"""API routes for accounting configuration: Chart of Accounts, Journals, Payment Terms, Fiscal Positions, Budgets, Overview."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, ensure_company_access, require_company_access
from app.models.account import (
    Account, Journal, JournalEntry, JournalEntryLine,
    PaymentTerm, FiscalPosition, FiscalPositionTax,
    Budget, BudgetLine,
)
from app.models.category import Category
from app.models.contact import Contact
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.pos_session import POSOrder
from app.models.product import Product
from app.models.expense import Expense
from app.models.purchase_order import PurchaseOrder
from app.models.stock_move import StockMove
from app.schemas.account import (
    AccountCreate, AccountRead, AccountUpdate,
    JournalCreate, JournalRead, JournalUpdate,
    JournalEntryCreate, JournalEntryRead, JournalEntryUpdate,
    NestedReversalCleanupEntryRead,
    NestedReversalCleanupReportRead,
    PaymentTermCreate, PaymentTermRead, PaymentTermUpdate,
    FiscalPositionCreate, FiscalPositionRead, FiscalPositionUpdate,
    BudgetCreate, BudgetRead, BudgetUpdate,
    AccountMappingExportRead,
    AccountMappingImportPayload,
    AccountMappingImportResult,
    CategoryAccountMappingTransfer,
    ContactAccountMappingTransfer,
    ProductAccountMappingTransfer,
    SourceJournalPreviewRead,
)
from app.services.accounting import (
    build_preview_entries,
    build_pos_payloads,
    build_source_payload,
    cleanup_neutralizing_reference,
    create_cleanup_neutralizing_entry,
    create_reversal_entry,
    is_nested_reversal_reference,
    post_expense_entry,
    post_invoice_entry,
    post_payment_entry,
    post_purchase_entry,
    post_stock_move_entry,
)

router = APIRouter(prefix="/accounting", tags=["accounting"])


def _validate_journal_entry_payload(db: Session, payload) -> None:
    """Validate double-entry rules and company ownership before saving."""
    lines = payload.lines or []
    usable_lines = [
        line for line in lines
        if round(float(line.debit or 0), 2) or round(float(line.credit or 0), 2)
    ]
    if len(usable_lines) < 2:
        raise HTTPException(400, "A journal entry needs at least two non-zero lines")

    total_debit = 0.0
    total_credit = 0.0
    account_ids = set()
    for line in usable_lines:
        debit = round(float(line.debit or 0), 2)
        credit = round(float(line.credit or 0), 2)
        if debit < 0 or credit < 0:
            raise HTTPException(400, "Debit and credit amounts cannot be negative")
        if debit and credit:
            raise HTTPException(400, "A line cannot have both debit and credit")
        total_debit += debit
        total_credit += credit
        account_ids.add(line.account_id)

    if round(total_debit - total_credit, 2) != 0:
        raise HTTPException(400, "Journal entry is not balanced")

    journal = (
        db.query(Journal)
        .filter(
            Journal.id == payload.journal_id,
            Journal.company_id == payload.company_id,
            Journal.is_active == True,
        )
        .first()
    )
    if not journal:
        raise HTTPException(400, "Journal does not belong to this company or is inactive")

    account_count = (
        db.query(func.count(Account.id))
        .filter(
            Account.id.in_(account_ids),
            Account.company_id == payload.company_id,
            Account.is_active == True,
        )
        .scalar() or 0
    )
    if account_count != len(account_ids):
        raise HTTPException(400, "One or more accounts are inactive or belong to another company")


def _replace_journal_entry_lines(db: Session, entry: JournalEntry, lines) -> None:
    entry.lines.clear()
    db.flush()
    for line_data in lines:
        data = line_data.model_dump()
        if not round(float(data.get("debit") or 0), 2) and not round(float(data.get("credit") or 0), 2):
            continue
        entry.lines.append(JournalEntryLine(**data))


def _refresh_budget_actuals(db: Session, budget: Budget) -> Budget:
    for line in budget.lines:
        if not line.account_id:
            line.practical_amount = 0
            continue
        actual = (
            db.query(func.coalesce(func.sum(JournalEntryLine.debit - JournalEntryLine.credit), 0))
            .join(JournalEntry, JournalEntry.id == JournalEntryLine.entry_id)
            .filter(
                JournalEntry.company_id == budget.company_id,
                JournalEntry.status == "posted",
                JournalEntry.entry_date >= budget.date_from,
                JournalEntry.entry_date <= budget.date_to,
                JournalEntryLine.account_id == line.account_id,
            )
            .scalar() or 0
        )
        line.practical_amount = round(float(actual), 2)
    return budget


# ─── Chart of Accounts ────────────────────────────────
@router.get("/accounts", response_model=list[AccountRead])
def list_accounts(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    return (
        db.query(Account)
        .filter(Account.company_id == company_id)
        .order_by(Account.code)
        .all()
    )


@router.post("/accounts", response_model=AccountRead)
def create_account(
    payload: AccountCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    existing = (
        db.query(Account)
        .filter(Account.company_id == payload.company_id, Account.code == payload.code)
        .first()
    )
    if existing:
        raise HTTPException(400, "Account code already exists for this company")
    account = Account(**payload.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.patch("/accounts/{account_id}", response_model=AccountRead)
def update_account(
    account_id: int,
    payload: AccountUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    ensure_company_access(db, user, account.company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(account, k, v)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    ensure_company_access(db, user, account.company_id)
    db.delete(account)
    db.commit()
    return {"ok": True}


# ─── Generic Chart of Accounts ────────────────────────
GENERIC_CHART_OF_ACCOUNTS = [
    # ── Assets ──
    {"code": "1000", "name": "Assets", "account_type": "asset", "reconcilable": False},
    # Current Assets
    {"code": "1100", "name": "Current Assets", "account_type": "asset", "reconcilable": False, "parent": "1000"},
    {"code": "1110", "name": "Cash on Hand", "account_type": "asset", "reconcilable": True, "parent": "1100"},
    {"code": "1120", "name": "Bank Account", "account_type": "asset", "reconcilable": True, "parent": "1100"},
    {"code": "1130", "name": "Petty Cash", "account_type": "asset", "reconcilable": True, "parent": "1100"},
    {"code": "1200", "name": "Accounts Receivable", "account_type": "asset", "reconcilable": True, "parent": "1100"},
    {"code": "1210", "name": "Trade Receivables", "account_type": "asset", "reconcilable": True, "parent": "1200"},
    {"code": "1220", "name": "Employee Advances", "account_type": "asset", "reconcilable": True, "parent": "1200"},
    {"code": "1230", "name": "Other Receivables", "account_type": "asset", "reconcilable": True, "parent": "1200"},
    {"code": "1300", "name": "Inventory", "account_type": "asset", "reconcilable": False, "parent": "1100"},
    {"code": "1310", "name": "Raw Materials", "account_type": "asset", "reconcilable": False, "parent": "1300"},
    {"code": "1320", "name": "Finished Goods", "account_type": "asset", "reconcilable": False, "parent": "1300"},
    {"code": "1330", "name": "Work in Progress", "account_type": "asset", "reconcilable": False, "parent": "1300"},
    {"code": "1400", "name": "Prepaid Expenses", "account_type": "asset", "reconcilable": False, "parent": "1100"},
    {"code": "1410", "name": "Prepaid Insurance", "account_type": "asset", "reconcilable": False, "parent": "1400"},
    {"code": "1420", "name": "Prepaid Rent", "account_type": "asset", "reconcilable": False, "parent": "1400"},
    {"code": "1500", "name": "VAT Input (Receivable)", "account_type": "asset", "reconcilable": True, "parent": "1100"},
    # Non-Current Assets
    {"code": "1600", "name": "Non-Current Assets", "account_type": "asset", "reconcilable": False, "parent": "1000"},
    {"code": "1610", "name": "Property, Plant & Equipment", "account_type": "asset", "reconcilable": False, "parent": "1600"},
    {"code": "1611", "name": "Land", "account_type": "asset", "reconcilable": False, "parent": "1610"},
    {"code": "1612", "name": "Buildings", "account_type": "asset", "reconcilable": False, "parent": "1610"},
    {"code": "1613", "name": "Machinery & Equipment", "account_type": "asset", "reconcilable": False, "parent": "1610"},
    {"code": "1614", "name": "Vehicles", "account_type": "asset", "reconcilable": False, "parent": "1610"},
    {"code": "1615", "name": "Office Furniture & Fixtures", "account_type": "asset", "reconcilable": False, "parent": "1610"},
    {"code": "1616", "name": "Computer Equipment", "account_type": "asset", "reconcilable": False, "parent": "1610"},
    {"code": "1700", "name": "Accumulated Depreciation", "account_type": "asset", "reconcilable": False, "parent": "1600"},
    {"code": "1710", "name": "Accum. Depr. – Buildings", "account_type": "asset", "reconcilable": False, "parent": "1700"},
    {"code": "1711", "name": "Accum. Depr. – Machinery", "account_type": "asset", "reconcilable": False, "parent": "1700"},
    {"code": "1712", "name": "Accum. Depr. – Vehicles", "account_type": "asset", "reconcilable": False, "parent": "1700"},
    {"code": "1713", "name": "Accum. Depr. – Furniture", "account_type": "asset", "reconcilable": False, "parent": "1700"},
    {"code": "1714", "name": "Accum. Depr. – Computers", "account_type": "asset", "reconcilable": False, "parent": "1700"},
    {"code": "1800", "name": "Intangible Assets", "account_type": "asset", "reconcilable": False, "parent": "1600"},
    {"code": "1810", "name": "Goodwill", "account_type": "asset", "reconcilable": False, "parent": "1800"},
    {"code": "1820", "name": "Software & Licences", "account_type": "asset", "reconcilable": False, "parent": "1800"},
    {"code": "1830", "name": "Patents & Trademarks", "account_type": "asset", "reconcilable": False, "parent": "1800"},

    # ── Liabilities ──
    {"code": "2000", "name": "Liabilities", "account_type": "liability", "reconcilable": False},
    # Current Liabilities
    {"code": "2100", "name": "Current Liabilities", "account_type": "liability", "reconcilable": False, "parent": "2000"},
    {"code": "2110", "name": "Accounts Payable", "account_type": "liability", "reconcilable": True, "parent": "2100"},
    {"code": "2120", "name": "Trade Payables", "account_type": "liability", "reconcilable": True, "parent": "2100"},
    {"code": "2130", "name": "Accrued Expenses", "account_type": "liability", "reconcilable": False, "parent": "2100"},
    {"code": "2140", "name": "Wages & Salaries Payable", "account_type": "liability", "reconcilable": False, "parent": "2100"},
    {"code": "2150", "name": "PAYE Payable", "account_type": "liability", "reconcilable": False, "parent": "2100"},
    {"code": "2160", "name": "VAT Output (Payable)", "account_type": "liability", "reconcilable": True, "parent": "2100"},
    {"code": "2170", "name": "Withholding Tax Payable", "account_type": "liability", "reconcilable": False, "parent": "2100"},
    {"code": "2180", "name": "Social Security Payable (NSSA)", "account_type": "liability", "reconcilable": False, "parent": "2100"},
    {"code": "2190", "name": "Short-Term Loans", "account_type": "liability", "reconcilable": True, "parent": "2100"},
    {"code": "2200", "name": "Customer Deposits / Deferred Revenue", "account_type": "liability", "reconcilable": False, "parent": "2100"},
    {"code": "2210", "name": "Unearned Revenue", "account_type": "liability", "reconcilable": False, "parent": "2100"},
    # Non-Current Liabilities
    {"code": "2500", "name": "Non-Current Liabilities", "account_type": "liability", "reconcilable": False, "parent": "2000"},
    {"code": "2510", "name": "Long-Term Loans", "account_type": "liability", "reconcilable": True, "parent": "2500"},
    {"code": "2520", "name": "Mortgage Payable", "account_type": "liability", "reconcilable": True, "parent": "2500"},
    {"code": "2530", "name": "Finance Lease Obligations", "account_type": "liability", "reconcilable": False, "parent": "2500"},

    # ── Equity ──
    {"code": "3000", "name": "Equity", "account_type": "equity", "reconcilable": False},
    {"code": "3100", "name": "Share Capital", "account_type": "equity", "reconcilable": False, "parent": "3000"},
    {"code": "3200", "name": "Retained Earnings", "account_type": "equity", "reconcilable": False, "parent": "3000"},
    {"code": "3300", "name": "Current Year Earnings", "account_type": "equity", "reconcilable": False, "parent": "3000"},
    {"code": "3400", "name": "Dividends Distributed", "account_type": "equity", "reconcilable": False, "parent": "3000"},
    {"code": "3500", "name": "Owner's Equity / Drawings", "account_type": "equity", "reconcilable": False, "parent": "3000"},
    {"code": "3600", "name": "Revaluation Reserve", "account_type": "equity", "reconcilable": False, "parent": "3000"},

    # ── Income / Revenue ──
    {"code": "4000", "name": "Revenue", "account_type": "income", "reconcilable": False},
    {"code": "4100", "name": "Sales Revenue", "account_type": "income", "reconcilable": False, "parent": "4000"},
    {"code": "4110", "name": "Product Sales", "account_type": "income", "reconcilable": False, "parent": "4100"},
    {"code": "4120", "name": "Service Revenue", "account_type": "income", "reconcilable": False, "parent": "4100"},
    {"code": "4130", "name": "Export Sales", "account_type": "income", "reconcilable": False, "parent": "4100"},
    {"code": "4200", "name": "Sales Returns & Allowances", "account_type": "income", "reconcilable": False, "parent": "4000"},
    {"code": "4300", "name": "Sales Discounts", "account_type": "income", "reconcilable": False, "parent": "4000"},
    {"code": "4400", "name": "Other Operating Income", "account_type": "income", "reconcilable": False, "parent": "4000"},
    {"code": "4500", "name": "Interest Income", "account_type": "income", "reconcilable": False, "parent": "4000"},
    {"code": "4600", "name": "Rental Income", "account_type": "income", "reconcilable": False, "parent": "4000"},
    {"code": "4700", "name": "Foreign Exchange Gains", "account_type": "income", "reconcilable": False, "parent": "4000"},
    {"code": "4800", "name": "Gain on Disposal of Assets", "account_type": "income", "reconcilable": False, "parent": "4000"},
    {"code": "4900", "name": "Miscellaneous Income", "account_type": "income", "reconcilable": False, "parent": "4000"},

    # ── Cost of Goods Sold ──
    {"code": "5000", "name": "Cost of Goods Sold", "account_type": "expense", "reconcilable": False},
    {"code": "5100", "name": "Direct Materials", "account_type": "expense", "reconcilable": False, "parent": "5000"},
    {"code": "5200", "name": "Direct Labour", "account_type": "expense", "reconcilable": False, "parent": "5000"},
    {"code": "5300", "name": "Manufacturing Overhead", "account_type": "expense", "reconcilable": False, "parent": "5000"},
    {"code": "5400", "name": "Purchases", "account_type": "expense", "reconcilable": False, "parent": "5000"},
    {"code": "5500", "name": "Purchase Returns & Allowances", "account_type": "expense", "reconcilable": False, "parent": "5000"},
    {"code": "5600", "name": "Freight & Shipping Inward", "account_type": "expense", "reconcilable": False, "parent": "5000"},
    {"code": "5700", "name": "Import Duties & Customs", "account_type": "expense", "reconcilable": False, "parent": "5000"},

    # ── Operating Expenses ──
    {"code": "6000", "name": "Operating Expenses", "account_type": "expense", "reconcilable": False},
    # Personnel
    {"code": "6100", "name": "Personnel Expenses", "account_type": "expense", "reconcilable": False, "parent": "6000"},
    {"code": "6110", "name": "Salaries & Wages", "account_type": "expense", "reconcilable": False, "parent": "6100"},
    {"code": "6120", "name": "Employee Benefits", "account_type": "expense", "reconcilable": False, "parent": "6100"},
    {"code": "6130", "name": "Employer NSSA Contributions", "account_type": "expense", "reconcilable": False, "parent": "6100"},
    {"code": "6140", "name": "Training & Development", "account_type": "expense", "reconcilable": False, "parent": "6100"},
    {"code": "6150", "name": "Recruitment Costs", "account_type": "expense", "reconcilable": False, "parent": "6100"},
    # Premises
    {"code": "6200", "name": "Premises Expenses", "account_type": "expense", "reconcilable": False, "parent": "6000"},
    {"code": "6210", "name": "Rent", "account_type": "expense", "reconcilable": False, "parent": "6200"},
    {"code": "6220", "name": "Rates & Property Taxes", "account_type": "expense", "reconcilable": False, "parent": "6200"},
    {"code": "6230", "name": "Repairs & Maintenance", "account_type": "expense", "reconcilable": False, "parent": "6200"},
    {"code": "6240", "name": "Security", "account_type": "expense", "reconcilable": False, "parent": "6200"},
    {"code": "6250", "name": "Cleaning", "account_type": "expense", "reconcilable": False, "parent": "6200"},
    # Admin & Office
    {"code": "6300", "name": "Administrative Expenses", "account_type": "expense", "reconcilable": False, "parent": "6000"},
    {"code": "6310", "name": "Office Supplies & Stationery", "account_type": "expense", "reconcilable": False, "parent": "6300"},
    {"code": "6320", "name": "Telephone & Internet", "account_type": "expense", "reconcilable": False, "parent": "6300"},
    {"code": "6330", "name": "Postage & Courier", "account_type": "expense", "reconcilable": False, "parent": "6300"},
    {"code": "6340", "name": "Printing & Reproduction", "account_type": "expense", "reconcilable": False, "parent": "6300"},
    {"code": "6350", "name": "Software & IT Services", "account_type": "expense", "reconcilable": False, "parent": "6300"},
    {"code": "6360", "name": "Subscriptions & Memberships", "account_type": "expense", "reconcilable": False, "parent": "6300"},
    # Motor Vehicle
    {"code": "6400", "name": "Motor Vehicle Expenses", "account_type": "expense", "reconcilable": False, "parent": "6000"},
    {"code": "6410", "name": "Fuel & Oil", "account_type": "expense", "reconcilable": False, "parent": "6400"},
    {"code": "6420", "name": "Vehicle Repairs & Servicing", "account_type": "expense", "reconcilable": False, "parent": "6400"},
    {"code": "6430", "name": "Vehicle Insurance", "account_type": "expense", "reconcilable": False, "parent": "6400"},
    {"code": "6440", "name": "Vehicle Licences & Tolls", "account_type": "expense", "reconcilable": False, "parent": "6400"},
    # Professional
    {"code": "6500", "name": "Professional Fees", "account_type": "expense", "reconcilable": False, "parent": "6000"},
    {"code": "6510", "name": "Accounting & Audit Fees", "account_type": "expense", "reconcilable": False, "parent": "6500"},
    {"code": "6520", "name": "Legal Fees", "account_type": "expense", "reconcilable": False, "parent": "6500"},
    {"code": "6530", "name": "Consulting Fees", "account_type": "expense", "reconcilable": False, "parent": "6500"},
    # Marketing & Sales
    {"code": "6600", "name": "Marketing & Sales Expenses", "account_type": "expense", "reconcilable": False, "parent": "6000"},
    {"code": "6610", "name": "Advertising", "account_type": "expense", "reconcilable": False, "parent": "6600"},
    {"code": "6620", "name": "Promotions & Events", "account_type": "expense", "reconcilable": False, "parent": "6600"},
    {"code": "6630", "name": "Commissions Paid", "account_type": "expense", "reconcilable": False, "parent": "6600"},
    {"code": "6640", "name": "Travel & Entertainment", "account_type": "expense", "reconcilable": False, "parent": "6600"},
    # Financial
    {"code": "6700", "name": "Financial Expenses", "account_type": "expense", "reconcilable": False, "parent": "6000"},
    {"code": "6710", "name": "Bank Charges & Fees", "account_type": "expense", "reconcilable": False, "parent": "6700"},
    {"code": "6720", "name": "Interest Expense", "account_type": "expense", "reconcilable": False, "parent": "6700"},
    {"code": "6730", "name": "Foreign Exchange Losses", "account_type": "expense", "reconcilable": False, "parent": "6700"},
    {"code": "6740", "name": "Payment Processing Fees", "account_type": "expense", "reconcilable": False, "parent": "6700"},
    # Insurance & Utilities
    {"code": "6800", "name": "Insurance", "account_type": "expense", "reconcilable": False, "parent": "6000"},
    {"code": "6810", "name": "General Insurance", "account_type": "expense", "reconcilable": False, "parent": "6800"},
    {"code": "6820", "name": "Workers' Compensation Insurance", "account_type": "expense", "reconcilable": False, "parent": "6800"},
    {"code": "6900", "name": "Utilities", "account_type": "expense", "reconcilable": False, "parent": "6000"},
    {"code": "6910", "name": "Electricity", "account_type": "expense", "reconcilable": False, "parent": "6900"},
    {"code": "6920", "name": "Water & Sewerage", "account_type": "expense", "reconcilable": False, "parent": "6900"},
    # Depreciation & Amortisation
    {"code": "7000", "name": "Depreciation & Amortisation", "account_type": "expense", "reconcilable": False},
    {"code": "7100", "name": "Depreciation Expense", "account_type": "expense", "reconcilable": False, "parent": "7000"},
    {"code": "7200", "name": "Amortisation Expense", "account_type": "expense", "reconcilable": False, "parent": "7000"},

    # ── Other Income / Expenses ──
    {"code": "8000", "name": "Other Income & Expenses", "account_type": "expense", "reconcilable": False},
    {"code": "8100", "name": "Loss on Disposal of Assets", "account_type": "expense", "reconcilable": False, "parent": "8000"},
    {"code": "8200", "name": "Bad Debts Written Off", "account_type": "expense", "reconcilable": False, "parent": "8000"},
    {"code": "8300", "name": "Donations & Charitable Contributions", "account_type": "expense", "reconcilable": False, "parent": "8000"},
    {"code": "8400", "name": "Penalties & Fines", "account_type": "expense", "reconcilable": False, "parent": "8000"},

    # ── Tax ──
    {"code": "9000", "name": "Tax Expense", "account_type": "expense", "reconcilable": False},
    {"code": "9100", "name": "Income Tax Expense", "account_type": "expense", "reconcilable": False, "parent": "9000"},
    {"code": "9200", "name": "Deferred Tax", "account_type": "expense", "reconcilable": False, "parent": "9000"},
]


@router.post("/install-chart")
def install_generic_chart(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Install the generic chart of accounts for a company.
    Skips any account codes that already exist for the company.
    """
    ensure_company_access(db, user, company_id)

    existing_codes = {
        code
        for (code,) in db.query(Account.code)
        .filter(Account.company_id == company_id)
        .all()
    }

    # First pass: create accounts without parent links so we can resolve parent_id
    code_to_id: dict[str, int] = {}
    created = 0

    for entry in GENERIC_CHART_OF_ACCOUNTS:
        if entry["code"] in existing_codes:
            existing_acct = (
                db.query(Account)
                .filter(Account.company_id == company_id, Account.code == entry["code"])
                .first()
            )
            if existing_acct:
                code_to_id[entry["code"]] = existing_acct.id
            continue

        acct = Account(
            company_id=company_id,
            code=entry["code"],
            name=entry["name"],
            account_type=entry["account_type"],
            is_reconcilable=entry.get("reconcilable", False),
            is_active=True,
            currency_code="USD",
        )
        db.add(acct)
        db.flush()
        code_to_id[entry["code"]] = acct.id
        created += 1

    # Second pass: set parent_id links
    for entry in GENERIC_CHART_OF_ACCOUNTS:
        parent_code = entry.get("parent")
        if not parent_code:
            continue
        acct_id = code_to_id.get(entry["code"])
        parent_id = code_to_id.get(parent_code)
        if acct_id and parent_id:
            db.query(Account).filter(Account.id == acct_id).update(
                {"parent_id": parent_id}
            )

    # Also seed default journals if none exist
    journal_count = (
        db.query(Journal)
        .filter(Journal.company_id == company_id)
        .count()
    )
    journals_created = 0
    if journal_count == 0:
        default_journals = [
            {"name": "Sales Journal", "code": "SAL", "journal_type": "sale", "default_code": "4100"},
            {"name": "Purchase Journal", "code": "PUR", "journal_type": "purchase", "default_code": "5400"},
            {"name": "Bank Journal", "code": "BNK", "journal_type": "bank", "default_code": "1120"},
            {"name": "Cash Journal", "code": "CSH", "journal_type": "cash", "default_code": "1110"},
            {"name": "Miscellaneous Journal", "code": "MISC", "journal_type": "general", "default_code": None},
        ]
        for jd in default_journals:
            default_acct_id = code_to_id.get(jd["default_code"]) if jd["default_code"] else None
            journal = Journal(
                company_id=company_id,
                name=jd["name"],
                code=jd["code"],
                journal_type=jd["journal_type"],
                default_account_id=default_acct_id,
                currency_code="USD",
                is_active=True,
            )
            db.add(journal)
            journals_created += 1

    db.commit()
    return {
        "ok": True,
        "accounts_created": created,
        "accounts_skipped": len(GENERIC_CHART_OF_ACCOUNTS) - created,
        "journals_created": journals_created,
    }


