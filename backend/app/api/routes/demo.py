from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timedelta
import secrets
from urllib.parse import urlsplit

from app.api.deps import get_db, require_admin
from app.models.company import Company
from app.models.company_user import CompanyUser
from app.models.company_settings import CompanySettings
from app.models.demo_account import DemoAccount
from app.models.role import Role
from app.models.subscription import ActivationCode, Subscription
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
DEMO_DURATION_SECONDS = 30
DEMO_INTEREST_EMAIL = "courageg@geenet.co.zw"
DEMO_INTERNAL_CC = ["support@geenet.co.zw", "info@geenet.co.zw", DEMO_INTEREST_EMAIL]
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


def normalize_requested_apps(requested_apps: list[str] | None) -> list[str]:
    allowed = [item.strip() for item in DEMO_PORTAL_APPS.split(",") if item.strip()]
    allowed_set = set(allowed)
    cleaned: list[str] = []
    for item in requested_apps or []:
        key = str(item).strip().lower()
        if key in allowed_set and key not in cleaned:
            cleaned.append(key)
    return cleaned


def parse_requested_apps(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def build_portal_apps(requested_apps: list[str] | None) -> list[str]:
    apps = ["dashboard"]
    for item in requested_apps or []:
        if item not in apps:
            apps.append(item)
    if "settings" not in apps:
        apps.append("settings")
    return apps


def generate_portal_password() -> str:
    return f"Three65@{secrets.token_hex(3).upper()}"


def generate_activation_code_value(length: int = 16) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    raw = "".join(secrets.choice(alphabet) for _ in range(length))
    return "-".join(raw[i : i + 4] for i in range(0, len(raw), 4))


def build_login_link(payment_link: str | None) -> str:
    raw = (payment_link or "").strip()
    if not raw:
        return "/login"
    parts = urlsplit(raw)
    if parts.scheme and parts.netloc:
        return f"{parts.scheme}://{parts.netloc}/login"
    return "/login"


@router.post("/signup", response_model=DemoSignupResponse)
def create_demo_account(
    payload: DemoAccountCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new demo account.
    Demo accounts expire after 30 seconds.
    """
    # Check if email already has an active demo account
    existing = db.query(DemoAccount).filter(
        DemoAccount.email == payload.email,
        DemoAccount.status == "active"
    ).first()
    
    if existing and not existing.is_expired():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An active demo account already exists for this email. Please wait 30 seconds before creating another."
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
    expires_at = datetime.utcnow() + timedelta(seconds=DEMO_DURATION_SECONDS)
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
            notes="Auto-created 30-second demo subscription.",
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
        subscription.notes = "Auto-created 30-second demo subscription."
    
    # Create new demo account
    demo_account = DemoAccount.create_demo_account(
        company_name=payload.company_name,
        email=payload.email,
        phone_number=payload.phone_number,
        wants_zimra_fdms=payload.wants_zimra_fdms,
        num_users=payload.num_users,
        demo_duration_seconds=DEMO_DURATION_SECONDS,
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

    company = db.query(Company).filter(Company.id == demo.company_id).first() if demo.company_id else None
    user = db.query(User).filter(User.id == demo.user_id).first() if demo.user_id else None
    if company is None or user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Demo account is not linked to a company or user.",
        )

    demo.company_name = payload.company_name
    demo.phone_number = payload.phone_number
    demo.num_users = payload.num_users
    demo.wants_actual_three65 = payload.wants_actual_three65
    requested_apps = normalize_requested_apps(payload.requested_apps)
    demo.requested_apps = ",".join(requested_apps)
    demo.subscription_period = payload.subscription_period
    demo.payment_link = (payload.payment_link or "").strip()
    demo.wants_zimra_fdms = payload.wants_zimra_fdms
    demo.tin = (payload.tin or "").strip()
    demo.vat_number = (payload.vat_number or "").strip()
    demo.trade_name = (payload.trade_name or "").strip()
    demo.address = (payload.address or "").strip()
    demo.status = "converted"

    portal_apps = build_portal_apps(requested_apps)
    portal_apps_csv = ",".join(portal_apps)
    portal_password = generate_portal_password()
    subscription_days = 365 if payload.subscription_period == "yearly" else 30
    now = datetime.utcnow()
    subscription_expires_at = now + timedelta(days=subscription_days)
    login_link = build_login_link(demo.payment_link)

    company.name = payload.company_name
    company.email = demo.email
    company.phone = payload.phone_number
    company.address = demo.address
    company.tin = demo.tin
    company.vat = demo.vat_number
    company.portal_apps = portal_apps_csv

    company_settings = (
        db.query(CompanySettings)
        .filter(CompanySettings.company_id == company.id)
        .first()
    )
    if company_settings is None:
        company_settings = CompanySettings(company_id=company.id)
        db.add(company_settings)
    else:
        company_settings.company_id = company.id

    user.name = payload.company_name
    user.email = demo.email
    user.hashed_password = hash_password(portal_password)
    user.is_active = True

    company_admin_role = db.query(Role).filter(Role.name == "company_admin").first()
    company_link = (
        db.query(CompanyUser)
        .filter(CompanyUser.company_id == company.id, CompanyUser.user_id == user.id)
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
            portal_apps=portal_apps_csv,
        )
        db.add(company_link)
    else:
        company_link.role = "company_admin"
        company_link.role_id = company_admin_role.id if company_admin_role else company_link.role_id
        company_link.is_active = True
        company_link.is_company_admin = True
        company_link.portal_apps = portal_apps_csv

    subscription = company.subscription
    if subscription is None:
        subscription = (
            db.query(Subscription)
            .filter(Subscription.company_id == company.id)
            .order_by(desc(Subscription.id))
            .first()
        )
    if subscription is None:
        subscription = Subscription(
            company_id=company.id,
            plan="starter",
            status="active",
            starts_at=now,
            expires_at=subscription_expires_at,
            max_users=max(payload.num_users, 1),
            max_devices=2,
            max_invoices_per_month=1000,
            notes="Created from Three65 demo follow-up form.",
        )
        db.add(subscription)
    else:
        subscription.plan = "starter"
        subscription.status = "active"
        subscription.starts_at = now
        subscription.expires_at = subscription_expires_at
        subscription.max_users = max(payload.num_users, 1)
        subscription.max_devices = max(subscription.max_devices, 2)
        subscription.max_invoices_per_month = max(subscription.max_invoices_per_month, 1000)
        subscription.notes = "Created from Three65 demo follow-up form."
        subscription.company_id = company.id

    activation_code_value = generate_activation_code_value()
    while db.query(ActivationCode).filter(ActivationCode.code == activation_code_value).first():
        activation_code_value = generate_activation_code_value()

    activation_code = ActivationCode(
        code=activation_code_value,
        company_id=company.id,
        plan="starter",
        duration_days=subscription_days,
        max_users=max(payload.num_users, 1),
        max_devices=2,
        max_invoices_per_month=1000,
        expires_at=now + timedelta(days=30),
    )
    db.add(activation_code)

    note_parts = [
        f"Actual Three65 requested: {'Yes' if payload.wants_actual_three65 else 'No'}",
        f"Subscription period: {payload.subscription_period}",
        f"Users required: {payload.num_users}",
        f"Subscription code: {activation_code_value}",
    ]
    if requested_apps:
        note_parts.append(f"Apps: {', '.join(requested_apps)}")
    if payload.wants_zimra_fdms:
        note_parts.append("ZIMRA fiscalization requested")
    demo.notes = " | ".join(note_parts)

    db.commit()
    db.refresh(demo)

    send_demo_interest_email(
        to_email=demo.email,
        demo_email=demo.email,
        company_name=demo.company_name,
        phone_number=demo.phone_number,
        num_users=demo.num_users,
        wants_actual_three65=demo.wants_actual_three65,
        requested_apps=portal_apps,
        subscription_period=demo.subscription_period,
        activation_code=activation_code_value,
        payment_link=demo.payment_link,
        login_link=login_link,
        portal_username=demo.email,
        portal_password=portal_password,
        wants_zimra_fdms=demo.wants_zimra_fdms,
        tin=demo.tin,
        vat_number=demo.vat_number,
        trade_name=demo.trade_name,
        address=demo.address,
        cc_emails=DEMO_INTERNAL_CC,
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
    if payload.requested_apps is not None:
        demo.requested_apps = ",".join(normalize_requested_apps(payload.requested_apps))
    if payload.subscription_period is not None:
        demo.subscription_period = payload.subscription_period
    if payload.payment_link is not None:
        demo.payment_link = payload.payment_link
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
        "requested_apps": parse_requested_apps(demo.requested_apps),
        "subscription_period": demo.subscription_period,
        "payment_link": demo.payment_link,
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
