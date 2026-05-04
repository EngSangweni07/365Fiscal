from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import (
    get_db, get_current_user, ensure_company_access, require_company_access, 
    require_portal_user, log_audit, can_create_quotation, can_convert_quotation,
    check_permission
)
from app.models.quotation import Quotation
from app.models.quotation_line import QuotationLine
from app.models.invoice import Invoice
from app.models.invoice_line import InvoiceLine
from app.models.audit_log import AuditAction, ResourceType
from app.schemas.quotation import QuotationCreate, QuotationRead, QuotationUpdate
from app.services.sequence import next_quotation_reference
from app.models.company_settings import CompanySettings

router = APIRouter(prefix="/quotations", tags=["quotations"])


def calculate_line_total(line_data: dict) -> float:
    """Calculate total price for a quotation line including VAT."""
    quantity = line_data.get("quantity", 1)
    unit_price = line_data.get("unit_price", 0)
    vat_rate = line_data.get("vat_rate", 0)
    discount = line_data.get("discount", 0)
    
    subtotal = quantity * unit_price * (1 - discount / 100)
    total = subtotal * (1 + vat_rate / 100)
    return total


def recalculate_quotation_totals(quotation: Quotation):
    """Recalculate quotation totals from lines."""
    subtotal = sum(line.quantity * line.unit_price for line in quotation.lines)
    discount_amount = sum(
        line.quantity * line.unit_price * (getattr(line, 'discount', 0) / 100) 
        for line in quotation.lines
    )
    tax_amount = sum(
        (line.quantity * line.unit_price - line.quantity * line.unit_price * (getattr(line, 'discount', 0) / 100)) * (line.vat_rate / 100)
        for line in quotation.lines
    )
    total_amount = sum(line.total_price for line in quotation.lines)
    
    quotation.subtotal = subtotal
    quotation.discount_amount = discount_amount
    quotation.tax_amount = tax_amount
    quotation.total_amount = total_amount


