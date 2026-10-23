"""The 7-day served percentage: active days, the exact transaction, customer reports.
Fair by construction: days count, not volume; served and failed reports weigh the same;
never 100, 95 at best. The worked examples are the ones in the rule document."""

from __future__ import annotations

import pytest
from app.core.settings import get_settings
from app.services.week_rule import Week, score


def week(days=0, cash=(), float_=(), served=0, failed=0, side="cash") -> Week:
    w = Week(active_days=days)
    w.bands["cash"] = set(cash)
    w.bands["float"] = set(float_)
    w.served[side] = served
    w.failed[side] = failed
    return w


def test_first_day_two_big_cash_outs_and_a_small_request_reads_40():
    s = score(week(days=1, cash={"≤5k"}), "cash_out", 300)
    assert (s.pct, s.outcome, s.note) == (40, "limited", None)


def test_four_days_and_three_confirmed_visits_reads_80_and_is_likely():
    s = score(week(days=4, cash={"≤5k"}, served=3), "cash_out", 300)
    assert (s.pct, s.outcome) == (80, "likely")


def test_an_agent_who_only_does_cash_in_is_capped_and_told_why():
    s = score(week(days=7, float_={"≤2k"}), "cash_out", 300)
    assert s.pct == 35 and s.note == "Does cash in; no cash out this week"


def test_small_cash_outs_every_day_with_good_reports_reach_95_never_100():
    s = score(week(days=7, cash={"≤500"}, served=4), "cash_out", 300)
    assert s.pct == 95


def test_a_size_never_served_this_week_is_capped_at_50_with_a_reason():
    s = score(week(days=7, cash={"≤500"}, served=4), "cash_out", 5_000)
    assert s.pct == 50 and s.note == "Not seen at this size this week"


def test_half_served_half_failed_cancels_out():
    s = score(week(days=7, cash={"≤2k"}, served=3, failed=3), "cash_out", 300)
    assert s.pct == 75


def test_fewer_than_three_reports_change_nothing():
    a = score(week(days=7, cash={"≤2k"}), "cash_out", 300)
    b = score(week(days=7, cash={"≤2k"}, failed=2), "cash_out", 300)
    assert a.pct == b.pct == 75


def test_volume_does_not_count_only_days():
    # The same seven days with one band or with every band read the same for a small request.
    quiet = score(week(days=7, cash={"≤500"}), "cash_out", None)
    busy = score(week(days=7, cash=set(("≤500", "≤2k", "≤5k", "≤10k"))), "cash_out", None)
    assert quiet.pct == busy.pct == 75


def test_no_activity_in_seven_days_is_5_and_not_recommended():
    s = score(week(days=0), "cash_out", 300)
    assert (s.pct, s.outcome, s.active) == (5, "unknown", False)


def test_the_agents_own_low_today_caps_that_side():
    w = week(days=7, cash={"≤5k"}, served=4)
    assert score(w, "cash_out", 300, low="low").pct == 35
    assert score(w, "cash_out", 300, low="none").pct == 5


async def _row(client, tx: str, amount: int | None, name: str = "Fatmata's Shop"):
    body = {"transaction": tx, "area": "Lumley"}
    if amount:
        body["amount_sle"] = amount
    d = (await client.post("/api/v1/search", json=body, headers={"X-Client": "w"})).json()
    rows = d["recommended"] + d["results"] + d["closer_not_serving"] + d["further_away"]
    return next((r for r in rows if r["name"] == name), None)


