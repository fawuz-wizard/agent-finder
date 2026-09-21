from __future__ import annotations

import pytest
from app.domain.capacity import DEFAULT_THRESHOLDS, SideThresholds, compare
from app.domain.types import CapacityCategory as C
from app.domain.types import PublicOutcome as O

T = SideThresholds(some_max_sle=1000, small_max_sle=200)


@pytest.mark.parametrize(
    "category,amount,expected",
    [
        (C.MOST, 5000, O.LIKELY),
        (C.SOME, 1000, O.LIKELY),
        (C.SOME, 1001, O.LIMITED),
        (C.SMALL, 200, O.LIKELY),
        (C.SMALL, 201, O.LIMITED),
        (C.NONE, 1, O.LIMITED),
        (C.MOST, None, O.LIKELY),
        (C.NONE, None, O.LIMITED),
        (None, 500, O.NOT_SET),
    ],
)
def test_compare(category, amount, expected):
    assert compare(category, T, amount) is expected


def test_rejects_non_positive_amount():
    with pytest.raises(ValueError):
        compare(C.MOST, T, 0)


def test_threshold_validation():
    with pytest.raises(ValueError):
        SideThresholds(some_max_sle=100, small_max_sle=200)


def test_defaults_are_sane():
    assert DEFAULT_THRESHOLDS.cash.small_max_sle < DEFAULT_THRESHOLDS.cash.some_max_sle
