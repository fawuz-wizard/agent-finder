"""Visibility: may availability be shown at all right now? Decided server-side, in the product's
timezone, so a phone with a wrong clock cannot change what the public sees.

Order of precedence: closed → hidden by agent → night mode (unless overridden tonight) → visible.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from enum import StrEnum


class VisibilityDecision(StrEnum):
    VISIBLE = "visible"
    CLOSED = "closed"
    HIDDEN_BY_AGENT = "hidden_by_agent"
    HIDDEN_NIGHT = "hidden_night"


@dataclass(frozen=True)
class NightSchedule:
    enabled: bool = True
    start: time = time(20, 0)
    end: time = time(7, 0)

    def is_night(self, local_now: datetime) -> bool:
        if not self.enabled:
            return False
        t = local_now.time()
        if self.start <= self.end:  # same-day window, e.g. 01:00–05:00
            return self.start <= t < self.end
        return t >= self.start or t < self.end  # crosses midnight, e.g. 20:00–07:00


@dataclass(frozen=True)
class AgentVisibilityInputs:
    is_open: bool
    hidden_by_agent: bool
    night: NightSchedule
    night_override_until: datetime | None = None  # agent chose "show tonight anyway"


def decide(inputs: AgentVisibilityInputs, local_now: datetime) -> VisibilityDecision:
    if not inputs.is_open:
        return VisibilityDecision.CLOSED
    if inputs.hidden_by_agent:
        return VisibilityDecision.HIDDEN_BY_AGENT
    if inputs.night.is_night(local_now):
        override_active = (
            inputs.night_override_until is not None and local_now < inputs.night_override_until
        )
        if not override_active:
            return VisibilityDecision.HIDDEN_NIGHT
    return VisibilityDecision.VISIBLE
