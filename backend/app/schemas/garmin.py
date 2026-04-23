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
