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
    wants_actual_three65: bool | None = None
    requested_apps: list[str] | None = None
    tin: str | None = None
    vat_number: str | None = None
    trade_name: str | None = None
    address: str | None = None
    subscription_period: str | None = None
    payment_link: str | None = None
    payment_method: str | None = None
    ecocash_phone_number: str | None = None
    paynow_reference: str | None = None
    paynow_poll_url: str | None = None
    paynow_status: str | None = None
    status: str | None = None
    notes: str | None = None


class DemoInterestRequest(BaseModel):
    wants_actual_three65: bool = True
    company_name: str = Field(min_length=2, max_length=255)
    phone_number: str = Field(min_length=5, max_length=20)
    num_users: int = Field(default=1, ge=1, le=500)
    requested_apps: list[str] = Field(default_factory=list)
    subscription_period: str = Field(default="monthly", pattern="^(monthly|yearly)$")
    payment_link: str | None = Field(default=None, max_length=1000)
    payment_method: str | None = Field(default=None, pattern="^(ecocash|visa)?$")
    ecocash_phone_number: str | None = Field(default=None, max_length=20)
    wants_zimra_fdms: bool = False
    tin: str | None = Field(default=None, max_length=100)
    vat_number: str | None = Field(default=None, max_length=100)
    trade_name: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=1000)


class DemoAccountRead(ORMBase):
    id: int
    company_name: str
    email: str
    phone_number: str
    wants_zimra_fdms: bool
    num_users: int
    wants_actual_three65: bool
    requested_apps: list[str]
    subscription_period: str
    payment_link: str
    payment_method: str
    ecocash_phone_number: str
    paynow_reference: str
    paynow_poll_url: str
    paynow_status: str
    paynow_paid_at: datetime | None = None
    tin: str
    vat_number: str
    trade_name: str
    address: str
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
