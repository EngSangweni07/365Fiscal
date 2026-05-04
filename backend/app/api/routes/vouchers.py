from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import ensure_company_access, get_db, require_portal_user
from app.models.voucher import Voucher
from app.schemas.voucher import VoucherIssuePayload, VoucherRead, VoucherRedeemPayload

router = APIRouter(prefix="/vouchers", tags=["vouchers"])


def _next_voucher_code(db: Session) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"VCH-{today}-"
    count = db.query(Voucher).filter(Voucher.code.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:05d}"


@router.get("", response_model=list[VoucherRead])
def list_vouchers(
    company_id: int,
    response: Response,
    status: Optional[str] = None,
    search: str = "",
    limit: int = Query(200, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, company_id)
    q = db.query(Voucher).filter(Voucher.company_id == company_id)
    if status:
        q = q.filter(Voucher.status == status)
    if search.strip():
        token = search.strip()
        q = q.filter(Voucher.code.ilike(f"%{token}%"))
    response.headers["X-Total-Count"] = str(q.count())
    return q.order_by(Voucher.issued_at.desc()).offset(offset).limit(limit).all()


@router.post("/issue", response_model=VoucherRead)
def issue_voucher(
    payload: VoucherIssuePayload,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Voucher amount must be greater than zero")

    voucher = Voucher(
        company_id=payload.company_id,
        code=_next_voucher_code(db),
        source_order_id=payload.source_order_id,
        issued_to_contact_id=payload.issued_to_contact_id,
        amount=round(float(payload.amount), 2),
        remaining_amount=round(float(payload.amount), 2),
        currency=(payload.currency or "USD").upper(),
        status="active",
        notes=payload.notes or "",
    )
    db.add(voucher)
    db.commit()
    db.refresh(voucher)
    return voucher


@router.get("/by-order/{order_id}", response_model=VoucherRead)
def get_voucher_by_order(
    order_id: int,
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, company_id)
    voucher = (
        db.query(Voucher)
        .filter(Voucher.company_id == company_id, Voucher.source_order_id == order_id)
        .order_by(Voucher.id.desc())
        .first()
    )
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found for this order")
    return voucher


@router.post("/{code}/redeem", response_model=VoucherRead)
def redeem_voucher(
    code: str,
    payload: VoucherRedeemPayload,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    voucher = (
        db.query(Voucher)
        .filter(Voucher.company_id == payload.company_id, Voucher.code == code)
        .first()
    )
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if voucher.status != "active" or voucher.remaining_amount <= 0:
        raise HTTPException(status_code=400, detail="Voucher is not redeemable")

    redeem_amount = round(float(payload.amount or voucher.remaining_amount), 2)
    if redeem_amount <= 0:
        raise HTTPException(status_code=400, detail="Redeem amount must be greater than zero")
    if redeem_amount > voucher.remaining_amount:
        raise HTTPException(status_code=400, detail="Redeem amount exceeds remaining voucher balance")

    voucher.remaining_amount = round(voucher.remaining_amount - redeem_amount, 2)
    voucher.redeemed_order_id = payload.order_id
    voucher.redeemed_at = datetime.utcnow()
    voucher.status = "redeemed" if voucher.remaining_amount <= 0 else "active"

    db.commit()
    db.refresh(voucher)
    return voucher
