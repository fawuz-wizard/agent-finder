"""Shared value types for the domain layer."""

from __future__ import annotations

from enum import StrEnum


class TransactionType(StrEnum):
    WITHDRAW = "withdraw"
    DEPOSIT = "deposit"
    SEND = "send"

    @property
    def side(self) -> CapacitySide:
        """A withdrawal needs the agent's physical cash; deposits and sends need e-float."""
        return CapacitySide.CASH if self is TransactionType.WITHDRAW else CapacitySide.FLOAT


class CapacitySide(StrEnum):
    CASH = "cash"
    FLOAT = "float"


class CapacityCategory(StrEnum):
    """PRIVATE. Set by the agent, compared server-side, never serialised to a public response."""

    MOST = "most"
    SOME = "some"
    SMALL = "small"
    NONE = "none"


class FreshnessState(StrEnum):
    FRESH = "fresh"
    AGEING = "ageing"
    MAY_HAVE_CHANGED = "may_have_changed"
    EXPIRED = "expired"
    NOT_SET = "not_set"


class PublicOutcome(StrEnum):
    """The only availability vocabulary a customer ever sees."""

    LIKELY = "likely"
    LIMITED = "limited"
    EXPIRED = "expired"
    CLOSED = "closed"
    HIDDEN = "hidden"
    NOT_SET = "not_set"


PUBLIC_PHRASES: dict[PublicOutcome, str] = {
    PublicOutcome.LIKELY: "Can likely handle your request",
    PublicOutcome.LIMITED: "Limited — may not cover this amount",
    PublicOutcome.EXPIRED: "Status expired — ask before you go",
    PublicOutcome.CLOSED: "Closed",
    PublicOutcome.HIDDEN: "Availability hidden",
    PublicOutcome.NOT_SET: "Status not set",
}