@router.post("", response_model=QuotationRead)
def create_quotation(
    payload: QuotationCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    
    # Check permission
    if not can_create_quotation(db, user, payload.company_id):
        raise HTTPException(status_code=403, detail="Permission denied to create quotations")
    
    reference = next_quotation_reference(db)
    
    # Calculate expiry date
    validity_days = getattr(payload, 'validity_days', 30) or 30
    expires_at = payload.expires_at or (datetime.now(timezone.utc) + timedelta(days=validity_days))
    
    currency = (getattr(payload, "currency", None) or "").strip().upper()
    if not currency:
        settings = (
            db.query(CompanySettings)
            .filter(CompanySettings.company_id == payload.company_id)
            .first()
        )
        currency = (getattr(settings, "currency_code", None) or "USD").strip().upper()

    quotation = Quotation(
        company_id=payload.company_id,
        customer_id=payload.customer_id,
        reference=reference,
        quotation_date=datetime.now(timezone.utc),
        expires_at=expires_at,
        payment_terms=payload.payment_terms,
        validity_days=validity_days,
        notes=getattr(payload, 'notes', '') or '',
        currency=currency,
        status="draft",
        created_by_id=user.id,
    )
    db.add(quotation)
    db.flush()

    for line in payload.lines:
        line_dict = line.dict()
        total_price = calculate_line_total(line_dict)
        db.add(
            QuotationLine(
                quotation_id=quotation.id,
                product_id=line.product_id,
                description=line.description,
                quantity=line.quantity,
                uom=line.uom,
                unit_price=line.unit_price,
                vat_rate=line.vat_rate,
                total_price=total_price,
            )
        )
    
    db.flush()
    db.refresh(quotation)
    recalculate_quotation_totals(quotation)
    
    # Audit log
    log_audit(
        db=db,
        user=user,
        action=AuditAction.CREATE,
        resource_type=ResourceType.QUOTATION,
        resource_id=quotation.id,
        resource_reference=quotation.reference,
        company_id=payload.company_id,
        changes_summary=f"Quotation {quotation.reference} created",
    )

    db.commit()
    db.refresh(quotation)
    return quotation


@router.get("", response_model=list[QuotationRead])
def list_quotations(
    company_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
    status: str | None = None,
    customer_id: int | None = None,
    search: str | None = None,
    currency: str | None = None,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    query = db.query(Quotation).filter(Quotation.company_id == company_id)
    if status:
        query = query.filter(Quotation.status == status)
    if customer_id:
        query = query.filter(Quotation.customer_id == customer_id)
    if search:
        like = f"%{search}%"
        query = query.filter(Quotation.reference.ilike(like))
    if currency:
        cur = currency.strip().upper()
        codes = [cur]
        if cur in {"ZWG", "ZWL"}:
            codes = ["ZWG", "ZWL"]
        query = query.filter(Quotation.currency.in_(codes))
    if date_from:
        query = query.filter(Quotation.quotation_date >= date_from)
    if date_to:
        query = query.filter(Quotation.quotation_date <= date_to)
    response.headers["X-Total-Count"] = str(query.count())
    return query.order_by(Quotation.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/{quotation_id}", response_model=QuotationRead)
def get_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    ensure_company_access(db, user, quotation.company_id)
    return quotation


@router.patch("/{quotation_id}", response_model=QuotationRead)
def update_quotation(
    quotation_id: int,
    payload: QuotationUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    ensure_company_access(db, user, quotation.company_id)

    updates = payload.dict(exclude_unset=True)
    lines = updates.pop("lines", None)
    for field, value in updates.items():
        setattr(quotation, field, value)

    if lines is not None:
        db.query(QuotationLine).filter(QuotationLine.quotation_id == quotation.id).delete()
        for line in lines:
            line_dict = line.dict()
            total_price = calculate_line_total(line_dict)
            db.add(
                QuotationLine(
                    quotation_id=quotation.id,
                    product_id=line.product_id,
                    description=line.description,
                    quantity=line.quantity,
                    uom=line.uom,
                    unit_price=line.unit_price,
                    vat_rate=line.vat_rate,
                    total_price=total_price,
                )
            )

    db.commit()
    db.refresh(quotation)
    return quotation


@router.delete("/{quotation_id}")
def delete_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    ensure_company_access(db, user, quotation.company_id)
    
    if quotation.status not in ["draft", "cancelled"]:
        raise HTTPException(status_code=400, detail="Can only delete draft or cancelled quotations")
    
    db.delete(quotation)
    db.commit()
    return {"status": "deleted"}


@router.post("/{quotation_id}/duplicate", response_model=QuotationRead)
def duplicate_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    ensure_company_access(db, user, quotation.company_id)
    
    new_reference = next_quotation_reference(db)
    new_quotation = Quotation(
        company_id=quotation.company_id,
        customer_id=quotation.customer_id,
        reference=new_reference,
        expires_at=quotation.expires_at,
        payment_terms=quotation.payment_terms,
        status="draft",
    )
    db.add(new_quotation)
    db.flush()
    
    for line in quotation.lines:
        db.add(QuotationLine(
            quotation_id=new_quotation.id,
            product_id=line.product_id,
            description=line.description,
            quantity=line.quantity,
            uom=line.uom,
            unit_price=line.unit_price,
            vat_rate=line.vat_rate,
            total_price=line.total_price,
        ))
    
    db.commit()
    db.refresh(new_quotation)
    return new_quotation


@router.post("/{quotation_id}/send", response_model=QuotationRead)
def send_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Mark quotation as sent to customer."""
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    ensure_company_access(db, user, quotation.company_id)
    
    if quotation.status != "draft":
        raise HTTPException(status_code=400, detail="Can only send draft quotations")
    
    if not quotation.lines:
        raise HTTPException(status_code=400, detail="Cannot send quotation without lines")
    
    quotation.status = "sent"
    quotation.sent_at = datetime.now(timezone.utc)
    quotation.sent_by_id = user.id
    
    log_audit(
        db=db,
        user=user,
        action=AuditAction.QUOTATION_SEND,
        resource_type=ResourceType.QUOTATION,
        resource_id=quotation.id,
        resource_reference=quotation.reference,
        company_id=quotation.company_id,
        changes_summary=f"Quotation {quotation.reference} sent to customer",
    )
    
    db.commit()
    db.refresh(quotation)
    return quotation


@router.post("/{quotation_id}/accept", response_model=QuotationRead)
def accept_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Mark quotation as accepted by customer."""
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    ensure_company_access(db, user, quotation.company_id)
    
    if quotation.status not in ["draft", "sent"]:
        raise HTTPException(status_code=400, detail="Can only accept draft or sent quotations")
    
    # Check if expired
    if quotation.expires_at and quotation.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Quotation has expired")
    
    quotation.status = "accepted"
    quotation.accepted_at = datetime.now(timezone.utc)
    
    log_audit(
        db=db,
        user=user,
        action=AuditAction.QUOTATION_ACCEPT,
        resource_type=ResourceType.QUOTATION,
        resource_id=quotation.id,
        resource_reference=quotation.reference,
        company_id=quotation.company_id,
        changes_summary=f"Quotation {quotation.reference} accepted",
    )
    
    db.commit()
    db.refresh(quotation)
    return quotation


@router.post("/{quotation_id}/reject", response_model=QuotationRead)
def reject_quotation(
    quotation_id: int,
    reason: str = "",
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Mark quotation as rejected by customer."""
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    ensure_company_access(db, user, quotation.company_id)
    
    if quotation.status not in ["draft", "sent"]:
        raise HTTPException(status_code=400, detail="Can only reject draft or sent quotations")
    
    quotation.status = "rejected"
    quotation.rejected_at = datetime.now(timezone.utc)
    if reason:
        quotation.notes = f"{quotation.notes}\nRejected: {reason}"
    
    log_audit(
        db=db,
        user=user,
        action=AuditAction.QUOTATION_REJECT,
        resource_type=ResourceType.QUOTATION,
        resource_id=quotation.id,
        resource_reference=quotation.reference,
        company_id=quotation.company_id,
        new_values={"reason": reason},
        changes_summary=f"Quotation {quotation.reference} rejected",
    )
    
    db.commit()
    db.refresh(quotation)
    return quotation


@router.post("/{quotation_id}/convert")
def convert_quotation_to_invoice(
    quotation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Convert accepted quotation to invoice. Quotation becomes read-only."""
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    ensure_company_access(db, user, quotation.company_id)
    
    # Check permission
    if not can_convert_quotation(db, user, quotation.company_id):
        raise HTTPException(status_code=403, detail="Permission denied to convert quotations")
    
    if quotation.status != "accepted":
        raise HTTPException(status_code=400, detail="Only accepted quotations can be converted to invoices")
    
    if quotation.is_locked:
        raise HTTPException(status_code=400, detail="Quotation already converted")
    
    # Generate invoice reference
    from app.api.routes.invoices import next_invoice_reference
    invoice_reference = next_invoice_reference(db, prefix="INV")
    
    # Create invoice
    invoice = Invoice(
        company_id=quotation.company_id,
        quotation_id=quotation.id,
        customer_id=quotation.customer_id,
        reference=invoice_reference,
        invoice_type="invoice",
        invoice_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc) + timedelta(days=30),  # Default 30 days
        currency=quotation.currency,
        payment_terms=quotation.payment_terms,
        notes=quotation.notes,
        status="draft",
        created_by_id=user.id,
    )
    db.add(invoice)
    db.flush()
    
    # Copy lines
    for qline in quotation.lines:
        subtotal = qline.quantity * qline.unit_price
        tax_amount = subtotal * (qline.vat_rate / 100)
        total_price = subtotal + tax_amount
        
        db.add(InvoiceLine(
            invoice_id=invoice.id,
            product_id=qline.product_id,
            description=qline.description,
            quantity=qline.quantity,
            uom=qline.uom,
            unit_price=qline.unit_price,
            discount=0,
            vat_rate=qline.vat_rate,
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_price=total_price,
        ))
    
    # Lock quotation
    quotation.status = "converted"
    quotation.is_locked = True
    quotation.converted_at = datetime.now(timezone.utc)
    quotation.converted_invoice_id = invoice.id
    
    # Calculate invoice totals
    db.flush()
    db.refresh(invoice)
    invoice.subtotal = sum(line.subtotal for line in invoice.lines)
    invoice.tax_amount = sum(line.tax_amount for line in invoice.lines)
    invoice.total_amount = sum(line.total_price for line in invoice.lines)
    invoice.amount_due = invoice.total_amount
    
    log_audit(
        db=db,
        user=user,
        action=AuditAction.QUOTATION_CONVERT,
        resource_type=ResourceType.QUOTATION,
        resource_id=quotation.id,
        resource_reference=quotation.reference,
        company_id=quotation.company_id,
        new_values={"invoice_reference": invoice.reference, "invoice_id": invoice.id},
        changes_summary=f"Quotation {quotation.reference} converted to invoice {invoice.reference}",
    )
    
    db.commit()
    
    return {
        "message": "Quotation converted to invoice",
        "quotation_id": quotation.id,
        "quotation_reference": quotation.reference,
        "invoice_id": invoice.id,
        "invoice_reference": invoice.reference,
    }


@router.post("/{quotation_id}/cancel", response_model=QuotationRead)
def cancel_quotation(
    quotation_id: int,
    reason: str = "",
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Cancel a quotation."""
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    ensure_company_access(db, user, quotation.company_id)
    
    if quotation.is_locked:
        raise HTTPException(status_code=400, detail="Cannot cancel converted quotation")
    
    quotation.status = "cancelled"
    if reason:
        quotation.notes = f"{quotation.notes}\nCancelled: {reason}"
    
    db.commit()
    db.refresh(quotation)
    return quotation
