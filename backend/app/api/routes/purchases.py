from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db, ensure_company_access, require_company_access, require_portal_user
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_order_line import PurchaseOrderLine
from app.models.contact import Contact
from app.models.product import Product
from app.models.stock_move import StockMove
from app.models.stock_quant import StockQuant
from app.models.warehouse import Warehouse
from app.models.location import Location
from app.schemas.purchase_order import (
    PurchaseOrderCreate,
    PurchaseOrderRead,
    PurchaseOrderUpdate,
    PurchaseOrderReceive,
)
from app.services.accounting import post_purchase_entry

router = APIRouter(prefix="/purchases", tags=["purchases"])


def next_purchase_reference(db: Session, prefix: str = "PO") -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    full_prefix = f"{prefix}-{today}-"
    count = db.query(PurchaseOrder).filter(PurchaseOrder.reference.like(f"{full_prefix}%")).count()
    return f"{full_prefix}{count + 1:04d}"


def calculate_line_amounts(line_data: dict) -> tuple[float, float, float]:
    quantity = line_data.get("quantity", 1)
    unit_price = line_data.get("unit_price", 0)
    discount = line_data.get("discount", 0)
    vat_rate = line_data.get("vat_rate", 0)

    subtotal = quantity * unit_price * (1 - discount / 100)
    tax_amount = subtotal * (vat_rate / 100)
    total_price = subtotal + tax_amount

    return subtotal, tax_amount, total_price


def recalculate_purchase_totals(order: PurchaseOrder):
    subtotal = sum(line.subtotal for line in order.lines)
    discount_amount = sum(
        line.quantity * line.unit_price * (line.discount / 100)
        for line in order.lines
    )
    tax_amount = sum(line.tax_amount for line in order.lines)
    total_amount = sum(line.total_price for line in order.lines)

    order.subtotal = subtotal
    order.discount_amount = discount_amount
    order.tax_amount = tax_amount
    order.total_amount = total_amount


def apply_stock_move(db: Session, move: StockMove):
    if move.state != "done":
        return

    quant = db.query(StockQuant).filter(
        StockQuant.product_id == move.product_id,
        StockQuant.location_id == move.location_id,
    ).first()

    if not quant:
        quant = StockQuant(
            company_id=move.company_id,
            product_id=move.product_id,
            warehouse_id=move.warehouse_id,
            location_id=move.location_id,
            quantity=0,
            reserved_quantity=0,
            available_quantity=0,
            unit_cost=move.unit_cost,
            total_value=0,
        )
        db.add(quant)
        db.flush()

    if move.move_type == "in":
        quant.quantity += move.quantity
    elif move.move_type == "out":
        quant.quantity -= move.quantity
    elif move.move_type == "adjustment":
        quant.quantity = move.quantity

    quant.available_quantity = quant.quantity - quant.reserved_quantity
    if move.unit_cost > 0:
        quant.unit_cost = move.unit_cost
    quant.total_value = quant.quantity * quant.unit_cost


@router.post("", response_model=PurchaseOrderRead)
def create_purchase_order(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)

    if payload.supplier_id:
        supplier = db.query(Contact).filter(Contact.id == payload.supplier_id).first()
        if not supplier or supplier.company_id != payload.company_id:
            raise HTTPException(status_code=400, detail="Invalid supplier")

    reference = payload.reference or next_purchase_reference(db)

    order = PurchaseOrder(
        company_id=payload.company_id,
        supplier_id=payload.supplier_id,
        reference=reference,
        order_date=payload.order_date or datetime.utcnow(),
        expected_date=payload.expected_date,
        currency=payload.currency,
        notes=payload.notes,
        warehouse_id=payload.warehouse_id,
        location_id=payload.location_id,
        status="draft",
    )
    db.add(order)
    db.flush()

    for line_data in payload.lines or []:
        subtotal, tax_amount, total_price = calculate_line_amounts(line_data.dict())
        db.add(PurchaseOrderLine(
            purchase_order_id=order.id,
            product_id=line_data.product_id,
            description=line_data.description,
            quantity=line_data.quantity,
            received_quantity=line_data.received_quantity,
            uom=line_data.uom,
            unit_price=line_data.unit_price,
            discount=line_data.discount,
            vat_rate=line_data.vat_rate,
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_price=total_price,
        ))

    db.flush()
    db.refresh(order)
    recalculate_purchase_totals(order)
    db.commit()
    db.refresh(order)
    return order


@router.get("/values")
def purchase_values(field: str, company_id: int | None = None, q: str | None = None, db: Session = Depends(get_db)):
    if field == "status":
        query = db.query(PurchaseOrder.status).distinct()
        if company_id:
            query = query.filter(PurchaseOrder.company_id == company_id)
        if q:
            query = query.filter(PurchaseOrder.status.ilike(f"%{q}%"))
        return [r[0] for r in query.order_by(PurchaseOrder.status).all() if r[0]]
    if field == "reference":
        query = db.query(PurchaseOrder.reference.distinct())
        if company_id:
            query = query.filter(PurchaseOrder.company_id == company_id)
        if q:
            query = query.filter(PurchaseOrder.reference.ilike(f"%{q}%"))
        return [r[0] for r in query.order_by(PurchaseOrder.reference).all() if r[0]]
    return []


