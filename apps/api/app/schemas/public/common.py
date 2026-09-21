from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PublicModel(BaseModel):
    """Base for every public response model. `extra="forbid"` so nothing leaks by accident."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)


class HealthResponse(PublicModel):
    status: str
    service: str
    version: str
    environment: str


class ApiInfo(PublicModel):
    name: str
    version: str
    docs: str
    resources: list[str]
