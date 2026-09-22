"""Directions stay in the app: results and detail carry coarse points and the origin the
distance was measured from, so the map is drawn under the agent, never in another app."""

from __future__ import annotations

import pytest

HDR = {"X-Client": "cust-map"}


@pytest.mark.asyncio
async def test_results_and_detail_carry_coarse_points_and_the_origin(client):
    r = await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "amount_sle": 2000, "area": "Lumley"},
        headers=HDR,
    )
    body = r.json()
    assert body["query"]["origin"] == {"lat": 8.4405, "lng": -13.2795}  # the area centre
    fat = [x for x in body["recommended"] if x["name"] == "Fatmata's Shop"][0]
    assert fat["lat"] == 8.441 and fat["lng"] == -13.28  # rounded to ~110 m
    assert len(str(fat["lat"]).split(".")[1]) <= 3
    d = await client.get(
        "/api/v1/agents/af-024?transaction=cash_out&amount_sle=2000&lat=8.43912&lng=-13.28117"
    )  # noqa: E501
    detail = d.json()
    assert detail["origin"] == {"lat": 8.439, "lng": -13.281}  # blunted before use, echoed blunt
    assert detail["lat"] == 8.441 and "directions_url" in detail
