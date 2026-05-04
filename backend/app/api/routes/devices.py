from datetime import datetime

from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException, status, Response
from sqlalchemy.orm import Session
from typing import Optional

from app.api.deps import (
    get_db,
    get_current_user,
    ensure_company_access,
    require_company_access,
    require_admin,
    require_portal_user,
)
from app.models.device import Device
from app.models.company_certificate import CompanyCertificate
from app.models.audit_log import AuditLog
from app.schemas.device import DeviceCreate, DeviceRead, DeviceUpdate
from app.schemas.audit_log import AuditLogRead
from app.services.fdms import get_status, open_day, close_day, get_config, ping_device, register_device

router = APIRouter(prefix="/devices", tags=["devices"])


def _ensure_company_certificate(db: Session, company_id: int) -> None:
    cert = db.query(CompanyCertificate).filter(CompanyCertificate.company_id == company_id).first()
    if not cert or not cert.crt_data or not cert.key_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company certificate or key not configured",
        )


@router.get("/values")
def list_device_values(
    field: str,
    company_id: int | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
):
    """Return distinct values for a given device field (e.g., 'status').

    Optional `company_id` can scope values to a single company.
    """
    if field == "status":
        query = db.query(Device.fiscal_day_status).distinct()
        if company_id:
            query = query.filter(Device.company_id == company_id)
        if q:
            query = query.filter(Device.fiscal_day_status.ilike(f"%{q}%"))
        results = [r[0] for r in query.order_by(Device.fiscal_day_status).all() if r[0]]
        return results
    # Unknown field -> empty list
    return []


@router.post("", response_model=DeviceRead)
def create_device(
    payload: DeviceCreate,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    ensure_company_access(db, user, payload.company_id)
    device = Device(**payload.dict())
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.get("", response_model=list[DeviceRead])
def list_devices(
    company_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    search: str | None = None,
    status: str | None = None,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _=Depends(require_company_access),
):
    query = db.query(Device).filter(Device.company_id == company_id)
    if search:
        like = f"%{search}%"
        query = query.filter(
            Device.device_id.ilike(like)
            | Device.serial_number.ilike(like)
            | Device.model.ilike(like)
        )
    if status:
        query = query.filter(Device.fiscal_day_status == status)
    if date_from:
        query = query.filter(Device.created_at >= date_from)
    if date_to:
        query = query.filter(Device.created_at <= date_to)
    response.headers["X-Total-Count"] = str(query.count())
    return query.order_by(Device.id.desc()).offset(offset).limit(limit).all()


@router.put("/{device_id}", response_model=DeviceRead)
def update_device(
    device_id: int,
    payload: DeviceUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(device, key, value)
    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}")
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    db.delete(device)
    db.commit()
    return {"detail": "Device deleted"}


@router.post("/{device_id}/crt", response_model=DeviceRead)
def upload_crt(
    device_id: int,
    crt: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    device.crt_filename = crt.filename
    device.crt_data = crt.file.read()
    db.commit()
    db.refresh(device)
    return device


@router.post("/{device_id}/key", response_model=DeviceRead)
def upload_key(
    device_id: int,
    key: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    device.key_filename = key.filename
    device.key_data = key.file.read()
    db.commit()
    db.refresh(device)
    return device


@router.get("/{device_id}/status")
def fetch_status(device_id: int, db: Session = Depends(get_db), user=Depends(require_portal_user)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    _ensure_company_certificate(db, device.company_id)
    try:
        result = get_status(device, db)
        # Persist useful fields from FDMS response
        if "fiscalDayStatus" in result:
            raw = result["fiscalDayStatus"]
            device.fiscal_day_status = (
                "open" if raw == "FiscalDayOpened"
                else "closed" if raw in ("FiscalDayClosed", "") else raw
            )
        if "lastFiscalDayNo" in result:
            device.last_fiscal_day_no = result["lastFiscalDayNo"]
        if "lastReceiptCounter" in result:
            device.last_receipt_counter = result["lastReceiptCounter"]
        if "lastReceiptGlobalNo" in result:
            device.last_receipt_global_no = result["lastReceiptGlobalNo"]
        if "lastReceiptHash" in result:
            device.last_receipt_hash = result["lastReceiptHash"] or ""
        db.commit()
        return result
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.get("/{device_id}/config")
def fetch_config(device_id: int, db: Session = Depends(get_db), user=Depends(require_portal_user)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    _ensure_company_certificate(db, device.company_id)
    try:
        result = get_config(device, db)
        # Persist QR URL if present
        if result.get("qrUrl"):
            device.qr_url = result["qrUrl"]
            db.commit()
        return result
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/{device_id}/ping")
def ping(device_id: int, db: Session = Depends(get_db), user=Depends(require_portal_user)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    _ensure_company_certificate(db, device.company_id)
    try:
        return ping_device(device, db)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/{device_id}/register")
def register(device_id: int, db: Session = Depends(get_db), user=Depends(require_admin)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    try:
        return register_device(device, db)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/{device_id}/open-day")
def open_fiscal_day(device_id: int, db: Session = Depends(get_db), user=Depends(require_portal_user)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    _ensure_company_certificate(db, device.company_id)
    try:
        result = open_day(device, db)
        device.fiscal_day_status = result.get("fiscalDayStatus", device.fiscal_day_status)
        device.current_fiscal_day_no = result.get("currentFiscalDayNo", device.current_fiscal_day_no)
        device.last_fiscal_day_no = result.get("lastFiscalDayNo", device.last_fiscal_day_no)
        # NOTE: fiscal_day_opened_at is already set inside open_day() in fdms.py
        db.commit()
        return result
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/{device_id}/close-day")
def close_fiscal_day(device_id: int, db: Session = Depends(get_db), user=Depends(require_portal_user)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    _ensure_company_certificate(db, device.company_id)
    try:
        result = close_day(device, db)
        device.fiscal_day_status = result.get("fiscalDayStatus", device.fiscal_day_status)
        device.last_fiscal_day_no = result.get("lastFiscalDayNo", device.last_fiscal_day_no)
        db.commit()
        return result
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.get("/{device_id}/logs", response_model=list[AuditLogRead])
def get_device_logs(
    device_id: int,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Get audit/traffic logs for a specific device (portal-safe)."""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    ensure_company_access(db, user, device.company_id)
    logs = (
        db.query(AuditLog)
        .filter(
            AuditLog.resource_type == "device",
            AuditLog.resource_id == device_id,
        )
        .order_by(AuditLog.action_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return logs
