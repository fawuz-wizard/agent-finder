"""Evidence by amount: what an agent usually serves, from history rather than a word."""

from __future__ import annotations

import pytest
from app.core.settings import get_settings
from app.services.evidence import ceiling_from_bands

HDR = {"X-Client": "cust-evidence"}
SEARCH = {"transaction": "cash_out", "area": "Lumley"}


def test_ceiling_is_the_highest_band_served_more_than_declined():
    assert ceiling_from_bands({}, {}) is None
    assert ceiling_from_bands({"≤500": 3}, {}) == 500
    assert ceiling_from_bands({"≤500": 40, "≤2k": 60, "≤5k": 25, "≤10k": 6}, {"≤10k": 2}) == 10_000
    assert ceiling_from_bands({"≤500": 12}, {"≤2k": 4}) == 500  # declined above what is served
    assert ceiling_from_bands({"≤2k": 5, "≤10k": 1}, {"≤5k": 3}) == 2_000  # a wall in between


async def _fatmata(client, amount, tx="cash_out"):
    r = await client.post(
        "/api/v1/search", json={**SEARCH, "transaction": tx, "amount_sle": amount}, headers=HDR
    )  # noqa: E501
    d = r.json()
    return [
        x
        for x in d["recommended"] + d["closer_not_serving"] + d["results"]
        if x["name"] == "Fatmata's Shop"
    ][0]  # noqa: E501


@pytest.mark.asyncio
async def test_dealers_note_sets_what_reads_as_likely_and_beats_the_word(client, agent, dealer):
    assert (await _fatmata(client, 8_000))["outcome"] == "likely"  # her word is "most"
    r = await client.put(
        "/api/v1/dealer/agents/Agent 024/usual",
        json={"usual_max_sle": 5_000, "usual_float_max_sle": 3_000, "usual_daily_transactions": 30},
        headers=dealer,
    )
    assert r.status_code == 200 and r.json()["usual_max_sle"] == 5_000
    assert (await _fatmata(client, 5_000))["outcome"] == "likely"
    assert (await _fatmata(client, 5_001))["outcome"] == "limited"
    assert (await _fatmata(client, 3_000, "deposit"))["outcome"] == "likely"
    assert (await _fatmata(client, 3_001, "deposit"))["outcome"] == "limited"
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    cash = home["customers_see"]["sides"][0]
    assert cash["range_text"] == "up to SLE 5,000"
    assert cash["estimate_text"] == "Your dealer noted you usually handle up to about SLE 5,000"
    detail = (await client.get("/api/v1/dealer/agents/Agent 024", headers=dealer)).json()
    assert (
        detail["usual"]["usual_max_sle"] == 5_000
        and detail["evidence"]["cash"]["source"] == "dealer"
    )  # noqa: E501
    # Customers never see the note, the source, or the figure.
    text = (
        await client.post("/api/v1/search", json={**SEARCH, "amount_sle": 2_000}, headers=HDR)
    ).text  # noqa: E501
    for private in ("usual", "dealer noted", "5,000", "5000", "evidence"):
        assert private not in text, private
    # Only my own agents.
    assert (
        await client.put("/api/v1/dealer/agents/Agent 999/usual", json={}, headers=dealer)
    ).status_code == 404  # noqa: E501
    assert (
        await client.put("/api/v1/dealer/agents/Agent 024/usual", json={}, headers=agent)
    ).status_code == 404  # noqa: E501


@pytest.mark.asyncio
async def test_confirmed_visits_become_evidence_when_there_is_no_note(client, dealer, frozen_clock):
    # Kadiatu (Agent 066, word "most"): three confirmed visits around SLE 3,000 and one
    # failure at 8,000 give her a 5,000 ceiling by evidence; the word no longer decides.
    for n, (amount, answer, reason) in enumerate(
        [
            (3_000, "yes", None),
            (2_500, "yes", None),
            (4_000, "yes", None),
            (8_000, "no", "could_not_complete"),
        ]  # noqa: E501
    ):
        frozen_clock.advance(1)
        r = await client.post(
            "/api/v1/reports",
            json={
                "agent_id": "af-066",
                "transaction": "cash_out",
                "amount_sle": amount,
                "answer": answer,
                "reason_code": reason,
                "source": "search",
                "client_token": f"tok-ev-{n}",
            },  # noqa: E501
            headers=HDR,
        )
        assert r.status_code == 201
    # Kadiatu refreshes so the ledger's own cap clears; the evidence stays.
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "Agent 066", "pin": "1234", "role": "agent"}
    )  # noqa: E501
    kad = {"Authorization": f"Bearer {r.json()['token']}"}
    frozen_clock.advance(1)
    assert (await client.post("/api/v1/agent/availability/confirm", headers=kad)).status_code == 200
    detail = (await client.get("/api/v1/dealer/agents/Agent 066", headers=dealer)).json()
    assert detail["evidence"]["cash"]["source"] == "visits"
    assert (
        detail["evidence"]["cash"]["text"]
        == "3 confirmed visits in the last 30 days, usually up to about SLE 5,000"
    )  # noqa: E501
    r = await client.post("/api/v1/search", json={**SEARCH, "amount_sle": 6_000}, headers=HDR)
    d = r.json()
    kadiatu = [
        x
        for x in d["recommended"] + d["closer_not_serving"] + d["results"]
        if x["name"] == "Kadiatu's Kiosk"
    ][0]  # noqa: E501
    assert kadiatu["outcome"] == "limited"


@pytest.fixture
def feed_on(monkeypatch):
    monkeypatch.setenv("OPERATOR_FEED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_operators_records_are_the_first_source(feed_on, client, dealer):
    detail = (await client.get("/api/v1/dealer/agents/Agent 038", headers=dealer)).json()
    ev = detail["evidence"]["cash"]
    assert ev["source"] == "operator" and ev["text"].startswith(
        "Orange (demo): 12 served in the last 30 days"
    )  # noqa: E501
    assert "usually up to about SLE 500" in ev["text"]
