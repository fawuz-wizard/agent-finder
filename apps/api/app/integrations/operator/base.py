"""Operator adapter: the only door to money and transaction data. Agent Finder reads through
it, labels the source, and never stores what comes back. The fake implementation is switched
on by OPERATOR_ADAPTER=fake and is labelled as demo data from the host system."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Protocol

from pydantic import BaseModel


class OperatorValue(BaseModel):
    amount_sle: int
    source: str
    read_at: str


class OperatorActivity(BaseModel):
    """What the host system knows about one agent right now. E-float is exact; cash is what
    the operator infers from the till declared at opening and the transactions since. Read
    through the adapter on each request, labelled, never stored."""

    cash_sle: int
    float_sle: int
    as_of: str
    last_transaction_min_ago: int
    transactions_last_hour: int
    failed_for_float_today: int
    source: str


class OperatorAdapter(Protocol):
    def source_name(self) -> str: ...
    async def activity(self, agent_ref: str, now: datetime) -> OperatorActivity | None: ...
    async def balance(self, agent_ref: str) -> OperatorValue | None: ...
    async def float_position(self, agent_ref: str) -> OperatorValue | None: ...
    async def transactions_today(self, agent_ref: str) -> dict: ...
    async def transactions_list(self, agent_ref: str) -> list[dict]: ...
    async def transactions_series(
        self, agent_ref: str, bucket_starts: list[datetime], width: timedelta
    ) -> list[int] | None: ...


class NoOperator:
    """Nothing connected. Every panel that needs operator data is absent, never faked."""

    def source_name(self) -> str:
        return ""

    async def activity(self, agent_ref: str, now: datetime) -> OperatorActivity | None:
        return None

    async def balance(self, agent_ref: str) -> OperatorValue | None:
        return None

    async def float_position(self, agent_ref: str) -> OperatorValue | None:
        return None

    async def transactions_today(self, agent_ref: str) -> dict:
        return {"transactions": None, "successful": None}

    async def transactions_list(self, agent_ref: str) -> list[dict]:
        return []

    async def transactions_series(self, agent_ref: str, bucket_starts, width) -> list[int] | None:
        return None


class FakeOperator:
    """Labelled demo data shaped like the host system. Used for the pilot until Orange's
    contract exists. Values are deterministic per agent so a demo is repeatable."""

    _seed = {
        "Agent 024": (12_400, 8_450, 31, 28),
        "Agent 031": (4_900, 3_100, 22, 21),
        "Agent 009": (21_000, 15_600, 12, 12),
        "Agent 017": (7_300, 6_050, 18, 17),
        "Agent 038": (900, 400, 3, 3),
    }

    def source_name(self) -> str:
        return "Orange (demo)"

    def _row(self, ref: str):
        return self._seed.get(ref, (5_000, 3_000, 10, 9))

    async def activity(self, agent_ref: str, now: datetime) -> OperatorActivity | None:
        """A day that moves: cash is drawn through opening hours and e-float rises with it,
        deterministically from the clock, so a demo is repeatable and a test can pin it."""
        if agent_ref not in self._seed:
            return None
        bal, fl, t, _ = self._row(agent_ref)
        hour = now.hour + now.minute / 60
        frac = max(0.0, min(1.0, (hour - 7) / 13))  # 0 at 07:00 → 1 at 20:00
        drawn = int(bal * 0.85 * frac)
        salt = sum(ord(c) for c in agent_ref) % 17
        return OperatorActivity(
            cash_sle=max(0, bal - drawn),
            float_sle=fl + int(drawn * 0.6),
            as_of=now.isoformat(),
            last_transaction_min_ago=3 + salt,
            transactions_last_hour=max(0, t // 8),
            failed_for_float_today=1 if fl < 1_000 else 0,
            source=self.source_name(),
        )

    async def balance(self, agent_ref: str) -> OperatorValue | None:
        return OperatorValue(
            amount_sle=self._row(agent_ref)[0],
            source=self.source_name(),
            read_at=datetime.utcnow().isoformat() + "Z",
        )

    async def float_position(self, agent_ref: str) -> OperatorValue | None:
        return OperatorValue(
            amount_sle=self._row(agent_ref)[1],
            source=self.source_name(),
            read_at=datetime.utcnow().isoformat() + "Z",
        )

    async def transactions_today(self, agent_ref: str) -> dict:
        _, _, t, s = self._row(agent_ref)
        return {"transactions": t, "successful": s}

    async def transactions_list(self, agent_ref: str) -> list[dict]:
        now = datetime.utcnow()
        return [
            {
                "id": "op-1",
                "at": (now - timedelta(hours=1)).isoformat() + "Z",
                "time_text": (now - timedelta(hours=1)).strftime("%H:%M"),
                "text": "Cash out SLE 2,000 — successful",
                "tone": "neutral",
            },
            {
                "id": "op-2",
                "at": (now - timedelta(hours=2)).isoformat() + "Z",
                "time_text": (now - timedelta(hours=2)).strftime("%H:%M"),
                "text": "Deposit SLE 500 — successful",
                "tone": "neutral",
            },
        ]

    async def transactions_series(self, agent_ref: str, bucket_starts, width) -> list[int] | None:
        base = self._row(agent_ref)[2]
        n = len(bucket_starts)
        per = base if width >= timedelta(days=1) else max(1, base // 13)
        return [max(0, int(per * (0.7 + 0.6 * ((i * 7) % 5) / 4))) for i in range(n)]


def get_operator() -> OperatorAdapter:
    return FakeOperator() if os.environ.get("OPERATOR_ADAPTER", "fake") == "fake" else NoOperator()
