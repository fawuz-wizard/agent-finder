"""Phone numbers as the apps show them back: the last three digits only."""

from __future__ import annotations

import re


def mask_msisdn(msisdn: str | None) -> str | None:
    """A person's own line, shown to them with the last three digits only: enough to
    recognise, not enough to copy. +232 •• ••• •23."""
    digits = re.sub(r"\D", "", msisdn or "")
    if not digits:
        return None
    local = digits[3:] if digits.startswith("232") else digits
    shown = "•" * max(0, len(local) - 3) + local[-3:]
    if len(shown) == 8:
        shown = f"{shown[:2]} {shown[2:5]} {shown[5:]}"
    return f"+232 {shown}"


def call_url(msisdn: str | None) -> str | None:
    """A tel: link for a Call button; None when there is no number."""
    digits = re.sub(r"\D", "", msisdn or "")
    if not digits:
        return None
    return f"tel:+{digits}" if digits.startswith("232") else f"tel:+232{digits.lstrip('0')}"
