from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, ensure_company_access, require_company_access, require_portal_user
from app.models.expense import Expense
from app.models.contact import Contact
from app.schemas.expense import ExpenseCreate, ExpenseRead, ExpenseUpdate
from app.services.accounting import post_expense_entry

router = APIRouter(prefix="/expenses", tags=["expenses"])


def next_expense_reference(db: Session, prefix: str = "EXP") -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    full_prefix = f"{prefix}-{today}-"
    count = db.query(Expense).filter(Expense.reference.like(f"{full_prefix}%")).count()
    return f"{full_prefix}{count + 1:04d}"


def recalc_amounts(exp: Expense) -> None:
    subtotal = float(exp.subtotal or 0)
    vat_rate = float(exp.vat_rate or 0)
    tax = subtotal * (vat_rate / 100.0)
    exp.tax_amount = tax
    exp.total_amount = subtotal + tax


@router.get("", response_model=list[ExpenseRead])
def list_expenses(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
    supplier_id: int | None = None,
    search: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    currency: str | None = None,
    limit: int = Query(200, le=500),
    offset: int = 0,
):
    ensure_company_access(db, user, company_id)

    q = db.query(Expense).filter(Expense.company_id == company_id)
    if supplier_id:
        q = q.filter(Expense.supplier_id == supplier_id)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (Expense.reference.ilike(like))
            | (Expense.description.ilike(like))
            | (Expense.category.ilike(like))
        )
    if start_date:
        q = q.filter(Expense.expense_date >= start_date)
    if end_date:
        q = q.filter(Expense.expense_date <= end_date)
    if currency:
        cur = currency.strip().upper()
        codes = [cur]
        if cur in {"ZWG", "ZWL"}:
            codes = ["ZWG", "ZWL"]
        q = q.filter(Expense.currency.in_(codes))

    return (
        q.order_by(Expense.expense_date.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post("", response_model=ExpenseRead)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)

    if payload.supplier_id:
        supplier = db.query(Contact).filter(Contact.id == payload.supplier_id).first()
        if not supplier or supplier.company_id != payload.company_id:
            raise HTTPException(status_code=400, detail="Invalid supplier")

    reference = payload.reference or next_expense_reference(db)

    exp = Expense(
        company_id=payload.company_id,
        supplier_id=payload.supplier_id,
        reference=reference,
        expense_date=payload.expense_date or datetime.utcnow(),
        description=payload.description,
        category=payload.category,
        subtotal=payload.subtotal,
        vat_rate=payload.vat_rate,
        currency=payload.currency,
        status=payload.status,
        notes=payload.notes,
        created_by_id=user.id,
    )
    recalc_amounts(exp)

    db.add(exp)
    db.flush()
    if exp.status == "posted":
        post_expense_entry(db, exp)
    db.commit()
    db.refresh(exp)
    return exp


@router.get("/{expense_id}", response_model=ExpenseRead)
def get_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    ensure_company_access(db, user, exp.company_id)
    return exp


@router.patch("/{expense_id}", response_model=ExpenseRead)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    ensure_company_access(db, user, exp.company_id)

    updates = payload.dict(exclude_unset=True)

    if "supplier_id" in updates and updates["supplier_id"]:
        supplier = db.query(Contact).filter(Contact.id == updates["supplier_id"]).first()
        if not supplier or supplier.company_id != exp.company_id:
            raise HTTPException(status_code=400, detail="Invalid supplier")

    for field, value in updates.items():
        setattr(exp, field, value)

    if "subtotal" in updates or "vat_rate" in updates:
        recalc_amounts(exp)
    if exp.status == "posted":
        post_expense_entry(db, exp, replace_existing=True)

    db.commit()
    db.refresh(exp)
    return exp


@router.delete("/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    ensure_company_access(db, user, exp.company_id)

    db.delete(exp)
    db.commit()
    return None
