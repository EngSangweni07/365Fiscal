from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.api.deps import ensure_company_access, get_db, require_company_access, require_portal_user
from app.models.location import Location
from app.models.manufacturing import (
    ManufacturingBOM,
    ManufacturingBOMLine,
    ManufacturingOrder,
    ManufacturingOrderMaterial,
    ManufacturingOrderOperation,
    ManufacturingRoutingStep,
    ManufacturingWorkCenter,
)
from app.models.product import Product
from app.models.stock_move import StockMove
from app.models.stock_quant import StockQuant
from app.models.warehouse import Warehouse
from app.schemas.manufacturing import (
    ManufacturingBOMCreate,
    ManufacturingBOMRead,
    ManufacturingBOMUpdate,
    ManufacturingDashboardCard,
    ManufacturingDashboardRead,
    ManufacturingOrderCreate,
    ManufacturingOrderMaterialUpdate,
    ManufacturingOrderOperationUpdate,
    ManufacturingProductionRecord,
    ManufacturingOrderRead,
    ManufacturingOrderUpdate,
    ManufacturingShortage,
    ManufacturingWorkCenterCreate,
    ManufacturingWorkCenterRead,
    ManufacturingWorkCenterUpdate,
)
from app.services.accounting import post_stock_move_entry

router = APIRouter(prefix="/manufacturing", tags=["manufacturing"])


def _load_bom_query(db: Session):
    return db.query(ManufacturingBOM).options(
        selectinload(ManufacturingBOM.lines),
        selectinload(ManufacturingBOM.steps),
    )


def _load_order_query(db: Session):
    return db.query(ManufacturingOrder).options(
        selectinload(ManufacturingOrder.materials),
        selectinload(ManufacturingOrder.operations),
    )


def _primary_location(db: Session, warehouse_id: int | None) -> int | None:
    if not warehouse_id:
        return None
    location = (
        db.query(Location)
        .filter(Location.warehouse_id == warehouse_id, Location.is_primary.is_(True))
        .first()
    )
    if location:
        return location.id
    location = db.query(Location).filter(Location.warehouse_id == warehouse_id).first()
    return location.id if location else None


def _finished_goods_location(db: Session, warehouse_id: int | None) -> int | None:
    if not warehouse_id:
        return None
    location = (
        db.query(Location)
        .filter(Location.warehouse_id == warehouse_id, Location.is_finished_goods.is_(True))
        .order_by(Location.id.asc())
        .first()
    )
    if location:
        return location.id
    return _primary_location(db, warehouse_id)


def _make_reference(db: Session, company_id: int, prefix: str) -> str:
    count = db.query(func.count()).select_from(ManufacturingOrder).filter(
        ManufacturingOrder.company_id == company_id
    ).scalar() or 0
    return f"{prefix}-{company_id:03d}-{count + 1:05d}"


def _stock_available(
    db: Session,
    company_id: int,
    product_id: int,
    location_id: int | None = None,
    lot_number: str | None = None,
    serial_number: str | None = None,
) -> float:
    query = db.query(func.sum(StockQuant.available_quantity)).filter(
        StockQuant.company_id == company_id,
        StockQuant.product_id == product_id,
    )
    if location_id:
        query = query.filter(StockQuant.location_id == location_id)
    if lot_number is not None:
        query = query.filter(StockQuant.lot_number == lot_number)
    if serial_number is not None:
        query = query.filter(StockQuant.serial_number == serial_number)
    return float(query.scalar() or 0)


def _average_unit_cost(
    db: Session,
    company_id: int,
    product_id: int,
    location_id: int | None = None,
    lot_number: str | None = None,
    serial_number: str | None = None,
) -> float:
    query = db.query(StockQuant).filter(
        StockQuant.company_id == company_id,
        StockQuant.product_id == product_id,
    )
    if location_id:
        query = query.filter(StockQuant.location_id == location_id)
    if lot_number is not None:
        query = query.filter(StockQuant.lot_number == lot_number)
    if serial_number is not None:
        query = query.filter(StockQuant.serial_number == serial_number)
    quants = query.all()
    total_qty = sum(q.quantity for q in quants)
    total_value = sum(q.total_value for q in quants)
    if total_qty > 0:
        return total_value / total_qty
    product = db.query(Product).filter(Product.id == product_id).first()
    return float(product.purchase_cost if product else 0)


