from __future__ import annotations

from typing import Protocol

from app.core.logging import get_logger

log = get_logger("app.integrations.sms")


class SmsGateway(Protocol):
    async def send(self, to_phone: str, body: str) -> None: ...


class ConsoleSmsGateway:
    """Development/demo gateway. Logs the message; never contacts a network."""

    async def send(self, to_phone: str, body: str) -> None:
        log.info(
            "sms (console)",
            extra={"extra": {"to": to_phone[-4:].rjust(len(to_phone), "*"), "body": body}},
        )
