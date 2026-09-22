"""Float demand forecast: a ranking with reasons from the pilot's own evidence. Never a
balance, never a figure of the agent's, never a decision."""

from __future__ import annotations

import pytest
from app.services.forecast import days_left_text, risk_of

HDR = {"X-Client": "cust-forecast"}


def test_risk_rule_reads_the_evidence_in_order():
    base = dict(
        word="most",
        capped=False,
        days_left=None,
        failures_today=0,
        last_top_up_days=None,
        pace_per_day=0.0,
    )  # noqa: E501
    assert risk_of(**base) == "low"
    assert risk_of(**{**base, "word": "none"}) == "high"
    assert risk_of(**{**base, "capped": True}) == "high"
    assert risk_of(**{**base, "days_left": 0.4, "pace_per_day": 500}) == "high"
    assert risk_of(**{**base, "days_left": 1.5, "pace_per_day": 500}) == "medium"
    assert risk_of(**{**base, "days_left": 3.0, "pace_per_day": 500}) == "low"
    assert risk_of(**{**base, "word": "small"}) == "medium"
    assert risk_of(**{**base, "failures_today": 1}) == "medium"
    assert risk_of(**{**base, "last_top_up_days": 9, "pace_per_day": 100}) == "medium"
    assert risk_of(**{**base, "last_top_up_days": 9, "pace_per_day": 0}) == "low"
    assert days_left_text(0.4).startswith("about half a day")
    assert days_left_text(1.0).startswith("about a day")
    assert days_left_text(3.4).startswith("about 3 days")


async def _report(client, clock, token, amount, answer, reason=None):
    clock.advance(1)
    r = await client.post(
        "/api/v1/reports",
        json={
            "agent_id": "af-024",
            "transaction": "cash_out",
            "amount_sle": amount,
            "answer": answer,
            "reason_code": reason,
            "source": "search",
            "client_token": token,
        },
        headers=HDR,
    )
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_forecast_learns_the_pace_from_confirmed_visits(client, agent, dealer, frozen_clock):
    rows = (await client.get("/api/v1/dealer/forecast", headers=dealer)).json()
    by = {r["agent_ref"]: r for r in rows}
    assert (
        by["Agent 038"]["risk"] == "high"
        and "Says no cash right now." in by["Agent 038"]["reasons"]
    )  # noqa: E501
    assert by["Agent 024"]["risk"] == "low" and by["Agent 024"]["headline"] == "Fine for now"
    assert rows[0]["risk"] == "high"  # sorted most urgent first

    # Fatmata says up to 4,000; one confirmed 3,000 visit leaves 500 at a pace of 500 a day.
    frozen_clock.advance(1)
    r = await client.post(
        "/api/v1/agent/availability",
        json={
            "presence": "open",
            "cash_out": "most",
            "deposit": "most",
            "cash_out_sle": 4_000,
            "night_mode": False,
        },  # noqa: E501
        headers=agent,
    )
    assert r.status_code == 200, r.text
    await _report(client, frozen_clock, "tok-fc-1", 3_000, "yes")
    f = [
        x
        for x in (await client.get("/api/v1/dealer/forecast", headers=dealer)).json()
        if x["agent_ref"] == "Agent 024"
    ][0]  # noqa: E501
    assert f["risk"] == "medium" and f["days_left_text"] == "about a day of cash at the recent pace"
    assert "Confirmed visits drew cash 1 time in the last 7 days." in f["reasons"]
    # A second visit: 250 left at a faster pace — short by tomorrow.  # noqa: E501
    await _report(client, frozen_clock, "tok-fc-2", 300, "yes")
    f = [
        x
        for x in (await client.get("/api/v1/dealer/forecast", headers=dealer)).json()
        if x["agent_ref"] == "Agent 024"
    ][0]  # noqa: E501
    assert f["risk"] == "high" and f["days_left_text"].startswith("about half a day")
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert over["forecast_counts"]["high"] >= 2  # Fatmata and Amadu (no cash)


@pytest.mark.asyncio
async def test_failed_visit_and_top_up_history_show_in_the_reasons(
    client, agent, dealer, frozen_clock
):  # noqa: E501
    await _report(client, frozen_clock, "tok-fc-3", 6_000, "no", reason="could_not_complete")
    f = [
        x
        for x in (await client.get("/api/v1/dealer/forecast", headers=dealer)).json()
        if x["agent_ref"] == "Agent 024"
    ][0]  # noqa: E501
    assert f["risk"] == "high"
    assert "A customer could not be served for lack of cash since the last update." in f["reasons"]
    assert "1 failed visit for lack of cash today." in f["reasons"]
    assert "No top-up on record." in f["reasons"]
    # A request, approved: the forecast now knows when the last top-up was, and that nothing waits.
    frozen_clock.advance(1)
    fr = (
        await client.post(
            "/api/v1/float-requests", json={"amount_sle": 5_000, "reason": "Market"}, headers=agent
        )
    ).json()  # noqa: E501
    f = [
        x
        for x in (await client.get("/api/v1/dealer/forecast", headers=dealer)).json()
        if x["agent_ref"] == "Agent 024"
    ][0]  # noqa: E501
    assert (
        f["pending_request"] is True and "A request is waiting for your decision." in f["reasons"]
    )
    frozen_clock.advance(1)
    assert (
        await client.post(
            f"/api/v1/float-requests/{fr['id']}/decision", json={"to": "approved"}, headers=dealer
        )
    ).status_code == 200  # noqa: E501
    f = [
        x
        for x in (await client.get("/api/v1/dealer/forecast", headers=dealer)).json()
        if x["agent_ref"] == "Agent 024"
    ][0]  # noqa: E501
    assert f["pending_request"] is False and f["last_top_up_text"] == "Last top-up just now"


@pytest.mark.asyncio
async def test_forecast_is_dealer_only_and_never_carries_money(client, agent, dealer, frozen_clock):
    r = await client.post(
        "/api/v1/agent/availability",
        json={
            "presence": "open",
            "cash_out": "most",
            "deposit": "most",
            "cash_out_sle": 4_000,
            "night_mode": False,
        },  # noqa: E501
        headers=agent,
    )
    assert r.status_code == 200
    assert (await client.get("/api/v1/dealer/forecast", headers=agent)).status_code == 404
    assert (await client.get("/api/v1/dealer/forecast")).status_code == 401
    text = (await client.get("/api/v1/dealer/forecast", headers=dealer)).text
    for private in ("balance", "float_position", "4,000", "4000", "cash_out_sle", "estimate"):
        assert private not in text, private
