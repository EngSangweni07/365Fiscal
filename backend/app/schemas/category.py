from typing import Optional
from pydantic import BaseModel
from app.schemas.common import ORMBase


class CategoryCreate(BaseModel):
    company_id: int
    name: str
    income_account_id: Optional[int] = None
    expense_account_id: Optional[int] = None
    inventory_account_id: Optional[int] = None
    cogs_account_id: Optional[int] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    income_account_id: Optional[int] = None
    expense_account_id: Optional[int] = None
    inventory_account_id: Optional[int] = None
    cogs_account_id: Optional[int] = None


class CategoryRead(ORMBase):
    id: int
    company_id: int
    name: str
    income_account_id: Optional[int] = None
    expense_account_id: Optional[int] = None
    inventory_account_id: Optional[int] = None
    cogs_account_id: Optional[int] = None
