"""Accounting integration helpers for operational apps.

These helpers post simple double-entry journals from invoices, payments,
expenses, purchases, and stock moves. They intentionally use the generic chart
codes seeded by the accounting app so the operational apps stay loosely coupled.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.account import Account, Journal, JournalEntry, JournalEntryLine
from app.models.category import Category
from app.models.contact import Contact
from app.models.product import Product


ACCOUNT_CODES = {
    "cash": "1110",
    "bank": "1120",
    "receivable": "1200",
    "inventory": "1300",
    "vat_input": "1500",
    "payable": "2110",
    "vat_output": "2160",
    "sales": "4100",
    "purchases": "5400",
    "cogs": "5000",
    "expenses": "6000",
}

JOURNAL_CODES = {
    "sale": "SAL",
    "purchase": "PUR",
    "bank": "BNK",
    "cash": "CSH",
    "general": "MISC",
}


def get_account(db: Session, company_id: int, code: str) -> Account | None:
    return (
        db.query(Account)
        .filter(
            Account.company_id == company_id,
            Account.code == code,
            Account.is_active == True,
        )
        .first()
    )


def get_valid_account_id(db: Session, company_id: int, account_id: int | None) -> int | None:
    if not account_id:
        return None
    return (
        db.query(Account.id)
        .filter(Account.id == account_id, Account.company_id == company_id, Account.is_active == True)
        .scalar()
    )


def contact_account_id(db: Session, company_id: int, contact_id: int | None, field: str) -> int | None:
    if not contact_id:
        return None
    contact = db.query(Contact).filter(Contact.id == contact_id, Contact.company_id == company_id).first()
    if not contact:
        return None
    return get_valid_account_id(db, company_id, getattr(contact, field, None))


def product_account_id(db: Session, company_id: int, product_id: int | None, field: str) -> int | None:
    if not product_id:
        return None
    product = db.query(Product).filter(Product.id == product_id, Product.company_id == company_id).first()
    if not product:
        return None
    mapped = get_valid_account_id(db, company_id, getattr(product, field, None))
    if mapped:
        return mapped
    if product.category_id:
        category = db.query(Category).filter(Category.id == product.category_id, Category.company_id == company_id).first()
        if category:
            return get_valid_account_id(db, company_id, getattr(category, field, None))
    return None


def get_journal(db: Session, company_id: int, journal_type: str) -> Journal | None:
    code = JOURNAL_CODES.get(journal_type)
    query = db.query(Journal).filter(
        Journal.company_id == company_id,
        Journal.is_active == True,
    )
    if code:
        journal = query.filter(Journal.code == code).first()
        if journal:
            return journal
    return query.filter(Journal.journal_type == journal_type).first()


def post_entry(
    db: Session,
    *,
    company_id: int,
    journal_type: str,
    reference: str,
    entry_date: datetime | None,
    narration: str,
    lines: list[dict],
    invoice_id: int | None = None,
    payment_id: int | None = None,
    replace_existing: bool = False,
) -> JournalEntry | None:
    """Create a posted journal entry if the chart has the required accounts."""
    existing = (
        db.query(JournalEntry)
        .filter(JournalEntry.company_id == company_id, JournalEntry.reference == reference)
        .first()
    )
    if existing:
        if not replace_existing:
            return existing
        db.delete(existing)
        db.flush()

    prepared = []
    total_debit = 0.0
    total_credit = 0.0
    for line in lines:
        account = None
        mapped_account_id = line.get("account_id")
        if mapped_account_id:
            account = (
                db.query(Account)
                .filter(
                    Account.id == mapped_account_id,
                    Account.company_id == company_id,
                    Account.is_active == True,
                )
                .first()
            )
        if not account:
            account = get_account(db, company_id, line["code"])
        debit = round(float(line.get("debit") or 0), 2)
        credit = round(float(line.get("credit") or 0), 2)
        if not account or (not debit and not credit):
            continue
        prepared.append({
            "account_id": account.id,
            "contact_id": line.get("contact_id"),
            "label": line.get("label") or "",
            "debit": debit,
            "credit": credit,
            "currency_code": line.get("currency_code") or account.currency_code or "USD",
        })
        total_debit += debit
        total_credit += credit

    if len(prepared) < 2 or round(total_debit - total_credit, 2) != 0:
        return None

    journal = get_journal(db, company_id, journal_type) or get_journal(db, company_id, "general")
    if not journal:
        return None

    entry = JournalEntry(
        company_id=company_id,
        journal_id=journal.id,
        reference=reference,
        entry_date=entry_date or datetime.utcnow(),
        status="posted",
        narration=narration,
        invoice_id=invoice_id,
        payment_id=payment_id,
    )
    db.add(entry)
    db.flush()
    for line in prepared:
        db.add(JournalEntryLine(entry_id=entry.id, **line))
    return entry


def post_invoice_entry(db: Session, invoice, replace_existing: bool = False) -> JournalEntry | None:
    sign = -1 if invoice.invoice_type == "credit_note" else 1
    total = round(abs(float(invoice.total_amount or 0)), 2)
    tax = round(abs(float(invoice.tax_amount or 0)), 2)
    if total <= 0:
        return None

    receivable_account_id = contact_account_id(db, invoice.company_id, invoice.customer_id, "receivable_account_id")
    sales_lines = []
    for invoice_line in getattr(invoice, "lines", []) or []:
        amount = round(abs(float(invoice_line.subtotal or 0)), 2)
        if amount <= 0:
            continue
        sales_lines.append({
            "code": ACCOUNT_CODES["sales"],
            "account_id": product_account_id(db, invoice.company_id, invoice_line.product_id, "income_account_id"),
            "credit" if sign > 0 else "debit": amount,
            "label": invoice_line.description or invoice.reference,
            "currency_code": invoice.currency,
        })
    if not sales_lines:
        sales_lines = [{
            "code": ACCOUNT_CODES["sales"],
            "credit" if sign > 0 else "debit": round(abs(float(invoice.subtotal or 0)), 2),
            "label": invoice.reference,
            "currency_code": invoice.currency,
        }]

    if sign > 0:
        lines = [
            {"code": ACCOUNT_CODES["receivable"], "account_id": receivable_account_id, "debit": total, "contact_id": invoice.customer_id, "label": invoice.reference, "currency_code": invoice.currency},
            *sales_lines,
            {"code": ACCOUNT_CODES["vat_output"], "credit": tax, "label": invoice.reference, "currency_code": invoice.currency},
        ]
    else:
        lines = [
            *sales_lines,
            {"code": ACCOUNT_CODES["vat_output"], "debit": tax, "label": invoice.reference, "currency_code": invoice.currency},
            {"code": ACCOUNT_CODES["receivable"], "account_id": receivable_account_id, "credit": total, "contact_id": invoice.customer_id, "label": invoice.reference, "currency_code": invoice.currency},
        ]
    return post_entry(
        db,
        company_id=invoice.company_id,
        journal_type="sale",
        reference=f"INV/{invoice.reference}",
        entry_date=invoice.invoice_date,
        narration=f"Customer invoice {invoice.reference}",
        lines=lines,
        invoice_id=invoice.id,
        replace_existing=replace_existing,
    )


def post_payment_entry(db: Session, payment, replace_existing: bool = False) -> JournalEntry | None:
    amount = round(float(payment.amount or 0), 2)
    if amount <= 0:
        return None
    is_cash = payment.payment_method == "cash"
    cash_code = ACCOUNT_CODES["cash"] if is_cash else ACCOUNT_CODES["bank"]
    receivable_account_id = contact_account_id(db, payment.company_id, payment.contact_id, "receivable_account_id")
    return post_entry(
        db,
        company_id=payment.company_id,
        journal_type="cash" if is_cash else "bank",
        reference=f"PAY/{payment.reference}",
        entry_date=payment.payment_date,
        narration=f"Payment {payment.reference}",
        lines=[
            {"code": cash_code, "debit": amount, "contact_id": payment.contact_id, "label": payment.reference, "currency_code": payment.currency},
            {"code": ACCOUNT_CODES["receivable"], "account_id": receivable_account_id, "credit": amount, "contact_id": payment.contact_id, "label": payment.reference, "currency_code": payment.currency},
        ],
        payment_id=payment.id,
        replace_existing=replace_existing,
    )


def post_expense_entry(db: Session, expense, replace_existing: bool = False) -> JournalEntry | None:
    subtotal = round(float(expense.subtotal or 0), 2)
    tax = round(float(expense.tax_amount or 0), 2)
    total = round(float(expense.total_amount or 0), 2)
    if total <= 0:
        return None
    payable_account_id = contact_account_id(db, expense.company_id, expense.supplier_id, "payable_account_id")
    return post_entry(
        db,
        company_id=expense.company_id,
        journal_type="purchase",
        reference=f"EXP/{expense.reference}",
        entry_date=expense.expense_date,
        narration=f"Expense {expense.reference}",
        lines=[
            {"code": ACCOUNT_CODES["expenses"], "debit": subtotal, "contact_id": expense.supplier_id, "label": expense.category or expense.description, "currency_code": expense.currency},
            {"code": ACCOUNT_CODES["vat_input"], "debit": tax, "label": expense.reference, "currency_code": expense.currency},
            {"code": ACCOUNT_CODES["payable"], "account_id": payable_account_id, "credit": total, "contact_id": expense.supplier_id, "label": expense.reference, "currency_code": expense.currency},
        ],
        replace_existing=replace_existing,
    )


def post_purchase_entry(db: Session, order, replace_existing: bool = False) -> JournalEntry | None:
    subtotal = round(float(order.subtotal or 0), 2)
    tax = round(float(order.tax_amount or 0), 2)
    total = round(float(order.total_amount or 0), 2)
    if total <= 0:
        return None
    payable_account_id = contact_account_id(db, order.company_id, order.supplier_id, "payable_account_id")
    purchase_lines = []
    for order_line in getattr(order, "lines", []) or []:
        amount = round(float(order_line.subtotal or 0), 2)
        if amount <= 0:
            continue
        purchase_lines.append({
            "code": ACCOUNT_CODES["inventory"],
            "account_id": product_account_id(db, order.company_id, order_line.product_id, "inventory_account_id"),
            "debit": amount,
            "contact_id": order.supplier_id,
            "label": order_line.description or order.reference,
            "currency_code": order.currency,
        })
    if not purchase_lines:
        purchase_lines = [{"code": ACCOUNT_CODES["inventory"], "debit": subtotal, "contact_id": order.supplier_id, "label": order.reference, "currency_code": order.currency}]
    return post_entry(
        db,
        company_id=order.company_id,
        journal_type="purchase",
        reference=f"PO/{order.reference}",
        entry_date=order.received_at or order.order_date,
        narration=f"Purchase receipt {order.reference}",
        lines=[
            *purchase_lines,
            {"code": ACCOUNT_CODES["vat_input"], "debit": tax, "label": order.reference, "currency_code": order.currency},
            {"code": ACCOUNT_CODES["payable"], "account_id": payable_account_id, "credit": total, "contact_id": order.supplier_id, "label": order.reference, "currency_code": order.currency},
        ],
        replace_existing=replace_existing,
    )


def post_stock_move_entry(db: Session, move, replace_existing: bool = False) -> JournalEntry | None:
    amount = round(abs(float(move.total_cost or 0)), 2)
    if amount <= 0:
        return None
    if move.move_type == "out":
        lines = [
            {"code": ACCOUNT_CODES["cogs"], "account_id": product_account_id(db, move.company_id, move.product_id, "cogs_account_id"), "debit": amount, "label": move.reference},
            {"code": ACCOUNT_CODES["inventory"], "account_id": product_account_id(db, move.company_id, move.product_id, "inventory_account_id"), "credit": amount, "label": move.reference},
        ]
    elif move.move_type == "in":
        lines = [
            {"code": ACCOUNT_CODES["inventory"], "account_id": product_account_id(db, move.company_id, move.product_id, "inventory_account_id"), "debit": amount, "label": move.reference},
            {"code": ACCOUNT_CODES["purchases"], "account_id": product_account_id(db, move.company_id, move.product_id, "expense_account_id"), "credit": amount, "label": move.reference},
        ]
    else:
        lines = [
            {"code": ACCOUNT_CODES["inventory"], "debit": amount, "label": move.reference},
            {"code": ACCOUNT_CODES["expenses"], "credit": amount, "label": move.reference},
        ]
    return post_entry(
        db,
        company_id=move.company_id,
        journal_type="general",
        reference=f"STK/{move.id or move.reference}",
        entry_date=move.done_date,
        narration=f"Stock move {move.reference}",
        lines=lines,
        replace_existing=replace_existing,
    )
