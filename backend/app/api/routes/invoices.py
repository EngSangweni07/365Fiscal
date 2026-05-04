from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import (
    get_db, get_current_user, ensure_company_access, require_company_access, 
    require_portal_user, log_audit, can_create_invoice, can_confirm_invoice,
    can_fiscalize_invoice, can_create_credit_note, check_permission
)
from app.models.invoice import Invoice
from app.models.invoice_line import InvoiceLine
from app.models.quotation import Quotation
from app.models.contact import Contact
from app.models.device import Device
from app.models.account import Journal, JournalEntry
from app.models.stock_move import StockMove
from app.models.stock_quant import StockQuant
from app.models.company_settings import CompanySettings
from app.models.audit_log import AuditAction, ResourceType
from app.models.payment import Payment
from app.schemas.invoice import InvoiceCreate, InvoiceRead, InvoiceUpdate
from app.services.accounting import create_reversal_entry, post_invoice_entry, post_payment_entry, post_stock_move_entry
from app.services.payment_records import create_payment_record
from app.services.fdms import submit_invoice

router = APIRouter(prefix="/invoices", tags=["invoices"])


def next_invoice_reference(db: Session, prefix: str = "INV", company_id: int | None = None) -> str:
    """Generate the next invoice reference.

    If company settings define a sequence (sequence_size/step/next), use that and increment
    the `sequence_next` value. Otherwise fall back to date-based counting.
    """
    if company_id:
        # Attempt to lock the settings row for update to avoid race conditions
        try:
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).with_for_update().first()
        except Exception:
            # Some DB backends or SQLAlchemy configs may not support with_for_update(); fall back
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
        if settings and settings.sequence_next is not None:
            seq_size = settings.sequence_size or 4
            next_num = settings.sequence_next or 1
            used_prefix = settings.invoice_prefix or prefix
            # Format without date by default, e.g. INV-0001
            reference = f"{used_prefix}-{next_num:0{seq_size}d}"
            # Increment and persist
            settings.sequence_next = next_num + (settings.sequence_step or 1)
            db.commit()
            return reference

    # Fallback: date-based sequence
    today = datetime.utcnow().strftime("%Y%m%d")
    full_prefix = f"{prefix}-{today}-"
    count = db.query(Invoice).filter(Invoice.reference.like(f"{full_prefix}%")).count()
    return f"{full_prefix}{count + 1:04d}"


def calculate_line_amounts(line_data: dict) -> tuple[float, float, float]:
    """Calculate subtotal, tax_amount, and total_price for a line."""
    quantity = line_data.get("quantity", 1)
    unit_price = line_data.get("unit_price", 0)
    discount = line_data.get("discount", 0)
    vat_rate = line_data.get("vat_rate", 0)
    
    subtotal = quantity * unit_price * (1 - discount / 100)
    tax_amount = subtotal * (vat_rate / 100)
    total_price = subtotal + tax_amount
    
    return subtotal, tax_amount, total_price


def recalculate_invoice_totals(invoice: Invoice):
    """Recalculate invoice totals from lines."""
    subtotal = sum(line.subtotal for line in invoice.lines)
    discount_amount = sum(
        line.quantity * line.unit_price * (line.discount / 100) 
        for line in invoice.lines
    )
    tax_amount = sum(line.tax_amount for line in invoice.lines)
    total_amount = sum(line.total_price for line in invoice.lines)
    
    invoice.subtotal = subtotal
    invoice.discount_amount = discount_amount
    invoice.tax_amount = tax_amount
    invoice.total_amount = total_amount
    invoice.amount_due = total_amount - invoice.amount_paid


