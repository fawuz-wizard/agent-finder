"""Predictive availability: the figure an agent gives, the visits customers confirm or fail,
and what the next customer is told. Rules on real events; the agent's words are never changed
by anything but the agent."""

from __future__ import annotations

import pytest
from app.domain.capacity import SideThresholds
from app.services.ledger import Ledger, SideLedger, word_for_figure

RANGES = SideThresholds(some_max_sle=10_000, small_max_sle=500)
SEARCH = {"transaction": "cash_out", "area": "Lumley"}
HDR = {"X-Client": "cust-ledger"}


async def _declare(client, agent, clock=None, **fields):
    if clock is not None:
        clock.advance(1)
    body = {"presence": "open", "cash_out": "most", "deposit": "most", "night_mode": False}
    body.update(fields)
    r = await client.post("/api/v1/agent/availability", json=body, headers=agent)
    assert r.status_code == 200, r.text
    return r.json()


async def _fatmata(client, amount: int, tx: str = "cash_out") -> dict:
    r = await client.post(
        "/api/v1/search", json={**SEARCH, "transaction": tx, "amount_sle": amount}
    )
    assert r.status_code == 200, r.text
    d = r.json()
    rows = d["recommended"] + d["closer_not_serving"] + d["results"]
    return [x for x in rows if x["name"] == "Fatmata's Shop"][0]


async def _report(
    client, token: str, amount: int, answer: str, tx="cash_out", reason=None, clock=None
):  # noqa: E501
    if clock is not None:
        clock.advance(1)
    body = {
        "agent_id": "af-024",
        "transaction": tx,
        "amount_sle": amount,
        "answer": answer,
        "reason_code": reason,
        "source": "search",
        "client_token": token,
    }
    r = await client.post("/api/v1/reports", json=body, headers=HDR)
    assert r.status_code == 201, r.text


def test_words_follow_figures_on_the_network_ranges():
    assert word_for_figure(0, RANGES) == "none"
    assert word_for_figure(500, RANGES) == "small"
    assert word_for_figure(5_000, RANGES) == "some"
    assert word_for_figure(10_001, RANGES) == "most"


def test_side_ledger_ceiling_word_only_matches_the_network_ranges():
    assert SideLedger("cash", "most", None).ceiling(RANGES) is None
    assert SideLedger("cash", "some", None).ceiling(RANGES) == 10_000
    assert SideLedger("cash", "small", None).ceiling(RANGES) == 500
    assert SideLedger("cash", "none", None).ceiling(RANGES) == 0
    assert SideLedger("cash", "none", None).outcome(None, RANGES) == "limited"
    assert SideLedger("cash", "most", None).outcome(None, RANGES) == "likely"


def test_side_ledger_figure_minus_movements_and_a_cap():
    s = SideLedger("cash", "some", 5_000, net_out_sle=3_500, confirmed_visits=1)
    assert s.estimate_sle == 1_500 and s.ceiling(RANGES) == 1_500
    assert s.outcome(1_500, RANGES) == "likely" and s.outcome(1_501, RANGES) == "limited"
    s.cap_sle = 501  # a failed visit in the 500–2,000 band
    assert s.ceiling(RANGES) == 500
    assert "You said up to SLE 5,000" in (s.estimate_text() or "")
    assert "1 confirmed visit since" in (s.estimate_text() or "")
    ledger = Ledger(cash=s, float=SideLedger("float", "most", None))
    assert ledger.nudge_reason(RANGES) is None  # cap_at/band unset → no why text yet


@pytest.mark.asyncio
async def test_figure_declaration_answers_by_amount_and_shows_the_agent_the_same(
    client, agent, frozen_clock
):
    d = await _declare(client, agent, frozen_clock, cash_out_sle=5_000, deposit_sle=800)
    # Words are derived for dealers; figures stay with the agent.
    assert d["cash_out"] == "some" and d["deposit"] == "some"
    assert d["cash_out_sle"] == 5_000 and d["deposit_sle"] == 800
    assert (await _fatmata(client, 3_000))["outcome"] == "likely"
    assert (await _fatmata(client, 8_000))["outcome"] == "limited"  # the 8,000 case
    assert (await _fatmata(client, 800, "deposit"))["outcome"] == "likely"
    assert (await _fatmata(client, 801, "deposit"))["outcome"] == "limited"
    see = (await client.get("/api/v1/agent/home", headers=agent)).json()["customers_see"]
    cash, dep = see["sides"]
    assert (
        cash["range_text"] == "up to SLE 5,000"
        and cash["estimate_text"] == "You said up to SLE 5,000"
    )  # noqa: E501
    assert dep["range_text"] == "up to SLE 800"
    assert cash["why"] is None


