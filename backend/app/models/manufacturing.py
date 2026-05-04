from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin


class ManufacturingWorkCenter(Base, TimestampMixin):
    __tablename__ = "manufacturing_work_centers"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    code: Mapped[str] = mapped_column(String(80), default="")
    capacity_per_cycle: Mapped[float] = mapped_column(Float, default=1)
    hourly_cost: Mapped[float] = mapped_column(Float, default=0)
    efficiency_percent: Mapped[float] = mapped_column(Float, default=100)
    time_uom: Mapped[str] = mapped_column(String(20), default="hours")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class ManufacturingBOM(Base, TimestampMixin):
    __tablename__ = "manufacturing_boms"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    output_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    code: Mapped[str] = mapped_column(String(100), default="")
    name: Mapped[str] = mapped_column(String(255), default="")
    version: Mapped[str] = mapped_column(String(40), default="1.0")
    quantity: Mapped[float] = mapped_column(Float, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    product = relationship("Product")
    warehouse = relationship("Warehouse")
    output_location = relationship("Location")
    lines = relationship(
        "ManufacturingBOMLine",
        back_populates="bom",
        cascade="all, delete-orphan",
        order_by="ManufacturingBOMLine.sequence.asc()",
    )
    steps = relationship(
        "ManufacturingRoutingStep",
        back_populates="bom",
        cascade="all, delete-orphan",
        order_by="ManufacturingRoutingStep.sequence.asc()",
    )


class ManufacturingBOMLine(Base, TimestampMixin):
    __tablename__ = "manufacturing_bom_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    bom_id: Mapped[int] = mapped_column(ForeignKey("manufacturing_boms.id"), index=True)
    component_product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer, default=10)
    quantity: Mapped[float] = mapped_column(Float, default=1)
    uom: Mapped[str] = mapped_column(String(50), default="Units")
    scrap_rate_percent: Mapped[float] = mapped_column(Float, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")

    bom = relationship("ManufacturingBOM", back_populates="lines")
    component_product = relationship("Product")


class ManufacturingRoutingStep(Base, TimestampMixin):
    __tablename__ = "manufacturing_routing_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    bom_id: Mapped[int] = mapped_column(ForeignKey("manufacturing_boms.id"), index=True)
    work_center_id: Mapped[int | None] = mapped_column(
        ForeignKey("manufacturing_work_centers.id"), nullable=True
    )
    sequence: Mapped[int] = mapped_column(Integer, default=10)
    name: Mapped[str] = mapped_column(String(255))
    duration_minutes: Mapped[float] = mapped_column(Float, default=0)
    instructions: Mapped[str] = mapped_column(Text, default="")

    bom = relationship("ManufacturingBOM", back_populates="steps")
    work_center = relationship("ManufacturingWorkCenter")


class ManufacturingOrder(Base, TimestampMixin):
    __tablename__ = "manufacturing_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    bom_id: Mapped[int] = mapped_column(ForeignKey("manufacturing_boms.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    source_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    output_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    reference: Mapped[str] = mapped_column(String(100), default="")
    state: Mapped[str] = mapped_column(String(30), default="draft")
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    planned_quantity: Mapped[float] = mapped_column(Float, default=1)
    produced_quantity: Mapped[float] = mapped_column(Float, default=0)
    scrapped_quantity: Mapped[float] = mapped_column(Float, default=0)
    scheduled_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    bom = relationship("ManufacturingBOM")
    product = relationship("Product")
    warehouse = relationship("Warehouse")
    source_location = relationship("Location", foreign_keys=[source_location_id])
    output_location = relationship("Location", foreign_keys=[output_location_id])
    materials = relationship(
        "ManufacturingOrderMaterial",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="ManufacturingOrderMaterial.sequence.asc()",
    )
    operations = relationship(
        "ManufacturingOrderOperation",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="ManufacturingOrderOperation.sequence.asc()",
    )


class ManufacturingOrderMaterial(Base, TimestampMixin):
    __tablename__ = "manufacturing_order_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("manufacturing_orders.id"), index=True)
    component_product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    source_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    lot_number: Mapped[str] = mapped_column(String(100), default="")
    serial_number: Mapped[str] = mapped_column(String(100), default="")
    sequence: Mapped[int] = mapped_column(Integer, default=10)
    planned_quantity: Mapped[float] = mapped_column(Float, default=0)
    consumed_quantity: Mapped[float] = mapped_column(Float, default=0)
    uom: Mapped[str] = mapped_column(String(50), default="Units")
    notes: Mapped[str] = mapped_column(Text, default="")

    order = relationship("ManufacturingOrder", back_populates="materials")
    component_product = relationship("Product")
    source_location = relationship("Location")


class ManufacturingOrderOperation(Base, TimestampMixin):
    __tablename__ = "manufacturing_order_operations"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("manufacturing_orders.id"), index=True)
    work_center_id: Mapped[int | None] = mapped_column(
        ForeignKey("manufacturing_work_centers.id"), nullable=True
    )
    sequence: Mapped[int] = mapped_column(Integer, default=10)
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    planned_duration_minutes: Mapped[float] = mapped_column(Float, default=0)
    actual_duration_minutes: Mapped[float] = mapped_column(Float, default=0)
    instructions: Mapped[str] = mapped_column(Text, default="")

    order = relationship("ManufacturingOrder", back_populates="operations")
    work_center = relationship("ManufacturingWorkCenter")
