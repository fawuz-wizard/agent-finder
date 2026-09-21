"""The pilot loop, end to end, against a real database: customer search → agent declaration →
float request → dealer decision → audited financial read → usage count."""

from __future__ import annotations

import json

import pytest

PRIVATE_FRAGMENTS = (
    "balance",
    "float_position",
    "cash_out",
    "deposit",
    '"most"',
    '"some"',
    '"small"',
    "threshold",
    "signal",
    "audit",
    "rating",
    "comment",
)


@pytest.mark.asyncio
async def test_search_ranks_by_serveability_and_never_leaks(client):
    r = await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "amount_sle": 2000, "area": "Lumley"},
        headers={"X-Client": "dev-a"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    names = [x["name"] for x in body["recommended"]]
    # Fresh 'likely' (Kadiatu, 14 min) outranks aging 'likely' (Fatmata, 112 min) even though Fatmata is nearer.  # noqa: E501
    assert names == ["Kadiatu's Kiosk", "Fatmata's Shop"]
    assert all(x["outcome"] == "likely" for x in body["recommended"])
    assert any(
        x["outcome"] == "limited" and "may not cover" in (x["note"] or "").lower()
        for x in body["closer_not_serving"]
    )
    # The echoed query is the customer's own input; the leak check is on what we say about agents.
    text = json.dumps(body["recommended"] + body["closer_not_serving"] + body["results"]).lower()
    for frag in PRIVATE_FRAGMENTS:
        assert frag not in text, frag


@pytest.mark.asyncio
async def test_same_declaration_different_answer_for_different_amounts(client):
    small = await client.post(
        "/api/v1/search", json={"transaction": "cash_out", "amount_sle": 400, "area": "Lumley"}
    )
    big = await client.post(
        "/api/v1/search", json={"transaction": "cash_out", "amount_sle": 5000, "area": "Lumley"}
    )

    def by(b):
        return {
            x["name"]: x["outcome"]
            for x in b["recommended"] + b["closer_not_serving"] + b["results"]
        }

    assert by(small.json())["Mohamed's Store"] == "likely"  # Small covers 400
    assert by(big.json())["Mohamed's Store"] == "limited"  # Small does not cover 5000


@pytest.mark.asyncio
async def test_wrong_pin_and_wrong_role_are_refused(client):
    assert (
        await client.post(
            "/api/v1/auth/sign-in", json={"ref": "Agent 024", "pin": "0000", "role": "agent"}
        )
    ).status_code == 401
    assert (await client.get("/api/v1/agent/home")).status_code == 401


@pytest.mark.asyncio
async def test_agent_declaration_changes_what_customers_see(client, agent):
    r = await client.post(
        "/api/v1/agent/availability",
        json={"presence": "open", "cash_out": "small", "deposit": "some", "night_mode": True},
        headers=agent,
    )
    assert r.status_code == 200 and r.json()["confirm_due"] is False
    s = await client.post(
        "/api/v1/search", json={"transaction": "cash_out", "amount_sle": 5000, "area": "Lumley"}
    )
    names = {
        x["name"]: x["outcome"]
        for x in s.json()["recommended"] + s.json()["closer_not_serving"] + s.json()["results"]
    }
    assert names["Fatmata's Shop"] == "limited"
    # and the dealer can see the same word the agent typed — but the customer never can
    home = await client.get("/api/v1/agent/home", headers=agent)
    assert home.json()["declaration"]["cash_out"] == "small"


@pytest.mark.asyncio
async def test_dealer_cannot_use_agent_endpoints_and_vice_versa(client, agent, dealer):
    assert (await client.get("/api/v1/agent/home", headers=dealer)).status_code == 404
    assert (await client.get("/api/v1/dealer/overview", headers=agent)).status_code == 404


@pytest.mark.asyncio
async def test_float_loop_agent_to_dealer_to_agent(client, agent, dealer):
    created = await client.post(
        "/api/v1/float-requests",
        json={"amount_sle": 5000, "reason": "Customer demand"},
        headers=agent,
    )
    assert created.status_code == 201, created.text
    rid = created.json()["id"]
    # a second open request is refused
    assert (
        await client.post("/api/v1/float-requests", json={"amount_sle": 100}, headers=agent)
    ).status_code == 400
    # agent cannot approve their own
    assert (
        await client.post(
            f"/api/v1/float-requests/{rid}/decision", json={"to": "approved"}, headers=agent
        )
    ).status_code == 404
    # decline needs a reason
    r = await client.post(
        f"/api/v1/float-requests/{rid}/decision",
        json={"to": "declined", "reason": " "},
        headers=dealer,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "reason_required"
    # illegal jump
    r = await client.post(
        f"/api/v1/float-requests/{rid}/decision", json={"to": "completed"}, headers=dealer
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "illegal_transition"
    # approve, then the agent sees it
    r = await client.post(
        f"/api/v1/float-requests/{rid}/decision", json={"to": "approved"}, headers=dealer
    )
    assert r.status_code == 200 and r.json()["decided_by"] == "Kissy Distribution"
    mine = await client.get("/api/v1/float-requests", headers=agent)
    assert [x for x in mine.json() if x["id"] == rid][0]["state"] == "approved"


@pytest.mark.asyncio
async def test_financial_reveal_is_audited_first_and_permission_gated(client, dealer):
    r = await client.post(
        "/api/v1/financial/Agent 024",
        json={"field": "balance", "purpose": "Reviewing a float request"},
        headers=dealer,
    )
    assert r.status_code == 200 and r.json()["amount_sle"] == 12400 and "demo" in r.json()["source"]
    audit = (await client.get("/api/v1/audit", headers=dealer)).json()
    assert audit[0]["field"] == "balance" and audit[0]["purpose"] == "Reviewing a float request"
    assert "12400" not in json.dumps(audit)
    # too short a purpose is refused
    assert (
        await client.post(
            "/api/v1/financial/Agent 024", json={"field": "float", "purpose": "x"}, headers=dealer
        )
    ).status_code == 422
    # dashboard never carries money
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert "balance" not in json.dumps(over).lower()


@pytest.mark.asyncio
async def test_report_is_idempotent_and_feeds_signals_and_usage(client, dealer):
    body = {
        "agent_id": "af-024",
        "transaction": "cash_out",
        "amount_sle": 6000,
        "answer": "no",
        "reason_code": "could_not_complete",
        "source": "search",
        "client_token": "tok-abcdef-1",
    }
    a = await client.post("/api/v1/reports", json=body, headers={"X-Client": "cust-1"})
    b = await client.post("/api/v1/reports", json=body, headers={"X-Client": "cust-1"})
    assert a.status_code == 201 and b.status_code == 201 and a.json()["id"] == b.json()["id"]
    await client.post(
        "/api/v1/reports",
        json={**body, "client_token": "tok-abcdef-2"},
        headers={"X-Client": "cust-2"},
    )
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert any(
        s["title"].startswith("Says available") and s["agent_ref"] == "Agent 024"
        for s in over["signals"]
    )
    use = (await client.get("/api/v1/dealer/usage", headers=dealer)).json()
    assert use["distinct_customers"] == 2


@pytest.mark.asyncio
async def test_usage_counts_distinct_real_people(client, agent, dealer):
    for k in ("p1", "p2", "p3"):
        await client.post(
            "/api/v1/search",
            json={"transaction": "deposit", "area": "Lumley"},
            headers={"X-Client": k},
        )
    await client.post("/api/v1/agent/availability/confirm", headers=agent)
    use = (await client.get("/api/v1/dealer/usage", headers=dealer)).json()
    assert (
        use["distinct_customers"] == 3
        and use["distinct_agents"] == 1
        and use["distinct_users"] == 4
    )


@pytest.mark.asyncio
async def test_insights_every_range_and_never_money(client, agent):
    for span in ("today", "yesterday", "week", "month"):
        r = await client.get(f"/api/v1/agent/insights?range={span}", headers=agent)
        assert r.status_code == 200, (span, r.text)
        body = r.json()
        assert body["range"] == span and body["points"]
        assert all(0 <= pt["fresh_pct"] <= 100 for pt in body["points"])
        assert "balance" not in json.dumps(body).lower()
