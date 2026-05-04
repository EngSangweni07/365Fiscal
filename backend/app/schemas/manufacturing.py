from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMBase


class ManufacturingWorkCenterBase(BaseModel):
    name: str
    code: str = ""
    capacity_per_cycle: float = 1
    hourly_cost: float = 0
    efficiency_percent: float = 100
    time_uom: str = "hours"
    is_active: bool = True
    notes: str = ""


class ManufacturingWorkCenterCreate(ManufacturingWorkCenterBase):
    company_id: int


class ManufacturingWorkCenterUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    capacity_per_cycle: float | None = None
    hourly_cost: float | None = None
    efficiency_percent: float | None = None
    time_uom: str | None = None
    is_active: bool | None = None
    notes: str | None = None


class ManufacturingWorkCenterRead(ORMBase):
    id: int
    company_id: int
    name: str
    code: str
    capacity_per_cycle: float
    hourly_cost: float
    efficiency_percent: float
    time_uom: str
    is_active: bool
    notes: str


class ManufacturingBOMLineInput(BaseModel):
    component_product_id: int
    sequence: int = 10
    quantity: float = 1
    uom: str = "Units"
    scrap_rate_percent: float = 0
    notes: str = ""


class ManufacturingRoutingStepInput(BaseModel):
    work_center_id: int | None = None
    sequence: int = 10
    name: str
    duration_minutes: float = 0
    instructions: str = ""


class ManufacturingBOMCreate(BaseModel):
    company_id: int
    product_id: int
    warehouse_id: int | None = None
    output_location_id: int | None = None
    code: str = ""
    name: str = ""
    version: str = "1.0"
    quantity: float = 1
    is_active: bool = True
    notes: str = ""
    lines: list[ManufacturingBOMLineInput] = []
    steps: list[ManufacturingRoutingStepInput] = []


class ManufacturingBOMUpdate(BaseModel):
    product_id: int | None = None
    warehouse_id: int | None = None
    output_location_id: int | None = None
    code: str | None = None
    name: str | None = None
    version: str | None = None
    quantity: float | None = None
    is_active: bool | None = None
    notes: str | None = None
    lines: list[ManufacturingBOMLineInput] | None = None
    steps: list[ManufacturingRoutingStepInput] | None = None


class ManufacturingBOMLineRead(ORMBase):
    id: int
    bom_id: int
    component_product_id: int
    sequence: int
    quantity: float
    uom: str
    scrap_rate_percent: float
    notes: str


class ManufacturingRoutingStepRead(ORMBase):
    id: int
    bom_id: int
    work_center_id: int | None
    sequence: int
    name: str
    duration_minutes: float
    instructions: str


class ManufacturingBOMRead(ORMBase):
    id: int
    company_id: int
    product_id: int
    warehouse_id: int | None
    output_location_id: int | None
    code: str
    name: str
    version: str
    quantity: float
    is_active: bool
    notes: str
    lines: list[ManufacturingBOMLineRead] = []
    steps: list[ManufacturingRoutingStepRead] = []


class ManufacturingOrderCreate(BaseModel):
    company_id: int
    bom_id: int
    product_id: int | None = None
    warehouse_id: int | None = None
    source_location_id: int | None = None
    output_location_id: int | None = None
    priority: str = "normal"
    planned_quantity: float = 1
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    notes: str = ""


class ManufacturingOrderUpdate(BaseModel):
    warehouse_id: int | None = None
    source_location_id: int | None = None
    output_location_id: int | None = None
    priority: str | None = None
    planned_quantity: float | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    notes: str | None = None


class ManufacturingOrderMaterialRead(ORMBase):
    id: int
    order_id: int
    component_product_id: int
    source_location_id: int | None
    lot_number: str
    serial_number: str
    sequence: int
    planned_quantity: float
    consumed_quantity: float
    uom: str
    notes: str


class ManufacturingOrderMaterialUpdate(BaseModel):
    source_location_id: int | None = None
    lot_number: str | None = None
    serial_number: str | None = None
    notes: str | None = None


class ManufacturingOrderOperationRead(ORMBase):
    id: int
    order_id: int
    work_center_id: int | None
    sequence: int
    name: str
    status: str
    planned_duration_minutes: float
    actual_duration_minutes: float
    instructions: str


class ManufacturingOrderOperationUpdate(BaseModel):
    work_center_id: int | None = None
    name: str | None = None
    status: str | None = None
    planned_duration_minutes: float | None = None
    actual_duration_minutes: float | None = None
    instructions: str | None = None


class ManufacturingOrderRead(ORMBase):
    id: int
    company_id: int
    bom_id: int
    product_id: int
    warehouse_id: int | None
    source_location_id: int | None
    output_location_id: int | None
    reference: str
    state: str
    priority: str
    planned_quantity: float
    produced_quantity: float
    scrapped_quantity: float
    scheduled_start: datetime | None
    scheduled_end: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    notes: str
    materials: list[ManufacturingOrderMaterialRead] = []
    operations: list[ManufacturingOrderOperationRead] = []


class ManufacturingDashboardCard(BaseModel):
    label: str
    value: float


class ManufacturingShortage(BaseModel):
    order_id: int
    order_reference: str
    component_product_id: int
    required_quantity: float
    available_quantity: float
    shortage_quantity: float


class ManufacturingDashboardRead(BaseModel):
    summary: list[ManufacturingDashboardCard]
    recent_orders: list[ManufacturingOrderRead]
    shortages: list[ManufacturingShortage]


class ManufacturingProductionRecord(BaseModel):
    produced_quantity: float = 0
    scrap_quantity: float = 0
    lot_number: str = ""
    serial_number: str = ""
    notes: str = ""
