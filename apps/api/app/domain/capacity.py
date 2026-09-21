"""Capacity: turn a PRIVATE category + PRIVATE thresholds + the customer's amount into the
public, transaction-relative answer. This is the only place that comparison happens.

The output never contains the category or the thresholds. Callers must discard the private
inputs after calling; the public schemas cannot carry them (enforced by tests).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.types import CapacityCategory, CapacitySide, PublicOutcome


@dataclass(frozen=True)
class SideThresholds:
    """PRIVATE per-agent lines, in Leones. "Some" covers up to some_max; "Small" up to small_max;
    "Most" covers anything above some_max; "None" covers nothing."""

    some_max_sle: int
    small_max_sle: int

    def __post_init__(self) -> None:
        if self.small_max_sle <= 0 or self.some_max_sle <= 0:
            raise ValueError("thresholds must be positive")
        if self.small_max_sle > self.some_max_sle:
            raise ValueError("small_max must not exceed some_max")


@dataclass(frozen=True)
class AgentThresholds:
    cash: SideThresholds
    float: SideThresholds

    def for_side(self, side: CapacitySide) -> SideThresholds:
        return self.cash if side is CapacitySide.CASH else self.float


# Reasonable defaults for a Freetown kiosk until the agent sets their own lines at onboarding.
DEFAULT_THRESHOLDS = AgentThresholds(
    cash=SideThresholds(some_max_sle=1000, small_max_sle=200),
    float=SideThresholds(some_max_sle=2000, small_max_sle=300),
)


def compare(
    category: CapacityCategory | None,
    thresholds: SideThresholds,
    amount_sle: int | None,
) -> PublicOutcome:
    """Answer "can this agent likely handle `amount_sle` on this side?" without revealing why.

    - No category set → NOT_SET.
    - No amount given → LIKELY unless the agent said NONE (then LIMITED), so a blank amount still
      ranks agents sensibly without inventing precision.
    - NONE → LIMITED for any amount (we never say "no cash" publicly; the phrase stays relative).
    """
    if category is None:
        return PublicOutcome.NOT_SET
    if category is CapacityCategory.NONE:
        return PublicOutcome.LIMITED
    if amount_sle is None:
        return PublicOutcome.LIKELY
    if amount_sle <= 0:
        raise ValueError("amount must be positive")

    if category is CapacityCategory.MOST:
        return PublicOutcome.LIKELY
    if category is CapacityCategory.SOME:
        return (
            PublicOutcome.LIKELY if amount_sle <= thresholds.some_max_sle else PublicOutcome.LIMITED
        )
    # SMALL
    return PublicOutcome.LIKELY if amount_sle <= thresholds.small_max_sle else PublicOutcome.LIMITED
