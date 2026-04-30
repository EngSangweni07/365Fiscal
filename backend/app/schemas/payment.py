"""Payment schemas for API."""
from datetime import datetime
from pydantic import BaseModel
from typing import Optional, List


class PaymentBase(BaseModel):
    invoice_id: Optional[int] = None
    contact_id: Optional[int] = None
    amount: float
    currency: str = "USD"
    payment_method: str = "cash"
    payment_account: str = ""
    transaction_reference: str = ""
    payment_date: Optional[datetime] = None
    notes: str = ""


class PaymentCreate(PaymentBase):
    company_id: int


class PaymentUpdate(BaseModel):
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    payment_account: Optional[str] = None
    transaction_reference: Optional[str] = None
    payment_date: Optional[datetime] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class PaymentRead(PaymentBase):
    id: int
    company_id: int
    reference: str
    status: str
    reconciled_at: Optional[datetime] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentReconcile(BaseModel):
    payment_ids: List[int]
    invoice_id: int


class PaymentMethodBase(BaseModel):
    name: str
    code: str
    is_active: bool = True
    account_info: str = ""
    is_default: bool = False
    sort_order: int = 0


class PaymentMethodCreate(PaymentMethodBase):
    company_id: int


class PaymentMethodUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    account_info: Optional[str] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None


class PaymentMethodRead(PaymentMethodBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerDepositCreate(BaseModel):
    company_id: int
    contact_id: int
    amount: float
    currency: str = "USD"
    payment_method: str = "cash"
    payment_account: str = ""
    transaction_reference: str = ""
    payment_date: Optional[datetime] = None
    notes: str = ""


class CustomerDepositBalanceRead(BaseModel):
    company_id: int
    contact_id: int
    total_deposited: float
    total_used: float
    balance: float
