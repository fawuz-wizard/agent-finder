"""The agent photographs the shopfront on the phone. Customers see it at once, on the shop's
page and in the results; the aggregator can take it down; every change is an action."""

from __future__ import annotations

import base64

import pytest

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200  # a picture as far as the server checks
DATA_URL = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()


@pytest.mark.asyncio
async def test_photo_goes_live_at_once_and_the_aggregator_can_remove_it(client, agent, dealer):
    before = (await client.get("/api/v1/agent/profile", headers=agent)).json()
    assert before["photo"] is None
    assert (await client.get("/api/v1/agents/af-024")).json()["photo_url"] is None
    assert (await client.get("/api/v1/agents/af-024/photo")).status_code == 404

    r = await client.post("/api/v1/agent/profile/photo", json={"image": DATA_URL}, headers=agent)
    assert r.status_code == 200, r.text
    assert r.json()["photo"] == DATA_URL and r.json()["photo_at"]

    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["photo_url"].startswith("/api/v1/agents/af-024/photo?v=")

    # Customers: a URL on the result and the bytes behind it, cacheable.
    detail = (await client.get("/api/v1/agents/af-024")).json()
    assert detail["photo_url"].startswith("/api/v1/agents/af-024/photo?v=")
    img = await client.get(detail["photo_url"])
    assert img.status_code == 200 and img.content == JPEG
    assert img.headers["content-type"] == "image/jpeg"
    assert "max-age" in img.headers["cache-control"]
    found = (
        await client.post(
            "/api/v1/search",
            json={"transaction": "cash_out", "amount_sle": 2000, "area": "Lumley"},
            headers={"X-Client": "test"},
        )
    ).json()
    cards = found["recommended"] + found["results"] + found["closer_not_serving"]
    assert any(c["id"] == "af-024" and c["photo_url"] for c in cards)

    # The aggregator sees it on the agent's page and can take it down.
    mine = (await client.get("/api/v1/dealer/agents/Agent 024", headers=dealer)).json()
    assert mine["photo"] == DATA_URL
    assert (
        await client.delete("/api/v1/dealer/agents/Agent 024/photo", headers=agent)
    ).status_code == 404
    gone = await client.delete("/api/v1/dealer/agents/Agent 024/photo", headers=dealer)
    assert gone.status_code == 200 and gone.json()["photo"] is None
    assert (await client.get("/api/v1/agents/af-024/photo")).status_code == 404
    assert (await client.get("/api/v1/agent/profile", headers=agent)).json()["photo"] is None

    # Both changes are in the aggregator's action log, in the right names.
    notes = [x["note"] for x in (await client.get("/api/v1/actions", headers=dealer)).json()]
    assert any("added the photo of Fatmata's Shop" in n for n in notes)
    assert any("removed the photo of Fatmata's Shop" in n for n in notes)

    # The agent can remove their own too.
    await client.post("/api/v1/agent/profile/photo", json={"image": DATA_URL}, headers=agent)
    own = await client.delete("/api/v1/agent/profile/photo", headers=agent)
    assert own.status_code == 200 and own.json()["photo"] is None


@pytest.mark.asyncio
async def test_only_a_picture_of_a_sensible_size_is_accepted(client, agent):
    text = "data:text/plain;base64," + base64.b64encode(b"hello there, not a picture").decode()
    r = await client.post("/api/v1/agent/profile/photo", json={"image": text}, headers=agent)
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_photo"
    big = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"\x00" * 420_000).decode()
    r = await client.post("/api/v1/agent/profile/photo", json={"image": big}, headers=agent)
    assert r.status_code == 400 and r.json()["error"]["code"] == "photo_too_big"
    r = await client.post(
        "/api/v1/agent/profile/photo", json={"image": "not base64 at all!!"}, headers=agent
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_no_photo_for_a_shop_that_is_not_on_the_map(client, agent, dealer):
    """A pin waiting for confirmation keeps the shop off the map, picture included: the
    public route answers as it does for a shop that does not exist."""
    from app.db import session as dbsession
    from app.db.models import Agent
    from sqlalchemy import update

    await client.post("/api/v1/agent/profile/photo", json={"image": DATA_URL}, headers=agent)
    async with dbsession.get_session_factory()() as db:
        await db.execute(
            update(Agent).where(Agent.ref == "Agent 024").values(location_confirmed=False)
        )
        await db.commit()
    assert (await client.get("/api/v1/agents/af-024/photo")).status_code == 404
