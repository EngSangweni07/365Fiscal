from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin


class Voucher(Base, TimestampMixin):
    __tablename__ = "vouchers"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    source_order_id: Mapped[int | None] = mapped_column(ForeignKey("pos_orders.id"), nullable=True, index=True)
    issued_to_contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"), nullable=True, index=True)

    amount: Mapped[float] = mapped_column(Float, default=0)
    remaining_amount: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    status: Mapped[str] = mapped_column(String(30), default="active")  # active, redeemed, cancelled, expired
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    redeemed_order_id: Mapped[int | None] = mapped_column(ForeignKey("pos_orders.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    company = relationship("Company")
    issued_to_contact = relationship("Contact", foreign_keys=[issued_to_contact_id])
    source_order = relationship("POSOrder", foreign_keys=[source_order_id])
    redeemed_order = relationship("POSOrder", foreign_keys=[redeemed_order_id])