def process_invoice_stock(invoice: Invoice, db: Session, reverse: bool = False):
    """Process stock moves for an invoice. Set reverse=True for credit notes."""
    from app.models.warehouse import Warehouse
    from app.models.location import Location
    
    # Get company settings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == invoice.company_id).first()
    if not settings or not settings.auto_reserve_stock:
        return
    
    # Get default warehouse
    warehouse = None
    if invoice.warehouse_id:
        warehouse = db.query(Warehouse).filter(Warehouse.id == invoice.warehouse_id).first()
    if not warehouse:
        warehouse = db.query(Warehouse).filter(Warehouse.company_id == invoice.company_id).first()
    if not warehouse:
        return
    
    # Get default location
    location = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse.id,
            Location.is_scrap.is_(False),
        )
        .order_by(Location.is_primary.desc(), Location.id.asc())
        .first()
    )
    if not location:
        return
    
    for line in invoice.lines:
        if not line.product_id:
            continue
        
        # Check product type
        from app.models.product import Product
        product = db.query(Product).filter(Product.id == line.product_id).first()
        if not product or product.product_type != "storable":
            continue
        
        quantity = line.quantity
        if reverse:
            quantity = -quantity  # Credit note returns stock
        
        # Create stock move
        move = StockMove(
            company_id=invoice.company_id,
            product_id=line.product_id,
            location_id=location.id,
            quantity=quantity,
            unit_cost=product.purchase_cost or product.sales_cost or 0,
            total_cost=abs(quantity) * (product.purchase_cost or product.sales_cost or 0),
            reference=f"INV-{invoice.reference}",
            move_type="out" if quantity > 0 else "in",
            state="done",
            done_date=datetime.utcnow(),
        )
        db.add(move)
        db.flush()
        post_stock_move_entry(db, move)
        
        # Update stock quant
        quant = db.query(StockQuant).filter(
            StockQuant.product_id == line.product_id,
            StockQuant.location_id == location.id
        ).first()
        
        if quant:
            quant.quantity -= quantity
            quant.available_quantity = quant.quantity - quant.reserved_quantity
        elif not settings.allow_negative_stock:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient stock for product {product.name}"
            )
    
    invoice.stock_processed = True


