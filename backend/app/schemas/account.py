"""Pydantic schemas for accounting models."""
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.schemas.common import ORMBase


# ── Account (Chart of Accounts) ──
class AccountCreate(BaseModel):
    company_id: int
    code: str
    name: str
    account_type: str
    parent_id: Optional[int] = None
    is_reconcilable: bool = False
    currency_code: str = "USD"
    notes: str = ""


class AccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    account_type: Optional[str] = None
    parent_id: Optional[int] = None
    is_reconcilable: Optional[bool] = None
    is_active: Optional[bool] = None
    currency_code: Optional[str] = None
    notes: Optional[str] = None


class AccountRead(ORMBase):
    id: int
    company_id: int
    code: str
    name: str
    account_type: str
    parent_id: Optional[int]
    is_reconcilable: bool
    is_active: bool
    currency_code: str
    notes: str


# ── Journal ──
class JournalCreate(BaseModel):
    company_id: int
    name: str
    code: str
    journal_type: str
    default_account_id: Optional[int] = None
    currency_code: str = "USD"


class JournalUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    journal_type: Optional[str] = None
    default_account_id: Optional[int] = None
    currency_code: Optional[str] = None
    is_active: Optional[bool] = None


class JournalRead(ORMBase):
    id: int
    company_id: int
    name: str
    code: str
    journal_type: str
    default_account_id: Optional[int]
    currency_code: str
    is_active: bool


# --- Journal Entry ---
class JournalEntryLineCreate(BaseModel):
    account_id: int
    contact_id: Optional[int] = None
    label: str = ""
    debit: float = 0
    credit: float = 0
    currency_code: str = "USD"


class JournalEntryLineRead(ORMBase):
    id: int
    account_id: int
    contact_id: Optional[int]
    label: str
    debit: float
    credit: float
    currency_code: str


class JournalEntryCreate(BaseModel):
    company_id: int
    journal_id: int
    reference: str
    entry_date: datetime
    narration: str = ""
    lines: list[JournalEntryLineCreate]


class JournalEntryUpdate(BaseModel):
    journal_id: Optional[int] = None
    reference: Optional[str] = None
    entry_date: Optional[datetime] = None
    narration: Optional[str] = None
    lines: Optional[list[JournalEntryLineCreate]] = None


class JournalEntryRead(ORMBase):
    id: int
    company_id: int
    journal_id: int
    reference: str
    entry_date: datetime
    status: str
    narration: str
    invoice_id: Optional[int]
    payment_id: Optional[int]
    lines: list[JournalEntryLineRead] = []


class NestedReversalCleanupEntryRead(BaseModel):
    entry_id: int
    reference: str
    entry_date: datetime
    status: str
    cleanup_reference: str
    cleanup_entry_id: Optional[int] = None
    neutralized: bool = False


class NestedReversalCleanupReportRead(BaseModel):
    company_id: int
    detected_entries: int = 0
    pending_entries: int = 0
    cleaned_entries: int = 0
    items: list[NestedReversalCleanupEntryRead] = []


class JournalPreviewLineRead(BaseModel):
    account_id: Optional[int] = None
    account_code: str = ""
    account_name: str = ""
    label: str = ""
    debit: float = 0
    credit: float = 0
    currency_code: str = "USD"
    resolution: str = "unresolved"


class JournalPreviewEntryRead(BaseModel):
    entry_id: Optional[int] = None
    reference: str
    entry_date: Optional[datetime] = None
    status: str = "preview"
    narration: str = ""
    journal_name: Optional[str] = None
    journal_code: Optional[str] = None
    persisted: bool = False
    lines: list[JournalPreviewLineRead] = []


class SourceJournalPreviewRead(BaseModel):
    company_id: int
    source_type: str
    source_id: int
    source_reference: str
    exists: bool = False
    entries: list[JournalPreviewEntryRead] = []


class ProductAccountMappingTransfer(BaseModel):
    reference: str = ""
    name: str
    income_account_code: Optional[str] = None
    expense_account_code: Optional[str] = None
    inventory_account_code: Optional[str] = None
    cogs_account_code: Optional[str] = None


class CategoryAccountMappingTransfer(BaseModel):
    name: str
    income_account_code: Optional[str] = None
    expense_account_code: Optional[str] = None
    inventory_account_code: Optional[str] = None
    cogs_account_code: Optional[str] = None


class ContactAccountMappingTransfer(BaseModel):
    reference: str = ""
    name: str
    receivable_account_code: Optional[str] = None
    payable_account_code: Optional[str] = None


class AccountMappingExportRead(BaseModel):
    company_id: int
    exported_at: datetime
    products: list[ProductAccountMappingTransfer] = []
    categories: list[CategoryAccountMappingTransfer] = []
    contacts: list[ContactAccountMappingTransfer] = []


class AccountMappingImportPayload(BaseModel):
    company_id: int
    overwrite_nulls: bool = False
    products: list[ProductAccountMappingTransfer] = []
    categories: list[CategoryAccountMappingTransfer] = []
    contacts: list[ContactAccountMappingTransfer] = []


class AccountMappingImportResult(BaseModel):
    company_id: int
    updated_products: int = 0
    updated_categories: int = 0
    updated_contacts: int = 0
    unmatched_products: list[str] = []
    unmatched_categories: list[str] = []
    unmatched_contacts: list[str] = []
    unknown_account_codes: list[str] = []


# ── Payment Term ──
class PaymentTermCreate(BaseModel):
    company_id: int
    name: str
    description: str = ""
    due_days: int = 0
    discount_percentage: float = 0
    discount_days: int = 0


class PaymentTermUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    due_days: Optional[int] = None
    discount_percentage: Optional[float] = None
    discount_days: Optional[int] = None
    is_active: Optional[bool] = None


class PaymentTermRead(ORMBase):
    id: int
    company_id: int
    name: str
    description: str
    due_days: int
    discount_percentage: float
    discount_days: int
    is_active: bool


# ── Fiscal Position ──
class FiscalPositionTaxRead(ORMBase):
    id: int
    source_tax_id: Optional[int]
    destination_tax_id: Optional[int]


class FiscalPositionCreate(BaseModel):
    company_id: int
    name: str
    description: str = ""
    auto_apply: bool = False


class FiscalPositionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    auto_apply: Optional[bool] = None
    is_active: Optional[bool] = None


class FiscalPositionRead(ORMBase):
    id: int
    company_id: int
    name: str
    description: str
    auto_apply: bool
    is_active: bool
    tax_mappings: list[FiscalPositionTaxRead] = []


# ── Budget ──
class BudgetLineRead(ORMBase):
    id: int
    account_id: Optional[int]
    planned_amount: float
    practical_amount: float


class BudgetLineCreate(BaseModel):
    account_id: Optional[int] = None
    planned_amount: float = 0


class BudgetCreate(BaseModel):
    company_id: int
    name: str
    date_from: datetime
    date_to: datetime
    notes: str = ""
    lines: list[BudgetLineCreate] = []


class BudgetUpdate(BaseModel):
    name: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[list[BudgetLineCreate]] = None


class BudgetRead(ORMBase):
    id: int
    company_id: int
    name: str
    date_from: datetime
    date_to: datetime
    status: str
    notes: str
    lines: list[BudgetLineRead] = []
