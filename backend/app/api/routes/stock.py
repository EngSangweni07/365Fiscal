from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db, ensure_company_access, require_company_access, require_portal_user
from app.models.stock_move import StockMove
from app.models.stock_quant import StockQuant
from app.models.product import Product
from app.schemas.stock_move import StockMoveCreate, StockMoveRead, StockMoveUpdate
from app.schemas.stock_quant import StockQuantRead
from app.services.accounting import post_stock_move_entry

router = APIRouter(prefix="/stock", tags=["stock"])


def update_stock_quant(db: Session, move: StockMove):
    """Update stock quantities after a stock move is confirmed."""
    if move.state != "done":
        return

    quant = db.query(StockQuant).filter(
        StockQuant.product_id == move.product_id,
        StockQuant.location_id == move.location_id
    ).first()

    if move.move_type == "adjustment" and move.quantity <= 0:
        if quant:
            db.delete(quant)
            db.flush()
        return

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
            total_value=0
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
    quant.unit_cost = move.unit_cost if move.unit_cost > 0 else quant.unit_cost
    quant.total_value = quant.quantity * quant.unit_cost


@router.post("/moves", response_model=StockMoveRead)
def create_stock_move(
    payload: StockMoveCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    
    # Validate product exists
    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    total_cost = payload.quantity * payload.unit_cost
    move = StockMove(
        **payload.dict(),
        total_cost=total_cost,
        state="draft"
    )
    db.add(move)
    db.commit()
    db.refresh(move)
    return move


@router.get("/moves", response_model=list[StockMoveRead])
def list_stock_moves(
    company_id: int,
    product_id: int | None = None,
    warehouse_id: int | None = None,
    move_type: str | None = None,
    state: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
):
    query = db.query(StockMove).filter(StockMove.company_id == company_id)
    if product_id:
        query = query.filter(StockMove.product_id == product_id)
    if warehouse_id:
        query = query.filter(StockMove.warehouse_id == warehouse_id)
    if move_type:
        query = query.filter(StockMove.move_type == move_type)
    if state:
        query = query.filter(StockMove.state == state)
    return query.order_by(StockMove.created_at.desc()).all()


@router.patch("/moves/{move_id}", response_model=StockMoveRead)
def update_stock_move(
    move_id: int,
    payload: StockMoveUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    move = db.query(StockMove).filter(StockMove.id == move_id).first()
    if not move:
        raise HTTPException(status_code=404, detail="Stock move not found")
    ensure_company_access(db, user, move.company_id)
    
    if move.state == "done":
        raise HTTPException(status_code=400, detail="Cannot modify completed stock move")
    
    updates = payload.dict(exclude_unset=True)
    for field, value in updates.items():
        setattr(move, field, value)
    
    # Recalculate total cost
    move.total_cost = move.quantity * move.unit_cost
    
    db.commit()
    db.refresh(move)
    return move


@router.post("/moves/{move_id}/confirm", response_model=StockMoveRead)
def confirm_stock_move(
    move_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    move = db.query(StockMove).filter(StockMove.id == move_id).first()
    if not move:
        raise HTTPException(status_code=404, detail="Stock move not found")
    ensure_company_access(db, user, move.company_id)
    
    if move.state == "done":
        raise HTTPException(status_code=400, detail="Stock move already completed")
    
    move.state = "done"
    move.done_date = datetime.utcnow()
    move.total_cost = move.quantity * move.unit_cost
    update_stock_quant(db, move)
    post_stock_move_entry(db, move)
    
    db.commit()
    db.refresh(move)
    return move


@router.post("/moves/{move_id}/cancel", response_model=StockMoveRead)
def cancel_stock_move(
    move_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    move = db.query(StockMove).filter(StockMove.id == move_id).first()
    if not move:
        raise HTTPException(status_code=404, detail="Stock move not found")
    ensure_company_access(db, user, move.company_id)
    
    if move.state == "done":
        raise HTTPException(status_code=400, detail="Cannot cancel completed stock move")
    
    move.state = "cancelled"
    db.commit()
    db.refresh(move)
    return move


@router.get("/quants", response_model=list[StockQuantRead])
def list_stock_quants(
    company_id: int,
    product_id: int | None = None,
    warehouse_id: int | None = None,
    location_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
):
    query = db.query(StockQuant).filter(StockQuant.company_id == company_id)
    if product_id:
        query = query.filter(StockQuant.product_id == product_id)
    if warehouse_id:
        query = query.filter(StockQuant.warehouse_id == warehouse_id)
    if location_id:
        query = query.filter(StockQuant.location_id == location_id)
    return query.all()


@router.get("/product/{product_id}/stock", response_model=dict)
def get_product_stock(
    product_id: int,
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, company_id)
    
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    quants = db.query(StockQuant).filter(
        StockQuant.product_id == product_id,
        StockQuant.company_id == company_id
    ).all()
    
    total_quantity = sum(q.quantity for q in quants)
    total_available = sum(q.available_quantity for q in quants)
    total_reserved = sum(q.reserved_quantity for q in quants)
    total_value = sum(q.total_value for q in quants)
    
    return {
        "product_id": product_id,
        "quantity_on_hand": total_quantity,
        "quantity_available": total_available,
        "quantity_reserved": total_reserved,
        "stock_value": total_value,
        "locations": [
            {
                "location_id": q.location_id,
                "warehouse_id": q.warehouse_id,
                "quantity": q.quantity,
                "available_quantity": q.available_quantity
            }
            for q in quants
        ]
    }
