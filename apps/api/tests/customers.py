"""Test helper: headers standing for a new customer's phone on every request."""

from __future__ import annotations

import uuid
from collections.abc import Mapping


class _EachCustomer(Mapping):
    """Request headers standing for a different customer's phone on every request: a test
    that sends many visit reports stands for many customers, each reporting once a day."""

    def __init__(self, prefix: str) -> None:
        self.prefix = prefix

    def __getitem__(self, key: str) -> str:
        if key != "X-Client":
            raise KeyError(key)
        return f"{self.prefix}-{uuid.uuid4().hex[:8]}"

    def __iter__(self):
        return iter(["X-Client"])

    def __len__(self) -> int:
        return 1


def each_customer(prefix: str) -> Mapping:
    return _EachCustomer(prefix)
