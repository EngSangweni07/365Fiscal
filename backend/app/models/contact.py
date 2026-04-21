from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin


class Contact(Base, TimestampMixin):
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    address: Mapped[str] = mapped_column(String(500), default="")
    vat: Mapped[str] = mapped_column(String(50), default="")
    tin: Mapped[str] = mapped_column(String(50), default="")
    phone: Mapped[str] = mapped_column(String(50), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    reference: Mapped[str] = mapped_column(String(100), default="")
    receivable_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    payable_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)

    company = relationship("Company", back_populates="contacts")
