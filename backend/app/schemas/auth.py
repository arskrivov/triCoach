from pydantic import BaseModel


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None = None
    created_at: str | None = None
