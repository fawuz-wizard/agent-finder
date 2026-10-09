"""The Global Report for a dealer's agents and the CSV exports the team studies: one row per
agent, event tables for my agents only, never money, never a customer identity or a comment."""

from __future__ import annotations

import json

import pytest


@pytest.mark.asyncio
async def test_report_has_one_row_per_agent_and_never_money(client, agent, dealer):
    await client.post(
        "/api/v1/agent/transactions",
        json={"transaction": "cash_out", "amount_band": "≤2k", "client_token": "tx-rep-000001"},
        headers=agent,
    )
    r = await client.get("/api/v1/dealer/report", headers=dealer)
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["agents"] == 8 and len(rep["rows"]) == 8 and rep["located"] == 8
    fatmata = [x for x in rep["rows"] if x["agent_ref"] == "Agent 024"][0]
    assert fatmata["logged_transactions_today"] == 1 and fatmata["bucket"] in ("active", "limited")
    assert set(rep["by_bucket"]) <= {"active", "limited", "hidden", "closed"}
    text = json.dumps(rep).lower()
    for forbidden in ("balance", "12400", "12,400", "float_position", "pin"):
        assert forbidden not in text, forbidden
    csv_ = await client.get("/api/v1/dealer/report.csv", headers=dealer)
    assert csv_.status_code == 200 and csv_.headers["content-type"].startswith("text/csv")
    assert 'filename="agent-report-' in csv_.headers["content-disposition"]
    lines = csv_.text.strip().splitlines()
    assert lines[0].startswith("agent_ref,agent_code,shop_name,region") and len(lines) == 9
    # The agent role and a dealer without the permission get the 404 shape.
    assert (await client.get("/api/v1/dealer/report", headers=agent)).status_code == 404


@pytest.mark.asyncio
async def test_record_exports_cover_the_pilots_events_without_identity_or_comments(
    client, agent, dealer
):
    await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "amount_sle": 2000, "area": "Lumley"},
        headers={"X-Client": "cust-secret-device-key"},
    )
    await client.post(
        "/api/v1/reports",
        json={
            "agent_id": "af-024",
            "transaction": "cash_out",
            "amount_sle": 2000,
            "answer": "no",
            "reason_code": "less_than_requested",
            "comment": "PRIVATE WORDS ABOUT THE SHOP",
            "source": "search",
            "client_token": "tok-records-0001",
        },
        headers={"X-Client": "cust-secret-device-key"},
    )
    await client.post(
        "/api/v1/agent/transactions",
        json={"transaction": "deposit", "amount_band": "≤500", "client_token": "tx-rec-000001"},
        headers=agent,
    )
    await client.post(
        "/api/v1/actions", json={"agent": "Agent 024", "action": "nudge"}, headers=dealer
    )
    await client.post(
        "/api/v1/financial/Agent 024",
        json={"field": "balance", "purpose": "Checking the export"},
        headers=dealer,
    )
    got = {}
    for kind in ("searches", "reports", "transactions", "actions", "usage", "audit"):
        r = await client.get(f"/api/v1/dealer/records/{kind}.csv", headers=dealer)
        assert r.status_code == 200, (kind, r.text)
        assert r.headers["content-type"].startswith("text/csv")
        got[kind] = r.text
    assert "Agent 024" in got["searches"] and "outcome_shown" in got["searches"]
    assert "less_than_requested" in got["reports"] and "PRIVATE WORDS" not in got["reports"]
    assert "cust-secret-device-key" not in "".join(got.values())
    assert "≤500" in got["transactions"]
    assert "nudge" in got["actions"]
    assert "directions" in got["usage"] or "search" in got["usage"]
    assert "Checking the export" in got["audit"] and "12400" not in got["audit"]
    # Unknown table, wrong role: 404 shape.
    assert (
        await client.get("/api/v1/dealer/records/balances.csv", headers=dealer)
    ).status_code == 404
    assert (
        await client.get("/api/v1/dealer/records/reports.csv", headers=agent)
    ).status_code == 404
