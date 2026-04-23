from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.pos_session import POSOrder


def next_payment_reference(db: Session, prefix: str = "PAY") -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    full_prefix = f"{prefix}-{today}-"
    count = db.query(Payment).filter(Payment.reference.like(f"{full_prefix}%")).count()
    return f"{full_prefix}{count + 1:04d}"


def _normalise_payment_method(method: str | None) -> str:
    value = (method or "cash").strip().lower()
    if value in {"bank", "bank_transfer"}:
        return "bank_transfer"
    return value or "cash"


def create_payment_record(
    db: Session,
    *,
    company_id: int,
    invoice_id: int | None,
    contact_id: int | None,
    amount: float,
    currency: str,
    payment_method: str,
    created_by_id: int | None,
    payment_date: datetime | None = None,
    reference: str | None = None,
    payment_account: str = "",
    transaction_reference: str = "",
    notes: str = "",
    status: str = "posted",
    journal_id: int | None = None,
) -> Payment:
    chosen_reference = reference
    if not chosen_reference or db.query(Payment.id).filter(Payment.reference == chosen_reference).first():
        chosen_reference = next_payment_reference(db)

    payment = Payment(
        company_id=company_id,
        invoice_id=invoice_id,
        contact_id=contact_id,
        reference=chosen_reference,
        amount=float(amount or 0),
        currency=currency or "USD",
        payment_method=_normalise_payment_method(payment_method),
        payment_account=payment_account,
        transaction_reference=transaction_reference,
        payment_date=payment_date or datetime.utcnow(),
        notes=notes,
        status=status,
        created_by_id=created_by_id,
    )
    db.add(payment)
    db.flush()
    if journal_id is not None:
        setattr(payment, "journal_id", journal_id)
    return payment


def backfill_company_payments(db: Session, company_id: int) -> int:
    existing_sums = dict(
        db.query(Payment.invoice_id, func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.company_id == company_id, Payment.invoice_id.isnot(None), Payment.status != "cancelled")
        .group_by(Payment.invoice_id)
        .all()
    )

    pos_orders_by_invoice = {
        order.invoice_id: order
        for order in db.query(POSOrder)
        .filter(POSOrder.company_id == company_id, POSOrder.invoice_id.isnot(None), POSOrder.status.in_(["paid", "fiscalized"]))
        .all()
        if order.invoice_id is not None
    }

    created = 0
    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.company_id == company_id,
            Invoice.amount_paid > 0,
            Invoice.invoice_type != "credit_note",
        )
        .all()
    )
    for invoice in invoices:
        already_recorded = float(existing_sums.get(invoice.id, 0) or 0)
        missing_amount = round(float(invoice.amount_paid or 0) - already_recorded, 2)
        if missing_amount <= 0:
            continue

        pos_order = pos_orders_by_invoice.get(invoice.id)
        preferred_reference = None
        transaction_reference = ""
        payment_method = "cash"
        payment_date = invoice.invoice_date or invoice.created_at or datetime.utcnow()
        notes = f"Backfilled payment for invoice {invoice.reference}"

        if pos_order:
            preferred_reference = pos_order.reference or invoice.payment_reference or None
            transaction_reference = pos_order.payment_reference or ""
            payment_method = pos_order.payment_method or "cash"
            payment_date = pos_order.order_date or payment_date
            notes = f"Backfilled POS payment for order {pos_order.reference}"
        elif invoice.payment_reference:
            preferred_reference = invoice.payment_reference
            transaction_reference = invoice.payment_reference

        create_payment_record(
            db,
            company_id=invoice.company_id,
            invoice_id=invoice.id,
            contact_id=invoice.customer_id,
            amount=missing_amount,
            currency=invoice.currency or "USD",
            payment_method=payment_method,
            created_by_id=invoice.created_by_id,
            payment_date=payment_date,
            reference=preferred_reference,
            transaction_reference=transaction_reference,
            notes=notes,
        )
        created += 1

    if created:
        db.commit()

    return created