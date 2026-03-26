from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.api.deps import get_db, require_admin
from app.models.demo_account import DemoAccount
from app.schemas.demo_account import DemoAccountCreate, DemoAccountRead, DemoAccountUpdate


router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/signup", response_model=DemoAccountRead)
def create_demo_account(
    payload: DemoAccountCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new demo account.
    Demo accounts expire after 30 minutes.
    """
    # Check if email already has an active demo account
    existing = db.query(DemoAccount).filter(
        DemoAccount.email == payload.email,
        DemoAccount.status == "active"
    ).first()
    
    if existing and not existing.is_expired():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An active demo account already exists for this email. Please wait 30 minutes before creating another."
        )
    
    # Create new demo account
    demo_account = DemoAccount.create_demo_account(
        company_name=payload.company_name,
        email=payload.email,
        phone_number=payload.phone_number,
        wants_zimra_fdms=payload.wants_zimra_fdms,
        num_users=payload.num_users,
        demo_duration_minutes=30
    )
    
    db.add(demo_account)
    db.commit()
    db.refresh(demo_account)
    
    return serialize_demo(demo_account)


@router.get("/{demo_id}", response_model=DemoAccountRead)
def get_demo_account(
    demo_id: int,
    db: Session = Depends(get_db)
):
    """
    Get demo account details by ID.
    """
    demo = db.query(DemoAccount).filter(DemoAccount.id == demo_id).first()
    
    if not demo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demo account not found"
        )
    
    # Update status if expired
    if demo.is_expired() and demo.status == "active":
        demo.status = "expired"
        db.commit()
    
    return serialize_demo(demo)


@router.get("/status/{demo_id}")
def get_demo_status(
    demo_id: int,
    db: Session = Depends(get_db)
):
    """
    Get demo account status with countdown timer information.
    """
    demo = db.query(DemoAccount).filter(DemoAccount.id == demo_id).first()
    
    if not demo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demo account not found"
        )
    
    # Update status if expired
    if demo.is_expired() and demo.status == "active":
        demo.status = "expired"
        db.commit()
    
    return {
        "id": demo.id,
        "status": demo.status,
        "is_expired": demo.is_expired(),
        "time_remaining_seconds": demo.time_remaining_seconds(),
        "expires_at": demo.expires_at,
        "company_name": demo.company_name
    }


@router.get("", response_model=list[DemoAccountRead])
def list_demo_accounts(
    skip: int = 0,
    limit: int = 100,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    """
    List all demo accounts (used for Leads app).
    Can be filtered by status (active, expired, converted).
    """
    query = db.query(DemoAccount).order_by(desc(DemoAccount.created_at))
    
    if status_filter:
        query = query.filter(DemoAccount.status == status_filter)
    
    demos = query.offset(skip).limit(limit).all()
    
    # Auto-expire any that should be expired
    for demo in demos:
        if demo.is_expired() and demo.status == "active":
            demo.status = "expired"
    
    db.commit()
    
    return [serialize_demo(demo) for demo in demos]


@router.patch("/{demo_id}", response_model=DemoAccountRead)
def update_demo_account(
    demo_id: int,
    payload: DemoAccountUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    """
    Update demo account (mainly for admin to update notes or status).
    """
    demo = db.query(DemoAccount).filter(DemoAccount.id == demo_id).first()
    
    if not demo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demo account not found"
        )
    
    if payload.company_name is not None:
        demo.company_name = payload.company_name
    if payload.email is not None:
        demo.email = payload.email
    if payload.phone_number is not None:
        demo.phone_number = payload.phone_number
    if payload.wants_zimra_fdms is not None:
        demo.wants_zimra_fdms = payload.wants_zimra_fdms
    if payload.num_users is not None:
        demo.num_users = payload.num_users
    if payload.status is not None:
        demo.status = payload.status
    if payload.notes is not None:
        demo.notes = payload.notes
    
    db.commit()
    db.refresh(demo)
    
    return serialize_demo(demo)


def serialize_demo(demo: DemoAccount) -> dict:
    return {
        "id": demo.id,
        "company_name": demo.company_name,
        "email": demo.email,
        "phone_number": demo.phone_number,
        "wants_zimra_fdms": demo.wants_zimra_fdms,
        "num_users": demo.num_users,
        "status": demo.status,
        "created_at": demo.created_at,
        "expires_at": demo.expires_at,
        "notes": demo.notes,
        "time_remaining_seconds": demo.time_remaining_seconds(),
        "is_expired": demo.is_expired(),
    }
