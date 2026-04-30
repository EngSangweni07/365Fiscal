"""POS (Point of Sale) API routes.

Provides endpoints for:
- POS session management (open / close)
- POS order creation with inline payment + optional auto-fiscalize
- Order listing, detail, refund, receipt reprinting
- Quick product search optimised for barcode / name lookup
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.api.deps import (
    get_db, get_current_user, ensure_company_access, require_portal_user,
    log_audit, check_permission,
)
from sqlalchemy import func, or_
from app.models.pos_session import POSSession, POSOrder, POSOrderLine
from app.models.invoice import Invoice
from app.models.invoice_line import InvoiceLine
from app.models.product import Product
from app.models.device import Device
from app.models.contact import Contact
from app.models.tax_setting import TaxSetting
from app.models.category import Category
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.stock_quant import StockQuant
from app.models.stock_move import StockMove
from app.models.warehouse import Warehouse
from app.models.location import Location
from app.models.audit_log import AuditAction, ResourceType
from app.models.pos_employee import POSEmployee
from app.models.pos_till import POSTill
from app.models.account import Journal
from app.models.voucher import Voucher
from app.schemas.pos import (
    POSSessionOpen, POSSessionClose, POSSessionRead, POSSessionSummary,
    POSOrderCreate, POSOrderRead, POSOrderRefund,
    POSEmployeeCreate, POSEmployeeUpdate, POSEmployeeRead,
    POSTillCreate, POSTillUpdate, POSTillRead,
)
from app.services.accounting import post_invoice_entry, post_payment_entry
from app.services.payment_records import create_payment_record
from app.services.fdms import submit_invoice

router = APIRouter(prefix="/pos", tags=["pos"])


# ── helpers ─────────────────────────────────────────────────────────────────

def _next_session_name(db: Session) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"POS-{today}-"
    count = db.query(POSSession).filter(POSSession.name.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:04d}"


def _next_order_ref(db: Session) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"POS-ORD-{today}-"
    count = db.query(POSOrder).filter(POSOrder.reference.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:04d}"


def _next_voucher_code(db: Session) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"VCH-{today}-"
    count = db.query(Voucher).filter(Voucher.code.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:05d}"


def _next_invoice_ref(db: Session, company_id: int | None = None) -> str:
    """Generate next POS invoice reference. If company has an `invoice_prefix` setting
    use it (prefixed by `POS-`) so POS invoices remain distinct.
    """
    base_prefix = "INV"
    if company_id:
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
        if settings and settings.invoice_prefix:
            base_prefix = settings.invoice_prefix

    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"POS-{base_prefix}-{today}-"
    count = db.query(Invoice).filter(Invoice.reference.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:04d}"


def _calc_line(data: dict) -> tuple[float, float, float]:
    qty = data.get("quantity", 1)
    price = data.get("unit_price", 0)
    disc = data.get("discount", 0)
    vat = data.get("vat_rate", 0)
    subtotal = qty * price * (1 - disc / 100)
    tax = subtotal * (vat / 100)
    return round(subtotal, 2), round(tax, 2), round(subtotal + tax, 2)


def _resolve_pos_stock_location(
    db: Session,
    company_id: int,
    preferred_warehouse_id: int | None,
) -> tuple[int | None, int | None]:
    warehouse = None
    if preferred_warehouse_id is not None:
        warehouse = (
            db.query(Warehouse)
            .filter(
                Warehouse.id == preferred_warehouse_id,
                Warehouse.company_id == company_id,
            )
            .first()
        )
    if not warehouse:
        warehouse = (
            db.query(Warehouse)
            .filter(Warehouse.company_id == company_id)
            .order_by(Warehouse.id.asc())
            .first()
        )

    if not warehouse:
        return None, None

    location = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse.id,
            Location.is_scrap.is_(False),
        )
        .order_by(Location.is_primary.desc(), Location.id.asc())
        .first()
    )
    return warehouse.id, location.id if location else None


def _get_or_create_stock_quant(
    db: Session,
    *,
    company_id: int,
    product_id: int,
    warehouse_id: int | None,
    location_id: int | None,
    unit_cost: float,
) -> StockQuant:
    quant_q = db.query(StockQuant).filter(
        StockQuant.product_id == product_id,
        StockQuant.company_id == company_id,
    )
    if warehouse_id is not None:
        quant_q = quant_q.filter(StockQuant.warehouse_id == warehouse_id)
    if location_id is not None:
        quant_q = quant_q.filter(StockQuant.location_id == location_id)
    quant = quant_q.order_by(StockQuant.id.asc()).first()
    if quant:
        return quant

    quant = StockQuant(
        company_id=company_id,
        product_id=product_id,
        warehouse_id=warehouse_id,
        location_id=location_id,
        quantity=0,
        reserved_quantity=0,
        available_quantity=0,
        unit_cost=unit_cost,
        total_value=0,
    )
    db.add(quant)
    db.flush()
    return quant


def _apply_pos_inventory_move(
    db: Session,
    *,
    company_id: int,
    product: Product,
    quantity: float,
    warehouse_id: int | None,
    location_id: int | None,
    reference: str,
    source_document: str,
    move_type: str,
    notes: str,
) -> None:
    if product.product_type != "storable" or not product.track_inventory or quantity <= 0:
        return

    unit_cost = product.sales_cost or product.purchase_cost or 0
    quant = None
    quant_q = db.query(StockQuant).filter(
        StockQuant.product_id == product.id,
        StockQuant.company_id == company_id,
    )
    if warehouse_id is not None:
        quant_q = quant_q.filter(StockQuant.warehouse_id == warehouse_id)
    if location_id is not None:
        quant_q = quant_q.filter(StockQuant.location_id == location_id)
    quant = quant_q.order_by(StockQuant.id.asc()).first()

    if quant:
        delta = quantity if move_type == "in" else -quantity
        quant.quantity = round((quant.quantity or 0) + delta, 4)
        quant.available_quantity = round((quant.available_quantity or 0) + delta, 4)
        quant.unit_cost = unit_cost if unit_cost > 0 else (quant.unit_cost or 0)
        quant.total_value = round(quant.quantity * (quant.unit_cost or 0), 2)
    elif move_type == "in":
        quant = _get_or_create_stock_quant(
            db,
            company_id=company_id,
            product_id=product.id,
            warehouse_id=warehouse_id,
            location_id=location_id,
            unit_cost=unit_cost,
        )
        quant.quantity = round(quantity, 4)
        quant.available_quantity = round(quantity, 4)
        quant.total_value = round(quantity * (quant.unit_cost or 0), 2)

    db.add(StockMove(
        company_id=company_id,
        product_id=product.id,
        reference=reference,
        move_type=move_type,
        quantity=quantity,
        warehouse_id=warehouse_id,
        location_id=location_id,
        unit_cost=(quant.unit_cost if quant else unit_cost) or 0,
        total_cost=round(quantity * ((quant.unit_cost if quant else unit_cost) or 0), 2),
        source_document=source_document,
        state="done",
        done_date=datetime.utcnow(),
        notes=notes,
    ))
    db.flush()


# ── sessions ────────────────────────────────────────────────────────────────

@router.post("/sessions/open", response_model=POSSessionRead)
def open_session(
    payload: POSSessionOpen,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Open a new POS session (cash register)."""
    ensure_company_access(db, user, payload.company_id)

    # Only one open session per user per company
    existing = (
        db.query(POSSession)
        .filter(
            POSSession.company_id == payload.company_id,
            POSSession.opened_by_id == user.id,
            POSSession.status == "open",
        )
        .first()
    )
    if existing:
        return existing  # return current open session

    resolved_device_id = payload.device_id
    if payload.till_id is not None:
        till = (
            db.query(POSTill)
            .filter(
                POSTill.id == payload.till_id,
                POSTill.company_id == payload.company_id,
            )
            .first()
        )
        if not till:
            raise HTTPException(400, "POS till not found")
        if not till.is_active:
            raise HTTPException(400, "POS till is inactive")
        resolved_device_id = till.fiscal_device_id

    session = POSSession(
        company_id=payload.company_id,
        device_id=resolved_device_id,
        opened_by_id=user.id,
        name=_next_session_name(db),
        opening_balance=payload.opening_balance,
        notes=payload.notes,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    log_audit(
        db=db, user=user,
        action="pos_session_open",
        resource_type="pos_session",
        resource_id=session.id,
        resource_reference=session.name,
        company_id=payload.company_id,
        changes_summary=f"POS session {session.name} opened",
    )
    db.commit()
    return session


@router.post("/sessions/{session_id}/close", response_model=POSSessionSummary)
def close_session(
    session_id: int,
    payload: POSSessionClose,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Close a POS session and produce summary."""
    session = db.query(POSSession).filter(POSSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    ensure_company_access(db, user, session.company_id)
    if session.status != "open":
        raise HTTPException(400, "Session is already closed")

    session.status = "closed"
    session.closed_at = datetime.utcnow()
    session.closed_by_id = user.id
    session.closing_balance = payload.closing_balance
    if payload.notes:
        session.notes = f"{session.notes}\n{payload.notes}" if session.notes else payload.notes

    orders = db.query(POSOrder).filter(POSOrder.session_id == session_id).all()
    expected_cash = session.opening_balance + session.total_cash - session.total_returns
    difference = (payload.closing_balance or 0) - expected_cash

    log_audit(
        db=db, user=user,
        action="pos_session_close",
        resource_type="pos_session",
        resource_id=session.id,
        resource_reference=session.name,
        company_id=session.company_id,
        new_values={"closing_balance": payload.closing_balance, "difference": difference},
        changes_summary=f"POS session {session.name} closed",
    )
    db.commit()
    db.refresh(session)

    order_reads = []
    for o in orders:
        db.refresh(o)
        order_reads.append(POSOrderRead.model_validate(o))

    return POSSessionSummary(
        session=POSSessionRead.model_validate(session),
        orders=order_reads,
        expected_cash=round(expected_cash, 2),
        difference=round(difference, 2),
    )


@router.get("/sessions", response_model=List[POSSessionRead])
def list_sessions(
    company_id: int,
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, company_id)
    q = db.query(POSSession).filter(POSSession.company_id == company_id)
    if status:
        q = q.filter(POSSession.status == status)
    return q.order_by(POSSession.opened_at.desc()).offset(offset).limit(limit).all()


@router.get("/sessions/{session_id}", response_model=POSSessionSummary)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    session = db.query(POSSession).filter(POSSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    ensure_company_access(db, user, session.company_id)

    orders = (
        db.query(POSOrder)
        .options(joinedload(POSOrder.lines))
        .filter(POSOrder.session_id == session_id)
        .order_by(POSOrder.order_date.desc())
        .all()
    )
    expected_cash = session.opening_balance + session.total_cash - session.total_returns
    difference = (session.closing_balance or 0) - expected_cash if session.closing_balance is not None else 0

    return POSSessionSummary(
        session=POSSessionRead.model_validate(session),
        orders=[POSOrderRead.model_validate(o) for o in orders],
        expected_cash=round(expected_cash, 2),
        difference=round(difference, 2),
    )


# ── orders ──────────────────────────────────────────────────────────────────

@router.post("/orders", response_model=POSOrderRead)
def create_order(
    payload: POSOrderCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Create a POS order, record payment, optionally fiscalize via ZIMRA.

    This is the main POS endpoint – it creates the order, creates a
    backing invoice (for fiscal trail), processes payment, and optionally
    submits to ZIMRA in one call.
    """
    ensure_company_access(db, user, payload.company_id)

    # Validate session
    session = db.query(POSSession).filter(POSSession.id == payload.session_id).first()
    if not session or session.status != "open":
        raise HTTPException(400, "POS session is not open")
    if session.company_id != payload.company_id:
        raise HTTPException(400, "Session does not belong to this company")

    if not payload.lines:
        raise HTTPException(400, "Order must have at least one line")
    if payload.till_id is not None and payload.cashier_id is None:
        raise HTTPException(400, "cashier_id is required when till_id is provided")

    cashier = None
    if payload.cashier_id is not None:
        cashier = (
            db.query(POSEmployee)
            .filter(
                POSEmployee.id == payload.cashier_id,
                POSEmployee.company_id == payload.company_id,
                POSEmployee.is_active == True,
            )
            .first()
        )
        if not cashier:
            raise HTTPException(400, "Cashier not found or inactive")

    resolved_till_id = payload.till_id
    if cashier and resolved_till_id is None:
        assigned_tills = (
            db.query(POSTill)
            .filter(
                POSTill.company_id == payload.company_id,
                POSTill.is_active == True,
                POSTill.employees.any(POSEmployee.id == cashier.id),
            )
            .order_by(POSTill.sort_order, POSTill.name)
            .all()
        )
        if not assigned_tills:
            raise HTTPException(403, "Cashier is not assigned to any active POS till")
        if len(assigned_tills) > 1:
            raise HTTPException(400, "Select a POS till for this cashier")
        resolved_till_id = assigned_tills[0].id

    till = None
    if resolved_till_id is not None:
        till = (
            db.query(POSTill)
            .filter(
                POSTill.id == resolved_till_id,
                POSTill.company_id == payload.company_id,
            )
            .first()
        )
        if not till:
            raise HTTPException(400, "POS till not found")
        if not till.is_active:
            raise HTTPException(400, "POS till is inactive")
        if cashier:
            assigned = (
                db.query(POSTill.id)
                .filter(
                    POSTill.id == till.id,
                    POSTill.employees.any(POSEmployee.id == cashier.id),
                )
                .first()
            )
            if not assigned:
                raise HTTPException(403, "Cashier is not assigned to this POS till")
    till_warehouse_id = till.warehouse_id if till else None
    resolved_warehouse_id, resolved_location_id = _resolve_pos_stock_location(
        db,
        payload.company_id,
        till_warehouse_id,
    )

    # Get device from session
    device = None
    if session.device_id:
        device = db.query(Device).filter(Device.id == session.device_id).first()

    # Create POS order
    ref = _next_order_ref(db)
    order = POSOrder(
        session_id=session.id,
        company_id=payload.company_id,
        customer_id=payload.customer_id,
        created_by_id=user.id,
        reference=ref,
        currency=payload.currency,
        payment_method=payload.payment_method,
        cash_amount=payload.cash_amount,
        card_amount=payload.card_amount,
        mobile_amount=payload.mobile_amount,
        payment_reference=payload.payment_reference,
        notes=payload.notes,
        cashier_name=payload.cashier_name or (cashier.name if cashier else ""),
        till_id=resolved_till_id,
        status="draft",
    )
    db.add(order)
    db.flush()

    # Add lines
    subtotal_sum = 0.0
    discount_sum = 0.0
    tax_sum = 0.0
    total_sum = 0.0

    for ld in payload.lines:
        line_dict = ld.model_dump()

        # Auto-fill product info
        if ld.product_id:
            product = db.query(Product).filter(Product.id == ld.product_id).first()
            if product:
                if not ld.description:
                    line_dict["description"] = product.name
                if ld.unit_price == 0:
                    line_dict["unit_price"] = product.sale_price
                if not ld.uom:
                    line_dict["uom"] = product.uom or "Units"
                # Get VAT from product's tax setting
                if ld.vat_rate == 0 and product.tax_id:
                    tax = db.query(TaxSetting).filter(TaxSetting.id == product.tax_id).first()
                    if tax:
                        line_dict["vat_rate"] = tax.rate

        sub, tax, total = _calc_line(line_dict)
        disc = line_dict.get("quantity", 1) * line_dict.get("unit_price", 0) * (line_dict.get("discount", 0) / 100)

        ol = POSOrderLine(
            order_id=order.id,
            product_id=ld.product_id,
            description=line_dict.get("description", ""),
            quantity=line_dict.get("quantity", 1),
            uom=line_dict.get("uom", "Units"),
            unit_price=line_dict.get("unit_price", 0),
            discount=line_dict.get("discount", 0),
            vat_rate=line_dict.get("vat_rate", 0),
            subtotal=sub,
            tax_amount=tax,
            total_price=total,
        )
        db.add(ol)
        subtotal_sum += sub
        discount_sum += disc
        tax_sum += tax
        total_sum += total

    order.subtotal = round(subtotal_sum, 2)
    order.discount_amount = round(discount_sum, 2)
    order.tax_amount = round(tax_sum, 2)
    order.total_amount = round(total_sum, 2)

    voucher = None
    voucher_applied = 0.0
    voucher_code = (payload.voucher_code or "").strip()
    if voucher_code:
        voucher = (
            db.query(Voucher)
            .filter(
                Voucher.company_id == payload.company_id,
                Voucher.code == voucher_code,
            )
            .with_for_update()
            .first()
        )
        if not voucher:
            raise HTTPException(404, "Voucher not found")
        if voucher.status != "active" or (voucher.remaining_amount or 0) <= 0:
            raise HTTPException(400, "Voucher is not redeemable")
        if voucher.currency != payload.currency:
            raise HTTPException(400, "Voucher currency must match order currency")

        requested_voucher_amount = round(float(payload.voucher_amount or 0), 2)
        if requested_voucher_amount <= 0:
            requested_voucher_amount = round(float(voucher.remaining_amount or 0), 2)
        voucher_applied = min(
            requested_voucher_amount,
            round(float(voucher.remaining_amount or 0), 2),
            order.total_amount,
        )
        if voucher_applied <= 0:
            raise HTTPException(400, "Voucher amount is invalid")

    # Deduct inventory for storable products
    for ld in payload.lines:
        if not ld.product_id:
            continue
        product = db.query(Product).filter(Product.id == ld.product_id).first()
        if not product:
            continue
        _apply_pos_inventory_move(
            db,
            company_id=payload.company_id,
            product=product,
            quantity=ld.quantity,
            warehouse_id=resolved_warehouse_id,
            location_id=resolved_location_id,
            reference=ref,
            source_document=ref,
            move_type="out",
            notes=f"POS sale: {ref}",
        )

    # Calculate change
    paid = payload.cash_amount + payload.card_amount + payload.mobile_amount
    net_due = round(max(0, order.total_amount - voucher_applied), 2)
    if paid < net_due:
        raise HTTPException(400, f"Insufficient payment: {paid:.2f} < {net_due:.2f}")
    order.change_amount = round(paid - net_due, 2)

    if voucher and voucher_applied > 0:
        voucher.remaining_amount = round((voucher.remaining_amount or 0) - voucher_applied, 2)
        voucher.redeemed_order_id = order.id
        voucher.redeemed_at = datetime.utcnow()
        voucher.status = "redeemed" if voucher.remaining_amount <= 0 else "active"
        order.notes = (
            (order.notes + "\n") if order.notes else ""
        ) + f"Voucher redeemed: {voucher.code} ({voucher_applied:.2f} {voucher.currency})"

    if payload.issue_change_voucher and order.change_amount > 0:
        voucher_amount = order.change_amount
        voucher = Voucher(
            company_id=payload.company_id,
            code=_next_voucher_code(db),
            source_order_id=order.id,
            issued_to_contact_id=order.customer_id,
            amount=voucher_amount,
            remaining_amount=voucher_amount,
            currency=payload.currency,
            status="active",
            notes=f"Change voucher issued from POS order {order.reference}",
        )
        db.add(voucher)
        # Change is converted into voucher value instead of cash returned.
        order.change_amount = 0
    order.status = "paid"

    # Update session totals
    session.total_sales = round((session.total_sales or 0) + order.total_amount, 2)
    session.total_cash = round((session.total_cash or 0) + payload.cash_amount, 2)
    session.total_card = round((session.total_card or 0) + payload.card_amount, 2)
    session.total_mobile = round((session.total_mobile or 0) + payload.mobile_amount, 2)
    session.transaction_count = (session.transaction_count or 0) + 1

    # Create backing Invoice for fiscal trail
    inv_ref = _next_invoice_ref(db, company_id=payload.company_id)
    invoice = Invoice(
        company_id=payload.company_id,
        customer_id=payload.customer_id,
        device_id=session.device_id,
        reference=inv_ref,
        invoice_type="invoice",
        status="posted",
        invoice_date=datetime.utcnow(),
        subtotal=order.subtotal,
        discount_amount=order.discount_amount,
        tax_amount=order.tax_amount,
        total_amount=order.total_amount,
        amount_paid=order.total_amount,
        amount_due=0,
        currency=payload.currency,
        warehouse_id=resolved_warehouse_id,
        payment_terms="Immediate",
        payment_reference=ref,
        notes=f"POS Order {ref}",
        created_by_id=user.id,
        confirmed_by_id=user.id,
    )
    db.add(invoice)
    db.flush()

    # Copy lines to invoice
    for ld in payload.lines:
        line_dict = ld.model_dump()
        if ld.product_id:
            product = db.query(Product).filter(Product.id == ld.product_id).first()
            if product:
                if not ld.description:
                    line_dict["description"] = product.name
                if ld.unit_price == 0:
                    line_dict["unit_price"] = product.sale_price
                if not ld.uom:
                    line_dict["uom"] = product.uom or "Units"
                if ld.vat_rate == 0 and product.tax_id:
                    tax = db.query(TaxSetting).filter(TaxSetting.id == product.tax_id).first()
                    if tax:
                        line_dict["vat_rate"] = tax.rate

        sub, tax_amt, total = _calc_line(line_dict)
        db.add(InvoiceLine(
            invoice_id=invoice.id,
            product_id=ld.product_id,
            description=line_dict.get("description", ""),
            quantity=line_dict.get("quantity", 1),
            uom=line_dict.get("uom", "Units"),
            unit_price=line_dict.get("unit_price", 0),
            discount=line_dict.get("discount", 0),
            vat_rate=line_dict.get("vat_rate", 0),
            subtotal=sub,
            tax_amount=tax_amt,
            total_price=total,
        ))

    order.invoice_id = invoice.id
    db.flush()

    post_invoice_entry(db, invoice)
    journal_id = None
    if order.payment_method == "cash":
        journal = (
            db.query(Journal)
            .filter(
                Journal.company_id == order.company_id,
                Journal.is_active == True,
                Journal.journal_type == "cash",
            )
            .order_by(Journal.id.asc())
            .first()
        )
        journal_id = journal.id if journal else None
    payment = create_payment_record(
        db,
        company_id=order.company_id,
        invoice_id=invoice.id,
        contact_id=order.customer_id,
        amount=order.total_amount,
        currency=order.currency,
        payment_method=order.payment_method,
        created_by_id=user.id,
        payment_date=order.order_date,
        reference=order.reference,
        transaction_reference=order.payment_reference,
        notes=f"POS payment for order {order.reference}",
        journal_id=journal_id,
    )
    post_payment_entry(db, payment)

    # Auto-fiscalize
    if payload.auto_fiscalize and device:
        try:
            result = submit_invoice(invoice, db)
            invoice.status = "fiscalized"
            invoice.fiscalized_at = datetime.utcnow()
            invoice.fiscalized_by_id = user.id
            order.is_fiscalized = True
            order.status = "fiscalized"
            order.zimra_receipt_id = invoice.zimra_receipt_id
            order.zimra_verification_code = invoice.zimra_verification_code
            order.zimra_verification_url = invoice.zimra_verification_url
        except Exception as exc:
            order.fiscal_errors = str(exc)
            invoice.zimra_status = "error"
            invoice.zimra_errors = str(exc)

    db.commit()
    db.refresh(order)
    return order


@router.get("/orders", response_model=List[POSOrderRead])
def list_orders(
    company_id: int,
    session_id: Optional[int] = None,
    currency: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, company_id)
    q = (
        db.query(POSOrder)
        .options(joinedload(POSOrder.lines))
        .filter(POSOrder.company_id == company_id)
    )
    if session_id:
        q = q.filter(POSOrder.session_id == session_id)
    if currency:
        cur = currency.strip().upper()
        codes = [cur]
        if cur in {"ZWG", "ZWL"}:
            codes = ["ZWG", "ZWL"]
        q = q.filter(POSOrder.currency.in_(codes))
    if status:
        q = q.filter(POSOrder.status == status)
    return q.order_by(POSOrder.order_date.desc()).offset(offset).limit(limit).all()


@router.get("/orders/{order_id}", response_model=POSOrderRead)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = (
        db.query(POSOrder)
        .options(joinedload(POSOrder.lines))
        .filter(POSOrder.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Order not found")
    ensure_company_access(db, user, order.company_id)
    return order


@router.post("/orders/{order_id}/fiscalize", response_model=POSOrderRead)
def fiscalize_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Fiscalize a paid POS order that wasn't fiscalized at sale time."""
    order = db.query(POSOrder).filter(POSOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    ensure_company_access(db, user, order.company_id)

    if order.is_fiscalized:
        raise HTTPException(400, "Order already fiscalized")
    if order.status not in ("paid",):
        raise HTTPException(400, "Can only fiscalize paid orders")
    if not order.invoice_id:
        raise HTTPException(400, "Order has no backing invoice")

    invoice = db.query(Invoice).filter(Invoice.id == order.invoice_id).first()
    if not invoice:
        raise HTTPException(400, "Backing invoice not found")
    if not invoice.device_id:
        raise HTTPException(400, "No fiscal device assigned. Assign a device in settings.")

    try:
        submit_invoice(invoice, db)
        invoice.status = "fiscalized"
        invoice.fiscalized_at = datetime.utcnow()
        invoice.fiscalized_by_id = user.id
        order.is_fiscalized = True
        order.status = "fiscalized"
        order.zimra_receipt_id = invoice.zimra_receipt_id
        order.zimra_verification_code = invoice.zimra_verification_code
        order.zimra_verification_url = invoice.zimra_verification_url
        order.fiscal_errors = ""

        log_audit(
            db=db, user=user,
            action="pos_order_fiscalize",
            resource_type="pos_order",
            resource_id=order.id,
            resource_reference=order.reference,
            company_id=order.company_id,
            changes_summary=f"POS order {order.reference} fiscalized",
        )
        db.commit()
        db.refresh(order)
    except Exception as exc:
        order.fiscal_errors = str(exc)
        invoice.zimra_status = "error"
        invoice.zimra_errors = str(exc)
        db.commit()
        db.refresh(order)

    return order


@router.post("/orders/{order_id}/refund", response_model=POSOrderRead)
def refund_order(
    order_id: int,
    payload: POSOrderRefund,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Create a refund (credit note) for a POS order."""
    order = db.query(POSOrder).options(joinedload(POSOrder.lines)).filter(POSOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    ensure_company_access(db, user, order.company_id)
    if order.status in ("cancelled", "refunded"):
        raise HTTPException(400, f"Order is already {order.status}")

    session = db.query(POSSession).filter(POSSession.id == order.session_id).first()
    refund_warehouse_id, refund_location_id = _resolve_pos_stock_location(
        db,
        order.company_id,
        order.invoice.warehouse_id if order.invoice else None,
    )

    # Create refund order
    refund_ref = _next_order_ref(db)
    refund = POSOrder(
        session_id=order.session_id,
        company_id=order.company_id,
        customer_id=order.customer_id,
        created_by_id=user.id,
        reference=refund_ref,
        currency=order.currency,
        payment_method=order.payment_method,
        cash_amount=-order.cash_amount,
        card_amount=-order.card_amount,
        mobile_amount=-order.mobile_amount,
        subtotal=-order.subtotal,
        discount_amount=-order.discount_amount,
        tax_amount=-order.tax_amount,
        total_amount=-order.total_amount,
        notes=f"Refund of {order.reference}. {payload.reason}",
        status="paid",
    )
    db.add(refund)
    db.flush()

    for line in order.lines:
        db.add(POSOrderLine(
            order_id=refund.id,
            product_id=line.product_id,
            description=line.description,
            quantity=-line.quantity,
            uom=line.uom,
            unit_price=line.unit_price,
            discount=line.discount,
            vat_rate=line.vat_rate,
            subtotal=-line.subtotal,
            tax_amount=-line.tax_amount,
            total_price=-line.total_price,
        ))
        if not line.product_id:
            continue
        product = db.query(Product).filter(Product.id == line.product_id).first()
        if not product:
            continue
        _apply_pos_inventory_move(
            db,
            company_id=order.company_id,
            product=product,
            quantity=line.quantity,
            warehouse_id=refund_warehouse_id,
            location_id=refund_location_id,
            reference=refund_ref,
            source_document=order.reference,
            move_type="in",
            notes=f"POS refund return: {refund_ref} for {order.reference}",
        )

    # Create credit note invoice
    cn_ref = f"CN-{refund_ref}"
    cn = Invoice(
        company_id=order.company_id,
        customer_id=order.customer_id,
        device_id=session.device_id if session else None,
        reference=cn_ref,
        invoice_type="credit_note",
        reversed_invoice_id=order.invoice_id,
        status="posted",
        invoice_date=datetime.utcnow(),
        subtotal=-order.subtotal,
        discount_amount=-order.discount_amount,
        tax_amount=-order.tax_amount,
        total_amount=-order.total_amount,
        amount_paid=-order.total_amount,
        amount_due=0,
        currency=order.currency,
        notes=f"POS Refund {refund_ref}. {payload.reason}",
        created_by_id=user.id,
        confirmed_by_id=user.id,
    )
    db.add(cn)
    db.flush()

    for line in order.lines:
        db.add(InvoiceLine(
            invoice_id=cn.id,
            product_id=line.product_id,
            description=line.description,
            quantity=-line.quantity,
            uom=line.uom,
            unit_price=line.unit_price,
            discount=line.discount,
            vat_rate=line.vat_rate,
            subtotal=-line.subtotal,
            tax_amount=-line.tax_amount,
            total_price=-line.total_price,
        ))

    refund.invoice_id = cn.id
    order.status = "refunded"

    post_invoice_entry(db, cn)
    refund_payment = type("POSRefundPayment", (), {
        "id": None,
        "company_id": refund.company_id,
        "invoice_id": cn.id,
        "contact_id": refund.customer_id,
        "reference": refund.reference,
        "payment_date": refund.order_date,
        "amount": refund.total_amount,
        "currency": refund.currency,
        "payment_method": refund.payment_method,
    })
    post_payment_entry(db, refund_payment)

    # Update session
    if session:
        session.total_returns = round((session.total_returns or 0) + abs(order.total_amount), 2)
        session.transaction_count = (session.transaction_count or 0) + 1

    # Auto-fiscalize credit note if device available
    if session and session.device_id:
        try:
            submit_invoice(cn, db)
            cn.status = "fiscalized"
            cn.fiscalized_at = datetime.utcnow()
            cn.fiscalized_by_id = user.id
            refund.is_fiscalized = True
            refund.status = "fiscalized"
            refund.zimra_receipt_id = cn.zimra_receipt_id
            refund.zimra_verification_code = cn.zimra_verification_code
            refund.zimra_verification_url = cn.zimra_verification_url
        except Exception as exc:
            refund.fiscal_errors = str(exc)

    db.commit()
    db.refresh(refund)
    return refund


# ── product helpers for POS ─────────────────────────────────────────────────

@router.get("/products", response_model=list)
def pos_products(
    company_id: int,
    search: str = "",
    category_id: Optional[int] = None,
    till_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Quick product lookup for POS – returns id, name, price, barcode, tax info, category."""
    ensure_company_access(db, user, company_id)
    if till_id is not None and employee_id is None:
        raise HTTPException(400, "employee_id is required when till_id is provided")
    emp = None
    if employee_id is not None:
        emp = (
            db.query(POSEmployee)
            .filter(
                POSEmployee.id == employee_id,
                POSEmployee.company_id == company_id,
                POSEmployee.is_active == True,
            )
            .first()
        )
        if not emp:
            raise HTTPException(404, "POS employee not found")

    selected_till = None
    if till_id is not None:
        selected_till = (
            db.query(POSTill)
            .filter(
                POSTill.id == till_id,
                POSTill.company_id == company_id,
            )
            .first()
        )
        if not selected_till:
            raise HTTPException(404, "POS till not found")
        if not selected_till.is_active:
            raise HTTPException(400, "POS till is inactive")
        if employee_id is not None:
            assigned = (
                db.query(POSTill.id)
                .filter(
                    POSTill.id == selected_till.id,
                    POSTill.employees.any(POSEmployee.id == employee_id),
                )
                .first()
            )
            if not assigned:
                raise HTTPException(403, "Employee is not assigned to this POS till")
    elif emp is not None:
        assigned_tills = (
            db.query(POSTill)
            .filter(
                POSTill.company_id == company_id,
                POSTill.is_active == True,
                POSTill.employees.any(POSEmployee.id == emp.id),
            )
            .order_by(POSTill.sort_order, POSTill.name)
            .all()
        )
        if not assigned_tills:
            raise HTTPException(403, "Employee is not assigned to any active POS till")
        if len(assigned_tills) > 1:
            raise HTTPException(400, "Select a POS till for this employee")
        selected_till = assigned_tills[0]
    q = db.query(Product).filter(
        Product.company_id == company_id,
        Product.is_active == True,
        Product.can_be_sold == True,
        Product.show_in_pos == True,
    )
    if selected_till and selected_till.warehouse_id is not None:
        in_warehouse = {
            pid
            for (pid,) in db.query(StockQuant.product_id)
            .filter(
                StockQuant.company_id == company_id,
                StockQuant.warehouse_id == selected_till.warehouse_id,
                StockQuant.available_quantity > 0,
            )
            .distinct()
            .all()
        }
        if in_warehouse:
            q = q.filter(
                or_(
                    Product.track_inventory == False,
                    Product.product_type != "storable",
                    Product.id.in_(in_warehouse),
                )
            )
        else:
            q = q.filter(
                or_(
                    Product.track_inventory == False,
                    Product.product_type != "storable",
                )
            )
    if search:
        like = f"%{search}%"
        q = q.filter(
            Product.name.ilike(like)
            | Product.barcode.ilike(like)
            | Product.reference.ilike(like)
        )
    if category_id:
        q = q.filter(Product.category_id == category_id)

    products = q.order_by(Product.name).limit(limit).all()

    # Batch load stock quantities
    product_ids = [p.id for p in products]
    stock_map: dict[int, float] = {}
    if product_ids:
        quant_q = db.query(
            StockQuant.product_id,
            func.sum(StockQuant.available_quantity),
        ).filter(
            StockQuant.product_id.in_(product_ids),
            StockQuant.company_id == company_id,
        )
        if selected_till and selected_till.warehouse_id is not None:
            quant_q = quant_q.filter(
                StockQuant.warehouse_id == selected_till.warehouse_id,
            )
        quants = quant_q.group_by(StockQuant.product_id).all()
        stock_map = {pid: qty for pid, qty in quants}

    result = []
    for p in products:
        vat_rate = p.tax_rate or 0
        if p.tax_id:
            tax = db.query(TaxSetting).filter(TaxSetting.id == p.tax_id).first()
            if tax:
                vat_rate = tax.rate
        result.append({
            "id": p.id,
            "name": p.name,
            "barcode": p.barcode,
            "reference": p.reference,
            "sale_price": p.sale_price,
            "vat_rate": vat_rate,
            "uom": p.uom,
            "category_id": p.category_id,
            "category_name": p.category.name if p.category else "",
            "description": p.description,
            "image_url": p.image_url or "",
            "stock_on_hand": round(stock_map.get(p.id, 0), 2),
            "track_inventory": p.track_inventory,
            "product_type": p.product_type,
        })
    return result


@router.get("/categories")
def pos_categories(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """List product categories for POS filter."""
    ensure_company_access(db, user, company_id)
    cats = db.query(Category).filter(Category.company_id == company_id).order_by(Category.name).all()
    return [{"id": c.id, "name": c.name} for c in cats]


@router.get("/devices")
def pos_devices(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """List fiscal devices available for this company."""
    ensure_company_access(db, user, company_id)
    devices = db.query(Device).filter(Device.company_id == company_id).all()
    return [
        {
            "id": d.id,
            "device_id": d.device_id,
            "serial_number": d.serial_number,
            "model": d.model,
            "fiscal_day_status": d.fiscal_day_status,
        }
        for d in devices
    ]


@router.get("/customers")
def pos_customers(
    company_id: int,
    search: str = "",
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Quick customer search for POS."""
    ensure_company_access(db, user, company_id)
    q = db.query(Contact).filter(Contact.company_id == company_id)
    if search:
        like = f"%{search}%"
        q = q.filter(Contact.name.ilike(like) | Contact.email.ilike(like) | Contact.phone.ilike(like))
    contacts = q.order_by(Contact.name).limit(limit).all()
    return [
        {"id": c.id, "name": c.name, "email": c.email, "phone": c.phone, "tin": getattr(c, "tin", "")}
        for c in contacts
    ]


@router.get("/company-info")
def pos_company_info(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Company info for POS receipt header."""
    ensure_company_access(db, user, company_id)
    co = db.query(Company).filter(Company.id == company_id).first()
    if not co:
        raise HTTPException(404, "Company not found")
    # Get logo from company settings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    logo_data = settings.logo_data if settings and settings.logo_data else ""
    return {
        "id": co.id,
        "name": co.name,
        "address": co.address,
        "phone": co.phone,
        "email": co.email,
        "tin": co.tin,
        "vat": co.vat,
        "logo_data": logo_data,
    }


# ── POS Employee Management ────────────────────────────────────────────────

@router.get("/employees", response_model=List[POSEmployeeRead])
def list_pos_employees(
    company_id: int,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """List POS employees for a company."""
    ensure_company_access(db, user, company_id)
    q = db.query(POSEmployee).filter(POSEmployee.company_id == company_id)
    if not include_inactive:
        q = q.filter(POSEmployee.is_active == True)
    return q.order_by(POSEmployee.sort_order, POSEmployee.name).all()


@router.post("/employees", response_model=POSEmployeeRead)
def create_pos_employee(
    payload: POSEmployeeCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Create a new POS employee."""
    ensure_company_access(db, user, payload.company_id)
    # Check PIN uniqueness within company
    if payload.pin:
        existing = db.query(POSEmployee).filter(
            POSEmployee.company_id == payload.company_id,
            POSEmployee.pin == payload.pin,
            POSEmployee.is_active == True,
        ).first()
        if existing:
            raise HTTPException(400, f"PIN already used by employee: {existing.name}")
    emp = POSEmployee(**payload.dict())
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


@router.get("/employees/{employee_id}", response_model=POSEmployeeRead)
def get_pos_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Get a POS employee."""
    emp = db.query(POSEmployee).filter(POSEmployee.id == employee_id).first()
    if not emp:
        raise HTTPException(404, "POS employee not found")
    ensure_company_access(db, user, emp.company_id)
    return emp


@router.put("/employees/{employee_id}", response_model=POSEmployeeRead)
def update_pos_employee(
    employee_id: int,
    payload: POSEmployeeUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Update a POS employee."""
    emp = db.query(POSEmployee).filter(POSEmployee.id == employee_id).first()
    if not emp:
        raise HTTPException(404, "POS employee not found")
    ensure_company_access(db, user, emp.company_id)
    # Check PIN uniqueness if changed
    update_data = payload.dict(exclude_unset=True)
    if "pin" in update_data and update_data["pin"]:
        existing = db.query(POSEmployee).filter(
            POSEmployee.company_id == emp.company_id,
            POSEmployee.pin == update_data["pin"],
            POSEmployee.is_active == True,
            POSEmployee.id != employee_id,
        ).first()
        if existing:
            raise HTTPException(400, f"PIN already used by employee: {existing.name}")
    for field, value in update_data.items():
        setattr(emp, field, value)
    db.commit()
    db.refresh(emp)
    return emp


@router.delete("/employees/{employee_id}")
def delete_pos_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Delete a POS employee."""
    emp = db.query(POSEmployee).filter(POSEmployee.id == employee_id).first()
    if not emp:
        raise HTTPException(404, "POS employee not found")
    ensure_company_access(db, user, emp.company_id)
    db.delete(emp)
    db.commit()
    return {"detail": "Employee deleted"}


class _VerifyPinPayload(BaseModel):
    company_id: int
    pin: str


@router.post("/employees/verify-pin")
def verify_pos_pin(
    payload: _VerifyPinPayload,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Verify a POS employee PIN and return employee info."""
    ensure_company_access(db, user, payload.company_id)
    emp = db.query(POSEmployee).filter(
        POSEmployee.company_id == payload.company_id,
        POSEmployee.pin == payload.pin,
        POSEmployee.is_active == True,
    ).first()
    if not emp:
        raise HTTPException(401, "Invalid PIN")
    return {"id": emp.id, "name": emp.name, "role": emp.role}


# ── POS Till Management ────────────────────────────────────────────────────

@router.get("/tills", response_model=List[POSTillRead])
def list_tills(
    company_id: int,
    include_inactive: bool = False,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """List POS tills for a company."""
    ensure_company_access(db, user, company_id)
    q = db.query(POSTill).filter(POSTill.company_id == company_id)
    if employee_id is not None:
        emp = (
            db.query(POSEmployee)
            .filter(
                POSEmployee.id == employee_id,
                POSEmployee.company_id == company_id,
            )
            .first()
        )
        if not emp:
            raise HTTPException(404, "POS employee not found")
        q = q.filter(POSTill.employees.any(POSEmployee.id == employee_id))
    if not include_inactive:
        q = q.filter(POSTill.is_active == True)
    return q.order_by(POSTill.sort_order, POSTill.name).all()


@router.post("/tills", response_model=POSTillRead)
def create_till(
    payload: POSTillCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Create a new POS till and assign employees."""
    ensure_company_access(db, user, payload.company_id)
    if payload.fiscal_device_id is not None:
        device = (
            db.query(Device)
            .filter(
                Device.id == payload.fiscal_device_id,
                Device.company_id == payload.company_id,
            )
            .first()
        )
        if not device:
            raise HTTPException(400, "Fiscal device not found for this company")
    till = POSTill(
        company_id=payload.company_id,
        name=payload.name,
        is_active=payload.is_active,
        sort_order=payload.sort_order,
        warehouse_id=payload.warehouse_id,
        fiscal_device_id=payload.fiscal_device_id,
    )
    # Assign employees
    if payload.employee_ids:
        employees = db.query(POSEmployee).filter(
            POSEmployee.id.in_(payload.employee_ids),
            POSEmployee.company_id == payload.company_id,
        ).all()
        till.employees = employees
    db.add(till)
    db.commit()
    db.refresh(till)
    return till


@router.get("/tills/{till_id}", response_model=POSTillRead)
def get_till(
    till_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Get a POS till by ID."""
    till = db.query(POSTill).filter(POSTill.id == till_id).first()
    if not till:
        raise HTTPException(404, "Till not found")
    ensure_company_access(db, user, till.company_id)
    return till


@router.put("/tills/{till_id}", response_model=POSTillRead)
def update_till(
    till_id: int,
    payload: POSTillUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Update a POS till."""
    till = db.query(POSTill).filter(POSTill.id == till_id).first()
    if not till:
        raise HTTPException(404, "Till not found")
    ensure_company_access(db, user, till.company_id)
    update_data = payload.dict(exclude_unset=True)
    employee_ids = update_data.pop("employee_ids", None)
    if "fiscal_device_id" in update_data and update_data["fiscal_device_id"] is not None:
        device = (
            db.query(Device)
            .filter(
                Device.id == update_data["fiscal_device_id"],
                Device.company_id == till.company_id,
            )
            .first()
        )
        if not device:
            raise HTTPException(400, "Fiscal device not found for this company")
    for field, value in update_data.items():
        setattr(till, field, value)
    if employee_ids is not None:
        employees = db.query(POSEmployee).filter(
            POSEmployee.id.in_(employee_ids),
            POSEmployee.company_id == till.company_id,
        ).all()
        till.employees = employees
    db.commit()
    db.refresh(till)
    return till


@router.delete("/tills/{till_id}")
def delete_till(
    till_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Delete a POS till."""
    till = db.query(POSTill).filter(POSTill.id == till_id).first()
    if not till:
        raise HTTPException(404, "Till not found")
    ensure_company_access(db, user, till.company_id)
    db.delete(till)
    db.commit()
    return {"detail": "Till deleted"}
