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


@pytest.mark.asyncio
async def test_agent_home_shows_exactly_what_customers_see(client, agent):
    """The "Customers now see" card is phrased on the server from the same function the
    customer search uses, so the two can never disagree."""
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    see = home["customers_see"]
    assert see["state"] == "open" and [s["label"] for s in see["sides"]] == ["Cash out", "Deposit"]
    cash, dep = see["sides"]
    # Fatmata declared Most / Some: cash has no ceiling, deposit is capped by the network range.
    assert cash["range_text"] == "any amount" and cash["above_text"] is None
    assert dep["range_text"] == "up to SLE 10,000" and "Limited" in dep["above_text"]
    s = await client.post(
        "/api/v1/search", json={"transaction": "cash_out", "amount_sle": 2000, "area": "Lumley"}
    )
    fatmata = [x for x in s.json()["recommended"] if x["name"] == "Fatmata's Shop"][0]
    assert fatmata["outcome_text"] == cash["phrase"]

    # Small on cash: the card now says the ceiling, and the search agrees above it.
    await client.post(
        "/api/v1/agent/availability",
        json={"presence": "open", "cash_out": "small", "deposit": "none", "night_mode": True},
        headers=agent,
    )
    see = (await client.get("/api/v1/agent/home", headers=agent)).json()["customers_see"]
    assert see["sides"][0]["range_text"] == "up to SLE 500"
    assert see["sides"][1]["phrase"].startswith("Limited")  # None → Limited for any amount

    # Hidden: one headline, no sides — the same phrase the customer surface renders.
    await client.post(
        "/api/v1/agent/availability",
        json={"presence": "hidden", "cash_out": "small", "deposit": "none", "night_mode": True},
        headers=agent,
    )
    see = (await client.get("/api/v1/agent/home", headers=agent)).json()["customers_see"]
    assert see["state"] == "hidden" and see["sides"] == []
    assert see["headline"] == "Availability hidden"


@pytest.mark.asyncio
async def test_refresh_status_is_allowed_any_time_not_only_when_due(client, agent):
    fresh = await client.post(
        "/api/v1/agent/availability",
        json={"presence": "open", "cash_out": "most", "deposit": "most", "night_mode": True},
        headers=agent,
    )
    assert fresh.json()["confirm_due"] is False
    again = await client.post("/api/v1/agent/availability/confirm", headers=agent)
    assert again.status_code == 200 and again.json()["age_min"] == 0
    # A refresh is recorded as a confirm event, never as a new declaration.
    acts = (await client.get("/api/v1/agent/activity", headers=agent)).json()
    assert any("confirmed your status" in e["text"] for e in acts)


async def _two_failed_visits(client):
    for n in (1, 2):
        await client.post(
            "/api/v1/reports",
            json={
                "agent_id": "af-024",
                "transaction": "cash_out",
                "amount_sle": 6000,
                "answer": "no",
                "reason_code": "could_not_complete",
                "source": "search",
                "client_token": f"tok-row-{n}",
            },
            headers={"X-Client": f"cust-row-{n}"},
        )


@pytest.mark.asyncio
async def test_attention_row_call_and_nudge_are_logged_never_a_status_change(client, agent, dealer):
    await _two_failed_visits(client)
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    sig = [s for s in over["signals"] if s["id"] == "sig-mismatch-Agent 024"][0]
    assert sig["call_url"] == "tel:+23276000000"
    before = (await client.get("/api/v1/agent/home", headers=agent)).json()["declaration"]
    for action in ("call", "nudge"):
        r = await client.post(
            "/api/v1/actions", json={"agent": "Agent 024", "action": action}, headers=dealer
        )
        assert r.status_code == 201 and r.json()["action"] == action
    logged = {x["action"] for x in (await client.get("/api/v1/actions", headers=dealer)).json()}
    assert {"call", "nudge"} <= logged
    after = (await client.get("/api/v1/agent/home", headers=agent)).json()["declaration"]
    assert after == before  # nothing the dealer did touched the agent's declaration


@pytest.mark.asyncio
async def test_snooze_hides_a_signal_for_four_hours_and_is_logged(client, agent, dealer):
    await _two_failed_visits(client)
    sid = "sig-mismatch-Agent 024"
    r = await client.post("/api/v1/dealer/signals/snooze", json={"id": sid}, headers=dealer)
    assert r.status_code == 201, r.text
    body = r.json()
    from datetime import UTC, datetime

    until = datetime.fromisoformat(body["until"])
    assert 235 <= (until - datetime.now(UTC)).total_seconds() / 60 <= 240
    assert "snoozed" in body["note"] and body["agent_ref"] == "Agent 024"
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert all(s["id"] != sid for s in over["signals"])
    detail = (await client.get("/api/v1/dealer/agents/Agent 024", headers=dealer)).json()
    assert detail["open_signals"] == 0
    acts = (await client.get("/api/v1/actions?agent=Agent 024", headers=dealer)).json()
    assert acts[0]["action"] == "snooze"
    # The agent's own status is untouched and the reports still exist for tomorrow's recompute.
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["today"]["reported_problems"] == 2
    # Snoozing it again is refused: it is no longer a live signal.
    assert (
        await client.post("/api/v1/dealer/signals/snooze", json={"id": sid}, headers=dealer)
    ).status_code == 404


@pytest.mark.asyncio
async def test_resolve_hides_a_signal_for_the_rest_of_today(client, dealer):
    sid = "sig-stale-Agent 038"  # seeded three days stale, so this signal is always live
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert any(s["id"] == sid for s in over["signals"])
    r = await client.post("/api/v1/dealer/signals/resolve", json={"id": sid}, headers=dealer)
    assert r.status_code == 201, r.text
    assert r.json()["until"].endswith("23:59:59+00:00") and "resolved" in r.json()["note"]
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert all(s["id"] != sid for s in over["signals"])
    # Agent 038 is still expired: the signal was hidden from the queue, not fixed.
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    assert [x for x in rows if x["ref"] == "Agent 038"][0]["attention"] is True


@pytest.mark.asyncio
async def test_signal_mutes_are_404_for_unknown_ids_and_wrong_roles(client, agent, dealer):
    for bad in ("sig-stale-Agent 999", "nonsense", "sig-mismatch-Agent 031"):
        r = await client.post("/api/v1/dealer/signals/snooze", json={"id": bad}, headers=dealer)
        assert r.status_code == 404, bad
    r = await client.post(
        "/api/v1/dealer/signals/resolve", json={"id": "sig-stale-Agent 038"}, headers=agent
    )
    assert r.status_code == 404
    assert (
        await client.post(
            "/api/v1/dealer/signals/expire", json={"id": "sig-stale-Agent 038"}, headers=dealer
        )
    ).status_code == 422
