"""Accounting models: Chart of Accounts, Journals, Payment Terms, Fiscal Positions, Budgets."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin


class Account(Base, TimestampMixin):
    """Chart of Accounts entry."""
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    code: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(255))
    account_type: Mapped[str] = mapped_column(String(50))  # asset, liability, equity, income, expense
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    is_reconcilable: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    currency_code: Mapped[str] = mapped_column(String(10), default="USD")
    notes: Mapped[str] = mapped_column(Text, default="")

    company = relationship("Company")
    parent = relationship("Account", remote_side=[id])


class Journal(Base, TimestampMixin):
    """Accounting journal (Sales, Purchases, Bank, Cash, Miscellaneous)."""
    __tablename__ = "journals"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[str] = mapped_column(String(10))
    journal_type: Mapped[str] = mapped_column(String(20))  # sale, purchase, bank, cash, general
    default_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    currency_code: Mapped[str] = mapped_column(String(10), default="USD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    company = relationship("Company")
    default_account = relationship("Account")


class JournalEntry(Base, TimestampMixin):
    """Journal entry header (posted accounting transaction)."""
    __tablename__ = "journal_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    journal_id: Mapped[int] = mapped_column(ForeignKey("journals.id"), index=True)
    reference: Mapped[str] = mapped_column(String(100), index=True)
    entry_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, posted, cancelled
    narration: Mapped[str] = mapped_column(Text, default="")
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"), nullable=True)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"), nullable=True)

    company = relationship("Company")
    journal = relationship("Journal")
    lines = relationship("JournalEntryLine", back_populates="entry", cascade="all, delete-orphan")


class JournalEntryLine(Base, TimestampMixin):
    """Individual debit/credit line within a journal entry."""
    __tablename__ = "journal_entry_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("journal_entries.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"), nullable=True)
    label: Mapped[str] = mapped_column(String(255), default="")
    debit: Mapped[float] = mapped_column(Float, default=0)
    credit: Mapped[float] = mapped_column(Float, default=0)
    currency_code: Mapped[str] = mapped_column(String(10), default="USD")

    entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("Account")
    contact = relationship("Contact")


class PaymentTerm(Base, TimestampMixin):
    """Payment terms (e.g., Net 30, 2/10 Net 30)."""
    __tablename__ = "payment_terms"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(500), default="")
    due_days: Mapped[int] = mapped_column(Integer, default=0)
    discount_percentage: Mapped[float] = mapped_column(Float, default=0)
    discount_days: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    company = relationship("Company")


class FiscalPosition(Base, TimestampMixin):
    """Fiscal position for tax mapping (e.g., domestic vs export)."""
    __tablename__ = "fiscal_positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(500), default="")
    auto_apply: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    company = relationship("Company")
    tax_mappings = relationship("FiscalPositionTax", back_populates="fiscal_position", cascade="all, delete-orphan")


class FiscalPositionTax(Base, TimestampMixin):
    """Tax mapping within a fiscal position."""
    __tablename__ = "fiscal_position_taxes"

    id: Mapped[int] = mapped_column(primary_key=True)
    fiscal_position_id: Mapped[int] = mapped_column(ForeignKey("fiscal_positions.id"), index=True)
    source_tax_id: Mapped[int | None] = mapped_column(ForeignKey("tax_settings.id"), nullable=True)
    destination_tax_id: Mapped[int | None] = mapped_column(ForeignKey("tax_settings.id"), nullable=True)

    fiscal_position = relationship("FiscalPosition", back_populates="tax_mappings")
    source_tax = relationship("TaxSetting", foreign_keys=[source_tax_id])
    destination_tax = relationship("TaxSetting", foreign_keys=[destination_tax_id])


class Budget(Base, TimestampMixin):
    """Financial budget for a period."""
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    date_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    date_to: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, confirmed, done, cancelled
    notes: Mapped[str] = mapped_column(Text, default="")

    company = relationship("Company")
    lines = relationship("BudgetLine", back_populates="budget", cascade="all, delete-orphan")


class BudgetLine(Base, TimestampMixin):
    """Individual budget allocation line."""
    __tablename__ = "budget_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    budget_id: Mapped[int] = mapped_column(ForeignKey("budgets.id"), index=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    planned_amount: Mapped[float] = mapped_column(Float, default=0)
    practical_amount: Mapped[float] = mapped_column(Float, default=0)

    budget = relationship("Budget", back_populates="lines")
    account = relationship("Account")
