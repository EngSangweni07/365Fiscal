"""API routes for accounting configuration: Chart of Accounts, Journals, Payment Terms, Fiscal Positions, Budgets."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, ensure_company_access, require_company_access
from app.models.account import (
    Account, Journal, PaymentTerm, FiscalPosition, FiscalPositionTax,
    Budget, BudgetLine,
)
from app.schemas.account import (
    AccountCreate, AccountRead, AccountUpdate,
    JournalCreate, JournalRead, JournalUpdate,
    PaymentTermCreate, PaymentTermRead, PaymentTermUpdate,
    FiscalPositionCreate, FiscalPositionRead, FiscalPositionUpdate,
    BudgetCreate, BudgetRead, BudgetUpdate,
)

router = APIRouter(prefix="/accounting", tags=["accounting"])


# ─── Chart of Accounts ────────────────────────────────
@router.get("/accounts", response_model=list[AccountRead])
def list_accounts(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    return (
        db.query(Account)
        .filter(Account.company_id == company_id)
        .order_by(Account.code)
        .all()
    )


@router.post("/accounts", response_model=AccountRead)
def create_account(
    payload: AccountCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    existing = (
        db.query(Account)
        .filter(Account.company_id == payload.company_id, Account.code == payload.code)
        .first()
    )
    if existing:
        raise HTTPException(400, "Account code already exists for this company")
    account = Account(**payload.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.patch("/accounts/{account_id}", response_model=AccountRead)
def update_account(
    account_id: int,
    payload: AccountUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    ensure_company_access(db, user, account.company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(account, k, v)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    ensure_company_access(db, user, account.company_id)
    db.delete(account)
    db.commit()
    return {"ok": True}


# ─── Journals ─────────────────────────────────────────
@router.get("/journals", response_model=list[JournalRead])
def list_journals(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    return (
        db.query(Journal)
        .filter(Journal.company_id == company_id)
        .order_by(Journal.code)
        .all()
    )


@router.post("/journals", response_model=JournalRead)
def create_journal(
    payload: JournalCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    journal = Journal(**payload.model_dump())
    db.add(journal)
    db.commit()
    db.refresh(journal)
    return journal


@router.patch("/journals/{journal_id}", response_model=JournalRead)
def update_journal(
    journal_id: int,
    payload: JournalUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    journal = db.query(Journal).filter(Journal.id == journal_id).first()
    if not journal:
        raise HTTPException(404, "Journal not found")
    ensure_company_access(db, user, journal.company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(journal, k, v)
    db.commit()
    db.refresh(journal)
    return journal


@router.delete("/journals/{journal_id}")
def delete_journal(
    journal_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    journal = db.query(Journal).filter(Journal.id == journal_id).first()
    if not journal:
        raise HTTPException(404, "Journal not found")
    ensure_company_access(db, user, journal.company_id)
    db.delete(journal)
    db.commit()
    return {"ok": True}


# ─── Payment Terms ────────────────────────────────────
@router.get("/payment-terms", response_model=list[PaymentTermRead])
def list_payment_terms(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    return (
        db.query(PaymentTerm)
        .filter(PaymentTerm.company_id == company_id)
        .order_by(PaymentTerm.name)
        .all()
    )


@router.post("/payment-terms", response_model=PaymentTermRead)
def create_payment_term(
    payload: PaymentTermCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    pt = PaymentTerm(**payload.model_dump())
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


@router.patch("/payment-terms/{term_id}", response_model=PaymentTermRead)
def update_payment_term(
    term_id: int,
    payload: PaymentTermUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    pt = db.query(PaymentTerm).filter(PaymentTerm.id == term_id).first()
    if not pt:
        raise HTTPException(404, "Payment term not found")
    ensure_company_access(db, user, pt.company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(pt, k, v)
    db.commit()
    db.refresh(pt)
    return pt


@router.delete("/payment-terms/{term_id}")
def delete_payment_term(
    term_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    pt = db.query(PaymentTerm).filter(PaymentTerm.id == term_id).first()
    if not pt:
        raise HTTPException(404, "Payment term not found")
    ensure_company_access(db, user, pt.company_id)
    db.delete(pt)
    db.commit()
    return {"ok": True}


# ─── Fiscal Positions ────────────────────────────────
@router.get("/fiscal-positions", response_model=list[FiscalPositionRead])
def list_fiscal_positions(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    return (
        db.query(FiscalPosition)
        .filter(FiscalPosition.company_id == company_id)
        .order_by(FiscalPosition.name)
        .all()
    )


@router.post("/fiscal-positions", response_model=FiscalPositionRead)
def create_fiscal_position(
    payload: FiscalPositionCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    fp = FiscalPosition(**payload.model_dump())
    db.add(fp)
    db.commit()
    db.refresh(fp)
    return fp


@router.patch("/fiscal-positions/{fp_id}", response_model=FiscalPositionRead)
def update_fiscal_position(
    fp_id: int,
    payload: FiscalPositionUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    fp = db.query(FiscalPosition).filter(FiscalPosition.id == fp_id).first()
    if not fp:
        raise HTTPException(404, "Fiscal position not found")
    ensure_company_access(db, user, fp.company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(fp, k, v)
    db.commit()
    db.refresh(fp)
    return fp


@router.delete("/fiscal-positions/{fp_id}")
def delete_fiscal_position(
    fp_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    fp = db.query(FiscalPosition).filter(FiscalPosition.id == fp_id).first()
    if not fp:
        raise HTTPException(404, "Fiscal position not found")
    ensure_company_access(db, user, fp.company_id)
    db.delete(fp)
    db.commit()
    return {"ok": True}


# ─── Budgets ─────────────────────────────────────────
@router.get("/budgets", response_model=list[BudgetRead])
def list_budgets(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_company_access),
):
    return (
        db.query(Budget)
        .filter(Budget.company_id == company_id)
        .order_by(Budget.date_from.desc())
        .all()
    )


@router.post("/budgets", response_model=BudgetRead)
def create_budget(
    payload: BudgetCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_company_access(db, user, payload.company_id)
    data = payload.model_dump(exclude={"lines"})
    budget = Budget(**data)
    db.add(budget)
    db.flush()
    for line_data in payload.lines:
        line = BudgetLine(budget_id=budget.id, **line_data.model_dump())
        db.add(line)
    db.commit()
    db.refresh(budget)
    return budget


@router.patch("/budgets/{budget_id}", response_model=BudgetRead)
def update_budget(
    budget_id: int,
    payload: BudgetUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(404, "Budget not found")
    ensure_company_access(db, user, budget.company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(budget, k, v)
    db.commit()
    db.refresh(budget)
    return budget


@router.delete("/budgets/{budget_id}")
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(404, "Budget not found")
    ensure_company_access(db, user, budget.company_id)
    db.delete(budget)
    db.commit()
    return {"ok": True}
