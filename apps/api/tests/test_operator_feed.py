"""The operator activity feed: when it is on, the host system's position is the truth behind
every phrase, the agent is never asked to refresh capacity, and presence stays theirs."""

from __future__ import annotations

import pytest
from app.core.settings import get_settings

HDR = {"X-Client": "cust-feed"}
SEARCH = {"transaction": "cash_out", "area": "Lumley"}


@pytest.fixture
def feed_on(monkeypatch):
    monkeypatch.setenv("OPERATOR_FEED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def _fatmata(client, amount: int, tx: str = "cash_out") -> dict:
    r = await client.post(
        "/api/v1/search", json={**SEARCH, "transaction": tx, "amount_sle": amount}, headers=HDR
    )
    assert r.status_code == 200, r.text
    d = r.json()
    rows = d["recommended"] + d["closer_not_serving"] + d["results"]
    return [x for x in rows if x["name"] == "Fatmata's Shop"][0]


@pytest.mark.asyncio
async def test_feed_is_off_by_default_so_real_agents_keep_their_own_words(client, agent):
    assert get_settings().operator_feed is False
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["declaration"]["capacity_source"] == "agent"
    assert home["declaration"]["confirm_due"] is True  # seeded 112 min old: the clock asks


@pytest.mark.asyncio
async def test_feed_position_replaces_words_and_the_refresh_prompt(feed_on, client, agent, dealer):
    # At the pinned midday clock the fake feed has drawn 5/13 of the day's cash from
    # Fatmata's 12,400: 8,347 left, which reads as "some" on the network ranges.
    assert (await _fatmata(client, 8_000))["outcome"] == "likely"
    assert (await _fatmata(client, 8_400))["outcome"] == "limited"
    row = await _fatmata(client, 2_000)
    assert row["freshness"] == "fresh" and "Orange (demo)" in row["freshness_text"]
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    d = home["declaration"]
    assert d["capacity_source"] == "operator" and d["cash_out"] == "some"
    assert d["confirm_due"] is False and d["confirm_reason"] is None
    assert "nothing to refresh" in d["freshness_text"]
    assert "e-float exact" in d["source_text"].lower()
    see = home["customers_see"]
    assert see["sides"][0]["range_text"] == "up to SLE 8,347"
    assert "Orange (demo)" in see["explanation"] and see["sides"][0]["estimate_text"] is None
    # Presence is still the agent's: hidden means hidden, feed or no feed.
    r = await client.post(
        "/api/v1/agent/availability",
        json={"presence": "hidden", "cash_out": "most", "deposit": "most", "night_mode": False},
        headers=agent,
    )
    assert r.status_code == 200 and r.json()["presence"] == "hidden"
    hidden_search = await client.post(
        "/api/v1/search", json={**SEARCH, "amount_sle": 2_000}, headers=HDR
    )
    visible_results = sum(
        (
            hidden_search.json()[key]
            for key in ("recommended", "closer_not_serving", "results", "further_away")
        ),
        [],
    )
    assert all(row["name"] != "Fatmata's Shop" for row in visible_results)
    # And the dealer sees the live words, not the stale ones.
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    fat = [x for x in rows if x["ref"] == "Agent 024"][0]
    assert fat["capacity_source"] == "operator" and fat["declaration_text"].startswith("Some")


@pytest.mark.asyncio
async def test_feed_does_not_add_farther_agents_when_core_matches_exist(feed_on, client, dealer):
    # Amadu is outside 500 m. A live feed must not make him appear as a farther alternative
    # when an open, likely match already exists in the customer's core area.
    r = await client.post("/api/v1/search", json={**SEARCH, "amount_sle": 500}, headers=HDR)
    body = r.json()
    assert body["recommended"]
    customer_results = sum(
        (body[key] for key in ("recommended", "closer_not_serving", "results", "further_away")),
        [],
    )
    assert all(row["name"] != "Amadu Corner Shop" for row in customer_results)
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert all(s["id"] != "sig-stale-Agent 038" for s in over["signals"])
    assert over["counts"]["closed"] == sum(
        1
        for x in (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
        if x["bucket"] == "closed"  # noqa: E501
    )


@pytest.mark.asyncio
async def test_agents_off_the_feed_keep_their_own_words(feed_on, client, dealer):
    # Agent 019 is not in the fake operator's book: her declaration still speaks for her.
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    row = [x for x in rows if x["ref"] == "Agent 019"][0]
    assert row["capacity_source"] == "agent"


@pytest.mark.asyncio
async def test_feed_never_reaches_the_customer_payload(feed_on, client):
    r = await client.post("/api/v1/search", json={**SEARCH, "amount_sle": 2_000}, headers=HDR)
    text = r.text
    for private in ("8,347", "8347", "cash_sle", "float_sle", "balance", '"some"', "inferred"):
        assert private not in text, private
