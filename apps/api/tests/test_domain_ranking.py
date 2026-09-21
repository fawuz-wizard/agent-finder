from __future__ import annotations

from app.domain.ranking import Candidate, rank
from app.domain.types import FreshnessState as F
from app.domain.types import PublicOutcome as O


def test_tier_then_freshness_then_distance():
    cands = [
        Candidate("far-likely-fresh", O.LIKELY, F.FRESH, 1500),
        Candidate("near-limited-fresh", O.LIMITED, F.FRESH, 100),
        Candidate("near-likely-ageing", O.LIKELY, F.AGEING, 100),
        Candidate("near-likely-fresh", O.LIKELY, F.FRESH, 400),
        Candidate("closed", O.CLOSED, F.FRESH, 50),
        Candidate("expired", O.EXPIRED, F.EXPIRED, 50),
        Candidate("hidden", O.HIDDEN, F.FRESH, 10),
    ]
    order = [r.agent_id for r in rank(cands)]
    assert order == [
        "near-likely-fresh",
        "far-likely-fresh",
        "near-likely-ageing",
        "near-limited-fresh",
        "expired",
        "closed",
        "hidden",
    ]


def test_ranking_is_deterministic_and_explained():
    cands = [Candidate("a", O.LIKELY, F.FRESH, 10), Candidate("b", O.LIKELY, F.FRESH, 10)]
    first = rank(cands)
    second = rank(list(reversed(cands)))
    assert [r.agent_id for r in first] == [r.agent_id for r in second]
    assert first[0].explanation["rule"]
