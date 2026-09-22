"""The agent sets presence and hours; capacity comes from evidence. Words are never asked."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_presence_alone_is_a_valid_declaration(client, agent):
    r = await client.post("/api/v1/agent/availability", json={"presence": "hidden"}, headers=agent)
    assert r.status_code == 200 and r.json()["presence"] == "hidden"
    assert r.json()["cash_out"] == "most"  # whatever was set before is kept, unasked
    r = await client.post("/api/v1/agent/availability", json={"presence": "open"}, headers=agent)
    assert r.status_code == 200 and r.json()["presence"] == "open"


@pytest.mark.asyncio
async def test_dealer_sees_capacity_from_evidence_not_words(client, dealer):
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    fat = [x for x in rows if x["ref"] == "Agent 024"][0]
    assert fat["capacity_text"] == "Cash: any amount · Deposit up to ~SLE 10,000"
    r = await client.put(
        "/api/v1/dealer/agents/Agent 024/usual", json={"usual_max_sle": 5_000}, headers=dealer
    )
    assert r.status_code == 200
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    fat = [x for x in rows if x["ref"] == "Agent 024"][0]
    assert fat["capacity_text"] == "Cash up to ~SLE 5,000 · Deposit up to ~SLE 10,000"
    detail = (await client.get("/api/v1/dealer/agents/Agent 024", headers=dealer)).json()
    assert detail["capacity_text"] == fat["capacity_text"]
