"""The aggregator's own record: masked line, region, source, and the network in figures.
Only the signed-in aggregator sees it; an agent gets 404, never 403."""

import pytest
from app.api.v1.dealer import mask_msisdn


def test_mask_keeps_three_digits_only():
    assert mask_msisdn("+23276123456") == "+232 •• ••• 456"
    assert mask_msisdn("23276123456") == "+232 •• ••• 456"
    assert mask_msisdn(None) is None
    assert mask_msisdn("") is None


@pytest.mark.asyncio
async def test_dealer_sees_own_record_and_network(client, dealer):
    r = await client.get("/api/v1/dealer/me", headers=dealer)
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["name"] == "Kissy Distribution"
    assert me["region"] == "west"
    assert me["msisdn_masked"] == "+232 •• ••• 123"
    assert "000123" not in r.text  # the full number never leaves the server
    assert me["source"] == "manual"
    assert me["agents"] >= 5 and me["verified"] == me["agents"]  # every seeded agent is verified
    assert 0 <= me["on_map"] <= me["agents"]
    assert me["signed_in"] == me["agents"]  # every demo agent has declared
    assert me["subaggregators"] == 0
    assert me["since_text"]


@pytest.mark.asyncio
async def test_agent_gets_404_not_403(client, agent):
    r = await client.get("/api/v1/dealer/me", headers=agent)
    assert r.status_code == 404
