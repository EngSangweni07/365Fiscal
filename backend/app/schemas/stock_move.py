from datetime import datetime
from pydantic import BaseModel
from app.schemas.common import ORMBase


class StockMoveCreate(BaseModel):
    company_id: int
    product_id: int
    warehouse_id: int | None = None
    location_id: int | None = None
    lot_number: str = ""
    serial_number: str = ""
    reference: str = ""
    move_type: str = "in"  # in, out, internal, adjustment
    quantity: float = 0
    unit_cost: float = 0
    source_document: str = ""
    scheduled_date: datetime | None = None
    notes: str = ""


class StockMoveUpdate(BaseModel):
    warehouse_id: int | None = None
    location_id: int | None = None
    lot_number: str | None = None
    serial_number: str | None = None
    reference: str | None = None
    move_type: str | None = None
    quantity: float | None = None
    unit_cost: float | None = None
    source_document: str | None = None
    state: str | None = None
    scheduled_date: datetime | None = None
    notes: str | None = None


class StockMoveRead(ORMBase):
    id: int
    company_id: int
    product_id: int
    warehouse_id: int | None
    location_id: int | None
    lot_number: str
    serial_number: str
    reference: str
    move_type: str
    quantity: float
    unit_cost: float
    total_cost: float
    source_document: str
    state: str
    scheduled_date: datetime | None
    done_date: datetime | None
    notes: str
