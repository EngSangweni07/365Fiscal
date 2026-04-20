from datetime import datetime

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, get_current_user
from app.models.company_user import CompanyUser
from app.models.user import User
from app.models.company import Company
from app.models.device import Device
from app.models.company_certificate import CompanyCertificate
from app.models.company_settings import CompanySettings
from app.models.warehouse import Warehouse
from app.models.location import Location
from app.models.tax_setting import TaxSetting
from app.models.quotation import Quotation
from app.models.quotation_line import QuotationLine
from app.models.product import Product
from app.models.invoice import Invoice
from app.models.invoice_line import InvoiceLine
from app.models.contact import Contact
from app.models.category import Category
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_order_line import PurchaseOrderLine
from app.models.subscription import Subscription, ActivationCode
from app.models.demo_account import DemoAccount
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.models.expense import Expense
from app.models.expense_category import ExpenseCategory
from app.models.payment import Payment, PaymentMethod
from app.models.pos_employee import POSEmployee
from app.models.pos_session import POSSession, POSOrder, POSOrderLine
from app.models.pos_till import POSTill
from app.models.stock_move import StockMove
from app.models.stock_quant import StockQuant
from app.models.currency import Currency, CurrencyRate
from app.schemas.company import CompanyCreate, CompanyRead, CompanyUpdate

