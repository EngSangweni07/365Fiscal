"""Accounting report endpoints: Balance Sheet, P&L, Cash Flow, Trial Balance,
General Ledger, Aged Receivable, Aged Payable."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case, and_
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, require_company_access
from app.models.invoice import Invoice
from app.models.invoice_line import InvoiceLine
from app.models.payment import Payment
from app.models.expense import Expense
from app.models.contact import Contact
from app.models.purchase_order import PurchaseOrder
from app.models.stock_quant import StockQuant
from app.models.product import Product
from app.models.account import Account, JournalEntry, JournalEntryLine

router = APIRouter(prefix="/accounting/reports", tags=["accounting-reports"])


def _to_utc(dt: datetime) -> datetime:
    """Normalize datetime values so subtraction works across mixed tz-aware/naive data."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _company_ids(db: Session, user) -> list[int]:
    """Get company IDs the user can access."""
    from app.models.company import Company
    from app.models.company_user import CompanyUser

    if user.is_admin:
        return [cid for (cid,) in db.query(Company.id).all()]
    return [
        cid
        for (cid,) in db.query(CompanyUser.company_id)
        .filter(CompanyUser.user_id == user.id, CompanyUser.is_active == True)
        .all()
    ]


# ─── Balance Sheet ────────────────────────────────────
@router.get("/balance-sheet")
def balance_sheet(
    company_id: int,
    as_of: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    cutoff = datetime.fromisoformat(as_of) if as_of else datetime.utcnow()

    # Assets: stock valuation + receivables
    stock_value = (
        db.query(func.coalesce(func.sum(StockQuant.total_value), 0))
        .join(Product, Product.id == StockQuant.product_id)
        .filter(Product.company_id == company_id)
        .scalar()
    ) or 0

    receivables = (
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.invoice_date <= cutoff,
        )
        .scalar()
    ) or 0

    cash_received = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(
            Payment.company_id == company_id,
            Payment.status.in_(["posted", "reconciled"]),
            Payment.payment_date <= cutoff,
        )
        .scalar()
    ) or 0

    total_assets = float(stock_value) + float(receivables) + float(cash_received)

    # Liabilities: payables (unpaid purchase orders)
    payables = (
        db.query(func.coalesce(func.sum(PurchaseOrder.total_amount), 0))
        .filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status.in_(["confirmed", "received"]),
        )
        .scalar()
    ) or 0

    total_liabilities = float(payables)

    # Equity = Assets - Liabilities
    equity = total_assets - total_liabilities

    # Revenue & Expenses for retained earnings
    revenue = (
        db.query(func.coalesce(func.sum(Invoice.total_amount), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "paid", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.invoice_date <= cutoff,
        )
        .scalar()
    ) or 0

    expenses_total = (
        db.query(func.coalesce(func.sum(Expense.total_amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
            Expense.expense_date <= cutoff,
        )
        .scalar()
    ) or 0

    retained_earnings = float(revenue) - float(expenses_total)

    return {
        "as_of": cutoff.isoformat(),
        "assets": {
            "cash_and_bank": round(float(cash_received), 2),
            "accounts_receivable": round(float(receivables), 2),
            "inventory": round(float(stock_value), 2),
            "total": round(total_assets, 2),
        },
        "liabilities": {
            "accounts_payable": round(float(payables), 2),
            "total": round(total_liabilities, 2),
        },
        "equity": {
            "retained_earnings": round(retained_earnings, 2),
            "total": round(equity, 2),
        },
    }


# ─── Profit and Loss ─────────────────────────────────
@router.get("/profit-and-loss")
def profit_and_loss(
    company_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    now = datetime.utcnow()
    d_from = datetime.fromisoformat(date_from) if date_from else now.replace(month=1, day=1, hour=0, minute=0, second=0)
    d_to = datetime.fromisoformat(date_to) if date_to else now

    # Revenue
    inv_q = db.query(
        func.coalesce(func.sum(Invoice.subtotal), 0).label("revenue"),
        func.coalesce(func.sum(Invoice.tax_amount), 0).label("tax"),
        func.coalesce(func.sum(Invoice.total_amount), 0).label("total"),
        func.count(Invoice.id).label("count"),
    ).filter(
        Invoice.company_id == company_id,
        Invoice.status.in_(["posted", "paid", "partial"]),
        Invoice.invoice_type == "invoice",
        Invoice.invoice_date >= d_from,
        Invoice.invoice_date <= d_to,
    )
    rev = inv_q.first()

    # Credit notes
    cn_q = db.query(
        func.coalesce(func.sum(Invoice.total_amount), 0).label("total"),
        func.count(Invoice.id).label("count"),
    ).filter(
        Invoice.company_id == company_id,
        Invoice.status.in_(["posted", "paid", "partial"]),
        Invoice.invoice_type == "credit_note",
        Invoice.invoice_date >= d_from,
        Invoice.invoice_date <= d_to,
    )
    cn = cn_q.first()

    net_revenue = float(rev.revenue) - float(cn.total)

    # Cost of goods sold (purchases)
    cogs = (
        db.query(func.coalesce(func.sum(PurchaseOrder.total_amount), 0))
        .filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status.in_(["confirmed", "received", "done"]),
            PurchaseOrder.order_date >= d_from,
            PurchaseOrder.order_date <= d_to,
        )
        .scalar()
    ) or 0

    gross_profit = net_revenue - float(cogs)

    # Operating expenses
    exp = (
        db.query(
            func.coalesce(func.sum(Expense.subtotal), 0).label("subtotal"),
            func.coalesce(func.sum(Expense.tax_amount), 0).label("tax"),
            func.coalesce(func.sum(Expense.total_amount), 0).label("total"),
            func.count(Expense.id).label("count"),
        )
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
            Expense.expense_date >= d_from,
            Expense.expense_date <= d_to,
        )
        .first()
    )

    operating_expenses = float(exp.total)
    net_profit = gross_profit - operating_expenses

    # Expense breakdown by category
    expense_by_cat = (
        db.query(Expense.category, func.sum(Expense.total_amount))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
            Expense.expense_date >= d_from,
            Expense.expense_date <= d_to,
        )
        .group_by(Expense.category)
        .all()
    )

    return {
        "period_from": d_from.isoformat(),
        "period_to": d_to.isoformat(),
        "revenue": {
            "gross_sales": round(float(rev.revenue), 2),
            "sales_tax": round(float(rev.tax), 2),
            "credit_notes": round(float(cn.total), 2),
            "net_revenue": round(net_revenue, 2),
            "invoice_count": rev.count,
        },
        "cost_of_goods_sold": round(float(cogs), 2),
        "gross_profit": round(gross_profit, 2),
        "operating_expenses": {
            "total": round(operating_expenses, 2),
            "by_category": [
                {"category": cat or "Uncategorized", "amount": round(float(amt), 2)}
                for cat, amt in expense_by_cat
            ],
        },
        "net_profit": round(net_profit, 2),
    }


# ─── Cash Flow Statement ─────────────────────────────
@router.get("/cash-flow")
def cash_flow_statement(
    company_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    now = datetime.utcnow()
    d_from = datetime.fromisoformat(date_from) if date_from else now.replace(month=1, day=1, hour=0, minute=0, second=0)
    d_to = datetime.fromisoformat(date_to) if date_to else now

    # Cash inflows: payments received
    cash_in = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(
            Payment.company_id == company_id,
            Payment.status.in_(["posted", "reconciled"]),
            Payment.payment_date >= d_from,
            Payment.payment_date <= d_to,
        )
        .scalar()
    ) or 0

    # Cash in by method
    cash_in_by_method = (
        db.query(Payment.payment_method, func.sum(Payment.amount))
        .filter(
            Payment.company_id == company_id,
            Payment.status.in_(["posted", "reconciled"]),
            Payment.payment_date >= d_from,
            Payment.payment_date <= d_to,
        )
        .group_by(Payment.payment_method)
        .all()
    )

    # Cash outflows: expenses
    cash_out = (
        db.query(func.coalesce(func.sum(Expense.total_amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
            Expense.expense_date >= d_from,
            Expense.expense_date <= d_to,
        )
        .scalar()
    ) or 0

    cash_out_by_cat = (
        db.query(Expense.category, func.sum(Expense.total_amount))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
            Expense.expense_date >= d_from,
            Expense.expense_date <= d_to,
        )
        .group_by(Expense.category)
        .all()
    )

    net_cash = float(cash_in) - float(cash_out)

    return {
        "period_from": d_from.isoformat(),
        "period_to": d_to.isoformat(),
        "operating_activities": {
            "cash_received": round(float(cash_in), 2),
            "by_method": [
                {"method": m, "amount": round(float(a), 2)} for m, a in cash_in_by_method
            ],
            "cash_paid": round(float(cash_out), 2),
            "by_category": [
                {"category": c or "Uncategorized", "amount": round(float(a), 2)}
                for c, a in cash_out_by_cat
            ],
            "net_operating": round(net_cash, 2),
        },
        "net_cash_change": round(net_cash, 2),
    }


# ─── Executive Summary ───────────────────────────────
@router.get("/executive-summary")
def executive_summary(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    now = datetime.utcnow()
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0)

    revenue = (
        db.query(func.coalesce(func.sum(Invoice.total_amount), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "paid", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.invoice_date >= year_start,
        )
        .scalar()
    ) or 0

    expenses_total = (
        db.query(func.coalesce(func.sum(Expense.total_amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
            Expense.expense_date >= year_start,
        )
        .scalar()
    ) or 0

    outstanding = (
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "partial"]),
            Invoice.invoice_type == "invoice",
        )
        .scalar()
    ) or 0

    overdue = (
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.due_date < now,
        )
        .scalar()
    ) or 0

    return {
        "year": now.year,
        "ytd_revenue": round(float(revenue), 2),
        "ytd_expenses": round(float(expenses_total), 2),
        "ytd_net_profit": round(float(revenue) - float(expenses_total), 2),
        "outstanding_receivables": round(float(outstanding), 2),
        "overdue_receivables": round(float(overdue), 2),
    }


# ─── Trial Balance ───────────────────────────────────
@router.get("/trial-balance")
def trial_balance(
    company_id: int,
    as_of: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    cutoff = datetime.fromisoformat(as_of) if as_of else datetime.utcnow()

    # If journal entries exist, use them
    accounts = db.query(Account).filter(Account.company_id == company_id, Account.is_active == True).all()
    rows = []
    total_debit = 0.0
    total_credit = 0.0

    for acct in accounts:
        debit = (
            db.query(func.coalesce(func.sum(JournalEntryLine.debit), 0))
            .join(JournalEntry, JournalEntry.id == JournalEntryLine.entry_id)
            .filter(
                JournalEntryLine.account_id == acct.id,
                JournalEntry.status == "posted",
                JournalEntry.entry_date <= cutoff,
            )
            .scalar()
        ) or 0
        credit = (
            db.query(func.coalesce(func.sum(JournalEntryLine.credit), 0))
            .join(JournalEntry, JournalEntry.id == JournalEntryLine.entry_id)
            .filter(
                JournalEntryLine.account_id == acct.id,
                JournalEntry.status == "posted",
                JournalEntry.entry_date <= cutoff,
            )
            .scalar()
        ) or 0
        d = float(debit)
        c = float(credit)
        if d or c:
            rows.append({
                "account_code": acct.code,
                "account_name": acct.name,
                "account_type": acct.account_type,
                "debit": round(d, 2),
                "credit": round(c, 2),
                "balance": round(d - c, 2),
            })
            total_debit += d
            total_credit += c

    # If no journal entries, synthesize from invoices/expenses/payments
    if not rows:
        revenue = (
            db.query(func.coalesce(func.sum(Invoice.total_amount), 0))
            .filter(
                Invoice.company_id == company_id,
                Invoice.status.in_(["posted", "paid", "partial"]),
                Invoice.invoice_type == "invoice",
                Invoice.invoice_date <= cutoff,
            )
            .scalar()
        ) or 0
        expenses_total = (
            db.query(func.coalesce(func.sum(Expense.total_amount), 0))
            .filter(
                Expense.company_id == company_id,
                Expense.status == "posted",
                Expense.expense_date <= cutoff,
            )
            .scalar()
        ) or 0
        payments_in = (
            db.query(func.coalesce(func.sum(Payment.amount), 0))
            .filter(
                Payment.company_id == company_id,
                Payment.status.in_(["posted", "reconciled"]),
                Payment.payment_date <= cutoff,
            )
            .scalar()
        ) or 0
        receivables = (
            db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
            .filter(
                Invoice.company_id == company_id,
                Invoice.status.in_(["posted", "partial"]),
                Invoice.invoice_type == "invoice",
            )
            .scalar()
        ) or 0

        r = float(revenue)
        e = float(expenses_total)
        p = float(payments_in)
        rec = float(receivables)

        rows = [
            {"account_code": "1100", "account_name": "Cash & Bank", "account_type": "asset", "debit": round(p, 2), "credit": 0, "balance": round(p, 2)},
            {"account_code": "1200", "account_name": "Accounts Receivable", "account_type": "asset", "debit": round(rec, 2), "credit": 0, "balance": round(rec, 2)},
            {"account_code": "4000", "account_name": "Sales Revenue", "account_type": "income", "debit": 0, "credit": round(r, 2), "balance": round(-r, 2)},
            {"account_code": "5000", "account_name": "Operating Expenses", "account_type": "expense", "debit": round(e, 2), "credit": 0, "balance": round(e, 2)},
        ]
        total_debit = p + rec + e
        total_credit = r

    return {
        "as_of": cutoff.isoformat(),
        "rows": rows,
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "difference": round(total_debit - total_credit, 2),
    }


# ─── General Ledger ──────────────────────────────────
@router.get("/general-ledger")
def general_ledger(
    company_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    now = datetime.utcnow()
    d_from = datetime.fromisoformat(date_from) if date_from else now.replace(month=1, day=1, hour=0, minute=0, second=0)
    d_to = datetime.fromisoformat(date_to) if date_to else now

    # Combine invoices, payments, expenses into a ledger
    entries = []

    # Invoices
    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "paid", "partial"]),
            Invoice.invoice_date >= d_from,
            Invoice.invoice_date <= d_to,
        )
        .order_by(Invoice.invoice_date)
        .all()
    )
    for inv in invoices:
        customer = db.query(Contact).filter(Contact.id == inv.customer_id).first() if inv.customer_id else None
        entries.append({
            "date": inv.invoice_date.isoformat() if inv.invoice_date else "",
            "reference": inv.reference,
            "type": "credit_note" if inv.invoice_type == "credit_note" else "invoice",
            "party": customer.name if customer else "—",
            "debit": round(inv.total_amount, 2) if inv.invoice_type != "credit_note" else 0,
            "credit": round(inv.total_amount, 2) if inv.invoice_type == "credit_note" else 0,
            "description": f"Invoice {inv.reference}",
        })

    # Payments
    payments = (
        db.query(Payment)
        .filter(
            Payment.company_id == company_id,
            Payment.status.in_(["posted", "reconciled"]),
            Payment.payment_date >= d_from,
            Payment.payment_date <= d_to,
        )
        .order_by(Payment.payment_date)
        .all()
    )
    for pay in payments:
        contact = db.query(Contact).filter(Contact.id == pay.contact_id).first() if pay.contact_id else None
        entries.append({
            "date": pay.payment_date.isoformat() if pay.payment_date else "",
            "reference": pay.reference,
            "type": "payment",
            "party": contact.name if contact else "—",
            "debit": 0,
            "credit": round(pay.amount, 2),
            "description": f"Payment {pay.reference} ({pay.payment_method})",
        })

    # Expenses
    expenses = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
            Expense.expense_date >= d_from,
            Expense.expense_date <= d_to,
        )
        .order_by(Expense.expense_date)
        .all()
    )
    for exp in expenses:
        supplier = db.query(Contact).filter(Contact.id == exp.supplier_id).first() if exp.supplier_id else None
        entries.append({
            "date": exp.expense_date.isoformat() if exp.expense_date else "",
            "reference": exp.reference,
            "type": "expense",
            "party": supplier.name if supplier else "—",
            "debit": round(exp.total_amount, 2),
            "credit": 0,
            "description": f"{exp.category}: {exp.description[:80]}",
        })

    # Sort by date
    entries.sort(key=lambda x: x["date"])

    # Running balance
    running = 0.0
    for e in entries:
        running += e["debit"] - e["credit"]
        e["running_balance"] = round(running, 2)

    total_debit = sum(e["debit"] for e in entries)
    total_credit = sum(e["credit"] for e in entries)

    return {
        "period_from": d_from.isoformat(),
        "period_to": d_to.isoformat(),
        "entries": entries,
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
    }


