from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.coach_tools import add_workout
from app.services.plan_adjuster import _apply_adjustments


class _InsertQuery:
    def __init__(self):
        self.payload = None

    def insert(self, payload):
        self.payload = payload
        return self

    async def execute(self):
        return SimpleNamespace(data=[self.payload])


class _SelectQuery:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_args):
        return self

    def eq(self, *_args):
        return self

    def limit(self, *_args):
        return self

    async def execute(self):
        return SimpleNamespace(data=self.rows)


class _UpdateQuery:
    def __init__(self, base_row):
        self.base_row = base_row
        self.payload = None

    def update(self, payload):
        self.payload = payload
        return self

    def eq(self, *_args):
        return self

    async def execute(self):
        return SimpleNamespace(data=[{**self.base_row, **(self.payload or {})}])


@pytest.mark.asyncio
async def test_add_workout_normalizes_alias_before_insert(monkeypatch):
    insert_query = _InsertQuery()
    sb = MagicMock()
    sb.table.return_value = insert_query

    monkeypatch.setattr(
        "app.services.coach_tools.has_detailed_workout_content",
        lambda _content: True,
    )
    monkeypatch.setattr(
        "app.services.coach_tools.sync_workout_to_garmin",
        AsyncMock(return_value={"status": "created"}),
    )

    await add_workout(
        plan_id="plan-1",
        name="Endurance Ride",
        discipline="cycling",
        duration_minutes=60,
        scheduled_date="2099-01-01",
        plan_week=1,
        plan_day=2,
        reason="Added by coach",
        user_id="user-1",
        sb=sb,
        builder_type="endurance",
        content={
            "type": "endurance",
            "target_tss": 50,
            "target_hr_zone": "Z2",
            "warmup": {"duration_min": 10, "zone": "Z1", "description": "Easy spin"},
            "main": [{"duration_min": 40, "zone": "Z2", "description": "Steady aerobic ride"}],
            "cooldown": {"duration_min": 10, "zone": "Z1", "description": "Easy spin"},
            "notes": "Stay smooth",
        },
    )

    assert insert_query.payload is not None
    assert insert_query.payload["discipline"] == "RIDE_ROAD"


@pytest.mark.asyncio
async def test_apply_adjustments_normalizes_aliases_for_modify_and_add(monkeypatch):
    current_row = {
        "id": "workout-1",
        "user_id": "user-1",
        "plan_id": "plan-1",
        "name": "Tempo Run",
        "discipline": "RUN",
        "scheduled_date": "2099-01-07",
        "plan_week": 1,
        "plan_day": 2,
        "description": "Original workout",
    }
    select_query = _SelectQuery([current_row])
    update_query = _UpdateQuery(current_row)
    insert_query = _InsertQuery()

    sb = MagicMock()
    sb.table.side_effect = [select_query, update_query, insert_query]

    monkeypatch.setattr(
        "app.services.plan_adjuster.sync_workout_to_garmin",
        AsyncMock(return_value={"status": "updated"}),
    )

    modified = await _apply_adjustments(
        plan_id="plan-1",
        user_id="user-1",
        adjustments=[
            {
                "action": "modify",
                "workout_id": "workout-1",
                "new_discipline": "swimming",
                "reason": "Lower-impact swap",
            },
            {
                "action": "modify",
                "workout_id": None,
                "week": 1,
                "day": 4,
                "new_name": "Gym Session",
                "new_discipline": "strength training",
                "reason": "Added by coach",
            },
        ],
        plan_start=date(2099, 1, 5),
        today=date(2099, 1, 6),
        sb=sb,
    )

    assert update_query.payload is not None
    assert update_query.payload["discipline"] == "SWIM"
    assert insert_query.payload is not None
    assert insert_query.payload["discipline"] == "STRENGTH"
    assert len(modified) == 2
