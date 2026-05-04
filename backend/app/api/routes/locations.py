from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import ensure_company_access, get_db, require_portal_user
from app.models.location import Location
from app.models.purchase_order import PurchaseOrder
from app.models.stock_move import StockMove
from app.models.stock_quant import StockQuant
from app.models.warehouse import Warehouse
from app.schemas.location import LocationCreate, LocationRead, LocationUpdate

router = APIRouter(prefix="/locations", tags=["locations"])


def _normalize_location_payload(
    db: Session,
    warehouse_id: int,
    is_primary: bool,
    is_scrap: bool,
    is_finished_goods: bool,
    current_location_id: int | None = None,
) -> bool:
    if is_scrap:
        is_primary = False
        is_finished_goods = False
    if is_finished_goods:
        is_scrap = False

    if is_primary:
        query = db.query(Location).filter(Location.warehouse_id == warehouse_id)
        if current_location_id is not None:
            query = query.filter(Location.id != current_location_id)
        query.update({Location.is_primary: False}, synchronize_session=False)
    return is_primary


@router.post("", response_model=LocationRead)
def create_location(
    payload: LocationCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == payload.warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    ensure_company_access(db, user, warehouse.company_id)

    payload_data = payload.dict()
    payload_data["is_primary"] = _normalize_location_payload(
        db,
        warehouse_id=payload.warehouse_id,
        is_primary=payload.is_primary,
        is_scrap=payload.is_scrap,
        is_finished_goods=payload.is_finished_goods,
    )

    location = Location(**payload_data)
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.get("", response_model=list[LocationRead])
def list_locations(
    warehouse_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if warehouse:
        ensure_company_access(db, user, warehouse.company_id)
    return db.query(Location).filter(Location.warehouse_id == warehouse_id).all()


@router.get("/{location_id}", response_model=LocationRead)
def get_location(
    location_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    warehouse = db.query(Warehouse).filter(Warehouse.id == location.warehouse_id).first()
    if warehouse:
        ensure_company_access(db, user, warehouse.company_id)
    return location


@router.patch("/{location_id}", response_model=LocationRead)
def update_location(
    location_id: int,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    warehouse = db.query(Warehouse).filter(Warehouse.id == location.warehouse_id).first()
    if warehouse:
        ensure_company_access(db, user, warehouse.company_id)

    update_data = payload.dict(exclude_unset=True)
    next_is_scrap = update_data.get("is_scrap", location.is_scrap)
    next_is_primary = update_data.get("is_primary", location.is_primary)
    next_is_finished_goods = update_data.get("is_finished_goods", location.is_finished_goods)
    update_data["is_primary"] = _normalize_location_payload(
        db,
        warehouse_id=location.warehouse_id,
        is_primary=next_is_primary,
        is_scrap=next_is_scrap,
        is_finished_goods=next_is_finished_goods,
        current_location_id=location.id,
    )
    if next_is_scrap:
        update_data["is_primary"] = False
        update_data["is_finished_goods"] = False

    for key, value in update_data.items():
        setattr(location, key, value)

    db.commit()
    db.refresh(location)
    return location


@router.delete("/{location_id}")
def delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    warehouse = db.query(Warehouse).filter(Warehouse.id == location.warehouse_id).first()
    if warehouse:
        ensure_company_access(db, user, warehouse.company_id)

    db.query(StockQuant).filter(
        StockQuant.location_id == location.id
    ).delete(synchronize_session=False)
    db.query(StockMove).filter(
        StockMove.location_id == location.id
    ).update({StockMove.location_id: None}, synchronize_session=False)
    db.query(PurchaseOrder).filter(
        PurchaseOrder.location_id == location.id
    ).update({PurchaseOrder.location_id: None}, synchronize_session=False)

    if location.is_primary:
        replacement = (
            db.query(Location)
            .filter(
                Location.warehouse_id == location.warehouse_id,
                Location.id != location.id,
                Location.is_scrap.is_(False),
            )
            .order_by(Location.id.asc())
            .first()
        )
        if replacement:
            replacement.is_primary = True

    db.delete(location)
    db.commit()
    return {"message": "Location deleted"}
