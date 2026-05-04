from sqlalchemy import Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin


class StockQuant(Base, TimestampMixin):
    """Represents the current quantity of a product at a specific location."""
    __tablename__ = "stock_quants"
    __table_args__ = (
        UniqueConstraint('product_id', 'location_id', 'lot_number', 'serial_number', name='uq_product_location_traceability'),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    lot_number: Mapped[str] = mapped_column(String(100), default="")
    serial_number: Mapped[str] = mapped_column(String(100), default="")
    quantity: Mapped[float] = mapped_column(Float, default=0)
    reserved_quantity: Mapped[float] = mapped_column(Float, default=0)
    available_quantity: Mapped[float] = mapped_column(Float, default=0)
    unit_cost: Mapped[float] = mapped_column(Float, default=0)
    total_value: Mapped[float] = mapped_column(Float, default=0)

    company = relationship("Company")
    product = relationship("Product", back_populates="stock_quants")
    warehouse = relationship("Warehouse")
    location = relationship("Location")
