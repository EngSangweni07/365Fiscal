from pydantic import BaseModel
from app.schemas.common import ORMBase


class StockQuantRead(ORMBase):
    id: int
    company_id: int
    product_id: int
    warehouse_id: int | None
    location_id: int | None
    lot_number: str
    serial_number: str
    quantity: float
    reserved_quantity: float
    available_quantity: float
    unit_cost: float
    total_value: float


class StockQuantUpdate(BaseModel):
    quantity: float | None = None
    reserved_quantity: float | None = None
    unit_cost: float | None = None
    lot_number: str | None = None
    serial_number: str | None = None
