"""The learned ranker on the 7-day facts: every search logs the facts and the rule's own
percentage, a visit report labels the row, training learns the weights and says whether they
beat the rule, and RANKER=learned orders the agents while the customer still reads the rule."""

from __future__ import annotations

import json
from datetime import timedelta

import pytest
from app.core.settings import get_settings
from app.db import session as dbsession
from app.db.models import RankerModel, SearchImpression
from app.services.phrasing import now_utc
from app.services.ranker import (
    WEEK_DEFAULT_WEIGHTS,
    WEEK_FEATURES,
    current_model,
    current_week_model,
    fit,
    log_loss,
    probability,
    rule_log_loss,
    week_features,
)
from app.services.week_rule import Week, size_done
from sqlalchemy import select

SEARCH = {"transaction": "cash_out", "area": "Lumley", "amount_sle": 300}


def test_the_facts_read_as_the_rule_counts_them():
    w = Week(active_days=7)
    assert size_done(w, "cash_out", 300) == 0.0  # not done this week
    w.bands["cash"].add("≤500")
    assert size_done(w, "cash_out", 300) == 1.0
    assert size_done(w, "cash_out", 5_000) == 0.5  # only at smaller sizes
    assert size_done(w, "cash_out", None) == 1.0
    f = week_features(active_days=7, size_done=1.0, served=3, failed=1, distance_m=250, low=False)
    assert f == {
        "days_worked": 1.0,
        "size_done": 1.0,
        "report_balance": 0.5,
        "reports_known": 1.0,
        "distance_km": 0.25,
        "low_today": 0.0,
    }
    few = week_features(active_days=2, size_done=0.5, served=1, failed=1, distance_m=50, low=True)
    assert few["report_balance"] == 0.0 and few["reports_known"] == 0.0 and few["low_today"] == 1.0
    # The starting weights follow the rule: working every day at this size beats a new shop.
    assert probability(f, WEEK_DEFAULT_WEIGHTS, WEEK_FEATURES) > probability(
        few, WEEK_DEFAULT_WEIGHTS, WEEK_FEATURES
    )


def _rows(n: int = 60):
    """Visits where distance decides more than the rule thinks: near shops served, far ones not,
    whatever the rule said."""
    rows = []
    for i in range(n):
        near = i % 2 == 0
        f = week_features(
            active_days=5,
            size_done=1.0,
            served=0,
            failed=0,
            distance_m=100 if near else 480,
            low=False,
        )
        f["rule_pct"] = 65.0
        rows.append((f, 1 if near else 0))
    return rows


def test_training_learns_from_outcomes_and_can_beat_the_rule():
    rows = _rows()
    w = fit(rows, keys=WEEK_FEATURES)
    assert w["distance_km"] < WEEK_DEFAULT_WEIGHTS["distance_km"]  # learned: distance matters
    assert log_loss(rows, w, WEEK_FEATURES) < log_loss(rows, WEEK_DEFAULT_WEIGHTS, WEEK_FEATURES)
    assert log_loss(rows, w, WEEK_FEATURES) < rule_log_loss(rows)  # the bar to switch it on


@pytest.mark.asyncio
async def test_every_search_logs_the_7_day_facts_and_a_report_labels_them(client, agent):
    r = await client.post(
        "/api/v1/agent/transactions",
        json={"transaction": "cash_out", "amount_band": "≤5k", "client_token": "lr-tx-00001"},
        headers=agent,
    )
    assert r.status_code == 201, r.text
    r = await client.post("/api/v1/search", json=SEARCH, headers={"X-Client": "dev-lr1"})
    assert r.status_code == 200
    assert "days_worked" not in r.text and "rule_pct" not in r.text  # never to the customer
    async with dbsession.get_session_factory()() as db:
        fat = (
            (
                await db.execute(
                    select(SearchImpression).where(SearchImpression.agent_ref == "Agent 024")
                )
            )
            .scalars()
            .first()
        )
    f = json.loads(fat.features_json)
    assert set(f) == {*WEEK_FEATURES, "rule_pct"}
    assert f["size_done"] == 1.0 and f["days_worked"] > 0 and f["rule_pct"] >= 40
    assert fat.probability == pytest.approx(f["rule_pct"] / 100)  # the rule ranks by default
    rep = await client.post(
        "/api/v1/reports",
        json={
            "agent_id": "af-024",
            "transaction": "cash_out",
            "amount_sle": 300,
            "answer": "yes",
            "source": "search",
            "client_token": "lr-rep-0001",
        },
        headers={"X-Client": "dev-lr1"},
    )
    assert rep.status_code == 201
    async with dbsession.get_session_factory()() as db:
        again = (
            await db.execute(select(SearchImpression).where(SearchImpression.id == fat.id))
        ).scalar_one()
    assert again.label == 1


@pytest.mark.asyncio
async def test_the_training_script_stores_the_learned_weights_apart(client, capsys):
    from scripts.train_ranker import main

    async with dbsession.get_session_factory()() as db:
        at = now_utc() - timedelta(days=1)
        for f, y in _rows(40):
            db.add(
                SearchImpression(
                    at=at,
                    client_key="dev-train",
                    agent_ref="Agent 024",
                    transaction="cash_out",
                    amount_band="≤500",
                    features_json=json.dumps(f),
                    outcome_shown="likely",
                    probability=f["rule_pct"] / 100,
                    label=y,
                    labelled_at=at,
                )
            )
        await db.commit()
    await main()
    out = capsys.readouterr().out
    assert "7-day facts: 40 labelled visits" in out and "beats the rule: yes" in out
    async with dbsession.get_session_factory()() as db:
        week = await current_week_model(db)
        older = await current_model(db)
    assert week.trained_on == 40 and "days_worked" in week.weights
    assert "days_worked" not in older.weights  # the older ranker keeps its own weights


@pytest.fixture
def learned(monkeypatch):
    monkeypatch.setenv("RANKER", "learned")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_learned_mode_orders_by_the_learned_chance_while_customers_read_the_rule(
    client, agent, learned
):
    r = await client.post(
        "/api/v1/agent/transactions",
        json={"transaction": "cash_out", "amount_band": "≤5k", "client_token": "lr-tx-00002"},
        headers=agent,
    )
    assert r.status_code == 201, r.text
    weights = {**WEEK_DEFAULT_WEIGHTS, "distance_km": -4.0}
    async with dbsession.get_session_factory()() as db:
        db.add(RankerModel(at=now_utc(), weights_json=json.dumps(weights), trained_on=40, note="t"))
        await db.commit()
    d = (await client.post("/api/v1/search", json=SEARCH, headers={"X-Client": "dev-lr2"})).json()
    rows = d["recommended"] + d["results"] + d["closer_not_serving"] + d["further_away"]
    fat = next(x for x in rows if x["name"] == "Fatmata's Shop")
    async with dbsession.get_session_factory()() as db:
        imp = (
            (
                await db.execute(
                    select(SearchImpression).where(SearchImpression.client_key == "dev-lr2")
                )
            )
            .scalars()
            .all()
        )
    mine = next(i for i in imp if i.agent_ref == "Agent 024")
    f = json.loads(mine.features_json)
    # The customer reads the rule's percentage; the order uses the learned chance.
    assert fat["served_pct"] == int(f["rule_pct"])
    assert mine.probability == pytest.approx(probability(f, weights, WEEK_FEATURES))
    assert mine.probability != pytest.approx(f["rule_pct"] / 100)