# ─── Journals ─────────────────────────────────────────
@router.get("/journals", response_model=list[JournalRead])
def list_journals(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    return (
        db.query(Journal)
        .filter(Journal.company_id == company_id)
        .order_by(Journal.code)
        .all()
    )


@router.post("/journals", response_model=JournalRead)
def create_journal(
    payload: JournalCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    journal = Journal(**payload.model_dump())
    db.add(journal)
    db.commit()
    db.refresh(journal)
    return journal


@router.patch("/journals/{journal_id}", response_model=JournalRead)
def update_journal(
    journal_id: int,
    payload: JournalUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    journal = db.query(Journal).filter(Journal.id == journal_id).first()
    if not journal:
        raise HTTPException(404, "Journal not found")
    ensure_company_access(db, user, journal.company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(journal, k, v)
    db.commit()
    db.refresh(journal)
    return journal


@router.delete("/journals/{journal_id}")
def delete_journal(
    journal_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    journal = db.query(Journal).filter(Journal.id == journal_id).first()
    if not journal:
        raise HTTPException(404, "Journal not found")
    ensure_company_access(db, user, journal.company_id)
    db.delete(journal)
    db.commit()
    return {"ok": True}


# --- Manual Journal Entries ---
@router.get("/journal-entries", response_model=list[JournalEntryRead])
def list_journal_entries(
    company_id: int,
    status: str | None = None,
    search: str | None = None,
    journal_id: int | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    response: Response = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    query = db.query(JournalEntry).filter(JournalEntry.company_id == company_id)
    if status:
        query = query.filter(JournalEntry.status == status)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(JournalEntry.reference.ilike(like), JournalEntry.narration.ilike(like))
        )
    if journal_id:
        query = query.filter(JournalEntry.journal_id == journal_id)
    total_count = query.count()
    if response is not None:
        response.headers["X-Total-Count"] = str(total_count)
    return (
        query.order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post("/journal-entries", response_model=JournalEntryRead)
def create_journal_entry(
    payload: JournalEntryCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    _validate_journal_entry_payload(db, payload)
    data = payload.model_dump(exclude={"lines"})
    entry = JournalEntry(**data, status="draft")
    db.add(entry)
    db.flush()
    _replace_journal_entry_lines(db, entry, payload.lines)
    db.commit()
    db.refresh(entry)
    return entry


def _build_nested_reversal_cleanup_report(db: Session, company_id: int, *, cleaned_entries: int = 0):
    items: list[NestedReversalCleanupEntryRead] = []
    pending_entries = 0
    entries = (
        db.query(JournalEntry)
        .filter(JournalEntry.company_id == company_id, JournalEntry.reference.like("REV/REV/%"))
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
        .all()
    )
    for entry in entries:
        cleanup_reference = cleanup_neutralizing_reference(entry.reference)
        cleanup_entry = (
            db.query(JournalEntry)
            .filter(JournalEntry.company_id == company_id, JournalEntry.reference == cleanup_reference)
            .first()
        )
        neutralized = cleanup_entry is not None
        if entry.status == "posted" and not neutralized and is_nested_reversal_reference(entry.reference):
            pending_entries += 1
        items.append(
            NestedReversalCleanupEntryRead(
                entry_id=entry.id,
                reference=entry.reference,
                entry_date=entry.entry_date,
                status=entry.status,
                cleanup_reference=cleanup_reference,
                cleanup_entry_id=cleanup_entry.id if cleanup_entry else None,
                neutralized=neutralized,
            )
        )
    return NestedReversalCleanupReportRead(
        company_id=company_id,
        detected_entries=len(items),
        pending_entries=pending_entries,
        cleaned_entries=cleaned_entries,
        items=items,
    )


@router.get("/journal-entries/nested-reversals", response_model=NestedReversalCleanupReportRead)
def list_nested_reversal_entries(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    ensure_company_access(db, user, company_id)
    return _build_nested_reversal_cleanup_report(db, company_id)


@router.post("/journal-entries/nested-reversals/cleanup", response_model=NestedReversalCleanupReportRead)
def cleanup_nested_reversal_entries(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, company_id)
    cleaned_entries = 0
    entries = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.company_id == company_id,
            JournalEntry.status == "posted",
            JournalEntry.reference.like("REV/REV/%"),
        )
        .order_by(JournalEntry.entry_date.asc(), JournalEntry.id.asc())
        .all()
    )
    for entry in entries:
        cleanup_entry = create_cleanup_neutralizing_entry(
            db,
            entry,
            reason="Nested reversal cleanup",
        )
        if not cleanup_entry:
            continue
        neutralization_note = f"Neutralized by {cleanup_entry.reference}"
        if neutralization_note not in (entry.narration or ""):
            entry.narration = (
                f"{entry.narration}\n{neutralization_note}" if entry.narration else neutralization_note
            )
        entry.status = "cancelled"
        cleaned_entries += 1
    db.commit()
    return _build_nested_reversal_cleanup_report(db, company_id, cleaned_entries=cleaned_entries)


@router.get("/journal-entries/{entry_id}", response_model=JournalEntryRead)
def get_journal_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    ensure_company_access(db, user, entry.company_id)
    return entry


@router.patch("/journal-entries/{entry_id}", response_model=JournalEntryRead)
def update_journal_entry(
    entry_id: int,
    payload: JournalEntryUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    ensure_company_access(db, user, entry.company_id)
    if entry.status != "draft":
        raise HTTPException(400, "Only draft journal entries can be edited")

    next_data = {
        "company_id": entry.company_id,
        "journal_id": payload.journal_id if payload.journal_id is not None else entry.journal_id,
        "reference": payload.reference if payload.reference is not None else entry.reference,
        "entry_date": payload.entry_date if payload.entry_date is not None else entry.entry_date,
        "narration": payload.narration if payload.narration is not None else entry.narration,
        "lines": payload.lines if payload.lines is not None else entry.lines,
    }
    if payload.lines is not None:
        _validate_journal_entry_payload(db, type("EntryPayload", (), next_data))
        _replace_journal_entry_lines(db, entry, payload.lines)
    elif payload.journal_id is not None:
        journal = (
            db.query(Journal)
            .filter(
                Journal.id == payload.journal_id,
                Journal.company_id == entry.company_id,
                Journal.is_active == True,
            )
            .first()
        )
        if not journal:
            raise HTTPException(400, "Journal does not belong to this company or is inactive")

    for field in ["journal_id", "reference", "entry_date", "narration"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/journal-entries/{entry_id}/post", response_model=JournalEntryRead)
def post_journal_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    ensure_company_access(db, user, entry.company_id)
    if entry.status != "draft":
        raise HTTPException(400, "Only draft journal entries can be posted")
    payload = type("EntryPayload", (), {
        "company_id": entry.company_id,
        "journal_id": entry.journal_id,
        "lines": entry.lines,
    })
    _validate_journal_entry_payload(db, payload)
    entry.status = "posted"
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/journal-entries/{entry_id}/cancel", response_model=JournalEntryRead)
def cancel_journal_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    ensure_company_access(db, user, entry.company_id)
    if entry.status == "cancelled":
        raise HTTPException(400, "Journal entry is already cancelled")
    if entry.status == "posted":
        reversal = create_reversal_entry(
            db,
            entry,
            reason=f"Journal entry {entry.reference} cancelled",
        )
        if not reversal:
            raise HTTPException(400, "Posted journal entry could not be reversed")
    entry.status = "cancelled"
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/journal-entries/{entry_id}/reverse", response_model=JournalEntryRead)
def reverse_journal_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    ensure_company_access(db, user, entry.company_id)
    if entry.status != "posted":
        raise HTTPException(400, "Only posted journal entries can be reversed")
    if (entry.reference or "").startswith("REV/"):
        raise HTTPException(400, "Reversal entries cannot be reversed again")
    reversal = create_reversal_entry(
        db,
        entry,
        reason=f"Journal entry {entry.reference} reversed",
    )
    if not reversal:
        raise HTTPException(400, "Journal entry could not be reversed")
    db.commit()
    db.refresh(reversal)
    return reversal


@router.delete("/journal-entries/{entry_id}")
def delete_journal_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Journal entry not found")
    ensure_company_access(db, user, entry.company_id)
    if entry.status != "draft":
        raise HTTPException(400, "Only draft journal entries can be deleted")
    db.delete(entry)
    db.commit()
    return {"ok": True}


@router.get("/journal-entry-link")
def journal_entry_link(
    source_type: str,
    source_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Resolve the posted accounting entry for a business document."""
    source_type = source_type.strip().lower()
    entry = None
    company_id = None
    reference = ""

    if source_type == "invoice":
        source = db.query(Invoice).filter(Invoice.id == source_id).first()
        if source:
            company_id = source.company_id
            entry = db.query(JournalEntry).filter(JournalEntry.invoice_id == source.id).first()
            reference = f"INV/{source.reference}"
    elif source_type == "payment":
        source = db.query(Payment).filter(Payment.id == source_id).first()
        if source:
            company_id = source.company_id
            entry = db.query(JournalEntry).filter(JournalEntry.payment_id == source.id).first()
            reference = f"PAY/{source.reference}"
    elif source_type == "expense":
        source = db.query(Expense).filter(Expense.id == source_id).first()
        if source:
            company_id = source.company_id
            reference = f"EXP/{source.reference}"
    elif source_type == "pos":
        source = db.query(POSOrder).filter(POSOrder.id == source_id).first()
        if source:
            company_id = source.company_id
            reference = f"PAY/{source.reference}"
            if source.invoice_id:
                entry = (
                    db.query(JournalEntry)
                    .filter(
                        JournalEntry.company_id == source.company_id,
                        JournalEntry.invoice_id == source.invoice_id,
                    )
                    .order_by(JournalEntry.entry_date.asc(), JournalEntry.id.asc())
                    .first()
                )
                if entry and entry.reference:
                    reference = entry.reference
    elif source_type == "purchase":
        source = db.query(PurchaseOrder).filter(PurchaseOrder.id == source_id).first()
        if source:
            company_id = source.company_id
            reference = f"PO/{source.reference}"
    elif source_type == "stock":
        source = db.query(StockMove).filter(StockMove.id == source_id).first()
        if source:
            company_id = source.company_id
            reference = f"STK/{source.id}"
    else:
        raise HTTPException(400, "Unsupported source type")

    if not company_id:
        raise HTTPException(404, "Source document not found")
    ensure_company_access(db, user, company_id)

    if not entry and reference:
        entry = (
            db.query(JournalEntry)
            .filter(JournalEntry.company_id == company_id, JournalEntry.reference == reference)
            .first()
        )
    return {
        "company_id": company_id,
        "entry_id": entry.id if entry else None,
        "entry_reference": entry.reference if entry else reference,
        "exists": bool(entry),
    }


@router.get("/source-entry-preview", response_model=SourceJournalPreviewRead)
def source_entry_preview(
    source_type: str,
    source_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    normalized = source_type.strip().lower()
    source = None
    if normalized == "invoice":
        source = db.query(Invoice).filter(Invoice.id == source_id).first()
    elif normalized == "payment":
        source = db.query(Payment).filter(Payment.id == source_id).first()
    elif normalized == "expense":
        source = db.query(Expense).filter(Expense.id == source_id).first()
    elif normalized == "pos":
        source = db.query(POSOrder).filter(POSOrder.id == source_id).first()
    elif normalized == "purchase":
        source = db.query(PurchaseOrder).filter(PurchaseOrder.id == source_id).first()
    elif normalized == "stock":
        source = db.query(StockMove).filter(StockMove.id == source_id).first()
    else:
        raise HTTPException(400, "Unsupported source type")

    if not source:
        raise HTTPException(404, "Source document not found")
    ensure_company_access(db, user, source.company_id)

    if normalized == "pos":
        payloads = build_pos_payloads(db, source)
    else:
        payload = build_source_payload(db, normalized, source)
        payloads = [payload] if payload else []

    if not payloads:
        return {
            "company_id": source.company_id,
            "source_type": normalized,
            "source_id": source_id,
            "source_reference": getattr(source, "reference", str(source_id)),
            "exists": False,
            "entries": [],
        }

    related_query = db.query(JournalEntry).filter(JournalEntry.company_id == source.company_id)
    if normalized == "invoice":
        payload = payloads[0]
        related_query = related_query.filter(
            or_(
                JournalEntry.invoice_id == source.id,
                JournalEntry.reference == payload["reference"],
                JournalEntry.reference.like(f"REV/{payload['reference']}%"),
            )
        )
    elif normalized == "payment":
        payload = payloads[0]
        related_query = related_query.filter(
            or_(
                JournalEntry.payment_id == source.id,
                JournalEntry.reference == payload["reference"],
                JournalEntry.reference.like(f"REV/{payload['reference']}%"),
            )
        )
    elif normalized == "pos":
        references = [payload["reference"] for payload in payloads if payload.get("reference")]
        filters = []
        if source.invoice_id:
            filters.append(JournalEntry.invoice_id == source.invoice_id)
        for reference in references:
            filters.append(JournalEntry.reference == reference)
            filters.append(JournalEntry.reference.like(f"REV/{reference}%"))
        related_query = related_query.filter(or_(*filters)) if filters else related_query.filter(False)
    else:
        payload = payloads[0]
        related_query = related_query.filter(
            or_(
                JournalEntry.reference == payload["reference"],
                JournalEntry.reference.like(f"REV/{payload['reference']}%"),
            )
        )
    entries = related_query.order_by(JournalEntry.entry_date.asc(), JournalEntry.id.asc()).all()

    return {
        "company_id": source.company_id,
        "source_type": normalized,
        "source_id": source_id,
        "source_reference": getattr(source, "reference", str(source_id)),
        "exists": bool(entries),
        "entries": (
            build_preview_entries(db, payloads[0], entries)
            if entries
            else [
                preview
                for payload in payloads
                for preview in build_preview_entries(db, payload, [])
            ]
        ),
    }


@router.get("/account-mappings/export", response_model=AccountMappingExportRead)
def export_account_mappings(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    ensure_company_access(db, user, company_id)
    accounts = db.query(Account).filter(Account.company_id == company_id).all()
    account_code_by_id = {account.id: account.code for account in accounts}

    products = db.query(Product).filter(Product.company_id == company_id).order_by(Product.reference, Product.name).all()
    categories = db.query(Category).filter(Category.company_id == company_id).order_by(Category.name).all()
    contacts = db.query(Contact).filter(Contact.company_id == company_id).order_by(Contact.reference, Contact.name).all()

    return {
        "company_id": company_id,
        "exported_at": datetime.utcnow(),
        "products": [
            ProductAccountMappingTransfer(
                reference=product.reference or "",
                name=product.name,
                income_account_code=account_code_by_id.get(product.income_account_id),
                expense_account_code=account_code_by_id.get(product.expense_account_id),
                inventory_account_code=account_code_by_id.get(product.inventory_account_id),
                cogs_account_code=account_code_by_id.get(product.cogs_account_id),
            )
            for product in products
        ],
        "categories": [
            CategoryAccountMappingTransfer(
                name=category.name,
                income_account_code=account_code_by_id.get(category.income_account_id),
                expense_account_code=account_code_by_id.get(category.expense_account_id),
                inventory_account_code=account_code_by_id.get(category.inventory_account_id),
                cogs_account_code=account_code_by_id.get(category.cogs_account_id),
            )
            for category in categories
        ],
        "contacts": [
            ContactAccountMappingTransfer(
                reference=contact.reference or "",
                name=contact.name,
                receivable_account_code=account_code_by_id.get(contact.receivable_account_id),
                payable_account_code=account_code_by_id.get(contact.payable_account_id),
            )
            for contact in contacts
        ],
    }


@router.post("/account-mappings/import", response_model=AccountMappingImportResult)
def import_account_mappings(
    payload: AccountMappingImportPayload,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    account_code_map = {
        account.code.strip().upper(): account.id
        for account in db.query(Account).filter(Account.company_id == payload.company_id, Account.is_active == True).all()
    }
    unknown_codes: set[str] = set()

    def resolve_account_id(code: str | None):
        if code is None:
            return True, None
        normalized = code.strip().upper()
        if not normalized:
            return True, None
        account_id = account_code_map.get(normalized)
        if not account_id:
            unknown_codes.add(normalized)
            return False, None
        return True, account_id

    def apply_mapping(target, field: str, code: str | None) -> bool:
        valid, account_id = resolve_account_id(code)
        if code is None or not code.strip():
            if payload.overwrite_nulls and getattr(target, field) is not None:
                setattr(target, field, None)
                return True
            return False
        if not valid:
            return False
        if getattr(target, field) != account_id:
            setattr(target, field, account_id)
            return True
        return False

    updated_products = 0
    updated_categories = 0
    updated_contacts = 0
    unmatched_products: list[str] = []
    unmatched_categories: list[str] = []
    unmatched_contacts: list[str] = []

    for row in payload.products:
        query = db.query(Product).filter(Product.company_id == payload.company_id)
        product = None
        if row.reference:
            product = query.filter(Product.reference == row.reference).first()
        if not product:
            product = query.filter(Product.name == row.name).first()
        if not product:
            unmatched_products.append(row.reference or row.name)
            continue
        changed = False
        changed = apply_mapping(product, "income_account_id", row.income_account_code) or changed
        changed = apply_mapping(product, "expense_account_id", row.expense_account_code) or changed
        changed = apply_mapping(product, "inventory_account_id", row.inventory_account_code) or changed
        changed = apply_mapping(product, "cogs_account_id", row.cogs_account_code) or changed
        if changed:
            updated_products += 1

    for row in payload.categories:
        category = (
            db.query(Category)
            .filter(Category.company_id == payload.company_id, Category.name == row.name)
            .first()
        )
        if not category:
            unmatched_categories.append(row.name)
            continue
        changed = False
        changed = apply_mapping(category, "income_account_id", row.income_account_code) or changed
        changed = apply_mapping(category, "expense_account_id", row.expense_account_code) or changed
        changed = apply_mapping(category, "inventory_account_id", row.inventory_account_code) or changed
        changed = apply_mapping(category, "cogs_account_id", row.cogs_account_code) or changed
        if changed:
            updated_categories += 1

    for row in payload.contacts:
        query = db.query(Contact).filter(Contact.company_id == payload.company_id)
        contact = None
        if row.reference:
            contact = query.filter(Contact.reference == row.reference).first()
        if not contact:
            contact = query.filter(Contact.name == row.name).first()
        if not contact:
            unmatched_contacts.append(row.reference or row.name)
            continue
        changed = False
        changed = apply_mapping(contact, "receivable_account_id", row.receivable_account_code) or changed
        changed = apply_mapping(contact, "payable_account_id", row.payable_account_code) or changed
        if changed:
            updated_contacts += 1

    db.commit()
    return {
        "company_id": payload.company_id,
        "updated_products": updated_products,
        "updated_categories": updated_categories,
        "updated_contacts": updated_contacts,
        "unmatched_products": unmatched_products,
        "unmatched_categories": unmatched_categories,
        "unmatched_contacts": unmatched_contacts,
        "unknown_account_codes": sorted(unknown_codes),
    }


@router.post("/backfill")
def backfill_accounting_entries(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Generate missing accounting entries for older operational records."""
    ensure_company_access(db, user, company_id)
    created = {
        "invoices": 0,
        "payments": 0,
        "expenses": 0,
        "purchases": 0,
        "stock_moves": 0,
    }

    for invoice in (
        db.query(Invoice)
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "paid", "partial", "fiscalized"]),
        )
        .all()
    ):
        before = db.query(JournalEntry.id).filter(JournalEntry.reference == f"INV/{invoice.reference}").first()
        entry = post_invoice_entry(db, invoice)
        if entry and not before:
            created["invoices"] += 1

    for payment in (
        db.query(Payment)
        .filter(Payment.company_id == company_id, Payment.status.in_(["posted", "reconciled"]))
        .all()
    ):
        before = db.query(JournalEntry.id).filter(JournalEntry.reference == f"PAY/{payment.reference}").first()
        entry = post_payment_entry(db, payment)
        if entry and not before:
            created["payments"] += 1

    for expense in (
        db.query(Expense)
        .filter(Expense.company_id == company_id, Expense.status == "posted")
        .all()
    ):
        before = db.query(JournalEntry.id).filter(JournalEntry.reference == f"EXP/{expense.reference}").first()
        entry = post_expense_entry(db, expense)
        if entry and not before:
            created["expenses"] += 1

    for order in (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.company_id == company_id, PurchaseOrder.status.in_(["confirmed", "received"]))
        .all()
    ):
        before = db.query(JournalEntry.id).filter(JournalEntry.reference == f"PO/{order.reference}").first()
        entry = post_purchase_entry(db, order)
        if entry and not before:
            created["purchases"] += 1

    for move in (
        db.query(StockMove)
        .filter(StockMove.company_id == company_id, StockMove.state == "done")
        .all()
    ):
        before = db.query(JournalEntry.id).filter(JournalEntry.reference == f"STK/{move.id}").first()
        entry = post_stock_move_entry(db, move)
        if entry and not before:
            created["stock_moves"] += 1

    db.commit()
    return {"ok": True, "created": created}


# ─── Payment Terms ────────────────────────────────────
@router.get("/payment-terms", response_model=list[PaymentTermRead])
def list_payment_terms(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    return (
        db.query(PaymentTerm)
        .filter(PaymentTerm.company_id == company_id)
        .order_by(PaymentTerm.name)
        .all()
    )


@router.post("/payment-terms", response_model=PaymentTermRead)
def create_payment_term(
    payload: PaymentTermCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    pt = PaymentTerm(**payload.model_dump())
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


@router.patch("/payment-terms/{term_id}", response_model=PaymentTermRead)
def update_payment_term(
    term_id: int,
    payload: PaymentTermUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    pt = db.query(PaymentTerm).filter(PaymentTerm.id == term_id).first()
    if not pt:
        raise HTTPException(404, "Payment term not found")
    ensure_company_access(db, user, pt.company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(pt, k, v)
    db.commit()
    db.refresh(pt)
    return pt


@router.delete("/payment-terms/{term_id}")
def delete_payment_term(
    term_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    pt = db.query(PaymentTerm).filter(PaymentTerm.id == term_id).first()
    if not pt:
        raise HTTPException(404, "Payment term not found")
    ensure_company_access(db, user, pt.company_id)
    db.delete(pt)
    db.commit()
    return {"ok": True}


# ─── Fiscal Positions ────────────────────────────────
@router.get("/fiscal-positions", response_model=list[FiscalPositionRead])
def list_fiscal_positions(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    return (
        db.query(FiscalPosition)
        .filter(FiscalPosition.company_id == company_id)
        .order_by(FiscalPosition.name)
        .all()
    )


@router.post("/fiscal-positions", response_model=FiscalPositionRead)
def create_fiscal_position(
    payload: FiscalPositionCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    fp = FiscalPosition(**payload.model_dump())
    db.add(fp)
    db.commit()
    db.refresh(fp)
    return fp


@router.patch("/fiscal-positions/{fp_id}", response_model=FiscalPositionRead)
def update_fiscal_position(
    fp_id: int,
    payload: FiscalPositionUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    fp = db.query(FiscalPosition).filter(FiscalPosition.id == fp_id).first()
    if not fp:
        raise HTTPException(404, "Fiscal position not found")
    ensure_company_access(db, user, fp.company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(fp, k, v)
    db.commit()
    db.refresh(fp)
    return fp


@router.delete("/fiscal-positions/{fp_id}")
def delete_fiscal_position(
    fp_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    fp = db.query(FiscalPosition).filter(FiscalPosition.id == fp_id).first()
    if not fp:
        raise HTTPException(404, "Fiscal position not found")
    ensure_company_access(db, user, fp.company_id)
    db.delete(fp)
    db.commit()
    return {"ok": True}


# ─── Budgets ─────────────────────────────────────────
@router.get("/budgets", response_model=list[BudgetRead])
def list_budgets(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    budgets = (
        db.query(Budget)
        .filter(Budget.company_id == company_id)
        .order_by(Budget.date_from.desc())
        .all()
    )
    for budget in budgets:
        _refresh_budget_actuals(db, budget)
    db.flush()
    return budgets


@router.post("/budgets", response_model=BudgetRead)
def create_budget(
    payload: BudgetCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    data = payload.model_dump(exclude={"lines"})
    budget = Budget(**data)
    db.add(budget)
    db.flush()
    for line_data in payload.lines:
        line = BudgetLine(budget_id=budget.id, **line_data.model_dump())
        db.add(line)
    db.flush()
    _refresh_budget_actuals(db, budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.patch("/budgets/{budget_id}", response_model=BudgetRead)
def update_budget(
    budget_id: int,
    payload: BudgetUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(404, "Budget not found")
    ensure_company_access(db, user, budget.company_id)
    data = payload.model_dump(exclude_unset=True, exclude={"lines"})
    for k, v in data.items():
        setattr(budget, k, v)
    if payload.lines is not None:
        budget.lines.clear()
        db.flush()
        for line_data in payload.lines:
            line = BudgetLine(budget_id=budget.id, **line_data.model_dump())
            budget.lines.append(line)
    db.flush()
    _refresh_budget_actuals(db, budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.delete("/budgets/{budget_id}")
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(404, "Budget not found")
    ensure_company_access(db, user, budget.company_id)
    db.delete(budget)
    db.commit()
    return {"ok": True}


# ─── Accounting Overview (Dashboard) ─────────────────
@router.get("/overview")
def accounting_overview(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    """Aggregated accounting overview for the company dashboard."""
    now = datetime.utcnow()
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    # YTD Revenue
    ytd_revenue = float(
        db.query(func.coalesce(func.sum(Invoice.total_amount), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "paid", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.invoice_date >= year_start,
        )
        .scalar() or 0
    )

    # YTD Expenses
    ytd_expenses = float(
        db.query(func.coalesce(func.sum(Expense.total_amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
            Expense.expense_date >= year_start,
        )
        .scalar() or 0
    )

    ytd_net_profit = ytd_revenue - ytd_expenses

    # Outstanding receivables
    outstanding_receivables = float(
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "partial"]),
            Invoice.invoice_type == "invoice",
        )
        .scalar() or 0
    )

    # Overdue receivables
    overdue_receivables = float(
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.due_date < now,
        )
        .scalar() or 0
    )

    # Total payables
    total_payables = float(
        db.query(func.coalesce(func.sum(PurchaseOrder.total_amount), 0))
        .filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status.in_(["confirmed", "received"]),
        )
        .scalar() or 0
    )

    # Cash balance (all payments in minus expenses)
    cash_in = float(
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(
            Payment.company_id == company_id,
            Payment.status.in_(["posted", "reconciled"]),
        )
        .scalar() or 0
    )
    cash_out = float(
        db.query(func.coalesce(func.sum(Expense.total_amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
        )
        .scalar() or 0
    )
    cash_balance = cash_in - cash_out

    # Counts
    invoice_count = (
        db.query(func.count(Invoice.id))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "paid", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.invoice_date >= year_start,
        )
        .scalar() or 0
    )

    unpaid_invoice_count = (
        db.query(func.count(Invoice.id))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.amount_due > 0,
        )
        .scalar() or 0
    )

    overdue_invoice_count = (
        db.query(func.count(Invoice.id))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.amount_due > 0,
            Invoice.due_date < now,
        )
        .scalar() or 0
    )

    vendor_bills_to_validate_count = (
        db.query(func.count(PurchaseOrder.id))
        .filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status == "draft",
        )
        .scalar() or 0
    )

    vendor_bills_to_validate_amount = float(
        db.query(func.coalesce(func.sum(PurchaseOrder.total_amount), 0))
        .filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status == "draft",
        )
        .scalar() or 0
    )

    vendor_bills_open_count = (
        db.query(func.count(PurchaseOrder.id))
        .filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status.in_(["confirmed", "received"]),
        )
        .scalar() or 0
    )

    vendor_bills_open_amount = float(
        db.query(func.coalesce(func.sum(PurchaseOrder.total_amount), 0))
        .filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status.in_(["confirmed", "received"]),
        )
        .scalar() or 0
    )

    expense_count = (
        db.query(func.count(Expense.id))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
            Expense.expense_date >= year_start,
        )
        .scalar() or 0
    )

    payment_count = (
        db.query(func.count(Payment.id))
        .filter(
            Payment.company_id == company_id,
            Payment.status.in_(["posted", "reconciled"]),
            Payment.payment_date >= year_start,
        )
        .scalar() or 0
    )

    # Recent journal entries (last 10)
    recent_entries = (
        db.query(JournalEntry)
        .filter(JournalEntry.company_id == company_id)
        .order_by(JournalEntry.entry_date.desc())
        .limit(10)
        .all()
    )
    recent_journal_entries = []
    for je in recent_entries:
        journal = db.query(Journal).filter(Journal.id == je.journal_id).first()
        total_debit = float(
            db.query(func.coalesce(func.sum(JournalEntryLine.debit), 0))
            .filter(JournalEntryLine.entry_id == je.id)
            .scalar() or 0
        )
        recent_journal_entries.append({
            "id": je.id,
            "reference": je.reference,
            "entry_date": je.entry_date.isoformat() if je.entry_date else "",
            "journal_name": journal.name if journal else "—",
            "total_debit": round(total_debit, 2),
            "status": je.status,
        })

    # Monthly revenue vs expenses (last 6 months)
    monthly_revenue = []
    for i in range(5, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        m_start = datetime(y, m, 1)
        if m == 12:
            m_end = datetime(y + 1, 1, 1)
        else:
            m_end = datetime(y, m + 1, 1)

        rev = float(
            db.query(func.coalesce(func.sum(Invoice.total_amount), 0))
            .filter(
                Invoice.company_id == company_id,
                Invoice.status.in_(["posted", "paid", "partial"]),
                Invoice.invoice_type == "invoice",
                Invoice.invoice_date >= m_start,
                Invoice.invoice_date < m_end,
            )
            .scalar() or 0
        )
        exp = float(
            db.query(func.coalesce(func.sum(Expense.total_amount), 0))
            .filter(
                Expense.company_id == company_id,
                Expense.status == "posted",
                Expense.expense_date >= m_start,
                Expense.expense_date < m_end,
            )
            .scalar() or 0
        )
        monthly_revenue.append({
            "month": m_start.strftime("%b"),
            "revenue": round(rev, 2),
            "expenses": round(exp, 2),
        })

    # Bank & Cash journals with balance
    bank_journals_raw = (
        db.query(Journal)
        .filter(
            Journal.company_id == company_id,
            Journal.journal_type.in_(["bank", "cash"]),
            Journal.is_active == True,
        )
        .all()
    )
    bank_journals = []
    for j in bank_journals_raw:
        balance = float(
            db.query(
                func.coalesce(func.sum(JournalEntryLine.debit - JournalEntryLine.credit), 0)
            )
            .join(JournalEntry, JournalEntry.id == JournalEntryLine.entry_id)
            .filter(
                JournalEntry.journal_id == j.id,
                JournalEntry.status == "posted",
            )
            .scalar() or 0
        )
        payment_total = float(
            db.query(func.coalesce(func.sum(Payment.amount), 0))
            .join(JournalEntry, JournalEntry.payment_id == Payment.id)
            .filter(
                Payment.company_id == company_id,
                Payment.status.in_(["posted", "reconciled"]),
                JournalEntry.journal_id == j.id,
                JournalEntry.status == "posted",
            )
            .scalar() or 0
        )
        bank_journals.append({
            "id": j.id,
            "name": j.name,
            "code": j.code,
            "journal_type": j.journal_type,
            "balance": round(balance, 2),
            "payment_total": round(payment_total, 2),
        })

    return {
        "year": now.year,
        "ytd_revenue": round(ytd_revenue, 2),
        "ytd_expenses": round(ytd_expenses, 2),
        "ytd_net_profit": round(ytd_net_profit, 2),
        "outstanding_receivables": round(outstanding_receivables, 2),
        "overdue_receivables": round(overdue_receivables, 2),
        "total_payables": round(total_payables, 2),
        "cash_balance": round(cash_balance, 2),
        "invoice_count": invoice_count,
        "unpaid_invoice_count": unpaid_invoice_count,
        "overdue_invoice_count": overdue_invoice_count,
        "expense_count": expense_count,
        "payment_count": payment_count,
        "customer_invoices": {
            "unpaid_count": unpaid_invoice_count,
            "unpaid_amount": round(outstanding_receivables, 2),
            "overdue_count": overdue_invoice_count,
            "overdue_amount": round(overdue_receivables, 2),
        },
        "vendor_bills": {
            "to_validate_count": vendor_bills_to_validate_count,
            "to_validate_amount": round(vendor_bills_to_validate_amount, 2),
            "open_count": vendor_bills_open_count,
            "open_amount": round(vendor_bills_open_amount, 2),
        },
        "recent_journal_entries": recent_journal_entries,
        "monthly_revenue": monthly_revenue,
        "bank_journals": bank_journals,
    }