@router.post("", response_model=InvoiceRead)
def create_invoice(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    
    # Check permission
    if not can_create_invoice(db, user, payload.company_id):
        raise HTTPException(status_code=403, detail="Permission denied to create invoices")
    
    invoice_type = payload.invoice_type or "invoice"
    prefix = "CN" if invoice_type == "credit_note" else "INV"
    reference = payload.reference or next_invoice_reference(db, prefix=prefix, company_id=payload.company_id)
    
    # Get customer from quotation if not provided
    customer_id = payload.customer_id
    if not customer_id and payload.quotation_id:
        quotation = db.query(Quotation).filter(Quotation.id == payload.quotation_id).first()
        if quotation:
            customer_id = quotation.customer_id
    
    invoice = Invoice(
        company_id=payload.company_id,
        quotation_id=payload.quotation_id,
        customer_id=customer_id,
        device_id=payload.device_id,
        reference=reference,
        invoice_date=payload.invoice_date or datetime.utcnow(),
        due_date=payload.due_date,
        currency=payload.currency,
        payment_terms=payload.payment_terms,
        notes=payload.notes,
        created_by_id=user.id,
        invoice_type=invoice_type,
        reversed_invoice_id=payload.reversed_invoice_id,
        status="draft",
    )
    db.add(invoice)
    db.flush()
    
    # Add lines from payload or copy from quotation
    if payload.lines:
        for line_data in payload.lines:
            subtotal, tax_amount, total_price = calculate_line_amounts(line_data.dict())
            db.add(InvoiceLine(
                invoice_id=invoice.id,
                product_id=line_data.product_id,
                description=line_data.description,
                quantity=line_data.quantity,
                uom=line_data.uom,
                unit_price=line_data.unit_price,
                discount=line_data.discount,
                vat_rate=line_data.vat_rate,
                subtotal=subtotal,
                tax_amount=tax_amount,
                total_price=total_price,
            ))
    elif payload.quotation_id:
        quotation = db.query(Quotation).filter(Quotation.id == payload.quotation_id).first()
        if quotation:
            for qline in quotation.lines:
                line_dict = {
                    "quantity": qline.quantity,
                    "unit_price": qline.unit_price,
                    "discount": 0,
                    "vat_rate": qline.vat_rate
                }
                subtotal, tax_amount, total_price = calculate_line_amounts(line_dict)
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
    
    db.flush()
    db.refresh(invoice)
    recalculate_invoice_totals(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/values")
def invoice_values(field: str, company_id: int | None = None, q: str | None = None, db: Session = Depends(get_db)):
    """Return distinct values for invoice fields (e.g., status, reference)."""
    if field == "status":
        query = db.query(Invoice.status).distinct()
        if company_id:
            query = query.filter(Invoice.company_id == company_id)
        if q:
            query = query.filter(Invoice.status.ilike(f"%{q}%"))
        return [r[0] for r in query.order_by(Invoice.status).all() if r[0]]
    if field == "reference":
        query = db.query(Invoice.reference.distinct())
        if company_id:
            query = query.filter(Invoice.company_id == company_id)
        if q:
            query = query.filter(Invoice.reference.ilike(f"%{q}%"))
        return [r[0] for r in query.order_by(Invoice.reference).all() if r[0]]
    return []


@router.get("", response_model=list[InvoiceRead])
def list_invoices(
    company_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
    search: str | None = None,
    status: str | None = None,
    customer_id: int | None = None,
    invoice_type: str | None = None,
    currency: str | None = None,
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    query = db.query(Invoice).filter(Invoice.company_id == company_id)
    if search:
        like = f"%{search}%"
        query = query.filter(Invoice.reference.ilike(like) | Invoice.status.ilike(like))
    if status:
        query = query.filter(Invoice.status == status)
    if customer_id:
        query = query.filter(Invoice.customer_id == customer_id)
    if currency:
        cur = currency.strip().upper()
        codes = [cur]
        if cur in {"ZWG", "ZWL"}:
            codes = ["ZWG", "ZWL"]
        query = query.filter(Invoice.currency.in_(codes))
    if invoice_type:
        query = query.filter(Invoice.invoice_type == invoice_type)
    response.headers["X-Total-Count"] = str(query.count())
    return query.order_by(Invoice.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/{invoice_id}", response_model=InvoiceRead)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ensure_company_access(db, user, invoice.company_id)
    return invoice


@router.post("/{invoice_id}/credit-note", response_model=InvoiceRead)
def create_credit_note(
    invoice_id: int,
    partial_lines: list[dict] | None = None,  # Optional partial credit
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Create a credit note for an invoice. Optionally specify partial lines."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ensure_company_access(db, user, invoice.company_id)
    
    # Check permission
    if not can_create_credit_note(db, user, invoice.company_id):
        raise HTTPException(status_code=403, detail="Permission denied to create credit notes")
    
    # Only allow credit notes for posted/fiscalized invoices
    if invoice.status not in ["posted", "paid", "fiscalized"]:
        raise HTTPException(status_code=400, detail="Can only create credit notes for posted invoices")

    reference = next_invoice_reference(db, prefix="CN", company_id=invoice.company_id)
    credit_note = Invoice(
        company_id=invoice.company_id,
        invoice_type="credit_note",
        reversed_invoice_id=invoice.id,
        quotation_id=None,
        customer_id=invoice.customer_id,
        device_id=invoice.device_id,
        reference=reference,
        invoice_date=datetime.utcnow(),
        due_date=invoice.due_date,
        currency=invoice.currency,
        payment_terms=invoice.payment_terms,
        notes=f"Credit note for {invoice.reference}",
        status="draft",
        created_by_id=user.id,
    )
    db.add(credit_note)
    db.flush()

    # Use partial lines if provided, otherwise full credit
    lines_to_credit = partial_lines or [{"line_id": line.id, "quantity": line.quantity} for line in invoice.lines]
    
    for credit_info in lines_to_credit:
        original_line = next((l for l in invoice.lines if l.id == credit_info.get("line_id")), None)
        if not original_line:
            continue
        
        credit_qty = min(credit_info.get("quantity", original_line.quantity), original_line.quantity)
        
        line_dict = {
            "quantity": -credit_qty,
            "unit_price": original_line.unit_price,
            "discount": original_line.discount,
            "vat_rate": original_line.vat_rate,
        }
        subtotal, tax_amount, total_price = calculate_line_amounts(line_dict)
        db.add(InvoiceLine(
            invoice_id=credit_note.id,
            product_id=original_line.product_id,
            description=original_line.description,
            quantity=-credit_qty,
            uom=original_line.uom,
            unit_price=original_line.unit_price,
            discount=original_line.discount,
            vat_rate=original_line.vat_rate,
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_price=total_price,
        ))

    db.flush()
    db.refresh(credit_note)
    recalculate_invoice_totals(credit_note)
    
    # Audit log
    log_audit(
        db=db,
        user=user,
        action=AuditAction.CREDIT_NOTE_CREATE,
        resource_type=ResourceType.CREDIT_NOTE,
        resource_id=credit_note.id,
        resource_reference=credit_note.reference,
        company_id=invoice.company_id,
        new_values={"original_invoice": invoice.reference, "amount": credit_note.total_amount},
        changes_summary=f"Credit note {credit_note.reference} created for {invoice.reference}",
    )
    
    db.commit()
    db.refresh(credit_note)
    return credit_note


@router.patch("/{invoice_id}", response_model=InvoiceRead)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ensure_company_access(db, user, invoice.company_id)
    
    # Check permission
    if not check_permission(db, user, invoice.company_id, "can_edit_invoices"):
        raise HTTPException(status_code=403, detail="Permission denied to edit invoices")
    
    if invoice.status not in ["draft"]:
        raise HTTPException(status_code=400, detail="Can only edit draft invoices")
    
    updates = payload.dict(exclude_unset=True)
    lines = updates.pop("lines", None)
    
    for field, value in updates.items():
        setattr(invoice, field, value)
    
    if lines is not None:
        db.query(InvoiceLine).filter(InvoiceLine.invoice_id == invoice.id).delete()
        for line_data in lines:
            subtotal, tax_amount, total_price = calculate_line_amounts(line_data.dict())
            db.add(InvoiceLine(
                invoice_id=invoice.id,
                product_id=line_data.product_id,
                description=line_data.description,
                quantity=line_data.quantity,
                uom=line_data.uom,
                unit_price=line_data.unit_price,
                discount=line_data.discount,
                vat_rate=line_data.vat_rate,
                subtotal=subtotal,
                tax_amount=tax_amount,
                total_price=total_price,
            ))
        db.flush()
        db.refresh(invoice)
        recalculate_invoice_totals(invoice)
    
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/post", response_model=InvoiceRead)
def post_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Post/confirm an invoice. This reserves stock and moves to posted state."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ensure_company_access(db, user, invoice.company_id)
    
    # Check permission
    if not can_confirm_invoice(db, user, invoice.company_id):
        raise HTTPException(status_code=403, detail="Permission denied to confirm invoices")
    
    if invoice.status != "draft":
        raise HTTPException(status_code=400, detail="Can only post draft invoices")
    
    if not invoice.lines:
        raise HTTPException(status_code=400, detail="Cannot post invoice without lines")
    
    # Process stock for regular invoices
    if invoice.invoice_type == "invoice":
        try:
            process_invoice_stock(invoice, db)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Stock processing error: {str(e)}")
    
    invoice.status = "posted"
    invoice.confirmed_by_id = user.id
    post_invoice_entry(db, invoice)
    
    # Audit log
    log_audit(
        db=db,
        user=user,
        action=AuditAction.INVOICE_CONFIRM,
        resource_type=ResourceType.INVOICE,
        resource_id=invoice.id,
        resource_reference=invoice.reference,
        company_id=invoice.company_id,
        new_values={"status": "posted", "total": invoice.total_amount},
        changes_summary=f"Invoice {invoice.reference} confirmed",
    )
    
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/reset", response_model=InvoiceRead)
def reset_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ensure_company_access(db, user, invoice.company_id)
    
    if invoice.zimra_status == "submitted":
        raise HTTPException(status_code=400, detail="Cannot reset fiscalized invoice")
    
    invoice.status = "draft"
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/pay", response_model=InvoiceRead)
def register_payment(
    invoice_id: int,
    amount: float,
    payment_reference: str = "",
    payment_method: str = "cash",
    journal_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Quick payment registration. For full payment management, use /payments endpoint."""
    from app.api.deps import can_record_payment
    
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ensure_company_access(db, user, invoice.company_id)
    
    if not can_record_payment(db, user, invoice.company_id):
        raise HTTPException(status_code=403, detail="Permission denied to record payments")
    
    if invoice.status == "draft":
        raise HTTPException(status_code=400, detail="Cannot pay draft invoice")

    normalized_payment_method = (payment_method or "cash").strip().lower()
    if normalized_payment_method not in {"cash", "bank"}:
        raise HTTPException(status_code=400, detail="Payment method must be cash or bank")

    selected_journal = None
    if journal_id is not None:
        selected_journal = (
            db.query(Journal)
            .filter(
                Journal.id == journal_id,
                Journal.company_id == invoice.company_id,
                Journal.is_active == True,
            )
            .first()
        )
        if not selected_journal:
            raise HTTPException(status_code=404, detail="Selected journal not found")
        if (selected_journal.journal_type or "").strip().lower() != normalized_payment_method:
            raise HTTPException(
                status_code=400,
                detail="Selected journal does not match the payment method",
            )
    
    invoice.amount_paid += amount
    invoice.amount_due = invoice.total_amount - invoice.amount_paid
    invoice.payment_reference = payment_reference
    
    if invoice.amount_due <= 0:
        invoice.status = "paid"
    
    stored_payment_method = "cash" if normalized_payment_method == "cash" else "bank_transfer"
    payment = create_payment_record(
        db,
        company_id=invoice.company_id,
        invoice_id=invoice.id,
        contact_id=invoice.customer_id,
        amount=amount,
        currency=invoice.currency,
        payment_method=stored_payment_method,
        created_by_id=user.id,
        payment_date=datetime.utcnow(),
        reference=payment_reference or f"{invoice.reference}-PAY-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        transaction_reference=payment_reference,
        notes=f"Invoice payment for {invoice.reference}",
        journal_id=selected_journal.id if selected_journal else None,
    )
    post_payment_entry(db, payment)
    
    # Audit log
    log_audit(
        db=db,
        user=user,
        action=AuditAction.PAYMENT_RECORD,
        resource_type=ResourceType.INVOICE,
        resource_id=invoice.id,
        resource_reference=invoice.reference,
        company_id=invoice.company_id,
        new_values={
            "amount": amount,
            "total_paid": invoice.amount_paid,
            "payment_method": normalized_payment_method,
            "journal_id": selected_journal.id if selected_journal else None,
        },
        changes_summary=f"Payment of {amount} recorded for {invoice.reference} via {normalized_payment_method}",
    )
    
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/fiscalize", response_model=InvoiceRead)
def fiscalize_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Fiscalize an invoice. Only company admins can fiscalize."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ensure_company_access(db, user, invoice.company_id)
    
    # Check permission - fiscalization is admin-only
    if not can_fiscalize_invoice(db, user, invoice.company_id):
        raise HTTPException(status_code=403, detail="Permission denied to fiscalize invoices. Admin access required.")
    
    if invoice.status not in ["posted", "paid"]:
        raise HTTPException(status_code=400, detail="Can only fiscalize posted or paid invoices")
    
    if invoice.zimra_status == "submitted":
        raise HTTPException(status_code=400, detail="Invoice already fiscalized")

    if not invoice.device_id:
        raise HTTPException(status_code=400, detail="No fiscal device assigned to this invoice")

    device = db.query(Device).filter(Device.id == invoice.device_id).first()
    if not device:
        raise HTTPException(status_code=400, detail="Assigned fiscal device was not found")

    if (device.fiscal_day_status or "").lower() != "open":
        raise HTTPException(
            status_code=400,
            detail="No fiscal day is open for the selected fiscal device. Open the fiscal day first.",
        )
    
    try:
        submit_invoice(invoice, db)
        invoice.status = "fiscalized"
        invoice.fiscalized_at = datetime.utcnow()
        invoice.fiscalized_by_id = user.id
        
        # Audit log - success
        log_audit(
            db=db,
            user=user,
            action=AuditAction.INVOICE_FISCALIZE,
            resource_type=ResourceType.INVOICE,
            resource_id=invoice.id,
            resource_reference=invoice.reference,
            company_id=invoice.company_id,
            new_values={
                "zimra_status": invoice.zimra_status,
                "verification_code": invoice.zimra_verification_code,
            },
            changes_summary=f"Invoice {invoice.reference} fiscalized successfully",
        )
        
        db.commit()
        db.refresh(invoice)
    except Exception as exc:
        invoice.zimra_status = "error"
        invoice.zimra_errors = str(exc)
        
        # Audit log - failure
        log_audit(
            db=db,
            user=user,
            action=AuditAction.INVOICE_FISCALIZE_FAILED,
            resource_type=ResourceType.INVOICE,
            resource_id=invoice.id,
            resource_reference=invoice.reference,
            company_id=invoice.company_id,
            status="error",
            error_message=str(exc),
            changes_summary=f"Fiscalization failed for {invoice.reference}: {str(exc)}",
        )
        
        db.commit()
        db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/retry-fiscalize", response_model=InvoiceRead)
def retry_fiscalize_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Retry fiscalization for a failed invoice. Admin only."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ensure_company_access(db, user, invoice.company_id)
    
    # Check permission
    if not check_permission(db, user, invoice.company_id, "can_retry_fiscalization"):
        raise HTTPException(status_code=403, detail="Permission denied. Admin access required.")
    
    if invoice.zimra_status not in ["error", "not_submitted"]:
        raise HTTPException(status_code=400, detail="Can only retry failed fiscalizations")
    
    # Clear previous errors
    invoice.zimra_errors = ""
    
    try:
        submit_invoice(invoice, db)
        invoice.status = "fiscalized"
        invoice.fiscalized_at = datetime.utcnow()
        invoice.fiscalized_by_id = user.id
        
        log_audit(
            db=db,
            user=user,
            action=AuditAction.INVOICE_FISCALIZE_RETRY,
            resource_type=ResourceType.INVOICE,
            resource_id=invoice.id,
            resource_reference=invoice.reference,
            company_id=invoice.company_id,
            changes_summary=f"Fiscalization retry successful for {invoice.reference}",
        )
        
        db.commit()
        db.refresh(invoice)
    except Exception as exc:
        invoice.zimra_status = "error"
        invoice.zimra_errors = str(exc)
        
        log_audit(
            db=db,
            user=user,
            action=AuditAction.INVOICE_FISCALIZE_FAILED,
            resource_type=ResourceType.INVOICE,
            resource_id=invoice.id,
            resource_reference=invoice.reference,
            company_id=invoice.company_id,
            status="error",
            error_message=str(exc),
            changes_summary=f"Fiscalization retry failed for {invoice.reference}",
        )
        
        db.commit()
        db.refresh(invoice)
    
    return invoice


@router.post("/{invoice_id}/cancel", response_model=InvoiceRead)
def cancel_invoice(
    invoice_id: int,
    reason: str = "",
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Cancel an invoice. Cannot cancel fiscalized invoices."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ensure_company_access(db, user, invoice.company_id)
    
    if not check_permission(db, user, invoice.company_id, "can_cancel_invoices"):
        raise HTTPException(status_code=403, detail="Permission denied to cancel invoices")
    
    if invoice.status == "fiscalized" or invoice.zimra_status == "submitted":
        raise HTTPException(
            status_code=400, 
            detail="Cannot cancel fiscalized invoice. Create a credit note instead."
        )
    
    invoice.status = "cancelled"
    invoice.cancelled_by_id = user.id
    invoice.notes = f"{invoice.notes}\nCancelled: {reason}" if reason else invoice.notes
    linked_entry = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.company_id == invoice.company_id,
            JournalEntry.reference == f"INV/{invoice.reference}",
        )
        .first()
    )
    if linked_entry:
        create_reversal_entry(db, linked_entry, reason=reason or f"Invoice {invoice.reference} cancelled")
    
    log_audit(
        db=db,
        user=user,
        action=AuditAction.INVOICE_CANCEL,
        resource_type=ResourceType.INVOICE,
        resource_id=invoice.id,
        resource_reference=invoice.reference,
        company_id=invoice.company_id,
        new_values={"reason": reason},
        changes_summary=f"Invoice {invoice.reference} cancelled",
    )
    
    db.commit()
    db.refresh(invoice)
    return invoice
