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
Pure Python: no new library. It never hides anyone and never reaches the customer payload.
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
) -> dict[str, float]:
    if amount is None:
        margin = 1.0 if ceiling is None or ceiling > 0 else -1.0
    elif ceiling is None:
        margin = 1.0
    else:
        margin = max(-1.0, min(1.0, (ceiling - amount) / max(amount, 1)))
    fresh = float(freshness_min if freshness_min is not None else 240)
    since = float(feed_age_min if (live and feed_age_min is not None) else fresh)
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


def probability(f: dict[str, float], weights: dict[str, float] | None = None) -> float:
    w = weights or DEFAULT_WEIGHTS
    z = w.get("bias", 0.0) + sum(w.get(k, 0.0) * f.get(k, 0.0) for k in FEATURES)
    z = max(-30.0, min(30.0, z))
    return 1.0 / (1.0 + math.exp(-z))


def fit(
    rows: list[tuple[dict[str, float], int]],
    *,
    start: dict[str, float] | None = None,
    epochs: int = 400,
    lr: float = 0.05,
    l2: float = 0.01,
) -> dict[str, float]:
    """Logistic regression by gradient descent from the current weights, with a small
    penalty that keeps them near the start when examples are few. Deterministic."""
    w = dict(start or DEFAULT_WEIGHTS)
    if not rows:
        return w
    n = len(rows)
    for _ in range(epochs):
        grad = {k: 0.0 for k in w}
        for f, y in rows:
            p = probability(f, w)
            err = p - y
            grad["bias"] += err
            for k in FEATURES:
                grad[k] += err * f.get(k, 0.0)
        for k in w:
            reg = l2 * (w[k] - (start or DEFAULT_WEIGHTS).get(k, 0.0))
            w[k] -= lr * (grad[k] / n + reg)
    return w


def log_loss(rows: list[tuple[dict[str, float], int]], weights: dict[str, float]) -> float:
    if not rows:
        return 0.0
    eps = 1e-9
    total = 0.0
    for f, y in rows:
        p = min(1 - eps, max(eps, probability(f, weights)))
        total += -(y * math.log(p) + (1 - y) * math.log(1 - p))
    return total / len(rows)


@dataclass(frozen=True)
class Model:
    weights: dict[str, float]
    trained_on: int
    at: datetime | None

    @property
    def label(self) -> str:
        return f"learned from {self.trained_on} visits" if self.trained_on else "starting weights"


async def current_model(db: AsyncSession) -> Model:
    row = (
        await db.execute(select(RankerModel).order_by(RankerModel.at.desc()).limit(1))
    ).scalar_one_or_none()
    if row is None:
        return Model(dict(DEFAULT_WEIGHTS), 0, None)
    return Model(json.loads(row.weights_json), row.trained_on, row.at)
