"""The pilot loop, end to end, against a real database: customer search → agent declaration →
float request → dealer decision → audited financial read → usage count."""

from __future__ import annotations

import json

import pytest

PRIVATE_FRAGMENTS = (
    "balance",
    "float_position",
    "cash_out",
    "deposit",
    '"most"',
    '"some"',
    '"small"',
    "threshold",
    "signal",
    "audit",
    '"comment"',
)


@pytest.mark.asyncio
async def test_search_ranks_by_serveability_and_never_leaks(client):
    r = await client.post(
        "/api/v1/search",
        # Put both fresh demo candidates inside the 500 m core for this ranking assertion.
        json={
            "transaction": "cash_out",
            "amount_sle": 2000,
            "area": "Lumley",
            "lat": 8.439,
            "lng": -13.283,
        },
        headers={"X-Client": "dev-a"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    names = [x["name"] for x in body["recommended"]]
    # Fresh 'likely' (Kadiatu, 14 min) outranks aging 'likely' (Fatmata, 112 min) even though Fatmata is nearer.  # noqa: E501
    assert names == ["Kadiatu's Kiosk", "Fatmata's Shop"]
    assert all(x["outcome"] == "likely" for x in body["recommended"])
    # The echoed query is the customer's own input; the leak check is on what we say about agents.
    text = json.dumps(body["recommended"] + body["closer_not_serving"] + body["results"]).lower()
    for frag in PRIVATE_FRAGMENTS:
        assert frag not in text, frag


@pytest.mark.asyncio
async def test_same_declaration_different_answer_for_different_amounts(client):
    small = await client.post(
        "/api/v1/search", json={"transaction": "cash_out", "amount_sle": 400, "area": "Lumley"}
    )
    big = await client.post(
        "/api/v1/search", json={"transaction": "cash_out", "amount_sle": 5000, "area": "Lumley"}
    )

    def by(b):
        return {
            x["name"]: x["outcome"]
            for x in b["recommended"] + b["closer_not_serving"] + b["results"]
        }

    assert by(small.json())["Mohamed's Store"] == "likely"  # Small covers 400
    assert by(big.json())["Mohamed's Store"] == "limited"  # Small does not cover 5000


@pytest.mark.asyncio
async def test_wrong_pin_and_wrong_role_are_refused(client):
    assert (
        await client.post(
            "/api/v1/auth/sign-in", json={"ref": "Agent 024", "pin": "0000", "role": "agent"}
        )
    ).status_code == 401
    assert (await client.get("/api/v1/agent/home")).status_code == 401


@pytest.mark.asyncio
async def test_agent_declaration_changes_what_customers_see(client, agent):
    r = await client.post(
        "/api/v1/agent/availability",
        json={"presence": "open", "cash_out": "small", "deposit": "some", "night_mode": True},
        headers=agent,
    )
    assert r.status_code == 200 and r.json()["confirm_due"] is False
    s = await client.post(
        "/api/v1/search", json={"transaction": "cash_out", "amount_sle": 5000, "area": "Lumley"}
    )
    names = {
        x["name"]: x["outcome"]
        for x in s.json()["recommended"] + s.json()["closer_not_serving"] + s.json()["results"]
    }
    assert names["Fatmata's Shop"] == "limited"
    # and the dealer can see the same word the agent typed — but the customer never can
    home = await client.get("/api/v1/agent/home", headers=agent)
    assert home.json()["declaration"]["cash_out"] == "small"


@pytest.mark.asyncio
async def test_dealer_cannot_use_agent_endpoints_and_vice_versa(client, agent, dealer):
    assert (await client.get("/api/v1/agent/home", headers=dealer)).status_code == 404
    assert (await client.get("/api/v1/dealer/overview", headers=agent)).status_code == 404


@pytest.mark.asyncio
async def test_float_loop_agent_to_dealer_to_agent(client, agent, dealer):
    created = await client.post(
        "/api/v1/float-requests",
        json={"amount_sle": 5000, "reason": "Customer demand"},
        headers=agent,
    )
    assert created.status_code == 201, created.text
    rid = created.json()["id"]
    # a second open request is refused
    assert (
        await client.post("/api/v1/float-requests", json={"amount_sle": 100}, headers=agent)
    ).status_code == 400
    # agent cannot approve their own
    assert (
        await client.post(
            f"/api/v1/float-requests/{rid}/decision", json={"to": "approved"}, headers=agent
        )
    ).status_code == 404
    # decline needs a reason
    r = await client.post(
        f"/api/v1/float-requests/{rid}/decision",
        json={"to": "declined", "reason": " "},
        headers=dealer,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "reason_required"
    # illegal jump
    r = await client.post(
        f"/api/v1/float-requests/{rid}/decision", json={"to": "completed"}, headers=dealer
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "illegal_transition"
    # approve, then the agent sees it
    r = await client.post(
        f"/api/v1/float-requests/{rid}/decision", json={"to": "approved"}, headers=dealer
    )
    assert r.status_code == 200 and r.json()["decided_by"] == "Kissy Distribution"
    mine = await client.get("/api/v1/float-requests", headers=agent)
    assert [x for x in mine.json() if x["id"] == rid][0]["state"] == "approved"


@pytest.mark.asyncio
async def test_financial_reveal_is_audited_first_and_permission_gated(client, dealer):
    r = await client.post(
        "/api/v1/financial/Agent 024",
        json={"field": "balance", "purpose": "Reviewing a float request"},
        headers=dealer,
    )
    assert r.status_code == 200 and r.json()["amount_sle"] == 12400 and "demo" in r.json()["source"]
    audit = (await client.get("/api/v1/audit", headers=dealer)).json()
    assert audit[0]["field"] == "balance" and audit[0]["purpose"] == "Reviewing a float request"
    assert "12400" not in json.dumps(audit)
    # too short a purpose is refused
    assert (
        await client.post(
            "/api/v1/financial/Agent 024", json={"field": "float", "purpose": "x"}, headers=dealer
        )
    ).status_code == 422
    # dashboard never carries money
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert "balance" not in json.dumps(over).lower()


@pytest.mark.asyncio
async def test_report_is_idempotent_and_feeds_signals_and_usage(client, dealer):
    body = {
        "agent_id": "af-024",
        "transaction": "cash_out",
        "amount_sle": 6000,
        "answer": "no",
        "reason_code": "could_not_complete",
        "source": "search",
        "client_token": "tok-abcdef-1",
    }
    a = await client.post("/api/v1/reports", json=body, headers={"X-Client": "cust-1"})
    b = await client.post("/api/v1/reports", json=body, headers={"X-Client": "cust-1"})
    assert a.status_code == 201 and b.status_code == 201 and a.json()["id"] == b.json()["id"]
    await client.post(
        "/api/v1/reports",
        json={**body, "client_token": "tok-abcdef-2"},
        headers={"X-Client": "cust-2"},
    )
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert any(
        s["title"].startswith("Says available") and s["agent_ref"] == "Agent 024"
        for s in over["signals"]
    )
    use = (await client.get("/api/v1/dealer/usage", headers=dealer)).json()
    assert use["distinct_customers"] == 2


@pytest.mark.asyncio
async def test_usage_counts_distinct_real_people(client, agent, dealer):
    for k in ("p1", "p2", "p3"):
        await client.post(
            "/api/v1/search",
            json={"transaction": "deposit", "area": "Lumley"},
            headers={"X-Client": k},
        )
    await client.post("/api/v1/agent/availability/confirm", headers=agent)
    use = (await client.get("/api/v1/dealer/usage", headers=dealer)).json()
    assert (
        use["distinct_customers"] == 3
        and use["distinct_agents"] == 1
        and use["distinct_users"] == 4
    )


@pytest.mark.asyncio
async def test_insights_every_range_and_never_money(client, agent):
    for span in ("today", "yesterday", "week", "month"):
        r = await client.get(f"/api/v1/agent/insights?range={span}", headers=agent)
        assert r.status_code == 200, (span, r.text)
        body = r.json()
        assert body["range"] == span and body["points"]
        assert all(0 <= pt["fresh_pct"] <= 100 for pt in body["points"])
        assert "balance" not in json.dumps(body).lower()


@pytest.mark.asyncio
async def test_agent_home_shows_exactly_what_customers_see(client, agent):
    """The "Customers now see" card is phrased on the server from the same function the
    customer search uses, so the two can never disagree."""
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    see = home["customers_see"]
    assert see["state"] == "open" and [s["label"] for s in see["sides"]] == ["Cash out", "Cash in"]
    cash, dep = see["sides"]
    # Fatmata declared Most / Some: cash has no ceiling, deposit is capped by the network range.
    assert cash["range_text"] == "any amount" and cash["above_text"] is None
    assert (
        dep["range_text"] == "up to SLE 10,000"
        and "Availability uncertain for this request" in dep["above_text"]
    )
    s = await client.post(
        "/api/v1/search", json={"transaction": "cash_out", "amount_sle": 2000, "area": "Lumley"}
    )
    fatmata = [x for x in s.json()["recommended"] if x["name"] == "Fatmata's Shop"][0]
    assert fatmata["outcome_text"] == cash["phrase"]

    # Small on cash: the card now says the ceiling, and the search agrees above it.
    await client.post(
        "/api/v1/agent/availability",
        json={"presence": "open", "cash_out": "small", "deposit": "none", "night_mode": True},
        headers=agent,
    )
    see = (await client.get("/api/v1/agent/home", headers=agent)).json()["customers_see"]
    assert see["sides"][0]["range_text"] == "up to SLE 500"
    assert see["sides"][1]["phrase"] == "Availability uncertain for this request"

    # Hidden: one headline, no sides — the same phrase the customer surface renders.
    await client.post(
        "/api/v1/agent/availability",
        json={"presence": "hidden", "cash_out": "small", "deposit": "none", "night_mode": True},
        headers=agent,
    )
    see = (await client.get("/api/v1/agent/home", headers=agent)).json()["customers_see"]
    assert see["state"] == "hidden" and see["sides"] == []
    assert see["headline"] == "Availability hidden"


@pytest.mark.asyncio
async def test_refresh_status_is_allowed_any_time_not_only_when_due(client, agent):
    fresh = await client.post(
        "/api/v1/agent/availability",
        json={"presence": "open", "cash_out": "most", "deposit": "most", "night_mode": True},
        headers=agent,
    )
    assert fresh.json()["confirm_due"] is False
    again = await client.post("/api/v1/agent/availability/confirm", headers=agent)
    assert again.status_code == 200 and again.json()["age_min"] == 0
    # A refresh is recorded as a confirm event, never as a new declaration.
    acts = (await client.get("/api/v1/agent/activity", headers=agent)).json()
    assert any("confirmed your status" in e["text"] for e in acts)


async def _two_failed_visits(client):
    for n in (1, 2):
        await client.post(
            "/api/v1/reports",
            json={
                "agent_id": "af-024",
                "transaction": "cash_out",
                "amount_sle": 6000,
                "answer": "no",
                "reason_code": "could_not_complete",
                "source": "search",
                "client_token": f"tok-row-{n}",
            },
            headers={"X-Client": f"cust-row-{n}"},
        )


@pytest.mark.asyncio
async def test_attention_row_call_and_nudge_are_logged_never_a_status_change(client, agent, dealer):
    await _two_failed_visits(client)
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    sig = [s for s in over["signals"] if s["id"] == "sig-mismatch-Agent 024"][0]
    assert sig["call_url"] == "tel:+23276000000"
    before = (await client.get("/api/v1/agent/home", headers=agent)).json()["declaration"]
    for action in ("call", "nudge"):
        r = await client.post(
            "/api/v1/actions", json={"agent": "Agent 024", "action": action}, headers=dealer
        )
        assert r.status_code == 201 and r.json()["action"] == action
    logged = {x["action"] for x in (await client.get("/api/v1/actions", headers=dealer)).json()}
    assert {"call", "nudge"} <= logged
    after = (await client.get("/api/v1/agent/home", headers=agent)).json()["declaration"]
    assert after == before  # nothing the dealer did touched the agent's declaration


@pytest.mark.asyncio
async def test_snooze_hides_a_signal_for_four_hours_and_is_logged(client, agent, dealer):
    from tests.conftest import FROZEN_NOW

    await _two_failed_visits(client)
    sid = "sig-mismatch-Agent 024"
    r = await client.post(
        "/api/v1/actions",
        json={"agent": "Agent 024", "action": "snooze", "signal_id": sid},
        headers=dealer,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    from datetime import datetime

    until = datetime.fromisoformat(body["until"])
    assert (until - FROZEN_NOW).total_seconds() / 60 == 240
    assert body["action"] == "snooze" and body["signal_id"] == sid
    assert "snoozed" in body["note"] and body["agent_ref"] == "Agent 024"
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert all(s["id"] != sid for s in over["signals"])
    detail = (await client.get("/api/v1/dealer/agents/Agent 024", headers=dealer)).json()
    assert detail["open_signals"] == 0
    acts = (await client.get("/api/v1/actions?agent=Agent 024", headers=dealer)).json()
    assert acts[0]["action"] == "snooze" and acts[0]["signal_id"] == sid
    # The agent's own status is untouched and the reports still exist for tomorrow's recompute.
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["today"]["reported_problems"] == 2
    # Snoozing it again is refused: it is no longer a live signal.
    assert (
        await client.post(
            "/api/v1/actions",
            json={"agent": "Agent 024", "action": "snooze", "signal_id": sid},
            headers=dealer,
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_snooze_wears_off_after_four_hours_and_the_row_stays_logged(client, dealer):
    import importlib
    from datetime import timedelta

    from tests.conftest import CLOCK_MODULES, FROZEN_NOW

    sid = "sig-stale-Agent 038"  # seeded three days stale, so this signal is always live
    r = await client.post(
        "/api/v1/actions",
        json={"agent": "Agent 038", "action": "snooze", "signal_id": sid},
        headers=dealer,
    )
    assert r.status_code == 201, r.text
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert all(s["id"] != sid for s in over["signals"])
    later = FROZEN_NOW + timedelta(hours=4, minutes=1)
    for name in CLOCK_MODULES:
        importlib.import_module(name).now_utc = lambda: later
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert any(s["id"] == sid for s in over["signals"])  # still true, so it is back
    acts = (await client.get("/api/v1/actions?agent=Agent 038", headers=dealer)).json()
    assert acts[0]["action"] == "snooze"  # nothing expired silently: the log keeps the row


@pytest.mark.asyncio
async def test_resolve_hides_a_signal_for_the_rest_of_today(client, dealer):
    sid = "sig-stale-Agent 038"  # seeded three days stale, so this signal is always live
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert any(s["id"] == sid for s in over["signals"])
    r = await client.post(
        "/api/v1/actions",
        json={"agent": "Agent 038", "action": "resolve", "signal_id": sid},
        headers=dealer,
    )
    assert r.status_code == 201, r.text
    assert r.json()["until"].endswith("23:59:59+00:00") and "resolved" in r.json()["note"]
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert all(s["id"] != sid for s in over["signals"])
    # Agent 038 is still expired: the signal was hidden from the queue, not fixed.
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    assert [x for x in rows if x["ref"] == "Agent 038"][0]["attention"] is True


@pytest.mark.asyncio
async def test_snooze_and_resolve_need_a_signal_id_and_answer_404_otherwise(client, agent, dealer):
    for action in ("snooze", "resolve"):
        r = await client.post(
            "/api/v1/actions", json={"agent": "Agent 038", "action": action}, headers=dealer
        )
        assert r.status_code == 400, r.text
        assert r.json()["error"]["code"] == "signal_required"
    for agent_ref, bad in (
        ("Agent 999", "sig-stale-Agent 999"),  # not my agent
        ("Agent 038", "nonsense"),  # not a signal id
        ("Agent 031", "sig-mismatch-Agent 031"),  # no such live signal
        ("Agent 024", "sig-stale-Agent 038"),  # someone else's signal id
    ):
        r = await client.post(
            "/api/v1/actions",
            json={"agent": agent_ref, "action": "snooze", "signal_id": bad},
            headers=dealer,
        )
        assert r.status_code == 404, bad
    r = await client.post(
        "/api/v1/actions",
        json={"agent": "Agent 038", "action": "resolve", "signal_id": "sig-stale-Agent 038"},
        headers=agent,
    )
    assert r.status_code == 404
    assert (
        await client.post(
            "/api/v1/actions",
            json={"agent": "Agent 038", "action": "expire", "signal_id": "sig-stale-Agent 038"},
            headers=dealer,
        )
    ).status_code == 422


@pytest.mark.asyncio
async def test_dashboard_tiles_and_agent_register_share_one_bucket_per_agent(client, agent, dealer):
    from collections import Counter

    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    by_ref = {r["ref"]: r["bucket"] for r in rows}
    assert by_ref["Agent 009"] == "hidden"  # hidden right now
    assert by_ref["Agent 038"] == "closed"  # open, but three days stale
    assert by_ref["Agent 073"] == "limited"  # Small on cash
    assert by_ref["Agent 024"] == "active"
    assert Counter(by_ref.values()) == Counter(over["counts"])
    assert sum(over["counts"].values()) == over["agent_count"] == len(rows)

    # A declaration moves the agent between buckets, and tile and list move together.
    await client.post(
        "/api/v1/agent/availability",
        json={"presence": "open", "cash_out": "none", "deposit": "most", "night_mode": True},
        headers=agent,
    )
    over2 = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    rows2 = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    assert [r for r in rows2 if r["ref"] == "Agent 024"][0]["bucket"] == "limited"
    assert over2["counts"]["limited"] == over["counts"]["limited"] + 1
    assert over2["counts"]["active"] == over["counts"]["active"] - 1
    assert Counter(r["bucket"] for r in rows2) == Counter(over2["counts"])


async def test_home_carries_each_side_outcome_and_the_latest_float_request(client, agent):
    """The first screen draws the customer's pill from `outcome` and names the latest float
    request whatever its state, so a decline is visible the morning after."""
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    for side in home["customers_see"]["sides"]:
        assert side["outcome"] in {"likely", "limited", "unknown", "not_set"}
        assert side["phrase"]
    assert home["latest_float"] is None or home["latest_float"]["state"] in {
        "pending",
        "approved",
        "completed",
        "declined",
        "cancelled",
    }
    r = await client.post(
        "/api/v1/float-requests",
        headers=agent,
        json={"amount_sle": 4000, "reason": "Market day", "client_token": "t-latest-1"},
    )
    assert r.status_code in (200, 201), r.text
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["latest_float"]["state"] == "pending"
    assert home["pending_float"]["id"] == home["latest_float"]["id"]


async def test_todays_transactions_carry_a_commission_each_and_a_total(client, agent):
    """The Activity screen shows what each transaction earned: exact for the operator's rows,
    an estimate by band for the agent's own logs, and one total for the day."""
    before = (await client.get("/api/v1/agent/transactions", headers=agent)).json()
    assert before["commission_note"]
    r = await client.post(
        "/api/v1/agent/transactions",
        headers=agent,
        json={"transaction": "cash_out", "amount_band": "≤2k", "client_token": "t-comm-1"},
    )
    assert r.status_code in (200, 201), r.text
    after = (await client.get("/api/v1/agent/transactions", headers=agent)).json()
    mine = [
        x for x in after["rows"] if x["source"] == "agent" and x["id"].startswith("log-t-comm-1")
    ]
    assert len(mine) == 1
    assert mine[0]["estimated"] is True
    assert mine[0]["amount_sle"] is None
    assert mine[0]["amount_text"] == "SLE 500 to 2,000"
    assert mine[0]["commission_sle"] == 25
    assert after["commission_total_sle"] == before["commission_total_sle"] + 25
    assert after["count"] == before["count"] + 1
    for row in after["rows"]:
        if row["source"] == "operator":
            assert row["estimated"] is False
            assert row["amount_sle"] is not None


async def test_recording_a_cash_in_keeps_the_amount_and_masks_the_customers_number(client, agent):
    """Orange's own flow asks the agent for the customer's number and the amount; the record
    keeps the amount (so the commission is exact) and only the last three digits of the number."""
    r = await client.post(
        "/api/v1/agent/transactions",
        headers=agent,
        json={
            "transaction": "deposit",
            "amount_sle": 2000,
            "customer_msisdn": "076 123 456",
            "client_token": "t-cashin-1",
        },
    )
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["amount_sle"] == 2000
    assert out["amount_band"] == "≤2k"
    assert out["commission_sle"] == 15
    assert out["estimated"] is False
    assert out["customer_last3"] == "456"
    assert "076" not in r.text.replace("076 123 456", "")  # the number itself never comes back
    assert out["text"] == "Cash in · SLE 2,000"
    rows = (await client.get("/api/v1/agent/transactions", headers=agent)).json()["rows"]
    mine = next(x for x in rows if x["id"] == "log-t-cashin-1")
    assert mine["amount_text"] == "SLE 2,000" and mine["estimated"] is False
    acts = await client.get("/api/v1/agent/activity", headers=agent)
    assert any(a["text"] == "You recorded: Cash in · SLE 2,000" for a in acts.json())
    # A number too short to be a line is refused; nothing is stored.
    bad = await client.post(
        "/api/v1/agent/transactions",
        headers=agent,
        json={
            "transaction": "deposit",
            "amount_sle": 100,
            "customer_msisdn": "12",
            "client_token": "t-cashin-2",
        },
    )
    assert bad.status_code == 422
    # No amount and no band: refused.
    none = await client.post(
        "/api/v1/agent/transactions",
        headers=agent,
        json={"transaction": "cash_out", "client_token": "t-cashin-3"},
    )
    assert none.status_code == 422


async def test_low_today_lowers_one_side_until_midnight_and_never_raises(client, agent):
    """The agent's one correction: low on cash or float today. Customers read that side as
    limited (small amounts only) or unavailable; the other side is untouched; it clears at
    midnight or on "ok"."""
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["low"] == {"cash_out": None, "deposit": None, "until_text": "until midnight"}
    r = await client.post(
        "/api/v1/agent/availability/low", headers=agent, json={"side": "cash_out", "level": "low"}
    )
    assert r.status_code == 200, r.text
    sides = {s["label"]: s for s in r.json()["customers_see"]["sides"]}
    assert sides["Cash out"]["outcome"] == "likely"
    assert sides["Cash out"]["range_text"] in ("up to SLE 200", "up to SLE 500")  # the small band
    assert "low on cash today" in sides["Cash out"]["why"]
    assert r.json()["low"]["cash_out"] == "low" and r.json()["low"]["deposit"] is None
    # A customer asking for more than the small band now reads "limited".
    search = await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "amount_sle": 2000, "area": "Lumley", "radius_m": 500},
    )
    assert search.status_code == 200
    r = await client.post(
        "/api/v1/agent/availability/low", headers=agent, json={"side": "deposit", "level": "none"}
    )
    sides = {s["label"]: s for s in r.json()["customers_see"]["sides"]}
    assert (
        sides["Cash in"]["range_text"] == "nothing right now"
        and sides["Cash in"]["outcome"] == "limited"
    )
    assert "no float today" in sides["Cash in"]["why"]
    acts = (await client.get("/api/v1/agent/activity", headers=agent)).json()
    assert any(x["text"] == "You said: low on cash today" for x in acts)
    assert any(x["text"] == "You said: no float today" for x in acts)
    r = await client.post(
        "/api/v1/agent/availability/low", headers=agent, json={"side": "cash_out", "level": "ok"}
    )
    assert r.json()["low"]["cash_out"] is None and r.json()["low"]["deposit"] == "none"
    r = await client.post(
        "/api/v1/agent/availability/low", headers=agent, json={"side": "deposit", "level": "ok"}
    )
    assert r.json()["low"] == {"cash_out": None, "deposit": None, "until_text": "until midnight"}
