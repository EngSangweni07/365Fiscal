from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from app.schemas.common import ORMBase


class DemoAccountCreate(BaseModel):
    company_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone_number: str = Field(min_length=5, max_length=20)
    wants_zimra_fdms: bool = False
    num_users: int = Field(default=1, ge=1, le=500)


class DemoAccountUpdate(BaseModel):
    company_name: str | None = None
    email: EmailStr | None = None
    phone_number: str | None = None
    wants_zimra_fdms: bool | None = None
    num_users: int | None = None
    status: str | None = None
    notes: str | None = None


class DemoAccountRead(ORMBase):
    id: int
    company_name: str
    email: str
    phone_number: str
    wants_zimra_fdms: bool
    num_users: int
    status: str
    created_at: datetime
    expires_at: datetime
    notes: str
    user_id: int | None = None
    company_id: int | None = None
    time_remaining_seconds: int
    is_expired: bool


class DemoSignupResponse(DemoAccountRead):
    access_token: str
    portal_redirect_url: str
