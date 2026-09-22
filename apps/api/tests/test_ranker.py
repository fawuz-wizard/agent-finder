"""The activity ranker: a success probability from what is known, a training log that the
visit reports label, and weights that learn. Words are the fallback, never the ranking."""

from __future__ import annotations

import json

import pytest
from app.core.settings import get_settings
from app.db import session as dbsession
from app.db.models import SearchImpression
from app.services.ranker import DEFAULT_WEIGHTS, features, fit, log_loss, probability
from sqlalchemy import select

SEARCH = {"transaction": "cash_out", "area": "Lumley"}


def _f(**over):
    base = dict(
        ceiling=None,
        amount=2_000,
        live=False,
        feed_age_min=None,
        tx_last_hour=0,
        failed_today=0,
        freshness_min=10,
        distance_m=300,
        trust_visits=0,
        trust_matched=0,
    )
    base.update(over)
    return features(**base)


def test_features_and_probability_move_the_right_way():
    good = _f(live=True, feed_age_min=4, tx_last_hour=6, ceiling=9_000)
    thin = _f(ceiling=2_100)
    short = _f(ceiling=1_500)
    stale = _f(freshness_min=200)
    far = _f(distance_m=5_000)
    failing = _f(failed_today=2)
    untrusted = _f(trust_visits=5, trust_matched=1)
    p = probability
    assert p(good) > p(thin) > p(short)
    assert p(_f()) > p(stale) and p(_f()) > p(far) and p(_f()) > p(failing) > 0
    assert p(_f()) > p(untrusted)
    assert good["margin"] == 1.0 and short["margin"] == -0.25 and thin["margin"] == 0.05


def test_fit_learns_from_labelled_rows_and_lowers_the_loss():
    rows = []
    for i in range(40):
        served = i % 4 != 0
        # Served visits had margin and recency; failed ones were thin and stale.
        rows.append(
            (
                _f(ceiling=6_000 if served else 2_050, freshness_min=5 if served else 150),
                1 if served else 0,
            )
        )
    w = fit(rows)
    assert log_loss(rows, w) < log_loss(rows, DEFAULT_WEIGHTS)
    assert w["margin"] > 0 and w["freshness_min"] < 0


@pytest.mark.asyncio
async def test_search_logs_impressions_and_reports_label_them(client, frozen_clock):
    r = await client.post(
        "/api/v1/search", json={**SEARCH, "amount_sle": 2_000}, headers={"X-Client": "dev-r1"}
    )
    assert r.status_code == 200
    assert "probability" not in r.text and "features" not in r.text
    async with dbsession.get_session_factory()() as db:
        rows = (await db.execute(select(SearchImpression))).scalars().all()
    assert rows and all(x.label is None for x in rows)
    fat = [x for x in rows if x.agent_ref == "Agent 024"][0]
    f = json.loads(fat.features_json)
    assert set(f) >= {"margin", "distance_km", "trust_rate", "live"} and fat.client_key == "dev-r1"
    assert fat.amount_band == "≤2k" and 0 < fat.probability < 1
    frozen_clock.advance(2)
    rep = await client.post(
        "/api/v1/reports",
        json={
            "agent_id": "af-024",
            "transaction": "cash_out",
            "amount_sle": 2_000,
            "answer": "no",
            "reason_code": "could_not_complete",
            "source": "search",
            "client_token": "tok-rank-1",
        },
        headers={"X-Client": "dev-r1"},
    )
    assert rep.status_code == 201
    async with dbsession.get_session_factory()() as db:
        fat2 = (
            await db.execute(select(SearchImpression).where(SearchImpression.id == fat.id))
        ).scalar_one()
        others = (
            (
                await db.execute(
                    select(SearchImpression).where(SearchImpression.agent_ref != "Agent 024")
                )
            )
            .scalars()
            .all()
        )
    assert fat2.label == 0 and fat2.labelled_at is not None
    assert all(x.label is None for x in others)  # only the agent the customer went to


@pytest.fixture
def feed_on(monkeypatch):
    monkeypatch.setenv("OPERATOR_FEED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_activity_outranks_words_when_the_feed_is_on(feed_on, client):
    # Kadiatu (no feed, "most", fresher, farther) vs Fatmata (feed: 8,347 cash read minutes ago).
    r = await client.post(
        "/api/v1/search", json={**SEARCH, "amount_sle": 2_000}, headers={"X-Client": "dev-r2"}
    )
    names = [x["name"] for x in r.json()["recommended"]]
    assert names[0] == "Fatmata's Shop"


@pytest.mark.asyncio
async def test_rules_mode_keeps_the_fixed_order_and_logs_nothing(monkeypatch, client):
    monkeypatch.setenv("RANKER", "rules")
    get_settings.cache_clear()
    try:
        r = await client.post(
            "/api/v1/search", json={**SEARCH, "amount_sle": 2_000}, headers={"X-Client": "dev-r3"}
        )
        assert [x["name"] for x in r.json()["recommended"]] == ["Kadiatu's Kiosk", "Fatmata's Shop"]
        async with dbsession.get_session_factory()() as db:
            assert (await db.execute(select(SearchImpression))).scalars().all() == []
    finally:
        get_settings.cache_clear()