def _get_scrap_location(db: Session, warehouse_id: int | None) -> int | None:
    if not warehouse_id:
        return None
    scrap_location = (
        db.query(Location)
        .filter(Location.warehouse_id == warehouse_id, Location.is_scrap.is_(True))
        .order_by(Location.id.asc())
        .first()
    )
    return scrap_location.id if scrap_location else None


def _apply_stock_quant(db: Session, move: StockMove) -> None:
    quant = db.query(StockQuant).filter(
        StockQuant.product_id == move.product_id,
        StockQuant.location_id == move.location_id,
        StockQuant.lot_number == (move.lot_number or ""),
        StockQuant.serial_number == (move.serial_number or ""),
    ).first()

    if not quant:
        quant = StockQuant(
            company_id=move.company_id,
            product_id=move.product_id,
            warehouse_id=move.warehouse_id,
            location_id=move.location_id,
            lot_number=move.lot_number or "",
            serial_number=move.serial_number or "",
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


def _post_done_move(
    db: Session,
    *,
    company_id: int,
    product_id: int,
    warehouse_id: int | None,
    location_id: int | None,
    reference: str,
    move_type: str,
    quantity: float,
    unit_cost: float,
    lot_number: str = "",
    serial_number: str = "",
    notes: str,
) -> StockMove:
    move = StockMove(
        company_id=company_id,
        product_id=product_id,
        warehouse_id=warehouse_id,
        location_id=location_id,
        lot_number=lot_number,
        serial_number=serial_number,
        reference=reference,
        move_type=move_type,
        quantity=quantity,
        unit_cost=unit_cost,
        total_cost=quantity * unit_cost,
        source_document=reference,
        state="done",
        done_date=datetime.utcnow(),
        notes=notes,
    )
    db.add(move)
    db.flush()
    _apply_stock_quant(db, move)
    post_stock_move_entry(db, move)
    return move


def _consume_materials_for_progress(
    db: Session,
    order: ManufacturingOrder,
    gross_progress_quantity: float,
) -> float:
    total_component_cost = 0.0
    factor = gross_progress_quantity / order.planned_quantity if order.planned_quantity else 0
    for material in order.materials:
        target_total_consumed = material.planned_quantity * ((order.produced_quantity + order.scrapped_quantity + gross_progress_quantity) / order.planned_quantity)
        required_now = max(target_total_consumed - material.consumed_quantity, 0)
        if required_now <= 0:
            continue
        available = _stock_available(
            db,
            company_id=order.company_id,
            product_id=material.component_product_id,
            location_id=material.source_location_id,
            lot_number=material.lot_number or None,
            serial_number=material.serial_number or None,
        )
        if available + 1e-9 < required_now:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for component product {material.component_product_id}. Required {required_now}, available {available}",
            )
        unit_cost = _average_unit_cost(
            db,
            company_id=order.company_id,
            product_id=material.component_product_id,
            location_id=material.source_location_id,
            lot_number=material.lot_number or None,
            serial_number=material.serial_number or None,
        )
        total_component_cost += required_now * unit_cost
        _post_done_move(
            db,
            company_id=order.company_id,
            product_id=material.component_product_id,
            warehouse_id=order.warehouse_id,
            location_id=material.source_location_id,
            reference=order.reference,
            move_type="out",
            quantity=required_now,
            unit_cost=unit_cost,
            lot_number=material.lot_number,
            serial_number=material.serial_number,
            notes=f"Material issue for {order.reference}",
        )
        material.consumed_quantity += required_now
    return total_component_cost