@router.get("", response_model=list[PurchaseOrderRead])
def list_purchase_orders(
    company_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
    search: str | None = None,
    status: str | None = None,
    supplier_id: int | None = None,
    currency: str | None = None,
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    query = db.query(PurchaseOrder).filter(PurchaseOrder.company_id == company_id)
    if search:
        like = f"%{search}%"
        query = query.filter(PurchaseOrder.reference.ilike(like))
    if status:
        query = query.filter(PurchaseOrder.status == status)
    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)
    if currency:
        cur = currency.strip().upper()
        codes = [cur]
        if cur in {"ZWG", "ZWL"}:
            codes = ["ZWG", "ZWL"]
        query = query.filter(PurchaseOrder.currency.in_(codes))
    response.headers["X-Total-Count"] = str(query.count())
    return query.order_by(PurchaseOrder.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/{order_id}", response_model=PurchaseOrderRead)
def get_purchase_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    ensure_company_access(db, user, order.company_id)
    return order


@router.patch("/{order_id}", response_model=PurchaseOrderRead)
def update_purchase_order(
    order_id: int,
    payload: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    ensure_company_access(db, user, order.company_id)

    updates = payload.dict(exclude_unset=True)
    lines = updates.pop("lines", None)

    if order.status != "draft":
        allowed_fields = {"paid_state"}
        disallowed_fields = [k for k in updates.keys() if k not in allowed_fields]
        if disallowed_fields or lines is not None:
            raise HTTPException(status_code=400, detail="Can only edit draft purchase orders")

    for field, value in updates.items():
        setattr(order, field, value)

    if lines is not None:
        db.query(PurchaseOrderLine).filter(PurchaseOrderLine.purchase_order_id == order.id).delete()
        for line_data in lines:
            subtotal, tax_amount, total_price = calculate_line_amounts(line_data.dict())
            db.add(PurchaseOrderLine(
                purchase_order_id=order.id,
                product_id=line_data.product_id,
                description=line_data.description,
                quantity=line_data.quantity,
                received_quantity=line_data.received_quantity,
                uom=line_data.uom,
                unit_price=line_data.unit_price,
                discount=line_data.discount,
                vat_rate=line_data.vat_rate,
                subtotal=subtotal,
                tax_amount=tax_amount,
                total_price=total_price,
            ))
        db.flush()
        db.refresh(order)
        recalculate_purchase_totals(order)

    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/confirm", response_model=PurchaseOrderRead)
def confirm_purchase_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    ensure_company_access(db, user, order.company_id)

    if order.status != "draft":
        raise HTTPException(status_code=400, detail="Can only confirm draft purchase orders")
    if not order.lines:
        raise HTTPException(status_code=400, detail="Cannot confirm purchase order without lines")

    order.status = "confirmed"
    post_purchase_entry(db, order)
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/receive", response_model=PurchaseOrderRead)
def receive_purchase_order(
    order_id: int,
    payload: PurchaseOrderReceive | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    ensure_company_access(db, user, order.company_id)

    if order.status not in ["confirmed", "draft"]:
        raise HTTPException(status_code=400, detail="Purchase order cannot be received")
    if not order.lines:
        raise HTTPException(status_code=400, detail="Cannot receive purchase order without lines")

    warehouse = None
    if order.warehouse_id:
        warehouse = db.query(Warehouse).filter(Warehouse.id == order.warehouse_id).first()
    if not warehouse:
        warehouse = db.query(Warehouse).filter(Warehouse.company_id == order.company_id).first()
    if not warehouse:
        raise HTTPException(status_code=400, detail="No warehouse available")

    location = None
    if order.location_id:
        location = db.query(Location).filter(Location.id == order.location_id).first()
    if not location:
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
        raise HTTPException(status_code=400, detail="No location available")

    receive_map = {}
    if payload:
        receive_map = {line.id: line.received_quantity for line in payload.lines}

    for line in order.lines:
        if not line.product_id:
            continue
        if line.id in receive_map:
            quantity_to_receive = receive_map[line.id]
        else:
            quantity_to_receive = line.received_quantity or line.quantity
        quantity_to_receive = max(quantity_to_receive, 0)
        line.received_quantity = quantity_to_receive
        if quantity_to_receive <= 0:
            continue
        product = db.query(Product).filter(Product.id == line.product_id).first()
        if not product or product.product_type != "storable":
            continue

        move = StockMove(
            company_id=order.company_id,
            product_id=line.product_id,
            warehouse_id=warehouse.id,
            location_id=location.id,
            reference=order.reference,
            move_type="in",
            quantity=quantity_to_receive,
            unit_cost=line.unit_price,
            total_cost=quantity_to_receive * line.unit_price,
            source_document=order.reference,
            state="done",
            done_date=datetime.utcnow(),
            notes=order.notes or "",
        )
        db.add(move)
        db.flush()
        apply_stock_move(db, move)

    order.status = "received"
    order.received_at = datetime.utcnow()
    post_purchase_entry(db, order, replace_existing=True)

    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/cancel", response_model=PurchaseOrderRead)
def cancel_purchase_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    ensure_company_access(db, user, order.company_id)

    if order.status == "received":
        raise HTTPException(status_code=400, detail="Cannot cancel received purchase order")

    order.status = "cancelled"
    db.commit()
    db.refresh(order)
    return order
