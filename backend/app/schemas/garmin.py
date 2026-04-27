from datetime import datetime
from pydantic import BaseModel


class GarminConnectRequest(BaseModel):
    garmin_email: str
    garmin_password: str


class GarminTokenStoreRequest(BaseModel):
    token_store: str
    garmin_email: str | None = None


class GarminStatusResponse(BaseModel):
    connected: bool
    garmin_email: str | None
    last_sync_at: datetime | None
    session_status: str = "not_connected"  # "valid", "expired", or "not_connected"


class ConnectAndSyncResponse(BaseModel):
    connected: bool
    garmin_email: str
    activities_synced: int
    activity_files_synced: int = 0
    health_days_synced: int
    missing_health_metrics: list[str] = []
