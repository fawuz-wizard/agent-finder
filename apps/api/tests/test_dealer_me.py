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
    assert me["sign_in"] == "kissy"
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


JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
DATA_URL = "data:image/jpeg;base64," + __import__("base64").b64encode(JPEG).decode()


@pytest.mark.asyncio
async def test_the_aggregator_adds_and_removes_their_own_picture(client, dealer):
    assert (await client.get("/api/v1/dealer/me", headers=dealer)).json()["photo"] is None
    r = await client.post("/api/v1/dealer/me/photo", json={"image": DATA_URL}, headers=dealer)
    assert r.status_code == 200, r.text
    assert r.json()["photo"].startswith("data:image/jpeg;base64,")
    # A new one replaces it; removing brings the initials back.
    again = await client.post("/api/v1/dealer/me/photo", json={"image": DATA_URL}, headers=dealer)
    assert again.json()["photo"] == r.json()["photo"]
    gone = await client.delete("/api/v1/dealer/me/photo", headers=dealer)
    assert gone.status_code == 200 and gone.json()["photo"] is None


@pytest.mark.asyncio
async def test_the_aggregator_picture_refuses_what_is_not_a_picture_and_needs_a_dealer(
    client, dealer
):
    bad = await client.post(
        "/api/v1/dealer/me/photo",
        json={"image": "data:text/plain;base64,aGVsbG8gd29ybGQgaGVsbG8="},
        headers=dealer,
    )
    assert bad.status_code in (400, 422)
    anon = await client.post("/api/v1/dealer/me/photo", json={"image": DATA_URL})
    assert anon.status_code in (401, 404)
