"""The agent's own transaction log: two taps, a side and a band, never the amount. It counts
as activity for the ranker, keeps the agent current for customers, and shows on their day."""

from __future__ import annotations

import pytest

CUST = {"X-Client": "cust-txlog"}


async def _find(client, name: str, amount: int = 2_000):
    r = await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "amount_sle": amount, "area": "Lumley"},
        headers=CUST,
    )
    d = r.json()
    hits = [
        x
        for x in d["recommended"] + d["closer_not_serving"] + d["results"] + d["further_away"]
        if x["name"] == name
    ]
    return hits[0] if hits else None


@pytest.mark.asyncio
async def test_two_taps_log_a_transaction_and_it_shows_on_the_agents_day(client, agent, dealer):
    body = {"transaction": "cash_out", "amount_band": "≤2k", "client_token": "tx-token-000001"}
    a = await client.post("/api/v1/agent/transactions", json=body, headers=agent)
    assert a.status_code == 201, a.text
    assert a.json()["text"] == "Cash out · SLE 500 to 2,000" and a.json()["logged_today"] == 1
    # The same tap twice (a retry) is one transaction.
    b = await client.post("/api/v1/agent/transactions", json=body, headers=agent)
    assert b.status_code == 201 and b.json()["id"] == a.json()["id"]
    assert b.json()["logged_today"] == 1
    c = await client.post(
        "/api/v1/agent/transactions",
        json={"transaction": "deposit", "amount_band": "≤500", "client_token": "tx-token-000002"},
        headers=agent,
    )
    assert c.status_code == 201 and c.json()["logged_today"] == 2
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["today"]["logged"] == 2
    acts = (await client.get("/api/v1/agent/activity", headers=agent)).json()
    texts = [x["text"] for x in acts if x["text"].startswith("You recorded")]
    assert "You recorded: Cash out · SLE 500 to 2,000" in texts
    assert "You recorded: Deposit · under SLE 500" in texts
    # Never an amount in the log, and nothing of it in the customer payload.
    assert all("SLE 1," not in t for t in texts)
    # Validation and roles: an unknown band is refused, a dealer gets the 404 shape.
    bad = await client.post(
        "/api/v1/agent/transactions",
        json={**body, "amount_band": "≤3k", "client_token": "tx-token-000003"},
        headers=agent,
    )
    assert bad.status_code == 422
    assert (
        await client.post("/api/v1/agent/transactions", json=body, headers=dealer)
    ).status_code == 404


@pytest.mark.asyncio
async def test_a_logged_transaction_keeps_the_agent_current_for_customers(client, dealer):
    # Aminata Trading (Agent 019) declared 305 minutes ago: expired, so customers are told
    # to ask before they go. Serving a customer and logging it is better evidence than a
    # refresh tap — the shop is open and working right now.
    before = await _find(client, "Aminata Trading")
    assert before is not None and before["outcome"] == "expired"
    s = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "Agent 019", "pin": "1234", "role": "agent"}
    )
    aminata = {"Authorization": f"Bearer {s.json()['token']}"}
    r = await client.post(
        "/api/v1/agent/transactions",
        json={"transaction": "cash_out", "amount_band": "≤5k", "client_token": "tx-aminata-0001"},
        headers=aminata,
    )
    assert r.status_code == 201
    after = await _find(client, "Aminata Trading")
    assert after is not None and after["outcome"] == "likely" and after["freshness"] == "fresh"
    assert after["freshness_text"].startswith("Updated just now")
    home = (await client.get("/api/v1/agent/home", headers=aminata)).json()
    d = home["declaration"]
    assert d["freshness"] == "fresh" and d["freshness_text"].startswith("You logged a transaction")
    assert home["customers_see"]["state"] == "open"
    # The dealer's register agrees: no longer stale.
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    mine = [x for x in rows if x["ref"] == "Agent 019"][0]
    assert mine["bucket"] == "active"
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert not any(sig["id"] == "sig-stale-Agent 019" for sig in over["signals"])
