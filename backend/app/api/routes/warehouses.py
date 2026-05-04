import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import (
    ensure_company_access,
    get_db,
    require_company_access,
    require_portal_user,
)
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.pos_till import POSTill
from app.models.purchase_order import PurchaseOrder
from app.models.stock_move import StockMove
from app.models.stock_quant import StockQuant
from app.models.warehouse import Warehouse
from app.schemas.warehouse import WarehouseCreate, WarehouseRead, WarehouseUpdate

router = APIRouter(prefix="/warehouses", tags=["warehouses"])


def _warehouse_location_prefix(name: str, fallback_code: str = "") -> str:
    tokens = [re.sub(r"[^A-Z0-9]", "", part.upper()) for part in name.split()]
    tokens = [token for token in tokens if token]
    if len(tokens) >= 2:
        prefix = "".join(token[0] for token in tokens[:2])
    elif tokens:
        prefix = tokens[0][:2]
    else:
        fallback = re.sub(r"[^A-Z0-9]", "", fallback_code.upper())
        prefix = fallback[:2] if fallback else "WH"
    return prefix or "WH"


def _ensure_default_locations(db: Session, warehouse: Warehouse) -> None:
    stock_prefix = _warehouse_location_prefix(warehouse.name, warehouse.code)
    existing_locations = db.query(Location).filter(Location.warehouse_id == warehouse.id).all()
    if not any(location.is_primary for location in existing_locations):
        db.add(
            Location(
                warehouse_id=warehouse.id,
                name="Stock",
                code=f"{stock_prefix}/Stock",
                is_primary=True,
                is_scrap=False,
                is_finished_goods=False,
            )
        )
    if not any(location.is_finished_goods for location in existing_locations):
        db.add(
            Location(
                warehouse_id=warehouse.id,
                name="Finished Goods",
                code=f"{stock_prefix}/FG",
                is_primary=False,
                is_scrap=False,
                is_finished_goods=True,
            )
        )


@router.post("", response_model=WarehouseRead)
def create_warehouse(
    payload: WarehouseCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    warehouse = Warehouse(**payload.dict())
    db.add(warehouse)
    db.flush()
    _ensure_default_locations(db, warehouse)

    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.get("", response_model=list[WarehouseRead])
def list_warehouses(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
):
    return db.query(Warehouse).filter(Warehouse.company_id == company_id).all()


@router.get("/{warehouse_id}", response_model=WarehouseRead)
def get_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    ensure_company_access(db, user, warehouse.company_id)
    return warehouse


@router.patch("/{warehouse_id}", response_model=WarehouseRead)
def update_warehouse(
    warehouse_id: int,
    payload: WarehouseUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    ensure_company_access(db, user, warehouse.company_id)

    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(warehouse, key, value)

    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.delete("/{warehouse_id}")
def delete_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    ensure_company_access(db, user, warehouse.company_id)

    location_ids = [
        row[0]
        for row in db.query(Location.id)
        .filter(Location.warehouse_id == warehouse.id)
        .all()
    ]

    if location_ids:
        db.query(StockQuant).filter(
            StockQuant.location_id.in_(location_ids)
        ).delete(synchronize_session=False)
        db.query(StockMove).filter(
            StockMove.location_id.in_(location_ids)
        ).update({StockMove.location_id: None}, synchronize_session=False)
        db.query(PurchaseOrder).filter(
            PurchaseOrder.location_id.in_(location_ids)
        ).update({PurchaseOrder.location_id: None}, synchronize_session=False)
        db.query(Location).filter(
            Location.id.in_(location_ids)
        ).delete(synchronize_session=False)

    db.query(StockQuant).filter(
        StockQuant.warehouse_id == warehouse.id
    ).delete(synchronize_session=False)
    db.query(StockMove).filter(
        StockMove.warehouse_id == warehouse.id
    ).update({StockMove.warehouse_id: None}, synchronize_session=False)
    db.query(PurchaseOrder).filter(
        PurchaseOrder.warehouse_id == warehouse.id
    ).update({PurchaseOrder.warehouse_id: None}, synchronize_session=False)
    db.query(Invoice).filter(
        Invoice.warehouse_id == warehouse.id
    ).update({Invoice.warehouse_id: None}, synchronize_session=False)
    db.query(POSTill).filter(
        POSTill.warehouse_id == warehouse.id
    ).update({POSTill.warehouse_id: None}, synchronize_session=False)

    db.delete(warehouse)
    db.commit()
    return {"message": "Warehouse deleted"}
