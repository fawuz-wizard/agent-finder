"""The agent's page and the agent list say the same thing: one state, its age, and a way to call."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_agent_page_carries_the_list_state_age_and_call_link(client, dealer):
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    row = next(r for r in rows if r["ref"] == "Agent 024")
    detail = (await client.get("/api/v1/dealer/agents/Agent 024", headers=dealer)).json()
    assert detail["bucket"] == row["bucket"]
    assert detail["freshness_text"] == row["freshness_text"]
    assert detail["call_url"] == (f"tel:{row['phone']}" if row["phone"] else None)