# ─── Aged Receivable ─────────────────────────────────
@router.get("/aged-receivable")
def aged_receivable(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    now = datetime.now(timezone.utc)
    buckets = [
        ("current", 0, 30),
        ("1_30", 1, 30),
        ("31_60", 31, 60),
        ("61_90", 61, 90),
        ("over_90", 91, 9999),
    ]

    unpaid = (
        db.query(Invoice)
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.amount_due > 0,
        )
        .all()
    )

    # Group by customer
    customer_data: dict[int, dict] = {}
    for inv in unpaid:
        cid = inv.customer_id or 0
        if cid not in customer_data:
            customer = db.query(Contact).filter(Contact.id == cid).first() if cid else None
            customer_data[cid] = {
                "customer_id": cid,
                "customer_name": customer.name if customer else "Unknown",
                "current": 0, "1_30": 0, "31_60": 0, "61_90": 0, "over_90": 0, "total": 0,
            }

        due_date = inv.due_date or inv.invoice_date or inv.created_at
        if due_date:
            days_overdue = (now - _to_utc(due_date)).days
        else:
            days_overdue = 0

        amount = float(inv.amount_due or 0)
        customer_data[cid]["total"] += amount

        if days_overdue <= 0:
            customer_data[cid]["current"] += amount
        elif days_overdue <= 30:
            customer_data[cid]["1_30"] += amount
        elif days_overdue <= 60:
            customer_data[cid]["31_60"] += amount
        elif days_overdue <= 90:
            customer_data[cid]["61_90"] += amount
        else:
            customer_data[cid]["over_90"] += amount

    rows = sorted(customer_data.values(), key=lambda r: -r["total"])
    for r in rows:
        for k in ["current", "1_30", "31_60", "61_90", "over_90", "total"]:
            r[k] = round(r[k], 2)

    totals = {k: round(sum(r[k] for r in rows), 2) for k in ["current", "1_30", "31_60", "61_90", "over_90", "total"]}

    return {"as_of": now.isoformat(), "rows": rows, "totals": totals}


