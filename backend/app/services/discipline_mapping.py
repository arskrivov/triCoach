"""Helpers for normalizing workout disciplines to canonical enum values."""

from __future__ import annotations

from typing import Any

VALID_DISCIPLINES = {
    "SWIM",
    "RUN",
    "RIDE_ROAD",
    "RIDE_GRAVEL",
    "STRENGTH",
    "YOGA",
    "MOBILITY",
}


def normalize_discipline(value: Any, *, fallback: str = "RUN") -> str:
    """Normalize a user/AI-provided discipline label to a canonical enum."""
    canonical_fallback = str(fallback or "RUN").strip().upper()
    if canonical_fallback not in VALID_DISCIPLINES:
        canonical_fallback = "RUN"

    raw = str(value or "").strip()
    if not raw:
        return canonical_fallback

    normalized = raw.upper().replace("-", "_").replace(" ", "_")
    if normalized in VALID_DISCIPLINES:
        return normalized

    if any(token in normalized for token in ("GRAVEL", "MTB", "MOUNTAIN", "CYCLOCROSS", "BMX")):
        return "RIDE_GRAVEL"
    if any(token in normalized for token in ("BIKE", "RIDE", "CYCLE", "CYCLING")):
        return "RIDE_ROAD"
    if any(token in normalized for token in ("SWIM", "SWIMMING", "POOL", "OPEN_WATER")):
        return "SWIM"
    if any(token in normalized for token in ("RUN", "RUNNING", "TRAIL", "TREADMILL", "JOG")):
        return "RUN"
    if any(token in normalized for token in ("STRENGTH", "WEIGHT", "WEIGHTS", "GYM", "LIFT", "HIIT", "FITNESS_EQUIPMENT")):
        return "STRENGTH"
    if any(token in normalized for token in ("YOGA", "PILATES")):
        return "YOGA"
    if any(token in normalized for token in ("MOBILITY", "MOBILTY", "FLEXIBILITY", "STRETCH", "BREATHWORK")):
        return "MOBILITY"

    return canonical_fallback
