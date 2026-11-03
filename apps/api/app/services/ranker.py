"""Recommendation computed from activity, not from words.

Every candidate agent gets a probability that a visit for this request succeeds, from what
the system actually knows: the margin between what they can cover and what is asked (the
operator's position when the feed is on, the ledger otherwise), how recently they
transacted, failures for float today, how fresh the information is, distance, and how often
their word has held up. Among agents whose phrase is "likely", the recommendation is the
highest probability. The words stay only as the fallback for agents with no feed.

The model is a logistic regression small enough to read. It ships with hand-set weights so
the order is sensible on day one, and `fit()` re-estimates them from the training log
(search impressions joined to the visit reports that followed) once the pilot has examples.
Pure Python: no new library. It never hides anyone. The customer reads it only as a rounded
likelihood of being served (served_pct), never the features or the weights.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RankerModel

FEATURES = (
    "margin",  # (cover − amount) / amount, clipped to [−1, 1]; 1 when there is no ceiling
    "recent_tx",  # transactions in the last hour (feed), else 0
    "minutes_since_tx",  # feed: minutes since last transaction; else age of the declaration
    "failed_today",  # failures for lack of float today (feed) or failed visits reported today
    "freshness_min",  # age of the information behind the phrase, minutes
    "distance_km",
    "trust_rate",  # share of "likely" visits that matched, or a 0.7 prior with no record
    "live",  # 1 when the operator feed is behind the phrase
)

DEFAULT_WEIGHTS: dict[str, float] = {
    "bias": 0.6,
    "margin": 2.0,
    "recent_tx": 0.25,
    "minutes_since_tx": -0.006,
    "failed_today": -0.8,
    "freshness_min": -0.004,
    "distance_km": -0.3,
    "trust_rate": 1.5,
    "live": 0.5,
}


# The learned ranker on the 7-day facts. Every search under the 7-day rule logs exactly these
# for each agent shown, with the rule's own percentage beside them; a visit report labels the
# row; scripts.train_ranker learns the weights from those outcomes and says whether they beat
# the rule. With RANKER=learned the learned chance orders the agents, while the customer still
# reads the rule's percentage and its caps. The starting weights follow the rule's emphasis.
WEEK_FEATURES = (
    "days_worked",  # active days of the last 7, as a share: 0 to 1
    "size_done",  # any transaction at this size or larger 1, only smaller 0.5, none 0
    "report_balance",  # (served - failed) / reports, once there are 3; else 0
    "reports_known",  # 1 once there are 3 reports for this type
    "distance_km",
    "low_today",  # 1 when the agent said Low or None today for this side
)

WEEK_DEFAULT_WEIGHTS: dict[str, float] = {
    "bias": -2.2,
    "days_worked": 2.4,
    "size_done": 2.0,
    "report_balance": 1.0,
    "reports_known": 0.0,
    "distance_km": -0.3,
    "low_today": -2.0,
}


def week_features(
    *, active_days: int, size_done: float, served: int, failed: int, distance_m: int, low: bool
) -> dict[str, float]:
    reports = served + failed
    known = reports >= 3
    return {
        "days_worked": min(active_days, 7) / 7,
        "size_done": size_done,
        "report_balance": (served - failed) / reports if known else 0.0,
        "reports_known": 1.0 if known else 0.0,
        "distance_km": min(distance_m / 1000.0, 20.0),
        "low_today": 1.0 if low else 0.0,
    }


def features(
    *,
    ceiling: int | None,
    amount: int | None,
    live: bool,
    feed_age_min: int | None,
    tx_last_hour: int,
    failed_today: int,
    freshness_min: int | None,
    distance_m: int,
    trust_visits: int,
    trust_matched: int,
    last_tx_min: int | None = None,
) -> dict[str, float]:
    if amount is None:
        margin = 1.0 if ceiling is None or ceiling > 0 else -1.0
    elif ceiling is None:
        margin = 1.0
    else:
        margin = max(-1.0, min(1.0, (ceiling - amount) / max(amount, 1)))
    fresh = float(freshness_min if freshness_min is not None else 240)
    since = float(
        feed_age_min
        if (live and feed_age_min is not None)
        else last_tx_min
        if last_tx_min is not None
        else fresh
    )
    trust = trust_matched / trust_visits if trust_visits >= 3 else 0.7
    return {
        "margin": margin,
        "recent_tx": float(min(tx_last_hour, 20)),
        "minutes_since_tx": min(since, 480.0),
        "failed_today": float(min(failed_today, 5)),
        "freshness_min": min(fresh, 480.0),
        "distance_km": min(distance_m / 1000.0, 20.0),
        "trust_rate": trust,
        "live": 1.0 if live else 0.0,
    }


def probability(
    f: dict[str, float],
    weights: dict[str, float] | None = None,
    keys: tuple[str, ...] = FEATURES,
) -> float:
    w = weights or (DEFAULT_WEIGHTS if keys is FEATURES else WEEK_DEFAULT_WEIGHTS)
    z = w.get("bias", 0.0) + sum(w.get(k, 0.0) * f.get(k, 0.0) for k in keys)
    z = max(-30.0, min(30.0, z))
    return 1.0 / (1.0 + math.exp(-z))


SERVED_PCT_STEP = 5
SERVED_PCT_MIN = 5
SERVED_PCT_MAX = 95


def served_pct(p: float) -> int:
    """The probability as a customer reads it. Rounded to the nearest five, because a round
    figure says "about"; and never 100 (nor 0), because nothing here is a promise: the
    agent's drawer can change between the search and the visit."""
    pct = int(round(p * 100 / SERVED_PCT_STEP)) * SERVED_PCT_STEP
    return max(SERVED_PCT_MIN, min(SERVED_PCT_MAX, pct))