@pytest.mark.asyncio
async def test_confirmed_visits_move_the_ledger_on_both_sides(client, agent, frozen_clock):
    await _declare(client, agent, frozen_clock, cash_out_sle=5_000, deposit_sle=2_000)
    await _report(client, "tok-yes-1", 3_000, "yes", clock=frozen_clock)  # ≤5k band → 3,500 moved
    assert (await _fatmata(client, 1_500))["outcome"] == "likely"
    assert (await _fatmata(client, 1_501))["outcome"] == "limited"
    # The cash-out put e-float in: deposit side rose from 2,000 to 5,500.
    assert (await _fatmata(client, 5_500, "deposit"))["outcome"] == "likely"
    assert (await _fatmata(client, 5_501, "deposit"))["outcome"] == "limited"
    # A deposit refills the cash side.
    await _report(
        client, "tok-yes-2", 1_000, "yes", tx="deposit", clock=frozen_clock
    )  # ≤2k band → 1,250 back
    assert (await _fatmata(client, 2_750))["outcome"] == "likely"
    assert (await _fatmata(client, 2_751))["outcome"] == "limited"
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert (
        "1 confirmed visit since · about SLE 2,750 left"
        in home["customers_see"]["sides"][0]["estimate_text"]
    )  # noqa: E501
    # Crossing from "some" (5,000) to "some" (2,750) is no word change: no nudge from the ledger.
    assert home["declaration"]["confirm_reason"] is None
    # The agent's own words were not touched by any of this.
    assert (
        home["declaration"]["cash_out"] == "some" and home["declaration"]["cash_out_sle"] == 5_000
    )


@pytest.mark.asyncio
async def test_failed_visit_caps_the_side_names_why_and_asks_the_agent(client, agent, frozen_clock):
    await _declare(client, agent, frozen_clock)  # Most / Most, word only
    assert (await _fatmata(client, 8_000))["outcome"] == "likely"
    await _report(
        client, "tok-no-1", 8_000, "no", reason="could_not_complete", clock=frozen_clock
    )  # ≤10k band
    assert (await _fatmata(client, 8_000))["outcome"] == "limited"
    assert (await _fatmata(client, 5_001))["outcome"] == "limited"
    assert (await _fatmata(client, 5_000))["outcome"] == "likely"
    assert (await _fatmata(client, 8_000, "deposit"))["outcome"] == "likely"  # other side intact
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    d, see = home["declaration"], home["customers_see"]
    assert d["confirm_due"] is True and d["confirm_reason"].startswith(
        "A customer reported a failed cash out of SLE 5,000 to 10,000 at "
    )
    assert see["sides"][0]["range_text"] == "up to SLE 5,000"
    assert "until you refresh" in see["sides"][0]["why"]
    assert d["cash_out"] == "most"  # the word is the agent's; the ceiling is the system's
    # A fee complaint says nothing about capacity: no cap.
    await _declare(client, agent, frozen_clock)
    await _report(client, "tok-no-2", 8_000, "no", reason="charged_extra", clock=frozen_clock)
    assert (await _fatmata(client, 8_000))["outcome"] == "likely"


@pytest.mark.asyncio
async def test_refresh_clears_the_cap_and_confirm_folds_the_estimate(client, agent, frozen_clock):
    await _declare(client, agent, frozen_clock, cash_out_sle=5_000)
    await _report(client, "tok-yes-3", 3_000, "yes", clock=frozen_clock)
    await _report(
        client, "tok-no-3", 1_000, "no", reason="less_than_requested", clock=frozen_clock
    )  # ≤2k → cap 501
    assert (await _fatmata(client, 500))["outcome"] == "likely"
    assert (await _fatmata(client, 501))["outcome"] == "limited"
    # "Still correct?" · Yes: the figure becomes what the ledger says is left, cap cleared.
    frozen_clock.advance(1)
    r = await client.post("/api/v1/agent/availability/confirm", headers=agent)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["cash_out_sle"] == 1_500 and d["cash_out"] == "some"
    assert d["confirm_due"] is False and d["confirm_reason"] is None
    assert (await _fatmata(client, 1_500))["outcome"] == "likely"
    assert (await _fatmata(client, 1_501))["outcome"] == "limited"
    # Declaring again with words only drops the figures and the ledger starts over.
    d = await _declare(client, agent, frozen_clock, cash_out="most")
    assert d["cash_out_sle"] is None and (await _fatmata(client, 8_000))["outcome"] == "likely"


@pytest.mark.asyncio
async def test_customers_and_dealers_never_see_the_figures(client, agent, dealer, frozen_clock):
    await _declare(client, agent, frozen_clock, cash_out_sle=5_000, deposit_sle=800)
    await _report(client, "tok-yes-4", 3_000, "yes", clock=frozen_clock)
    s = await client.post("/api/v1/search", json={**SEARCH, "amount_sle": 1_500})
    a = await client.get("/api/v1/agents/af-024?transaction=cash_out&amount_sle=1500")
    text = s.text + a.text
    for private in (
        "cash_out_sle",
        "deposit_sle",
        "5,000",
        "5000",
        "estimate",
        "You said",
        '"some"',
    ):  # noqa: E501
        assert private not in text, private
    assert a.json()["outcome"] == "likely"
    # Dealers keep the words and the masked money; the figure is the agent's own.
    row = [
        x
        for x in (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
        if x["ref"] == "Agent 024"
    ][0]  # noqa: E501
    assert "cash_out_sle" not in row and "5000" not in str(row)
    detail = (await client.get("/api/v1/dealer/agents/Agent 024", headers=dealer)).json()
    assert "cash_out_sle" not in detail and "You said" not in str(detail)


@pytest.mark.asyncio
async def test_figure_out_of_range_is_refused(client, agent):
    for bad in (-1, 10_000_001):
        r = await client.post(
            "/api/v1/agent/availability",
            json={"presence": "open", "cash_out": "most", "deposit": "most", "cash_out_sle": bad},
            headers=agent,
        )
        assert r.status_code == 422, bad