# ─── Aged Payable ─────────────────────────────────────
@router.get("/aged-payable")
def aged_payable(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    now = datetime.now(timezone.utc)

    unpaid_pos = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status.in_(["confirmed", "received"]),
        )
        .all()
    )

    supplier_data: dict[int, dict] = {}
    for po in unpaid_pos:
        sid = po.supplier_id or 0
        if sid not in supplier_data:
            supplier = db.query(Contact).filter(Contact.id == sid).first() if sid else None
            supplier_data[sid] = {
                "supplier_id": sid,
                "supplier_name": supplier.name if supplier else "Unknown",
                "current": 0, "1_30": 0, "31_60": 0, "61_90": 0, "over_90": 0, "total": 0,
            }

        order_date = po.order_date or po.created_at
        if order_date:
            days_old = (now - _to_utc(order_date)).days
        else:
            days_old = 0

        amount = float(po.total_amount or 0)
        supplier_data[sid]["total"] += amount

        if days_old <= 0:
            supplier_data[sid]["current"] += amount
        elif days_old <= 30:
            supplier_data[sid]["1_30"] += amount
        elif days_old <= 60:
            supplier_data[sid]["31_60"] += amount
        elif days_old <= 90:
            supplier_data[sid]["61_90"] += amount
        else:
            supplier_data[sid]["over_90"] += amount

    rows = sorted(supplier_data.values(), key=lambda r: -r["total"])
    for r in rows:
        for k in ["current", "1_30", "31_60", "61_90", "over_90", "total"]:
            r[k] = round(r[k], 2)

    totals = {k: round(sum(r[k] for r in rows), 2) for k in ["current", "1_30", "31_60", "61_90", "over_90", "total"]}

    return {"as_of": now.isoformat(), "rows": rows, "totals": totals}


