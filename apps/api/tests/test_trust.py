"""Trust score: the share of "likely" visits where the word held up. Dealer-facing; ranks and
flags; never a word changed, never shown to a customer."""

from __future__ import annotations

import pytest
from app.services.trust import score

HDR = {"X-Client": "cust-trust"}


def test_score_labels_by_failure_rate_with_a_minimum_track_record():
    assert score(0, 0).label == "new" and score(2, 2).label == "new"
    assert score(3, 0).label == "reliable" and score(10, 1).label == "reliable"
    assert score(10, 2).label == "mixed" and score(3, 1).label == "mixed"
    assert score(3, 2).label == "unreliable" and score(10, 4).label == "unreliable"
    assert score(10, 4).text == "6 of 10 visits matched the status in the last 14 days."
    assert "no track record" in score(1, 0).text


async def _visit(client, clock, agent_id, token, answer, reason=None):
    clock.advance(1)
    r = await client.post(
        "/api/v1/reports",
        json={
            "agent_id": agent_id,
            "transaction": "cash_out",
            "amount_sle": 2000,
            "answer": answer,
            "reason_code": reason,
            "source": "search",
            "client_token": token,
        },
        headers=HDR,
    )
    assert r.status_code == 201, r.text


async def _refresh(client, headers, clock):
    clock.advance(1)
    r = await client.post("/api/v1/agent/availability/confirm", headers=headers)
    assert r.status_code == 200, r.text


@pytest.fixture
async def kadiatu(client):
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "Agent 066", "pin": "1234", "role": "agent"}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.mark.asyncio
async def test_unreliable_word_ranks_after_a_reliable_one_and_flags_the_dealer(
    client, dealer, kadiatu, frozen_clock
):
    async def order():
        r = await client.post(
            "/api/v1/search",
            json={"transaction": "cash_out", "amount_sle": 2000, "area": "Lumley"},
            headers=HDR,
        )
        return [x["name"] for x in r.json()["recommended"]], r.text

    names, text = await order()
    assert names == ["Kadiatu's Kiosk", "Fatmata's Shop"]  # fresher first, both likely
    # Three customers told "likely" at Kadiatu's could not be served for lack of cash.
    for n in range(3):
        await _visit(client, frozen_clock, "af-066", f"tok-kad-{n}", "no", "could_not_complete")
    await _refresh(client, kadiatu, frozen_clock)  # she refreshes: the cap clears, the record stays
    names, text = await order()
    assert names == ["Fatmata's Shop", "Kadiatu's Kiosk"]  # still likely, but after Fatmata
    for private in ("reliab", "matched", "track record", "trust"):
        assert private not in text.lower(), private

    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    kad = [x for x in rows if x["ref"] == "Agent 066"][0]
    assert kad["reliability"]["label"] == "unreliable" and kad["attention"] is True
    assert kad["reliability"]["text"] == "0 of 3 visits matched the status in the last 14 days."
    fat = [x for x in rows if x["ref"] == "Agent 024"][0]
    assert fat["reliability"]["label"] == "new"
    detail = (await client.get("/api/v1/dealer/agents/Agent 066", headers=dealer)).json()
    assert detail["reliability"]["label_text"] == "Unreliable"
    over = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    sig = [s for s in over["signals"] if s["id"] == "sig-trust-Agent 066"][0]
    assert sig["title"] == "Status keeps failing customers" and sig["severity"] == "high"
    assert "3 of 3 customers" in sig["sentence"]
    # Her words were never touched by any of it.
    assert detail["declaration"]["cash_out"] == "most"


@pytest.mark.asyncio
async def test_confirmed_visits_build_a_reliable_record(client, dealer, frozen_clock):
    for n in range(4):
        await _visit(client, frozen_clock, "af-024", f"tok-fat-{n}", "yes")
    await _visit(client, frozen_clock, "af-024", "tok-fat-fee", "no", "charged_extra")  # not money
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    fat = [x for x in rows if x["ref"] == "Agent 024"][0]
    assert fat["reliability"] == {
        "label": "reliable",
        "label_text": "Reliable",
        "text": "5 of 5 visits matched the status in the last 14 days.",
        "visits": 5,
        "matched": 5,
    }
