"""The aggregator reads what customers reported about their own agents, anonymously, as the
agent does; another aggregator's agent is not found."""

from __future__ import annotations

import pytest

from customers import each_customer

HDR = each_customer("cust-reports")


async def _report(client, token, answer, reason=None, comment=None):
    r = await client.post(
        "/api/v1/reports",
        json={
            "agent_id": "af-024",
            "transaction": "cash_out",
            "amount_sle": 2_000,
            "answer": answer,
            "reason_code": reason,
            "comment": comment,
            "source": "search",
            "client_token": token,
        },
        headers=HDR,
    )
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_aggregator_reads_the_agents_customer_reports_without_who(client, dealer, agent):
    await _report(client, "tok-dr-1", "no", reason="could_not_complete")
    await _report(client, "tok-dr-2", "yes", comment="Quick and kind.")
    r = await client.get("/api/v1/dealer/agents/Agent 024/reports", headers=dealer)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["shop_name"] == "Fatmata's Shop"
    assert d["summary"]["not_served"] >= 1 and d["summary"]["served"] >= 1
    kinds = {(i["kind"], i["reason_text"], i["comment"]) for i in d["items"]}
    assert ("not_served", "Could not complete the transaction", None) in kinds
    assert ("comment", None, "Quick and kind.") in kinds
    # The same items the agent reads in their own app.
    mine = (await client.get("/api/v1/agent/feedback", headers=agent)).json()
    assert mine["items"] == d["items"]
    # Never who: no number, device, time or amount in what the aggregator receives.
    assert "cust-reports" not in r.text and "2,000" not in r.text


@pytest.mark.asyncio
async def test_reports_are_only_for_my_own_agents(client, dealer, agent):
    assert (
        await client.get("/api/v1/dealer/agents/Agent 999/reports", headers=dealer)
    ).status_code == 404
    assert (
        await client.get("/api/v1/dealer/agents/Agent 024/reports", headers=agent)
    ).status_code == 404
    assert (await client.get("/api/v1/dealer/agents/Agent 024/reports")).status_code == 401


@pytest.mark.asyncio
async def test_failed_visits_are_counted_by_reason_worst_first_and_week_on_week(
    client, dealer, frozen_clock
):
    async def fail(token, reason):
        frozen_clock.advance(1)
        await _report(client, token, "no", reason=reason)

    await fail("tok-wk-1", "closed")  # last week
    frozen_clock.advance(8 * 24 * 60)
    await fail("tok-wk-2", "could_not_complete")
    await fail("tok-wk-3", "could_not_complete")
    await fail("tok-wk-4", "less_than_requested")
    d = (await client.get("/api/v1/dealer/agents/Agent 024/reports", headers=dealer)).json()
    counts = {r["code"]: r["count"] for r in d["reasons"]}
    assert counts["could_not_complete"] >= 2 and counts["closed"] >= 1
    assert d["reasons"][0]["count"] == max(counts.values())  # worst first
    assert d["reasons"][0]["text"]
    assert d["trend"]["this_week"] >= 3 and d["trend"]["last_week"] >= 1
    tagged = {i["reason_code"] for i in d["items"] if i["kind"] == "not_served"}
    assert {"could_not_complete", "less_than_requested"} <= tagged


@pytest.mark.asyncio
async def test_no_trend_until_there_is_a_week_to_compare(client, dealer):
    await _report(client, "tok-wk-5", "no", reason="closed")
    d = (await client.get("/api/v1/dealer/agents/Agent 024/reports", headers=dealer)).json()
    assert d["trend"] is None  # every report is from this week: nothing to compare yet


@pytest.mark.asyncio
async def test_tabs_page_20_at_a_time_and_filter_by_reason(
    client, dealer, frozen_clock, monkeypatch
):
    from app.api.v1 import reports

    # Paging needs more reports on one agent than the hourly cap lets in (tests/test_limits).
    monkeypatch.setattr(reports, "REPORTS_PER_AGENT_PER_HOUR", 100)
    for k in range(23):
        frozen_clock.advance(1)
        await _report(client, f"tok-pg-{k:02d}", "no", reason="could_not_complete")
    for k in range(3):
        frozen_clock.advance(1)
        await _report(client, f"tok-pg-c{k}", "yes", comment=f"Thanks {k}")
    url = "/api/v1/dealer/agents/Agent 024/reports"
    first = (await client.get(url, params={"kind": "not_served"}, headers=dealer)).json()
    assert len(first["items"]) == 20 and first["total"] >= 23
    assert all(i["kind"] == "not_served" for i in first["items"])
    rest = (
        await client.get(url, params={"kind": "not_served", "offset": 20}, headers=dealer)
    ).json()
    assert len(rest["items"]) == first["total"] - 20
    assert not {i["id"] for i in rest["items"]} & {i["id"] for i in first["items"]}
    one = (
        await client.get(
            url, params={"kind": "not_served", "reason": "could_not_complete"}, headers=dealer
        )
    ).json()
    assert one["total"] >= 23 and all(
        i["reason_code"] == "could_not_complete" for i in one["items"]
    )
    words = (await client.get(url, params={"kind": "comment"}, headers=dealer)).json()
    assert {"Thanks 0", "Thanks 1", "Thanks 2"} <= {i["comment"] for i in words["items"]}
    assert all(i["comment"] for i in words["items"])
    # The counts never depend on the page.
    assert first["summary"] == words["summary"] and first["reasons"] == words["reasons"]
