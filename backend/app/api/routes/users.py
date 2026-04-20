from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, get_current_user
from app.models.company_user import CompanyUser
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.security.security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


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


def parse_portal_apps(value: str | None) -> list[str]:
    apps = [item.strip().lower() for item in (value or "").split(",") if item.strip()]
    return apps or DEFAULT_PORTAL_APPS.copy()


def is_portal_super_user_link(
    db: Session,
    company_id: int,
    link: CompanyUser | None,
) -> bool:
    if not link:
        return False
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


@router.get("/me")
def read_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models.company import Company
    links = db.query(CompanyUser).filter(CompanyUser.user_id == user.id, CompanyUser.is_active == True).all()
    company_ids = [link.company_id for link in links]
    companies = db.query(Company).filter(Company.id.in_(company_ids)).all() if company_ids else []
    link_by_company = {link.company_id: link for link in links}
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "is_admin": user.is_admin,
        "company_ids": company_ids,
        "companies": [
            {
                "id": c.id,
                "name": c.name,
                "tin": c.tin,
                "vat": c.vat,
                "email": c.email,
                "phone": c.phone,
                "address": c.address,
                "portal_apps": parse_portal_apps(c.portal_apps),
                "user_portal_apps": [
                    app
                    for app in parse_portal_apps(c.portal_apps)
                    if link_by_company.get(c.id) is None
                    or is_portal_super_user_link(db, c.id, link_by_company.get(c.id))
                    or app != "settings"
                ],
                "is_portal_super_user": is_portal_super_user_link(
                    db, c.id, link_by_company.get(c.id)
                ),
            }
            for c in companies
        ],
    }


@router.post("", response_model=UserRead, dependencies=[Depends(require_admin)])
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        is_admin=payload.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("", response_model=list[UserRead], dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@router.patch("/{user_id}", response_model=UserRead, dependencies=[Depends(require_admin)])
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.email is not None:
        user.email = payload.email
    if payload.name is not None:
        user.name = payload.name
    if payload.password is not None:
        user.hashed_password = hash_password(payload.password)
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
    if payload.is_active is not None:
        user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", dependencies=[Depends(require_admin)])
def delete_user(user_id: int, db: Session = Depends(get_db), current=Depends(get_current_user)):
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"status": "deleted"}
