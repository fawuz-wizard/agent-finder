"""Where a shop may be. One check for every way a point enters the system: a dealer
registering or pinning, an agent pinning from the phone, the placement script."""

from __future__ import annotations

from app.core.errors import AppError

# Sierra Leone, with a margin: latitude 6.8–10.1, longitude -13.5 to -10.2.
SL_LAT = (6.8, 10.1)
SL_LNG = (-13.5, -10.2)


def on_map(agent) -> bool:
    """Whether a customer may be sent to this shop: a point, confirmed, and active at Orange."""
    return (
        agent.lat is not None
        and agent.lng is not None
        and bool(agent.active)
        and bool(agent.location_confirmed)
    )


def check_point(lat: float, lng: float) -> None:
    if not (SL_LAT[0] <= lat <= SL_LAT[1] and SL_LNG[0] <= lng <= SL_LNG[1]):
        raise AppError(
            "That location is outside Sierra Leone. Check the latitude and longitude.",
            code="invalid_location",
        )
