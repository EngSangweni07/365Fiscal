from datetime import datetime
from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin


class StockMove(Base, TimestampMixin):
    __tablename__ = "stock_moves"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    lot_number: Mapped[str] = mapped_column(String(100), default="")
    serial_number: Mapped[str] = mapped_column(String(100), default="")
    reference: Mapped[str] = mapped_column(String(100), default="")
    move_type: Mapped[str] = mapped_column(String(50), default="in")  # in, out, internal, adjustment
    quantity: Mapped[float] = mapped_column(Float, default=0)
    unit_cost: Mapped[float] = mapped_column(Float, default=0)
    total_cost: Mapped[float] = mapped_column(Float, default=0)
    source_document: Mapped[str] = mapped_column(String(100), default="")  # invoice/quotation reference
    state: Mapped[str] = mapped_column(String(50), default="draft")  # draft, confirmed, done, cancelled
    scheduled_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    done_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str] = mapped_column(String(1000), default="")

    company = relationship("Company", back_populates="stock_moves")
    product = relationship("Product", back_populates="stock_moves")
    warehouse = relationship("Warehouse")
    location = relationship("Location")