@pytest.mark.asyncio
async def test_search_and_shop_page_use_the_week_rule_when_switched_on(client, agent, monkeypatch):
    monkeypatch.setenv("RANKER", "week")
    get_settings.cache_clear()
    try:
        before = await _row(client, "cash_out", 300)
        assert before is not None
        # The seeded agent has recorded nothing yet: 5%, and the reason in plain words.
        if before["served_pct"] == 5:
            assert before["note"] == "No activity recorded this week"
        r = await client.post(
            "/api/v1/agent/transactions",
            json={"transaction": "cash_out", "amount_band": "≤5k", "client_token": "wk-0000001"},
            headers=agent,
        )
        assert r.status_code == 201, r.text
        after = await _row(client, "cash_out", 300)
        assert after["served_pct"] >= 40 and after["served_pct"] <= 95
        assert after["served_pct"] % 5 == 0
        # Cash in: the agent did none this week, so it is capped and says why.
        cash_in = await _row(client, "deposit", 300)
        assert cash_in["served_pct"] <= 35
        assert cash_in["note"] in (
            "Does cash out; no cash in this week",
            "No cash in recorded this week",
        )
        # The shop page agrees with the search.
        page = (
            await client.get(
                f"/api/v1/agents/{after['id']}",
                params={"transaction": "cash_out", "amount_sle": 300, "area": "Lumley"},
            )
        ).json()
        assert page["served_pct"] == after["served_pct"]
        # Never a figure beyond the percentage in the customer payload.
        assert all(k not in after for k in ("points", "active_days", "balance", "float"))
    finally:
        monkeypatch.delenv("RANKER", raising=False)
        get_settings.cache_clear()


# ---------- the note agents and aggregators read: words, never the percentage ----------

from app.services.week_rule import week_note  # noqa: E402


def test_the_note_gives_one_word_per_type_and_says_what_raises_it():
    note = week_note(week(days=4, cash={"≤5k"}, served=3), (None, None))
    assert [(s["label"], s["phrase"]) for s in note["sides"]] == [
        ("Cash out", "Likely to be served"),
        ("Cash in", "Not done this week"),
    ]
    titles = [w["title"] for w in note["why"]]
    assert titles == [
        "You worked 4 of the last 7 days",
        "Cash out done this week; cash in not",
        "Customers: 3 served, none failed",
    ]
    assert note["why"][1]["detail"].startswith("Record cash ins")


def test_the_aggregator_reads_the_same_note_in_the_third_person():
    note = week_note(week(days=4, cash={"≤5k"}, served=3), (None, None), viewer="dealer")
    assert note["why"][0]["title"] == "Worked 4 of the last 7 days"
    assert note["why"][1]["detail"] == "Cash in shows once the agent records one."


def test_no_activity_and_the_agents_low_tap_are_said_in_words():
    idle = week_note(week(days=0), (None, None))
    assert {s["phrase"] for s in idle["sides"]} == {"No activity this week"}
    low = week_note(week(days=7, cash={"≤5k"}, float_={"≤2k"}), ("low", None))
    assert low["sides"][0]["phrase"] == "Low today"
    assert low["why"][-1]["title"] == "You said you are low on cash today"


def test_no_figure_or_points_anywhere_in_the_note():
    note = week_note(week(days=7, cash={"≤5k"}, float_={"≤2k"}, served=4), (None, None))
    text = repr(note)
    assert "%" not in text and "pct" not in text and "points" not in text


@pytest.mark.asyncio
async def test_agent_and_aggregator_get_the_note_and_no_percentage(
    client, agent, dealer, monkeypatch
):
    monkeypatch.setenv("RANKER", "week")
    get_settings.cache_clear()
    await client.post(
        "/api/v1/agent/transactions",
        json={"transaction": "cash_out", "amount_band": "≤5k", "client_token": "wk-0000002"},
        headers=agent,
    )
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    mine = home["seen_as"]
    assert mine["sides"][1]["phrase"] == "Not done this week"
    assert mine["why"][0]["title"] == "You worked 1 of the last 7 days"
    page = (await client.get("/api/v1/dealer/agents/Agent 024", headers=dealer)).json()
    assert page["seen_as"]["sides"] == mine["sides"]
    assert page["seen_as"]["why"][0]["title"] == "Worked 1 of the last 7 days"
    for body in (home, page):
        assert "served_pct" not in repr(body)
