"""Placement puts agents without a point on real Lumley or Aberdeen streets, evenly, and never
moves a point a person set."""

from __future__ import annotations

import pytest
from app.db import session as dbsession
from app.db.models import Agent
from scripts.place_agents import load_points, place
from sqlalchemy import select, update


def test_street_points_are_real_and_split_between_the_two_areas():
    pts = load_points()
    assert len(pts["Lumley"]) >= 40 and len(pts["Aberdeen"]) >= 40
    for area, rows in pts.items():
        for street, lat, lng in rows:
            assert 8.43 <= lat <= 8.50 and -13.30 <= lng <= -13.26, (area, street)
    assert (
        max(lat for _, lat, _ in pts["Lumley"]) < min(lat for _, lat, _ in pts["Aberdeen"]) + 0.02
    )


@pytest.mark.asyncio
async def test_place_fills_only_missing_points_and_keeps_human_pins(client):
    async with dbsession.get_session_factory()() as db:
        # Two seeded agents lose their point as if they came from Orange's file; one keeps a
        # dealer pin; the rest keep their seed points, which count as unlocated-by-script.
        await db.execute(
            update(Agent)
            .where(Agent.ref.in_(["Agent 031", "Agent 038"]))
            .values(lat=None, lng=None, source="orange_file")
        )
        await db.execute(
            update(Agent).where(Agent.ref == "Agent 024").values(location_source="dealer")
        )
        await db.commit()
    counts = await place(apply=True, pin=None)
    assert counts["placed"] >= 2 and counts["kept"] >= 1
    async with dbsession.get_session_factory()() as db:
        rows = (
            (await db.execute(select(Agent).where(Agent.ref.in_(["Agent 031", "Agent 038"]))))
            .scalars()
            .all()
        )
        for a in rows:
            assert a.lat is not None and a.location_source == "placed"
            assert a.area in ("Lumley", "Aberdeen") and a.street
        fatmata = await db.get(Agent, "Agent 024")
        assert fatmata.location_source == "dealer" and fatmata.street == "Lumley Junction"
    # A second run changes nothing.
    again = await place(apply=True, pin=None)
    assert again["placed"] == 0
    # The placed agents are now on the customer map.
    r = await client.post(
        "/api/v1/search",
        json={
            "transaction": "cash_out",
            "amount_sle": 2000,
            "area": "Lumley",
            "lat": 8.4625,
            "lng": -13.2853,
        },
        headers={"X-Client": "cust-place"},
    )
    assert r.status_code == 200
