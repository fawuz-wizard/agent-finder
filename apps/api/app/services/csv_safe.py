"""Text bound for a CSV that aggregators open in Excel: anything Excel would read as a formula
(=, +, -, @, or a tab or carriage return in front of one) gets a leading quote, so a shop name
or street an agent typed can never run as a formula on the aggregator's computer."""

from __future__ import annotations

FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def safe_text(value: object) -> object:
    if isinstance(value, str) and value[:1] in FORMULA_START:
        return "'" + value
    return value
