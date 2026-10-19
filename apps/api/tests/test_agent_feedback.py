"""What customers said reaches the agent: failed visits with their reason, comments and
ratings, so the agent can work on it. Who said it never does: no number, device, time of day
or amount, only the day. Customers still read none of it."""

from __future__ import annotations

import pytest

CUST = {"X-Client": "cust-fb-1"}


async def _report(client, token: str, headers: dict | None = None, **over):
    body = {
        "agent_id": "af-024",
        "transaction": "cash_out",
        "amount_sle": 2000,
        "answer": "yes",
        "source": "search",
        "client_token": token,
    }
    body.update(over)
    r = await client.post("/api/v1/reports", json=body, headers=headers or CUST)
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_agent_reads_why_customers_failed_and_what_they_wrote_but_never_who(
    client, agent, frozen_clock
):
    await _report(client, "fb-token-00000001", answer="yes", rating=4)
    await _report(
        client,
        "fb-token-00000002",
        answer="no",
        reason_code="less_than_requested",
        comment="  Only had 1,500 when I came for 2,000. ",
    )
    await _report(
        client,
        "fb-token-00000003",
        transaction=None,
        amount_sle=None,
        answer="comment",
        source="direct",
        comment="The shop was clean and the queue moved fast.",
    )
    r = await client.get("/api/v1/agent/feedback", headers=agent)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["days"] == 30
    assert body["summary"] == {
        "served": 1,
        "not_served": 1,
        "comments": 2,
        "ratings": 1,
        "rating_average": None,
    }
    kinds = [x["kind"] for x in body["items"]]
    assert sorted(kinds) == ["comment", "not_served"]
    failed = [x for x in body["items"] if x["kind"] == "not_served"][0]
    assert failed["reason_text"] == "Had less than the customer asked for"
    assert failed["comment"] == "Only had 1,500 when I came for 2,000."
    assert failed["transaction_label"] == "Cash out" and failed["day_text"] == "Today"
    assert failed["rating"] is None
    only = [x for x in body["items"] if x["kind"] == "comment"][0]
    assert only["comment"] == "The shop was clean and the queue moved fast."
    assert only["reason_text"] is None and only["transaction_label"] is None
    # Nothing that points at a person: the device key, the hour, the amount, the token.
    text = r.text
    for forbidden in ("cust-fb-1", "fb-token", "client_key", "amount_", "12:0", '"at"'):
        assert forbidden not in text, forbidden
    assert set(failed) == {
        "id",
        "day_text",
        "kind",
        "transaction_label",
        "reason_text",
        "rating",
        "comment",
    }
    # Ids are stable across reads, so a screen can key on them.
    again = (await client.get("/api/v1/agent/feedback", headers=agent)).json()
    assert [x["id"] for x in again["items"]] == [x["id"] for x in body["items"]]


@pytest.mark.asyncio
async def test_the_day_is_all_the_agent_learns_about_when(client, agent, frozen_clock):
    await _report(client, "fb-token-00000010", answer="no", reason_code="closed")
    frozen_clock.advance(24 * 60)
    items = (await client.get("/api/v1/agent/feedback", headers=agent)).json()["items"]
    assert items[0]["day_text"] == "Yesterday"
    frozen_clock.advance(2 * 24 * 60)
    items = (await client.get("/api/v1/agent/feedback", headers=agent)).json()["items"]
    assert items[0]["day_text"] == "3 days ago"
    frozen_clock.advance(28 * 24 * 60)
    body = (await client.get("/api/v1/agent/feedback", headers=agent)).json()
    assert body["items"] == [] and body["summary"]["not_served"] == 0


@pytest.mark.asyncio
async def test_a_rating_average_appears_for_the_agent_only_from_three_ratings(client, agent):
    # One rating per browser per agent per day: each rating comes from its own browser.
    for i, score in enumerate((5, 3)):
        await _report(
            client,
            f"fb-token-0000002{i}",
            headers={"X-Client": f"cust-fb-r{i}"},
            answer="did_not_go",
            rating=score,
        )
    assert (await client.get("/api/v1/agent/feedback", headers=agent)).json()["summary"][
        "rating_average"
    ] is None
    # A third rating from another browser (one rating per browser per agent per day).
    r = await client.post(
        "/api/v1/reports",
        json={
            "agent_id": "af-024",
            "transaction": None,
            "amount_sle": None,
            "answer": "did_not_go",
            "rating": 4,
            "source": "direct",
            "client_token": "fb-token-00000029",
        },
        headers={"X-Client": "cust-fb-2"},
    )
    assert r.status_code == 201, r.text
    summary = (await client.get("/api/v1/agent/feedback", headers=agent)).json()["summary"]
    assert summary["ratings"] == 3 and summary["rating_average"] == 4.0


@pytest.mark.asyncio
async def test_feedback_is_the_agents_own_and_nobody_elses(client, agent, dealer):
    await _report(client, "fb-token-00000030", agent_id="af-031", answer="no", reason_code="other")
    await _report(client, "fb-token-00000031", answer="no", reason_code="unavailable")
    items = (await client.get("/api/v1/agent/feedback", headers=agent)).json()["items"]
    assert [x["reason_text"] for x in items] == ["Was unavailable"]
    assert (await client.get("/api/v1/agent/feedback", headers=dealer)).status_code == 404
    assert (await client.get("/api/v1/agent/feedback")).status_code == 401


@pytest.mark.asyncio
async def test_customers_still_read_no_comment_anywhere(client):
    await _report(
        client, "fb-token-00000040", answer="no", reason_code="other", comment="SECRET WORDS"
    )
    s = await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "amount_sle": 2000, "area": "Lumley"},
        headers=CUST,
    )
    d = await client.get("/api/v1/agents/af-024", params={"transaction": "cash_out"})
    assert "SECRET WORDS" not in s.text and "SECRET WORDS" not in d.text
    assert "comment" not in s.text and "comment" not in d.text