def fit(
    rows: list[tuple[dict[str, float], int]],
    *,
    start: dict[str, float] | None = None,
    epochs: int = 400,
    lr: float = 0.05,
    l2: float = 0.01,
    keys: tuple[str, ...] = FEATURES,
) -> dict[str, float]:
    """Logistic regression by gradient descent from the current weights, with a small
    penalty that keeps them near the start when examples are few. Deterministic."""
    base = start or (DEFAULT_WEIGHTS if keys is FEATURES else WEEK_DEFAULT_WEIGHTS)
    w = dict(base)
    if not rows:
        return w
    n = len(rows)
    for _ in range(epochs):
        grad = {k: 0.0 for k in w}
        for f, y in rows:
            p = probability(f, w, keys)
            err = p - y
            grad["bias"] += err
            for k in keys:
                grad[k] += err * f.get(k, 0.0)
        for k in w:
            reg = l2 * (w[k] - base.get(k, 0.0))
            w[k] -= lr * (grad[k] / n + reg)
    return w


def _loss(p: float, y: int) -> float:
    eps = 1e-9
    p = min(1 - eps, max(eps, p))
    return -(y * math.log(p) + (1 - y) * math.log(1 - p))


def log_loss(
    rows: list[tuple[dict[str, float], int]],
    weights: dict[str, float],
    keys: tuple[str, ...] = FEATURES,
) -> float:
    if not rows:
        return 0.0
    return sum(_loss(probability(f, weights, keys), y) for f, y in rows) / len(rows)


def rule_log_loss(rows: list[tuple[dict[str, float], int]]) -> float:
    """How well the 7-day rule's own percentage, logged beside the facts, predicted the
    visits: the bar the learned weights must clear before RANKER=learned is worth switching on."""
    if not rows:
        return 0.0
    return sum(_loss(f.get("rule_pct", 50) / 100, y) for f, y in rows) / len(rows)


def is_week_model(weights: dict[str, float]) -> bool:
    return "days_worked" in weights


@dataclass(frozen=True)
class Model:
    weights: dict[str, float]
    trained_on: int
    at: datetime | None

    @property
    def label(self) -> str:
        return f"learned from {self.trained_on} visits" if self.trained_on else "starting weights"


async def _latest(db: AsyncSession, week: bool) -> Model | None:
    rows = (
        (await db.execute(select(RankerModel).order_by(RankerModel.at.desc()).limit(50)))
        .scalars()
        .all()
    )
    for row in rows:
        w = json.loads(row.weights_json)
        if is_week_model(w) == week:
            return Model(w, row.trained_on, row.at)
    return None


async def current_model(db: AsyncSession) -> Model:
    """The older activity ranker's latest weights (RANKER=activity)."""
    return await _latest(db, week=False) or Model(dict(DEFAULT_WEIGHTS), 0, None)


async def current_week_model(db: AsyncSession) -> Model:
    """The learned ranker on the 7-day facts (RANKER=learned)."""
    return await _latest(db, week=True) or Model(dict(WEEK_DEFAULT_WEIGHTS), 0, None)
