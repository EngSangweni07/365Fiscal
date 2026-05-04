from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_user_company_link, require_admin
from app.models.company import Company
from app.models.company_user import CompanyUser
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.company_user import CompanyUserCreate, CompanyUserRead
from app.security.security import hash_password

router = APIRouter(prefix="/company-users", tags=["company-users"])

DEFAULT_PORTAL_APPS = [
    "dashboard",
    "invoices",
    "purchases",
    "contacts",
    "quotations",
    "inventory",
    "pos",
    "devices",
    "reports",
    "expenses",
    "settings",
]


def normalize_portal_apps(apps: list[str] | None) -> list[str]:
    seen: list[str] = []
    for app in apps or []:
        key = str(app).strip().lower()
        if key and key in DEFAULT_PORTAL_APPS and key not in seen:
            seen.append(key)
    return seen


def serialize_portal_apps(apps: list[str] | None) -> str:
    return ",".join(normalize_portal_apps(apps))


def parse_portal_apps(value: str | None) -> list[str]:
    parsed = normalize_portal_apps((value or "").split(","))
    return parsed or DEFAULT_PORTAL_APPS.copy()


def is_portal_super_link(db: Session, company_id: int, link: CompanyUser) -> bool:
    if link.is_company_admin:
        return True
    explicit_super = (
        db.query(CompanyUser)
        .filter(
            CompanyUser.company_id == company_id,
            CompanyUser.role == "portal",
            CompanyUser.is_active == True,
            CompanyUser.is_company_admin == True,
        )
        .first()
    )
    if explicit_super:
        return explicit_super.user_id == link.user_id
    return link.role == "portal"


def ensure_portal_user_manager(
    company_id: int,
    db: Session,
    current_user: User,
) -> CompanyUser | None:
    if current_user.is_admin:
        return None
    link = get_user_company_link(db, current_user, company_id)
    if not link:
        raise HTTPException(status_code=403, detail="Company access denied")
    if not is_portal_super_link(db, company_id, link):
        raise HTTPException(status_code=403, detail="Portal super user access required")
    return link


def build_effective_apps(db: Session, company: Company, link: CompanyUser) -> list[str]:
    apps = parse_portal_apps(link.portal_apps or company.portal_apps)
    if not is_portal_super_link(db, company.id, link):
        apps = [app for app in apps if app != "settings"]
    elif "settings" not in apps:
        apps.append("settings")
    return apps


def get_active_subscription(db: Session, company_id: int) -> Subscription | None:
    subscription = (
        db.query(Subscription)
        .filter(Subscription.company_id == company_id)
        .first()
    )
    if not subscription:
        return None
    if (subscription.status or "").lower() != "active":
        return None
    if subscription.expires_at:
        expires_at = subscription.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            return None
    return subscription


def count_active_portal_users(db: Session, company_id: int, exclude_user_id: int | None = None) -> int:
    query = (
        db.query(CompanyUser)
        .join(User, User.id == CompanyUser.user_id)
        .filter(
            CompanyUser.company_id == company_id,
            CompanyUser.role == "portal",
            CompanyUser.is_active == True,
            User.is_active == True,
        )
    )
    if exclude_user_id is not None:
        query = query.filter(CompanyUser.user_id != exclude_user_id)
    return query.count()


def enforce_subscription_user_limit(
    db: Session,
    company_id: int,
    exclude_user_id: int | None = None,
) -> None:
    subscription = get_active_subscription(db, company_id)
    if not subscription or not subscription.max_users:
        return
    current_count = count_active_portal_users(db, company_id, exclude_user_id)
    if current_count >= subscription.max_users:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Portal user limit reached for this subscription. "
            ),
        )