# ─── Tax Return Summary ──────────────────────────────
@router.get("/tax-return")
def tax_return(
    company_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    now = datetime.utcnow()
    d_from = datetime.fromisoformat(date_from) if date_from else now.replace(month=1, day=1, hour=0, minute=0, second=0)
    d_to = datetime.fromisoformat(date_to) if date_to else now

    # Output VAT (from sales)
    output_vat = (
        db.query(func.coalesce(func.sum(Invoice.tax_amount), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "paid", "partial"]),
            Invoice.invoice_type == "invoice",
            Invoice.invoice_date >= d_from,
            Invoice.invoice_date <= d_to,
        )
        .scalar()
    ) or 0

    # Credit note VAT
    cn_vat = (
        db.query(func.coalesce(func.sum(Invoice.tax_amount), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["posted", "paid", "partial"]),
            Invoice.invoice_type == "credit_note",
            Invoice.invoice_date >= d_from,
            Invoice.invoice_date <= d_to,
        )
        .scalar()
    ) or 0

    # Input VAT (from expenses)
    input_vat = (
        db.query(func.coalesce(func.sum(Expense.tax_amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "posted",
            Expense.expense_date >= d_from,
            Expense.expense_date <= d_to,
        )
        .scalar()
    ) or 0

    net_vat = float(output_vat) - float(cn_vat) - float(input_vat)

    return {
        "period_from": d_from.isoformat(),
        "period_to": d_to.isoformat(),
        "output_vat": round(float(output_vat), 2),
        "credit_note_vat": round(float(cn_vat), 2),
        "input_vat": round(float(input_vat), 2),
        "net_vat_payable": round(net_vat, 2),
    }
