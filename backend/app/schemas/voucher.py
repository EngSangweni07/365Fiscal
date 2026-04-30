from datetime import datetime

from pydantic import BaseModel


class VoucherRead(BaseModel):
    id: int
    company_id: int
    code: str
    source_order_id: int | None = None
    issued_to_contact_id: int | None = None
    amount: float
    remaining_amount: float
    currency: str
    status: str
    issued_at: datetime
    redeemed_at: datetime | None = None
    redeemed_order_id: int | None = None
    notes: str

    class Config:
        from_attributes = True


class VoucherRedeemPayload(BaseModel):
    company_id: int
    order_id: int
    amount: float | None = None


class VoucherIssuePayload(BaseModel):
    company_id: int
    amount: float
    currency: str = "USD"
    issued_to_contact_id: int | None = None
    source_order_id: int | None = None
    notes: str = ""