def _replace_bom_children(
    db: Session,
    bom: ManufacturingBOM,
    lines_payload,
    steps_payload,
) -> None:
    if lines_payload is not None:
        bom.lines.clear()
        for index, line in enumerate(lines_payload, start=1):
            bom.lines.append(
                ManufacturingBOMLine(
                    component_product_id=line.component_product_id,
                    sequence=line.sequence or index * 10,
                    quantity=line.quantity,
                    uom=line.uom,
                    scrap_rate_percent=line.scrap_rate_percent,
                    notes=line.notes,
                )
            )
    if steps_payload is not None:
        bom.steps.clear()
        for index, step in enumerate(steps_payload, start=1):
            bom.steps.append(
                ManufacturingRoutingStep(
                    work_center_id=step.work_center_id,
                    sequence=step.sequence or index * 10,
                    name=step.name,
                    duration_minutes=step.duration_minutes,
                    instructions=step.instructions,
                )
            )


def _sync_order_from_bom(db: Session, order: ManufacturingOrder, bom: ManufacturingBOM) -> None:
    factor = order.planned_quantity / (bom.quantity or 1)
    order.product_id = bom.product_id
    order.warehouse_id = order.warehouse_id or bom.warehouse_id
    order.source_location_id = order.source_location_id or _primary_location(db, order.warehouse_id)
    order.output_location_id = order.output_location_id or bom.output_location_id or _finished_goods_location(db, order.warehouse_id)

    order.materials.clear()
    for line in bom.lines:
        planned_qty = line.quantity * factor * (1 + ((line.scrap_rate_percent or 0) / 100))
        order.materials.append(
            ManufacturingOrderMaterial(
                component_product_id=line.component_product_id,
                source_location_id=order.source_location_id,
                lot_number="",
                serial_number="",
                sequence=line.sequence,
                planned_quantity=planned_qty,
                consumed_quantity=0,
                uom=line.uom,
                notes=line.notes,
            )
        )

    order.operations.clear()
    for step in bom.steps:
        order.operations.append(
            ManufacturingOrderOperation(
                work_center_id=step.work_center_id,
                sequence=step.sequence,
                name=step.name,
                status="pending",
                planned_duration_minutes=step.duration_minutes * factor,
                actual_duration_minutes=0,
                instructions=step.instructions,
            )
            )


