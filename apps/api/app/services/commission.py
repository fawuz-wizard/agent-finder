"""What an agent earns per transaction.

INDICATIVE figures: a flat commission per amount band, so the Activity screen can show the
day's earnings today. Orange's official agent tariff replaces this table the moment the team
has it; nothing else changes. Amounts are in new Leones (SLE).
"""

from __future__ import annotations

TARIFF_NOTE = "Indicative tariff. Orange's official schedule replaces these figures."

# (upper bound inclusive in SLE or None for open-ended, cash-out commission, deposit commission)
BANDS: list[tuple[int | None, int, int]] = [
    (500, 10, 6),
    (2_000, 25, 15),
    (5_000, 50, 30),
    (10_000, 90, 55),
    (50_000, 180, 110),
    (None, 300, 180),
]
BAND_KEYS = ["≤500", "≤2k", "≤5k", "≤10k", "≤50k", ">50k"]


def _pick(transaction: str, index: int) -> int:
    _, cash_out, deposit = BANDS[index]
    return cash_out if transaction == "cash_out" else deposit


def commission_for(transaction: str, amount_sle: int | float) -> int:
    """The commission on an exact amount."""
    for i, (upper, _, _) in enumerate(BANDS):
        if upper is None or amount_sle <= upper:
            return _pick(transaction, i)
    return _pick(transaction, len(BANDS) - 1)


def commission_for_band(transaction: str, band: str) -> int:
    """The commission for a band the agent logged; the band's own figure, so an estimate."""
    index = BAND_KEYS.index(band) if band in BAND_KEYS else len(BAND_KEYS) - 1
    return _pick(transaction, index)
