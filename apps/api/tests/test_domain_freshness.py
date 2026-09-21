from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.domain.freshness import FreshnessWindows, freshness_state, relative_label
from app.domain.types import FreshnessState

NOW = datetime(2026, 9, 14, 12, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    "age,expected",
    [
        (timedelta(minutes=0), FreshnessState.FRESH),
        (timedelta(minutes=89), FreshnessState.FRESH),
        (timedelta(minutes=90), FreshnessState.AGEING),
        (timedelta(minutes=119), FreshnessState.AGEING),
        (timedelta(hours=2), FreshnessState.MAY_HAVE_CHANGED),
        (timedelta(hours=3, minutes=59), FreshnessState.MAY_HAVE_CHANGED),
        (timedelta(hours=4), FreshnessState.EXPIRED),
        (timedelta(days=2), FreshnessState.EXPIRED),
    ],
)
def test_default_windows(age, expected):
    assert freshness_state(NOW - age, NOW) is expected


def test_missing_timestamp_is_not_set_never_fresh():
    assert freshness_state(None, NOW) is FreshnessState.NOT_SET


def test_future_timestamp_treated_as_now():
    assert freshness_state(NOW + timedelta(minutes=5), NOW) is FreshnessState.FRESH


def test_windows_are_configurable():
    w = FreshnessWindows(
        fresh_until=timedelta(minutes=30),
        ageing_until=timedelta(minutes=45),
        may_have_changed_until=timedelta(hours=1),
    )
    assert freshness_state(NOW - timedelta(minutes=31), NOW, w) is FreshnessState.AGEING
    assert freshness_state(NOW - timedelta(minutes=61), NOW, w) is FreshnessState.EXPIRED


def test_windows_must_increase():
    with pytest.raises(ValueError):
        FreshnessWindows(
            fresh_until=timedelta(hours=2),
            ageing_until=timedelta(hours=1),
            may_have_changed_until=timedelta(hours=3),
        )


@pytest.mark.parametrize(
    "age,label",
    [
        (timedelta(seconds=10), "Updated just now"),
        (timedelta(minutes=8), "Updated 8 min ago"),
        (timedelta(hours=1, minutes=40), "Updated 1 h 40 m ago"),
        (timedelta(hours=5), "Updated 5 h ago"),
        (timedelta(days=1), "Last updated 1 day ago"),
    ],
)
def test_relative_label(age, label):
    assert relative_label(NOW - age, NOW) == label
