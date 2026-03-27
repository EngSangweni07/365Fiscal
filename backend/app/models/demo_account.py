from sqlalchemy import String, Boolean, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timedelta

from app.db.base import Base
from app.models.common import TimestampMixin


class DemoAccount(Base, TimestampMixin):
    __tablename__ = "demo_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_name: Mapped[str] = mapped_column(String(255), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    phone_number: Mapped[str] = mapped_column(String(20))
    wants_zimra_fdms: Mapped[bool] = mapped_column(Boolean, default=False)
    num_users: Mapped[int] = mapped_column(Integer, default=1)
    wants_actual_three65: Mapped[bool] = mapped_column(Boolean, default=False)
    tin: Mapped[str] = mapped_column(String(100), default="")
    vat_number: Mapped[str] = mapped_column(String(100), default="")
    trade_name: Mapped[str] = mapped_column(String(255), default="")
    address: Mapped[str] = mapped_column(String(1000), default="")
    status: Mapped[str] = mapped_column(String(50), default="active")  # active, expired, converted
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    notes: Mapped[str] = mapped_column(String(1000), default="")
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True, index=True)

    def is_expired(self) -> bool:
        """Check if demo account has expired."""
        return datetime.utcnow() > self.expires_at

    def time_remaining_seconds(self) -> int:
        """Get remaining time in seconds."""
        remaining = self.expires_at - datetime.utcnow()
        if remaining.total_seconds() < 0:
            return 0
        return int(remaining.total_seconds())

    @staticmethod
    def create_demo_account(
        company_name: str,
        email: str,
        phone_number: str,
        wants_zimra_fdms: bool,
        num_users: int,
        demo_duration_minutes: int = 3,
    ):
        """Factory method to create a demo account with expiry."""
        demo = DemoAccount(
            company_name=company_name,
            email=email,
            phone_number=phone_number,
            wants_zimra_fdms=wants_zimra_fdms,
            num_users=num_users,
            expires_at=datetime.utcnow() + timedelta(minutes=demo_duration_minutes),
            status="active",
        )
        return demo