@router.post("", response_model=CompanyUserRead, dependencies=[Depends(require_admin)])
def link_user(payload: CompanyUserCreate, db: Session = Depends(get_db)):
    link = CompanyUser(**payload.dict())
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.get("", response_model=list[CompanyUserRead], dependencies=[Depends(require_admin)])
def list_links(
    company_id: int | None = None,
    user_id: int | None = None,
    response: Response = None,
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(CompanyUser)
    if company_id is not None:
        query = query.filter(CompanyUser.company_id == company_id)
    if user_id is not None:
        query = query.filter(CompanyUser.user_id == user_id)
    total_count = query.count()
    if response is not None:
        response.headers["X-Total-Count"] = str(total_count)
    return query.order_by(CompanyUser.id.desc()).offset(offset).limit(limit).all()


@router.get("/portal-users", dependencies=[Depends(require_admin)])
def get_portal_users(company_id: int, db: Session = Depends(get_db)):
    links = db.query(CompanyUser).filter(
        CompanyUser.company_id == company_id,
        CompanyUser.role == "portal"
    ).all()
    user_ids = [link.user_id for link in links]
    if not user_ids:
        return []
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    company = db.query(Company).filter(Company.id == company_id).first()
    return [
        {
            "id": link.user_id,
            "name": users[link.user_id].name,
            "email": users[link.user_id].email,
            "is_active": users[link.user_id].is_active,
            "is_portal_super_user": is_portal_super_link(db, company_id, link),
            "portal_apps": build_effective_apps(db, company, link) if company else [],
        }
        for link in links
        if link.user_id in users
    ]


@router.get("/portal-users/manage")
def get_manageable_portal_users(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_portal_user_manager(company_id, db, current_user)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    links = db.query(CompanyUser).filter(
        CompanyUser.company_id == company_id,
        CompanyUser.role == "portal",
        CompanyUser.is_active == True,
    ).all()
    user_ids = [link.user_id for link in links]
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    return [
        {
            "id": link.user_id,
            "name": users[link.user_id].name,
            "email": users[link.user_id].email,
            "is_active": users[link.user_id].is_active,
            "is_portal_super_user": is_portal_super_link(db, company_id, link),
            "portal_apps": build_effective_apps(db, company, link),
        }
        for link in links
        if link.user_id in users
    ]


@router.post("/portal-users/manage")
def create_manageable_portal_user(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = int(payload.get("company_id") or 0)
    name = str(payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    portal_apps = normalize_portal_apps(payload.get("portal_apps"))
    ensure_portal_user_manager(company_id, db, current_user)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Name, email and password are required")

    enforce_subscription_user_limit(db, company_id)

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        existing_link = db.query(CompanyUser).filter(
            CompanyUser.company_id == company_id,
            CompanyUser.user_id == existing_user.id,
        ).first()
        if existing_link:
            raise HTTPException(status_code=400, detail="Portal user already exists for this company")
        user = existing_user
        user.name = name or user.name
        user.hashed_password = hash_password(password)
        user.is_active = True
    else:
        user = User(name=name, email=email, hashed_password=hash_password(password), is_admin=False, is_active=True)
        db.add(user)
        db.flush()

    db.add(
        CompanyUser(
            company_id=company_id,
            user_id=user.id,
            role="portal",
            is_active=True,
            is_company_admin=False,
            portal_apps=serialize_portal_apps([app for app in portal_apps if app != "settings"]),
        )
    )
    db.commit()
    return {"status": "created", "user_id": user.id, "name": user.name, "email": user.email}


@router.patch("/portal-users/manage/{user_id}")
def update_manageable_portal_user(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = int(payload.get("company_id") or 0)
    manager_link = ensure_portal_user_manager(company_id, db, current_user)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    link = db.query(CompanyUser).filter(
        CompanyUser.company_id == company_id,
        CompanyUser.user_id == user_id,
        CompanyUser.role == "portal",
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Portal user not found")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_email = payload.get("email")
    new_name = payload.get("name")
    new_password = payload.get("password")
    is_active = payload.get("is_active")
    portal_apps = payload.get("portal_apps")

    if new_name is not None:
        user.name = str(new_name).strip()
    if new_email is not None:
        email = str(new_email).strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")
        duplicate = db.query(User).filter(User.email == email, User.id != user.id).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="User with this email already exists")
        user.email = email
    if new_password:
        user.hashed_password = hash_password(str(new_password))
    if is_active is not None:
        if bool(is_active) and (not link.is_active or not user.is_active):
            enforce_subscription_user_limit(db, company_id, exclude_user_id=user.id)
        user.is_active = bool(is_active)
        link.is_active = bool(is_active)
    if portal_apps is not None:
        link.portal_apps = serialize_portal_apps(
            portal_apps if link.is_company_admin else [app for app in portal_apps if app != "settings"]
        )

    if manager_link and manager_link.user_id == user_id:
        link.is_company_admin = True
        if "settings" not in parse_portal_apps(link.portal_apps or company.portal_apps):
            link.portal_apps = serialize_portal_apps(
                parse_portal_apps(link.portal_apps or company.portal_apps) + ["settings"]
            )

    db.commit()
    return {"status": "updated"}


@router.delete("/portal-users/manage/{user_id}")
def delete_manageable_portal_user(
    user_id: int,
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    manager_link = ensure_portal_user_manager(company_id, db, current_user)
    link = db.query(CompanyUser).filter(
        CompanyUser.company_id == company_id,
        CompanyUser.user_id == user_id,
        CompanyUser.role == "portal",
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Portal user not found")
    if manager_link and manager_link.user_id == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete the portal super user")
    db.delete(link)
    db.commit()
    return {"status": "deleted"}


@router.patch("/portal-users/{user_id}/password", dependencies=[Depends(require_admin)])
def update_portal_password(user_id: int, password: str = None, db: Session = Depends(get_db)):
    if not password:
        return {"error": "Password is required"}
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(password)
    db.commit()
    return {"status": "password updated"}
