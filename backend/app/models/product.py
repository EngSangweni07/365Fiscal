from sqlalchemy import Boolean, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(String(1000), default="")
    image_url: Mapped[str] = mapped_column(Text, default="")
    sale_price: Mapped[float] = mapped_column(Float, default=0)
    tax_rate: Mapped[float] = mapped_column(Float, default=0)
    tax_id: Mapped[int | None] = mapped_column(ForeignKey("tax_settings.id"), nullable=True, default=None)
    sales_cost: Mapped[float] = mapped_column(Float, default=0)
    purchase_cost: Mapped[float] = mapped_column(Float, default=0)
    hs_code: Mapped[str] = mapped_column(String(50), default="")
    reference: Mapped[str] = mapped_column(String(100), default="")
    barcode: Mapped[str] = mapped_column(String(100), default="")
    
    # Inventory fields
    product_type: Mapped[str] = mapped_column(String(50), default="storable")  # storable, consumable, service
    uom: Mapped[str] = mapped_column(String(50), default="Units")  # unit of measure
    track_inventory: Mapped[bool] = mapped_column(Boolean, default=True)
    min_stock_quantity: Mapped[float] = mapped_column(Float, default=0)
    max_stock_quantity: Mapped[float] = mapped_column(Float, default=0)
    reorder_point: Mapped[float] = mapped_column(Float, default=0)
    weight: Mapped[float] = mapped_column(Float, default=0)
    weight_uom: Mapped[str] = mapped_column(String(20), default="kg")
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    can_be_sold: Mapped[bool] = mapped_column(Boolean, default=True)
    can_be_purchased: Mapped[bool] = mapped_column(Boolean, default=True)
    show_in_pos: Mapped[bool] = mapped_column(Boolean, default=True)
    income_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    expense_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    inventory_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    cogs_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)

    company = relationship("Company", back_populates="products")
    category = relationship("Category", back_populates="products")
    tax = relationship("TaxSetting", foreign_keys=[tax_id], lazy="joined")
    stock_moves = relationship("StockMove", back_populates="product")
    stock_quants = relationship("StockQuant", back_populates="product")
