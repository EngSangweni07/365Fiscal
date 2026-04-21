from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin


class Category(Base, TimestampMixin):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    income_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    expense_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    inventory_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    cogs_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)

    company = relationship("Company")
    products = relationship("Product", back_populates="category")
