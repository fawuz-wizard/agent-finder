"""Ranking: deterministic, explainable ordering of search results.

Order: outcome tier → freshness → distance. No learning, no randomness. The explanation is
returned alongside the score so admins (never the public) can see why an agent ranks where it does.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.types import FreshnessState, PublicOutcome

# Lower is better. Tiers are deliberately far apart so freshness/distance never cross a tier.
OUTCOME_TIER: dict[PublicOutcome, int] = {
    PublicOutcome.LIKELY: 0,
    PublicOutcome.LIMITED: 1,
    PublicOutcome.NOT_SET: 2,
    PublicOutcome.EXPIRED: 3,
    PublicOutcome.CLOSED: 4,
    PublicOutcome.HIDDEN: 5,
}

FRESHNESS_RANK: dict[FreshnessState, int] = {
    FreshnessState.FRESH: 0,
    FreshnessState.AGEING: 1,
    FreshnessState.MAY_HAVE_CHANGED: 2,
    FreshnessState.NOT_SET: 3,
    FreshnessState.EXPIRED: 4,
}


@dataclass(frozen=True)
class Candidate:
    agent_id: str
    outcome: PublicOutcome
    freshness: FreshnessState
    distance_m: float


@dataclass(frozen=True)
class Ranked:
    agent_id: str
    position: int
    sort_key: tuple[int, int, float, str]
    explanation: dict[str, object] = field(default_factory=dict)


def sort_key(c: Candidate) -> tuple[int, int, float, str]:
    # agent_id last: a stable tiebreak so equal candidates always order the same way.
    return (
        OUTCOME_TIER[c.outcome],
        FRESHNESS_RANK[c.freshness],
        round(c.distance_m, 1),
        c.agent_id,
    )


def rank(candidates: list[Candidate]) -> list[Ranked]:
    ordered = sorted(candidates, key=sort_key)
    return [
        Ranked(
            agent_id=c.agent_id,
            position=i + 1,
            sort_key=sort_key(c),
            explanation={
                "tier": c.outcome.value,
                "freshness": c.freshness.value,
                "distance_m": round(c.distance_m),
                "rule": "outcome tier, then freshness, then distance",
            },
        )
        for i, c in enumerate(ordered)
    ]
