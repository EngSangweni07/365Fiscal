"""POS schemas for API serialization."""
from datetime import datetime
from pydantic import BaseModel, field_validator
from typing import Optional, List

from app.schemas.common import ORMBase
from app.schemas.warehouse import WarehouseRead


# --- POS Order Line ---
class POSOrderLineCreate(BaseModel):
    product_id: int | None = None
    description: str = ""
    quantity: float = 1
    uom: str = "Units"
    unit_price: float = 0
    discount: float = 0
    vat_rate: float = 0


class POSOrderLineRead(ORMBase):
    id: int
    order_id: int
    product_id: int | None = None
    description: str
    quantity: float
    uom: str
    unit_price: float
    discount: float
    vat_rate: float
    subtotal: float
    tax_amount: float
    total_price: float


# --- POS Order ---
class POSOrderCreate(BaseModel):
    session_id: int
    company_id: int
    customer_id: int | None = None
    cashier_id: int | None = None
    currency: str = "USD"
    payment_method: str = "cash"
    cash_amount: float = 0
    card_amount: float = 0
    mobile_amount: float = 0
    voucher_code: str = ""
    voucher_amount: float = 0
    payment_reference: str = ""
    notes: str = ""
    lines: List[POSOrderLineCreate] = []
    auto_fiscalize: bool = False
    issue_change_voucher: bool = False
    cashier_name: str = ""
    till_id: int | None = None


class POSOrderRead(ORMBase):
    id: int
    session_id: int
    company_id: int
    invoice_id: int | None = None
    customer_id: int | None = None
    created_by_id: int
    reference: str
    status: str
    order_date: datetime
    subtotal: float
    discount_amount: float
    tax_amount: float
    total_amount: float
    currency: str
    cash_amount: float
    card_amount: float
    mobile_amount: float
    change_amount: float
    payment_method: str
    payment_reference: str | None = ""
    is_fiscalized: bool
    zimra_receipt_id: str | None = ""
    zimra_verification_code: str | None = ""
    zimra_verification_url: str | None = ""
    fiscal_errors: str | None = ""
    notes: str | None = ""
    cashier_name: str | None = ""
    till_id: int | None = None
    lines: List[POSOrderLineRead] = []

    @field_validator(
        "cashier_name", "payment_reference", "zimra_receipt_id",
        "zimra_verification_code", "zimra_verification_url",
        "fiscal_errors", "notes",
        mode="before",
    )
    @classmethod
    def _none_to_empty(cls, v):  # noqa: N805
        return v if v is not None else ""


class POSOrderRefund(BaseModel):
    reason: str = ""


# --- POS Session ---
class POSSessionOpen(BaseModel):
    company_id: int
    device_id: int | None = None
    till_id: int | None = None
    opening_balance: float = 0
    notes: str = ""


class POSSessionClose(BaseModel):
    closing_balance: float = 0
    notes: str = ""


class POSSessionRead(ORMBase):
    id: int
    company_id: int
    device_id: int | None = None
    opened_by_id: int
    closed_by_id: int | None = None
    name: str
    status: str
    opened_at: datetime
    closed_at: datetime | None = None
    opening_balance: float
    closing_balance: float | None = None
    total_sales: float
    total_returns: float
    total_cash: float
    total_card: float
    total_mobile: float
    transaction_count: int
    notes: str | None = ""

    @field_validator("notes", mode="before")
    @classmethod
    def _session_none_to_empty(cls, v):  # noqa: N805
        return v if v is not None else ""


class POSSessionSummary(BaseModel):
    session: POSSessionRead
    orders: List[POSOrderRead] = []
    expected_cash: float = 0
    difference: float = 0


# --- POS Employee ---
class POSEmployeeCreate(BaseModel):
    company_id: int
    user_id: int | None = None
    name: str
    email: str = ""
    pin: str = ""
    role: str = "cashier"
    is_active: bool = True
    sort_order: int = 0

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, v: str) -> str:
        if v and (not v.isdigit() or len(v) < 4 or len(v) > 6):
            raise ValueError("PIN must be 4-6 digits")
        return v


class POSEmployeeUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    pin: str | None = None
    role: str | None = None
    is_active: bool | None = None
    user_id: int | None = None
    sort_order: int | None = None

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, v: str | None) -> str | None:
        if v is not None and v != "" and (not v.isdigit() or len(v) < 4 or len(v) > 6):
            raise ValueError("PIN must be 4-6 digits")
        return v


class POSEmployeeRead(ORMBase):
    id: int
    company_id: int
    user_id: int | None = None
    name: str
    email: str
    pin: str
    role: str
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


# --- POS Till ---
class POSTillCreate(BaseModel):
    company_id: int
    name: str
    is_active: bool = True
    sort_order: int = 0
    employee_ids: List[int] = []
    warehouse_id: int | None = None
    fiscal_device_id: int | None = None


class POSTillUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    employee_ids: List[int] | None = None
    warehouse_id: int | None = None
    fiscal_device_id: int | None = None


class POSTillEmployeeRead(ORMBase):
    id: int
    name: str
    role: str
    is_active: bool


class POSTillDeviceRead(ORMBase):
    id: int
    device_id: str
    serial_number: str
    model: str
    fiscal_day_status: str


class POSTillRead(ORMBase):
    id: int
    company_id: int
    name: str
    is_active: bool
    sort_order: int
    warehouse_id: int | None = None
    fiscal_device_id: int | None = None
    warehouse: WarehouseRead | None = None
    fiscal_device: POSTillDeviceRead | None = None
    employees: List[POSTillEmployeeRead] = []
    created_at: datetime
    updated_at: datetime
