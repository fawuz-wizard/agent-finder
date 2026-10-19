"""Customers only ever meet verified agents. Verified is the aggregator's statement that the
agent was checked against Orange's record (or the import's, for a clean row); a confirmed pin
and an open shop are not enough without it, and the register says why a shop is waiting."""

from __future__ import annotations

import pytest

CUST = {"X-Client": "cust-verify"}
SEARCH = {
    "transaction": "cash_out",
    "amount_sle": 2000,
    "area": "Lumley",
    "lat": 8.44,
    "lng": -13.28,
}


def _names(body: dict) -> set[str]:
    return {
        x["name"]
        for x in body["recommended"]
        + body["results"]
        + body["closer_not_serving"]
        + body.get("further_away", [])
    }


async def _register(client, dealer, verified: bool) -> dict:
    r = await client.post(
        "/api/v1/dealer/agents",
        json={
            "ref": "Agent 150",
            "person_name": "Isata Conteh",
            "shop_name": "Isata's Corner",
            "area": "Lumley",
            "street": "Lumley Beach Road",
            "lat": 8.44,
            "lng": -13.28,
            "open_time": "07:00",
            "close_time": "20:00",
            "verified": verified,
        },
        headers=dealer,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _sign_in_and_open(client, code: str) -> None:
    s = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "Agent 150", "pin": code, "role": "agent"}
    )
    assert s.status_code == 200, s.text
    h = {"Authorization": f"Bearer {s.json()['token']}"}
    assert (
        await client.post("/api/v1/auth/pin", json={"pin": "2468"}, headers=h)
    ).status_code == 200
    r = await client.post("/api/v1/agent/availability", json={"presence": "open"}, headers=h)
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_an_unverified_shop_is_never_shown_until_the_aggregator_ticks_it(client, dealer):
    reg = await _register(client, dealer, verified=False)
    assert reg["verified"] is False
    assert reg["verification_note"] == "Pending: not yet checked against Orange's record"
    assert "tick" in reg["next_step"]
    await _sign_in_and_open(client, reg["code"])
    # Pinned by the aggregator, confirmed, open, active: still not a result and not a page.
    r = await client.post("/api/v1/search", json=SEARCH, headers=CUST)
    assert "Isata's Corner" not in _names(r.json())
    assert (
        await client.get("/api/v1/agents/af-150", params={"transaction": "cash_out"})
    ).status_code == 404
    # The register says why.
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    row = [x for x in rows if x["ref"] == "Agent 150"][0]
    assert row["verified"] is False and row["verification_note"].startswith("Pending")
    detail = (await client.get("/api/v1/dealer/agents/Agent 150", headers=dealer)).json()
    assert detail["verified"] is False and detail["verification_note"].startswith("Pending")
    # The aggregator checks the agent against Orange's record: the shop appears, badge and all.
    e = await client.put("/api/v1/dealer/agents/Agent 150", json={"verified": True}, headers=dealer)
    assert e.status_code == 200 and e.json()["verified"] is True
    assert e.json()["verification_note"] is None
    r = await client.post("/api/v1/search", json=SEARCH, headers=CUST)
    assert "Isata's Corner" in _names(r.json())
    d = await client.get("/api/v1/agents/af-150", params={"transaction": "cash_out"})
    assert d.status_code == 200 and d.json()["verified_label"] == "Verified agent"
    # Customers never read the note, in either direction.
    assert "verification_note" not in r.text and "Pending" not in d.text


@pytest.mark.asyncio
async def test_unticking_hides_the_shop_again(client, dealer):
    reg = await _register(client, dealer, verified=True)
    assert reg["verification_note"] is None
    await _sign_in_and_open(client, reg["code"])
    assert "Isata's Corner" in _names(
        (await client.post("/api/v1/search", json=SEARCH, headers=CUST)).json()
    )
    e = await client.put(
        "/api/v1/dealer/agents/Agent 150", json={"verified": False}, headers=dealer
    )
    assert e.status_code == 200 and e.json()["verification_note"].startswith("Pending")
    assert "Isata's Corner" not in _names(
        (await client.post("/api/v1/search", json=SEARCH, headers=CUST)).json()
    )


@pytest.mark.asyncio
async def test_the_seeded_demo_agents_are_all_verified_so_the_demo_still_shows_them(client, dealer):
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    assert rows and all(x["verified"] is True and x["verification_note"] is None for x in rows)
    r = await client.post("/api/v1/search", json=SEARCH, headers=CUST)
    assert "Fatmata's Shop" in _names(r.json())