def _get_order_or_404(db: Session, order_id: int) -> ManufacturingOrder:
    order = _load_order_query(db).filter(ManufacturingOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Manufacturing order not found")
    return order


def _get_bom_or_404(db: Session, bom_id: int) -> ManufacturingBOM:
    bom = _load_bom_query(db).filter(ManufacturingBOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    return bom


def _get_operation_or_404(order: ManufacturingOrder, operation_id: int) -> ManufacturingOrderOperation:
    operation = next((item for item in order.operations if item.id == operation_id), None)
    if not operation:
        raise HTTPException(status_code=404, detail="Manufacturing operation not found")
    return operation


def _get_material_or_404(order: ManufacturingOrder, material_id: int) -> ManufacturingOrderMaterial:
    material = next((item for item in order.materials if item.id == material_id), None)
    if not material:
        raise HTTPException(status_code=404, detail="Manufacturing material line not found")
    return material


@router.get("/dashboard", response_model=ManufacturingDashboardRead)
def manufacturing_dashboard(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, company_id)
    orders = _load_order_query(db).filter(ManufacturingOrder.company_id == company_id).all()
    summary = [
        ManufacturingDashboardCard(label="Active BOMs", value=float(
            db.query(func.count()).select_from(ManufacturingBOM).filter(
                ManufacturingBOM.company_id == company_id,
                ManufacturingBOM.is_active.is_(True),
            ).scalar() or 0
        )),
        ManufacturingDashboardCard(label="Draft Orders", value=float(sum(1 for o in orders if o.state == "draft"))),
        ManufacturingDashboardCard(label="In Progress", value=float(sum(1 for o in orders if o.state == "in_progress"))),
        ManufacturingDashboardCard(label="Completed", value=float(sum(1 for o in orders if o.state == "done"))),
    ]

    shortages: list[ManufacturingShortage] = []
    for order in orders:
        if order.state not in {"draft", "in_progress"}:
            continue
        for material in order.materials:
            available = _stock_available(
                db,
                company_id=company_id,
                product_id=material.component_product_id,
                location_id=material.source_location_id,
            )
            required = max(material.planned_quantity - material.consumed_quantity, 0)
            if available + 1e-9 < required:
                shortages.append(
                    ManufacturingShortage(
                        order_id=order.id,
                        order_reference=order.reference,
                        component_product_id=material.component_product_id,
                        required_quantity=required,
                        available_quantity=available,
                        shortage_quantity=required - available,
                    )
                )
    recent_orders = sorted(orders, key=lambda item: item.created_at, reverse=True)[:8]
    return ManufacturingDashboardRead(summary=summary, recent_orders=recent_orders, shortages=shortages[:20])


@router.get("/work-centers", response_model=list[ManufacturingWorkCenterRead])
def list_work_centers(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
):
    return db.query(ManufacturingWorkCenter).filter(
        ManufacturingWorkCenter.company_id == company_id
    ).order_by(ManufacturingWorkCenter.name.asc()).all()


@router.post("/work-centers", response_model=ManufacturingWorkCenterRead)
def create_work_center(
    payload: ManufacturingWorkCenterCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    work_center = ManufacturingWorkCenter(**payload.dict())
    db.add(work_center)
    db.commit()
    db.refresh(work_center)
    return work_center


@router.patch("/work-centers/{work_center_id}", response_model=ManufacturingWorkCenterRead)
def update_work_center(
    work_center_id: int,
    payload: ManufacturingWorkCenterUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    work_center = db.query(ManufacturingWorkCenter).filter(
        ManufacturingWorkCenter.id == work_center_id
    ).first()
    if not work_center:
        raise HTTPException(status_code=404, detail="Work center not found")
    ensure_company_access(db, user, work_center.company_id)
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(work_center, field, value)
    db.commit()
    db.refresh(work_center)
    return work_center


@router.get("/boms", response_model=list[ManufacturingBOMRead])
def list_boms(
    company_id: int,
    product_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
):
    query = _load_bom_query(db).filter(ManufacturingBOM.company_id == company_id)
    if product_id:
        query = query.filter(ManufacturingBOM.product_id == product_id)
    return query.order_by(ManufacturingBOM.created_at.desc()).all()


@router.post("/boms", response_model=ManufacturingBOMRead)
def create_bom(
    payload: ManufacturingBOMCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Finished product not found")
    bom = ManufacturingBOM(
        company_id=payload.company_id,
        product_id=payload.product_id,
        warehouse_id=payload.warehouse_id,
        output_location_id=payload.output_location_id,
        code=payload.code,
        name=payload.name or f"{product.name} BOM",
        version=payload.version,
        quantity=payload.quantity,
        is_active=payload.is_active,
        notes=payload.notes,
    )
    db.add(bom)
    db.flush()
    _replace_bom_children(db, bom, payload.lines, payload.steps)
    db.commit()
    return _load_bom_query(db).filter(ManufacturingBOM.id == bom.id).first()


@router.get("/boms/{bom_id}", response_model=ManufacturingBOMRead)
def get_bom(
    bom_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    bom = _get_bom_or_404(db, bom_id)
    ensure_company_access(db, user, bom.company_id)
    return bom


@router.patch("/boms/{bom_id}", response_model=ManufacturingBOMRead)
def update_bom(
    bom_id: int,
    payload: ManufacturingBOMUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    bom = _get_bom_or_404(db, bom_id)
    ensure_company_access(db, user, bom.company_id)
    updates = payload.dict(exclude_unset=True, exclude={"lines", "steps"})
    for field, value in updates.items():
        setattr(bom, field, value)
    _replace_bom_children(db, bom, payload.lines, payload.steps)
    db.commit()
    return _load_bom_query(db).filter(ManufacturingBOM.id == bom.id).first()


@router.delete("/boms/{bom_id}")
def delete_bom(
    bom_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    bom = _get_bom_or_404(db, bom_id)
    ensure_company_access(db, user, bom.company_id)
    linked_order = db.query(ManufacturingOrder.id).filter(ManufacturingOrder.bom_id == bom.id).first()
    if linked_order:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a BOM that is already linked to manufacturing orders",
        )
    db.delete(bom)
    db.commit()
    return {"status": "deleted"}


@router.get("/orders", response_model=list[ManufacturingOrderRead])
def list_orders(
    company_id: int,
    state: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
):
    query = _load_order_query(db).filter(ManufacturingOrder.company_id == company_id)
    if state:
        query = query.filter(ManufacturingOrder.state == state)
    return query.order_by(ManufacturingOrder.created_at.desc()).all()


@router.post("/orders", response_model=ManufacturingOrderRead)
def create_order(
    payload: ManufacturingOrderCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    bom = _load_bom_query(db).filter(ManufacturingBOM.id == payload.bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    if bom.company_id != payload.company_id:
        raise HTTPException(status_code=400, detail="BOM company mismatch")

    warehouse_id = payload.warehouse_id or bom.warehouse_id
    source_location_id = payload.source_location_id or _primary_location(db, warehouse_id)
    output_location_id = payload.output_location_id or bom.output_location_id or _finished_goods_location(db, warehouse_id)
    order = ManufacturingOrder(
        company_id=payload.company_id,
        bom_id=bom.id,
        product_id=payload.product_id or bom.product_id,
        warehouse_id=warehouse_id,
        source_location_id=source_location_id,
        output_location_id=output_location_id,
        reference=_make_reference(db, payload.company_id, "MO"),
        state="draft",
        priority=payload.priority,
        planned_quantity=payload.planned_quantity,
        scheduled_start=payload.scheduled_start,
        scheduled_end=payload.scheduled_end,
        notes=payload.notes,
    )
    db.add(order)
    db.flush()
    _sync_order_from_bom(db, order, bom)
    db.commit()
    return _load_order_query(db).filter(ManufacturingOrder.id == order.id).first()


@router.get("/orders/{order_id}", response_model=ManufacturingOrderRead)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = _get_order_or_404(db, order_id)
    ensure_company_access(db, user, order.company_id)
    return order


@router.patch("/orders/{order_id}", response_model=ManufacturingOrderRead)
def update_order(
    order_id: int,
    payload: ManufacturingOrderUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = _get_order_or_404(db, order_id)
    ensure_company_access(db, user, order.company_id)
    if order.state != "draft":
        raise HTTPException(status_code=400, detail="Only draft orders can be edited")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(order, field, value)
    bom = _load_bom_query(db).filter(ManufacturingBOM.id == order.bom_id).first()
    _sync_order_from_bom(db, order, bom)
    db.commit()
    return _load_order_query(db).filter(ManufacturingOrder.id == order.id).first()


@router.patch("/orders/{order_id}/materials/{material_id}", response_model=ManufacturingOrderRead)
def update_order_material(
    order_id: int,
    material_id: int,
    payload: ManufacturingOrderMaterialUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = _get_order_or_404(db, order_id)
    ensure_company_access(db, user, order.company_id)
    if order.state in {"done", "cancelled"}:
        raise HTTPException(status_code=400, detail="Cannot edit materials on closed orders")
    material = _get_material_or_404(order, material_id)
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(material, field, value)
    db.commit()
    return _load_order_query(db).filter(ManufacturingOrder.id == order.id).first()


@router.post("/orders/{order_id}/release", response_model=ManufacturingOrderRead)
def release_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = _get_order_or_404(db, order_id)
    ensure_company_access(db, user, order.company_id)
    if order.state not in {"draft", "planned"}:
        raise HTTPException(status_code=400, detail="Only draft or planned orders can be released")
    order.state = "in_progress"
    order.started_at = datetime.utcnow()
    for operation in order.operations:
        if operation.status == "pending":
            operation.status = "ready"
    db.commit()
    return _load_order_query(db).filter(ManufacturingOrder.id == order.id).first()


@router.patch("/orders/{order_id}/operations/{operation_id}", response_model=ManufacturingOrderRead)
def update_order_operation(
    order_id: int,
    operation_id: int,
    payload: ManufacturingOrderOperationUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = _get_order_or_404(db, order_id)
    ensure_company_access(db, user, order.company_id)
    if order.state in {"done", "cancelled"}:
        raise HTTPException(status_code=400, detail="Cannot edit operations on closed orders")
    operation = _get_operation_or_404(order, operation_id)
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(operation, field, value)
    db.commit()
    return _load_order_query(db).filter(ManufacturingOrder.id == order.id).first()


@router.post("/orders/{order_id}/operations/{operation_id}/start", response_model=ManufacturingOrderRead)
def start_order_operation(
    order_id: int,
    operation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = _get_order_or_404(db, order_id)
    ensure_company_access(db, user, order.company_id)
    if order.state == "draft":
        order.state = "in_progress"
        order.started_at = order.started_at or datetime.utcnow()
    if order.state in {"done", "cancelled"}:
        raise HTTPException(status_code=400, detail="Cannot start operations on closed orders")
    operation = _get_operation_or_404(order, operation_id)
    prior_incomplete = [
        item for item in order.operations
        if item.sequence < operation.sequence and item.status != "done"
    ]
    if prior_incomplete:
        raise HTTPException(
            status_code=400,
            detail=f"Operation sequence blocked. Complete {prior_incomplete[0].name} first.",
        )
    if operation.status == "done":
        raise HTTPException(status_code=400, detail="Operation already completed")
    if operation.status == "pending":
        operation.status = "ready"
    operation.status = "in_progress"
    db.commit()
    return _load_order_query(db).filter(ManufacturingOrder.id == order.id).first()


@router.post("/orders/{order_id}/operations/{operation_id}/complete", response_model=ManufacturingOrderRead)
def complete_order_operation(
    order_id: int,
    operation_id: int,
    actual_duration_minutes: float | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = _get_order_or_404(db, order_id)
    ensure_company_access(db, user, order.company_id)
    if order.state in {"done", "cancelled"}:
        raise HTTPException(status_code=400, detail="Cannot complete operations on closed orders")
    operation = _get_operation_or_404(order, operation_id)
    prior_incomplete = [
        item for item in order.operations
        if item.sequence < operation.sequence and item.status != "done"
    ]
    if prior_incomplete:
        raise HTTPException(
            status_code=400,
            detail=f"Operation sequence blocked. Complete {prior_incomplete[0].name} first.",
        )
    if operation.status not in {"ready", "in_progress", "pending"}:
        raise HTTPException(status_code=400, detail="Operation is not in a completable state")
    operation.status = "done"
    operation.actual_duration_minutes = (
        actual_duration_minutes
        if actual_duration_minutes is not None and actual_duration_minutes >= 0
        else operation.planned_duration_minutes
    )
    if order.operations and all(item.status == "done" for item in order.operations):
        order.state = "ready_to_close"
    else:
        order.state = "in_progress"
    order.started_at = order.started_at or datetime.utcnow()
    db.commit()
    return _load_order_query(db).filter(ManufacturingOrder.id == order.id).first()


@router.post("/orders/{order_id}/record-production", response_model=ManufacturingOrderRead)
def record_partial_production(
    order_id: int,
    payload: ManufacturingProductionRecord,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = _get_order_or_404(db, order_id)
    ensure_company_access(db, user, order.company_id)
    if order.state in {"done", "cancelled"}:
        raise HTTPException(status_code=400, detail="Cannot record production on closed orders")
    if payload.produced_quantity < 0 or payload.scrap_quantity < 0:
        raise HTTPException(status_code=400, detail="Production and scrap quantities must be non-negative")
    gross_progress = payload.produced_quantity + payload.scrap_quantity
    if gross_progress <= 0:
        raise HTTPException(status_code=400, detail="Enter a production or scrap quantity")
    if not (payload.lot_number or payload.serial_number):
        raise HTTPException(status_code=400, detail="Provide a lot number or serial number for produced output")
    current_gross = order.produced_quantity + order.scrapped_quantity
    if current_gross + gross_progress > order.planned_quantity + 1e-9:
        raise HTTPException(status_code=400, detail="Recorded production exceeds planned quantity")

    total_component_cost = _consume_materials_for_progress(db, order, gross_progress)
    unit_cost = total_component_cost / gross_progress if gross_progress else 0

    if payload.produced_quantity > 0:
        _post_done_move(
            db,
            company_id=order.company_id,
            product_id=order.product_id,
            warehouse_id=order.warehouse_id,
            location_id=order.output_location_id,
            reference=order.reference,
            move_type="in",
            quantity=payload.produced_quantity,
            unit_cost=unit_cost,
            lot_number=payload.lot_number,
            serial_number=payload.serial_number,
            notes=payload.notes or f"Partial finished goods receipt for {order.reference}",
        )
        order.produced_quantity += payload.produced_quantity

    if payload.scrap_quantity > 0:
        scrap_location_id = _get_scrap_location(db, order.warehouse_id)
        if scrap_location_id:
            _post_done_move(
                db,
                company_id=order.company_id,
                product_id=order.product_id,
                warehouse_id=order.warehouse_id,
                location_id=scrap_location_id,
                reference=order.reference,
                move_type="in",
                quantity=payload.scrap_quantity,
                unit_cost=unit_cost,
                lot_number=payload.lot_number,
                serial_number=payload.serial_number,
                notes=payload.notes or f"Scrap receipt for {order.reference}",
            )
        order.scrapped_quantity += payload.scrap_quantity

    order.state = "in_progress"
    order.started_at = order.started_at or datetime.utcnow()
    if order.operations and all(item.status == "done" for item in order.operations):
        order.state = "ready_to_close"
    db.commit()
    return _load_order_query(db).filter(ManufacturingOrder.id == order.id).first()


@router.post("/orders/{order_id}/complete", response_model=ManufacturingOrderRead)
def complete_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = _get_order_or_404(db, order_id)
    ensure_company_access(db, user, order.company_id)
    if order.state not in {"draft", "planned", "in_progress", "ready_to_close"}:
        raise HTTPException(status_code=400, detail="Order cannot be completed from its current state")
    if order.operations and any(item.status != "done" for item in order.operations):
        raise HTTPException(status_code=400, detail="Complete all routing operations before closing the order")

    remaining_good = max(order.planned_quantity - order.produced_quantity - order.scrapped_quantity, 0)
    if remaining_good > 0:
        raise HTTPException(
            status_code=400,
            detail="Record the remaining produced quantity with lot or serial details before closing the order",
        )

    order.state = "done"
    order.started_at = order.started_at or datetime.utcnow()
    order.completed_at = datetime.utcnow()
    for operation in order.operations:
        operation.status = "done"
        if operation.actual_duration_minutes <= 0:
            operation.actual_duration_minutes = operation.planned_duration_minutes
    db.commit()
    return _load_order_query(db).filter(ManufacturingOrder.id == order.id).first()


@router.post("/orders/{order_id}/cancel", response_model=ManufacturingOrderRead)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    order = _get_order_or_404(db, order_id)
    ensure_company_access(db, user, order.company_id)
    if order.state == "done":
        raise HTTPException(status_code=400, detail="Completed orders cannot be cancelled")
    order.state = "cancelled"
    db.commit()
    return _load_order_query(db).filter(ManufacturingOrder.id == order.id).first()