router = APIRouter(prefix="/companies", tags=["companies"])


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
    normalized: list[str] = []
    seen: set[str] = set()
    for app in apps or []:
        key = (app or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    return normalized


def parse_portal_apps(value: str | None) -> list[str]:
    apps = normalize_portal_apps((value or "").split(","))
    return apps or DEFAULT_PORTAL_APPS.copy()


def serialize_portal_apps(apps: list[str] | None) -> str:
    return ",".join(normalize_portal_apps(apps))


def serialize_company(company: Company) -> dict:
    return {
        "id": company.id,
        "name": company.name,
        "address": company.address,
        "email": company.email,
        "phone": company.phone,
        "tin": company.tin,
        "vat": company.vat,
        "portal_apps": parse_portal_apps(company.portal_apps),
    }


def apply_company_filters(
    query,
    search: str | None,
    tin: str | None,
    tin_exact: str | None,
    tin_starts: str | None,
    tin_ends: str | None,
    vat: str | None,
    vat_exact: str | None,
    vat_starts: str | None,
    vat_ends: str | None,
    email: str | None,
    email_exact: str | None,
    email_starts: str | None,
    email_ends: str | None,
    phone: str | None,
    phone_exact: str | None,
    phone_starts: str | None,
    phone_ends: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
):
    if search:
        like = f"%{search}%"
        query = query.filter(
            Company.name.ilike(like)
            | Company.address.ilike(like)
            | Company.email.ilike(like)
            | Company.phone.ilike(like)
            | Company.tin.ilike(like)
            | Company.vat.ilike(like)
        )
    if tin:
        query = query.filter(Company.tin.ilike(f"%{tin}%"))
    if tin_exact:
        query = query.filter(Company.tin == tin_exact)
    if tin_starts:
        query = query.filter(Company.tin.ilike(f"{tin_starts}%"))
    if tin_ends:
        query = query.filter(Company.tin.ilike(f"%{tin_ends}"))

    if vat:
        query = query.filter(Company.vat.ilike(f"%{vat}%"))
    if vat_exact:
        query = query.filter(Company.vat == vat_exact)
    if vat_starts:
        query = query.filter(Company.vat.ilike(f"{vat_starts}%"))
    if vat_ends:
        query = query.filter(Company.vat.ilike(f"%{vat_ends}"))

    if email:
        query = query.filter(Company.email.ilike(f"%{email}%"))
    if email_exact:
        query = query.filter(Company.email == email_exact)
    if email_starts:
        query = query.filter(Company.email.ilike(f"{email_starts}%"))
    if email_ends:
        query = query.filter(Company.email.ilike(f"%{email_ends}"))

    if phone:
        query = query.filter(Company.phone.ilike(f"%{phone}%"))
    if phone_exact:
        query = query.filter(Company.phone == phone_exact)
    if phone_starts:
        query = query.filter(Company.phone.ilike(f"{phone_starts}%"))
    if phone_ends:
        query = query.filter(Company.phone.ilike(f"%{phone_ends}"))

    if date_from:
        query = query.filter(Company.created_at >= date_from)
    if date_to:
        query = query.filter(Company.created_at <= date_to)
    return query


@router.get("/values")
def list_company_values(field: str, q: str | None = None, db: Session = Depends(get_db)):
    """Return distinct values for a given company field (e.g., 'name', 'tin')."""
    if field == "name":
        query = db.query(Company.name.distinct())
        if q:
            query = query.filter(Company.name.ilike(f"%{q}%"))
        return [r[0] for r in query.order_by(Company.name).all() if r[0]]
    if field == "tin":
        query = db.query(Company.tin.distinct())
        if q:
            query = query.filter(Company.tin.ilike(f"%{q}%"))
        return [r[0] for r in query.order_by(Company.tin).all() if r[0]]
    return []


@router.post("", response_model=CompanyRead, dependencies=[Depends(require_admin)])
def create_company(payload: CompanyCreate, db: Session = Depends(get_db)):
    company = Company(
        name=payload.name,
        address=payload.address,
        email=payload.email or "",
        phone=payload.phone,
        tin=payload.tin,
        vat=payload.vat,
        portal_apps=serialize_portal_apps(payload.portal_apps),
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return serialize_company(company)


@router.patch("/{company_id}", response_model=CompanyRead, dependencies=[Depends(require_admin)])
def update_company(company_id: int, payload: CompanyUpdate, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "portal_apps":
            company.portal_apps = serialize_portal_apps(value)
        else:
            setattr(company, field, value)
    # Sync portal_apps to all associated CompanyUser links
    if "portal_apps" in payload.model_dump(exclude_unset=True):
        db.query(CompanyUser).filter(
            CompanyUser.company_id == company_id,
        ).update({"portal_apps": company.portal_apps})
    db.commit()
    db.refresh(company)
    return serialize_company(company)


@router.delete("/{company_id}", dependencies=[Depends(require_admin)])
def delete_company(company_id: int, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    quotation_ids = [q.id for q in db.query(Quotation.id).filter(Quotation.company_id == company_id).all()]
    invoice_ids = [i.id for i in db.query(Invoice.id).filter(Invoice.company_id == company_id).all()]
    purchase_order_ids = [
        p.id for p in db.query(PurchaseOrder.id).filter(PurchaseOrder.company_id == company_id).all()
    ]
    pos_order_ids = [o.id for o in db.query(POSOrder.id).filter(POSOrder.company_id == company_id).all()]
    pos_session_ids = [s.id for s in db.query(POSSession.id).filter(POSSession.company_id == company_id).all()]
    warehouse_ids = [w.id for w in db.query(Warehouse.id).filter(Warehouse.company_id == company_id).all()]

    # Delete all associated records first (order matters due to FK constraints)
    if quotation_ids:
        db.query(QuotationLine).filter(QuotationLine.quotation_id.in_(quotation_ids)).delete(synchronize_session=False)
    if invoice_ids:
        db.query(InvoiceLine).filter(InvoiceLine.invoice_id.in_(invoice_ids)).delete(synchronize_session=False)
    if purchase_order_ids:
        db.query(PurchaseOrderLine).filter(
            PurchaseOrderLine.purchase_order_id.in_(purchase_order_ids)
        ).delete(synchronize_session=False)
    if pos_order_ids:
        db.query(POSOrderLine).filter(POSOrderLine.order_id.in_(pos_order_ids)).delete(synchronize_session=False)
    if pos_session_ids:
        db.query(POSOrder).filter(POSOrder.session_id.in_(pos_session_ids)).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.company_id == company_id).delete(synchronize_session=False)
    db.query(AuditLog).filter(AuditLog.company_id == company_id).delete(synchronize_session=False)
    db.query(ActivationCode).filter(ActivationCode.company_id == company_id).delete(synchronize_session=False)
    db.query(DemoAccount).filter(DemoAccount.company_id == company_id).delete(synchronize_session=False)
    db.query(Subscription).filter(Subscription.company_id == company_id).delete(synchronize_session=False)
    db.query(CompanySettings).filter(CompanySettings.company_id == company_id).delete(synchronize_session=False)
    db.query(Payment).filter(Payment.company_id == company_id).delete(synchronize_session=False)
    db.query(PaymentMethod).filter(PaymentMethod.company_id == company_id).delete(synchronize_session=False)
    db.query(Expense).filter(Expense.company_id == company_id).delete(synchronize_session=False)
    db.query(ExpenseCategory).filter(ExpenseCategory.company_id == company_id).delete(synchronize_session=False)
    db.query(StockMove).filter(StockMove.company_id == company_id).delete(synchronize_session=False)
    db.query(StockQuant).filter(StockQuant.company_id == company_id).delete(synchronize_session=False)
    db.query(CurrencyRate).filter(CurrencyRate.company_id == company_id).delete(synchronize_session=False)
    db.query(Currency).filter(Currency.company_id == company_id).delete(synchronize_session=False)
    db.query(POSEmployee).filter(POSEmployee.company_id == company_id).delete(synchronize_session=False)
    db.query(POSTill).filter(POSTill.company_id == company_id).delete(synchronize_session=False)
    db.query(POSSession).filter(POSSession.company_id == company_id).delete(synchronize_session=False)
    db.query(PurchaseOrder).filter(PurchaseOrder.company_id == company_id).delete(synchronize_session=False)
    db.query(Invoice).filter(Invoice.company_id == company_id).delete(synchronize_session=False)
    db.query(Quotation).filter(Quotation.company_id == company_id).delete()
    db.query(Product).filter(Product.company_id == company_id).delete()
    db.query(Contact).filter(Contact.company_id == company_id).delete()
    db.query(Category).filter(Category.company_id == company_id).delete()
    if warehouse_ids:
        db.query(Location).filter(Location.warehouse_id.in_(warehouse_ids)).delete(synchronize_session=False)
    db.query(Device).filter(Device.company_id == company_id).delete(synchronize_session=False)
    db.query(Warehouse).filter(Warehouse.company_id == company_id).delete()
    db.query(TaxSetting).filter(TaxSetting.company_id == company_id).delete()
    db.query(CompanyCertificate).filter(CompanyCertificate.company_id == company_id).delete()
    db.query(CompanyUser).filter(CompanyUser.company_id == company_id).delete(synchronize_session=False)
    db.delete(company)
    db.commit()
    return {"detail": "Company deleted"}


@router.get("", response_model=list[CompanyRead], dependencies=[Depends(require_admin)])
def list_companies(
    db: Session = Depends(get_db),
    search: str | None = None,
    tin: str | None = None,
    tin_exact: str | None = None,
    tin_starts: str | None = None,
    tin_ends: str | None = None,
    vat: str | None = None,
    vat_exact: str | None = None,
    vat_starts: str | None = None,
    vat_ends: str | None = None,
    email: str | None = None,
    email_exact: str | None = None,
    email_starts: str | None = None,
    email_ends: str | None = None,
    phone: str | None = None,
    phone_exact: str | None = None,
    phone_starts: str | None = None,
    phone_ends: str | None = None,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
):
    query = db.query(Company)
    query = apply_company_filters(
        query,
        search,
        tin,
        tin_exact,
        tin_starts,
        tin_ends,
        vat,
        vat_exact,
        vat_starts,
        vat_ends,
        email,
        email_exact,
        email_starts,
        email_ends,
        phone,
        phone_exact,
        phone_starts,
        phone_ends,
        date_from,
        date_to,
    )
    return [serialize_company(company) for company in query.all()]


@router.get("/me", response_model=list[CompanyRead])
def list_my_companies(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    search: str | None = None,
    tin: str | None = None,
    tin_exact: str | None = None,
    tin_starts: str | None = None,
    tin_ends: str | None = None,
    vat: str | None = None,
    vat_exact: str | None = None,
    vat_starts: str | None = None,
    vat_ends: str | None = None,
    email: str | None = None,
    email_exact: str | None = None,
    email_starts: str | None = None,
    email_ends: str | None = None,
    phone: str | None = None,
    phone_exact: str | None = None,
    phone_starts: str | None = None,
    phone_ends: str | None = None,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
):
    if user.is_admin:
        query = db.query(Company)
        query = apply_company_filters(
            query,
            search,
            tin,
            tin_exact,
            tin_starts,
            tin_ends,
            vat,
            vat_exact,
            vat_starts,
            vat_ends,
            email,
            email_exact,
            email_starts,
            email_ends,
            phone,
            phone_exact,
            phone_starts,
            phone_ends,
            date_from,
            date_to,
        )
        return query.all()
    company_ids = [
        link.company_id
        for link in db.query(CompanyUser).filter(CompanyUser.user_id == user.id, CompanyUser.is_active == True).all()
    ]
    if not company_ids:
        return []
    query = db.query(Company).filter(Company.id.in_(company_ids))
    query = apply_company_filters(
        query,
        search,
        tin,
        tin_exact,
        tin_starts,
        tin_ends,
        vat,
        vat_exact,
        vat_starts,
        vat_ends,
        email,
        email_exact,
        email_starts,
        email_ends,
        phone,
        phone_exact,
        phone_starts,
        phone_ends,
        date_from,
        date_to,
    )
    return [serialize_company(company) for company in query.all()]


@router.get("/{company_id}/portal-user")
def get_portal_user(company_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Get the portal user linked to a company."""
    link = db.query(CompanyUser).filter(
        CompanyUser.company_id == company_id,
        CompanyUser.role == "portal",
        CompanyUser.is_active == True,
    ).first()
    if not link:
        return {"user_id": None, "email": None}
    user = db.query(User).filter(User.id == link.user_id).first()
    if not user:
        return {"user_id": None, "email": None}
    return {"user_id": user.id, "email": user.email}


@router.patch("/{company_id}/portal-user")
def update_portal_user(
    company_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Update or create the portal user for a company."""
    from app.security.security import hash_password

    email = payload.get("email")
    password = payload.get("password")

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    # Check if company exists
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Find existing portal link
    link = db.query(CompanyUser).filter(
        CompanyUser.company_id == company_id,
        CompanyUser.role == "portal",
    ).first()

    def apply_portal_link(target_link: CompanyUser, target_user: User) -> None:
        target_link.user_id = target_user.id
        target_link.role = "portal"
        target_link.is_active = True
        target_link.is_company_admin = True
        target_link.portal_apps = company.portal_apps or ""

    if link:
        # Update existing user
        user = db.query(User).filter(User.id == link.user_id).first()
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user and (not user or existing_user.id != user.id):
            existing_company_link = db.query(CompanyUser).filter(
                CompanyUser.company_id == company_id,
                CompanyUser.user_id == existing_user.id,
            ).first()
            if existing_company_link and existing_company_link.id != link.id:
                db.delete(link)
                link = existing_company_link
            user = existing_user
            if password:
                user.hashed_password = hash_password(password)
            apply_portal_link(link, user)
        elif user:
            user.email = email
            if password:
                user.hashed_password = hash_password(password)
            apply_portal_link(link, user)
        else:
            # Create new user and update link
            user = User(email=email, hashed_password=hash_password(password or "changeme"), is_admin=False)
            db.add(user)
            db.flush()
            apply_portal_link(link, user)
    else:
        # Check if user with this email exists
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(email=email, hashed_password=hash_password(password or "changeme"), is_admin=False)
            db.add(user)
            db.flush()
        elif password:
            user.hashed_password = hash_password(password)
        existing_company_link = db.query(CompanyUser).filter(
            CompanyUser.company_id == company_id,
            CompanyUser.user_id == user.id,
        ).first()
        if existing_company_link:
            apply_portal_link(existing_company_link, user)
        else:
            # Create link
            db.add(
                CompanyUser(
                    company_id=company_id,
                    user_id=user.id,
                    role="portal",
                    is_active=True,
                    is_company_admin=True,
                    portal_apps=company.portal_apps or "",
                )
            )

    db.commit()
    return {"user_id": user.id, "email": user.email}
