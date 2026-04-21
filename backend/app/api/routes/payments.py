"""Payment API routes."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from app.api.deps import (
    get_db, get_current_user, ensure_company_access,
    can_record_payment, require_portal_user, log_audit
)
from app.models.payment import Payment, PaymentMethod
from app.models.account import JournalEntry
from app.models.invoice import Invoice
from app.models.user import User
from app.models.audit_log import AuditAction, ResourceType
from app.schemas.payment import (
    PaymentCreate, PaymentUpdate, PaymentRead, PaymentReconcile,
    PaymentMethodCreate, PaymentMethodUpdate, PaymentMethodRead
)
from app.services.accounting import create_reversal_entry, post_payment_entry

router = APIRouter(prefix="/payments", tags=["payments"])


def next_payment_reference(db: Session, prefix: str = "PAY") -> str:
    """Generate next payment reference."""
    today = datetime.utcnow().strftime("%Y%m%d")
    full_prefix = f"{prefix}-{today}-"
    count = db.query(Payment).filter(Payment.reference.like(f"{full_prefix}%")).count()
    return f"{full_prefix}{count + 1:04d}"


@router.get("")
def list_payments(
    company_id: int,
    invoice_id: Optional[int] = None,
    contact_id: Optional[int] = None,
    status: Optional[str] = None,
    payment_method: Optional[str] = None,
    is_reconciled: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """List payments for a company."""
    ensure_company_access(db, user, company_id)
    
    query = db.query(Payment).filter(Payment.company_id == company_id)
    
    if invoice_id:
        query = query.filter(Payment.invoice_id == invoice_id)
    if contact_id:
        query = query.filter(Payment.contact_id == contact_id)
    if status:
        query = query.filter(Payment.status == status)
    if payment_method:
        query = query.filter(Payment.payment_method == payment_method)
    if is_reconciled == "true":
        query = query.filter(Payment.status == "reconciled")
    elif is_reconciled == "false":
        query = query.filter(Payment.status != "reconciled")
    if search:
        query = query.filter(Payment.reference.ilike(f"%{search}%"))
    if start_date:
        query = query.filter(Payment.payment_date >= start_date)
    if end_date:
        query = query.filter(Payment.payment_date <= end_date)
    
    query = query.order_by(Payment.payment_date.desc())
    query = query.offset(offset).limit(limit)
    
    payments = query.all()
    
    # Enrich with invoice_reference and created_by_email
    result = []
    for p in payments:
        data = PaymentRead.model_validate(p).model_dump()
        # Get invoice reference
        if p.invoice_id:
            inv = db.query(Invoice).filter(Invoice.id == p.invoice_id).first()
            data["invoice_reference"] = inv.reference if inv else ""
        else:
            data["invoice_reference"] = ""
        # Get created_by_email
        if p.created_by_id:
            u = db.query(User).filter(User.id == p.created_by_id).first()
            data["created_by_email"] = u.email if u else ""
        else:
            data["created_by_email"] = ""
        data["is_reconciled"] = p.status == "reconciled"
        result.append(data)
    
    return result


@router.post("", response_model=PaymentRead)
def create_payment(
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Create a new payment."""
    ensure_company_access(db, user, payload.company_id)
    
    if not can_record_payment(db, user, payload.company_id):
        raise HTTPException(status_code=403, detail="Permission denied to record payments")
    
    # Validate invoice if provided
    invoice = None
    if payload.invoice_id:
        invoice = db.query(Invoice).filter(
            Invoice.id == payload.invoice_id,
            Invoice.company_id == payload.company_id
        ).first()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        # Get contact from invoice if not provided
        if not payload.contact_id and invoice.customer_id:
            payload.contact_id = invoice.customer_id
    
    payment = Payment(
        company_id=payload.company_id,
        invoice_id=payload.invoice_id,
        contact_id=payload.contact_id,
        reference=next_payment_reference(db),
        amount=payload.amount,
        currency=payload.currency,
        payment_method=payload.payment_method,
        payment_account=payload.payment_account,
        transaction_reference=payload.transaction_reference,
        payment_date=payload.payment_date or datetime.utcnow(),
        notes=payload.notes,
        status="posted",
        created_by_id=user.id,
    )
    db.add(payment)
    db.flush()
    
    # Update invoice if linked
    if invoice:
        invoice.amount_paid += payload.amount
        invoice.amount_due = invoice.total_amount - invoice.amount_paid
        if invoice.amount_due <= 0:
            invoice.payment_reference = payment.reference
            invoice.status = "paid"
    
    post_payment_entry(db, payment)
    
    # Audit log
    log_audit(
        db=db,
        user=user,
        action=AuditAction.PAYMENT_RECORD,
        resource_type=ResourceType.PAYMENT,
        resource_reference=payment.reference,
        company_id=payload.company_id,
        new_values={"amount": payload.amount, "invoice_id": payload.invoice_id},
        changes_summary=f"Payment of {payload.amount} {payload.currency} recorded",
    )
    
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/summary")
def payment_summary(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Get payment summary for a company."""
    ensure_company_access(db, user, company_id)
    
    base = db.query(Payment).filter(
        Payment.company_id == company_id,
        Payment.status != "cancelled",
    )
    
    total_payments = base.count()
    total_amount = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.company_id == company_id,
        Payment.status != "cancelled",
    ).scalar()
    reconciled_count = base.filter(Payment.status == "reconciled").count()
    pending_count = total_payments - reconciled_count
    
    # By method breakdown
    by_method_rows = (
        db.query(
            Payment.payment_method,
            func.count(Payment.id),
            func.coalesce(func.sum(Payment.amount), 0),
        )
        .filter(Payment.company_id == company_id, Payment.status != "cancelled")
        .group_by(Payment.payment_method)
        .all()
    )
    by_method = {
        row[0]: {"count": row[1], "amount": float(row[2])}
        for row in by_method_rows
    }
    
    return {
        "total_payments": total_payments,
        "total_amount": float(total_amount),
        "reconciled_count": reconciled_count,
        "pending_count": pending_count,
        "by_method": by_method,
    }


@router.post("/{payment_id}/reconcile")
def reconcile_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Reconcile a payment."""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    ensure_company_access(db, user, payment.company_id)
    
    if not can_record_payment(db, user, payment.company_id):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if payment.status == "reconciled":
        raise HTTPException(status_code=400, detail="Payment is already reconciled")
    
    if payment.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled payments cannot be reconciled")
    
    payment.status = "reconciled"
    payment.reconciled_at = datetime.utcnow()
    
    db.commit()
    db.refresh(payment)
    return {"message": "Payment reconciled", "id": payment.id}


@router.get("/{payment_id}", response_model=PaymentRead)
def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Get a specific payment."""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    ensure_company_access(db, user, payment.company_id)
    return payment


@router.put("/{payment_id}", response_model=PaymentRead)
def update_payment(
    payment_id: int,
    payload: PaymentUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Update a payment. Only draft payments can be fully updated."""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    ensure_company_access(db, user, payment.company_id)
    
    if not can_record_payment(db, user, payment.company_id):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Only allow status update for posted payments
    if payment.status != "draft":
        allowed_fields = {"status", "notes"}
        update_data = {k: v for k, v in payload.dict(exclude_unset=True).items() if k in allowed_fields}
    else:
        update_data = payload.dict(exclude_unset=True)
    
    old_amount = payment.amount
    
    for field, value in update_data.items():
        setattr(payment, field, value)
    
    # Update invoice amounts if amount changed
    if "amount" in update_data and payment.invoice_id:
        invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
        if invoice:
            # Adjust for amount change
            amount_diff = payment.amount - old_amount
            invoice.amount_paid += amount_diff
            invoice.amount_due = invoice.total_amount - invoice.amount_paid
    
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{payment_id}")
def delete_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Cancel/delete a payment. Reconciled payments cannot be deleted."""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    ensure_company_access(db, user, payment.company_id)
    
    if not can_record_payment(db, user, payment.company_id):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if payment.status == "reconciled":
        raise HTTPException(status_code=400, detail="Reconciled payments cannot be deleted")
    
    # Update invoice if linked
    if payment.invoice_id:
        invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
        if invoice:
            invoice.amount_paid -= payment.amount
            invoice.amount_due = invoice.total_amount - invoice.amount_paid

    linked_entry = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.company_id == payment.company_id,
            JournalEntry.reference == f"PAY/{payment.reference}",
        )
        .first()
    )
    if linked_entry:
        create_reversal_entry(db, linked_entry, reason=f"Payment {payment.reference} cancelled")
    
    # Mark as cancelled instead of deleting
    payment.status = "cancelled"
    
    db.commit()
    return {"message": "Payment cancelled"}


# Payment Methods
@router.get("/methods/list", response_model=List[PaymentMethodRead])
def list_payment_methods(
    company_id: int,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """List payment methods for a company."""
    ensure_company_access(db, user, company_id)
    
    q = db.query(PaymentMethod).filter(PaymentMethod.company_id == company_id)
    if not include_inactive:
        q = q.filter(PaymentMethod.is_active == True)
    return q.order_by(PaymentMethod.sort_order).all()


@router.post("/methods", response_model=PaymentMethodRead)
def create_payment_method(
    payload: PaymentMethodCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Create a new payment method."""
    ensure_company_access(db, user, payload.company_id)
    
    method = PaymentMethod(**payload.dict())
    db.add(method)
    db.commit()
    db.refresh(method)
    return method


@router.put("/methods/{method_id}", response_model=PaymentMethodRead)
def update_payment_method(
    method_id: int,
    payload: PaymentMethodUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Update a payment method."""
    method = db.query(PaymentMethod).filter(PaymentMethod.id == method_id).first()
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    
    ensure_company_access(db, user, method.company_id)
    
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(method, field, value)
    
    db.commit()
    db.refresh(method)
    return method
