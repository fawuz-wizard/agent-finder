"""Float sent: the aggregator records float sent in Orange Money; the app moves no money."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_a_send_answers_the_request_and_the_agent_reads_it(client, agent, dealer):
    req = await client.post(
        "/api/v1/float-requests", json={"amount_sle": 5000, "reason": "Weekend"}, headers=agent
    )
    rid = req.json()["id"]
    body = {
        "agent_ref": "Agent 024",
        "amount_sle": 5000,
        "om_reference": " MP2910.1432 ",
        "request_id": rid,
        "client_token": "t-1",
    }
    r = await client.post("/api/v1/float-sends", json=body, headers=dealer)
    assert r.status_code == 201, r.text
    sent = r.json()
    assert sent["om_reference"] == "MP2910.1432" and sent["sent_by"] == "Kissy Distribution"
    # The pending request went through approved to completed, in its own trail.
    mine = await client.get("/api/v1/float-requests", headers=agent)
    done = [x for x in mine.json() if x["id"] == rid][0]
    assert done["state"] == "completed" and "MP2910.1432" in done["decision_reason"]
    # The same token again records nothing new.
    again = await client.post("/api/v1/float-sends", json=body, headers=dealer)
    assert again.json()["id"] == sent["id"]
    # The agent reads what they received; the aggregator reads their history.
    got = (await client.get("/api/v1/float-sends", headers=agent)).json()
    assert [s["id"] for s in got] == [sent["id"]] and got[0]["sent_by"] == "Kissy Distribution"
    history = (await client.get("/api/v1/float-sends?days=7", headers=dealer)).json()
    assert history[0]["amount_sle"] == 5000
    # A completed request cannot be sent twice.
    r = await client.post(
        "/api/v1/float-sends", json={**body, "client_token": "t-2"}, headers=dealer
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "illegal_transition"


@pytest.mark.asyncio
async def test_a_send_with_no_request_and_no_reference(client, dealer):
    r = await client.post(
        "/api/v1/float-sends", json={"agent_ref": "Agent 031", "amount_sle": 10000}, headers=dealer
    )
    assert r.status_code == 201, r.text
    assert r.json()["om_reference"] is None and r.json()["request_id"] is None


@pytest.mark.asyncio
async def test_only_the_aggregator_and_only_their_agents(client, agent, dealer):
    body = {"agent_ref": "Agent 024", "amount_sle": 1000}
    assert (await client.post("/api/v1/float-sends", json=body, headers=agent)).status_code == 404
    r = await client.post(
        "/api/v1/float-sends", json={**body, "agent_ref": "Agent 999"}, headers=dealer
    )
    assert r.status_code == 404
    r = await client.post("/api/v1/float-sends", json={**body, "amount_sle": 0}, headers=dealer)
    assert r.status_code == 422
