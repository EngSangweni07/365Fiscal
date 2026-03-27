from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timedelta

from app.api.deps import get_db, require_admin
from app.models.company import Company
from app.models.company_user import CompanyUser
from app.models.demo_account import DemoAccount
from app.models.role import Role
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.demo_account import (
    DemoAccountCreate,
    DemoInterestRequest,
    DemoAccountRead,
    DemoAccountUpdate,
    DemoSignupResponse,
)
from app.security.security import create_access_token, hash_password
from app.services.email import send_demo_interest_email


router = APIRouter(prefix="/demo", tags=["demo"])
DEMO_DURATION_MINUTES = 3
DEMO_INTEREST_EMAIL = "courageg@geenet.co.zw"
DEMO_PORTAL_APPS = ",".join([
    "dashboard",
    "invoices",
    "purchases",
    "contacts",
    "quotations",
    "inventory",
    "pos",
    "devices",
    "expenses",
    "reports",
    "settings",
])


@router.post("/signup", response_model=DemoSignupResponse)
def create_demo_account(
    payload: DemoAccountCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new demo account.
    Demo accounts expire after 3 minutes.
    """
    # Check if email already has an active demo account
    existing = db.query(DemoAccount).filter(
        DemoAccount.email == payload.email,
        DemoAccount.status == "active"
    ).first()
    
    if existing and not existing.is_expired():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An active demo account already exists for this email. Please wait 3 minutes before creating another."
        )

    existing_user = db.query(User).filter(User.email == payload.email).first()
    reusable_demo = (
        db.query(DemoAccount)
        .filter(DemoAccount.email == payload.email)
        .order_by(desc(DemoAccount.created_at))
        .first()
    )

    if existing_user and (not reusable_demo or reusable_demo.user_id != existing_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email already belongs to an existing account. Please use another email for the demo or log in with your existing account.",
        )

    company_admin_role = db.query(Role).filter(Role.name == "company_admin").first()
    company = None
    user = existing_user

    if reusable_demo and reusable_demo.company_id:
        company = db.query(Company).filter(Company.id == reusable_demo.company_id).first()

    if company is None:
        company = Company(
            name=payload.company_name,
            email=payload.email,
            phone=payload.phone_number,
            portal_apps=DEMO_PORTAL_APPS,
        )
        db.add(company)
        db.flush()
    else:
        company.name = payload.company_name
        company.email = payload.email
        company.phone = payload.phone_number
        company.portal_apps = DEMO_PORTAL_APPS

    if user is None:
        user = User(
            name=payload.company_name,
            email=payload.email,
            hashed_password=hash_password(f"demo-{payload.email.lower()}"),
            is_admin=False,
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        user.name = payload.company_name
        user.is_active = True

    company_link = (
        db.query(CompanyUser)
        .filter(
            CompanyUser.company_id == company.id,
            CompanyUser.user_id == user.id,
        )
        .first()
    )

    if company_link is None:
        company_link = CompanyUser(
            company_id=company.id,
            user_id=user.id,
            role="company_admin",
            role_id=company_admin_role.id if company_admin_role else None,
            is_active=True,
            is_company_admin=True,
            portal_apps=DEMO_PORTAL_APPS,
        )
        db.add(company_link)
    else:
        company_link.role = "company_admin"
        company_link.role_id = company_admin_role.id if company_admin_role else company_link.role_id
        company_link.is_active = True
        company_link.is_company_admin = True
        company_link.portal_apps = DEMO_PORTAL_APPS

    subscription = db.query(Subscription).filter(Subscription.company_id == company.id).first()
    expires_at = datetime.utcnow() + timedelta(minutes=DEMO_DURATION_MINUTES)
    if subscription is None:
        subscription = Subscription(
            company_id=company.id,
            plan="trial",
            status="active",
            starts_at=datetime.utcnow(),
            expires_at=expires_at,
            max_users=max(payload.num_users, 1),
            max_devices=2,
            max_invoices_per_month=100,
            notes="Auto-created 3-minute demo subscription.",
        )
        db.add(subscription)
    else:
        subscription.plan = "trial"
        subscription.status = "active"
        subscription.starts_at = datetime.utcnow()
        subscription.expires_at = expires_at
        subscription.max_users = max(payload.num_users, 1)
        subscription.max_devices = max(subscription.max_devices, 2)
        subscription.max_invoices_per_month = max(subscription.max_invoices_per_month, 100)
        subscription.notes = "Auto-created 3-minute demo subscription."
    
    # Create new demo account
    demo_account = DemoAccount.create_demo_account(
        company_name=payload.company_name,
        email=payload.email,
        phone_number=payload.phone_number,
        wants_zimra_fdms=payload.wants_zimra_fdms,
        num_users=payload.num_users,
        demo_duration_minutes=DEMO_DURATION_MINUTES,
    )
    demo_account.user_id = user.id
    demo_account.company_id = company.id
    
    db.add(demo_account)
    db.commit()
    db.refresh(demo_account)
    
    return {
        **serialize_demo(demo_account),
        "access_token": create_access_token(str(user.id)),
        "portal_redirect_url": "/",
    }


@router.post("/{demo_id}/confirm-interest", response_model=DemoAccountRead)
def confirm_demo_interest(
    demo_id: int,
    payload: DemoInterestRequest,
    db: Session = Depends(get_db),
):
    demo = db.query(DemoAccount).filter(DemoAccount.id == demo_id).first()

    if not demo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demo account not found",
        )

    demo.company_name = payload.company_name
    demo.phone_number = payload.phone_number
    demo.num_users = payload.num_users
    demo.wants_actual_three65 = payload.wants_actual_three65
    demo.wants_zimra_fdms = payload.wants_zimra_fdms
    demo.tin = (payload.tin or "").strip()
    demo.vat_number = (payload.vat_number or "").strip()
    demo.trade_name = (payload.trade_name or "").strip()
    demo.address = (payload.address or "").strip()

    note_parts = [
        f"Actual Three65 requested: {'Yes' if payload.wants_actual_three65 else 'No'}",
        f"Users required: {payload.num_users}",
    ]
    if payload.wants_zimra_fdms:
        note_parts.append("ZIMRA fiscalization requested")
    demo.notes = " | ".join(note_parts)

    db.commit()
    db.refresh(demo)

    send_demo_interest_email(
        to_email=DEMO_INTEREST_EMAIL,
        demo_email=demo.email,
        company_name=demo.company_name,
        phone_number=demo.phone_number,
        num_users=demo.num_users,
        wants_actual_three65=demo.wants_actual_three65,
        wants_zimra_fdms=demo.wants_zimra_fdms,
        tin=demo.tin,
        vat_number=demo.vat_number,
        trade_name=demo.trade_name,
        address=demo.address,
    )

    return serialize_demo(demo)


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
    if payload.wants_actual_three65 is not None:
        demo.wants_actual_three65 = payload.wants_actual_three65
    if payload.tin is not None:
        demo.tin = payload.tin
    if payload.vat_number is not None:
        demo.vat_number = payload.vat_number
    if payload.trade_name is not None:
        demo.trade_name = payload.trade_name
    if payload.address is not None:
        demo.address = payload.address
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
        "wants_actual_three65": demo.wants_actual_three65,
        "tin": demo.tin,
        "vat_number": demo.vat_number,
        "trade_name": demo.trade_name,
        "address": demo.address,
        "status": demo.status,
        "created_at": demo.created_at,
        "expires_at": demo.expires_at,
        "notes": demo.notes,
        "user_id": demo.user_id,
        "company_id": demo.company_id,
        "time_remaining_seconds": demo.time_remaining_seconds(),
        "is_expired": demo.is_expired(),
    }
