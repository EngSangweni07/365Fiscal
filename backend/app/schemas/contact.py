from pydantic import BaseModel, EmailStr
from app.schemas.common import ORMBase


class ContactCreate(BaseModel):
    company_id: int
    name: str
    address: str = ""
    vat: str = ""
    tin: str = ""
    phone: str = ""
    email: EmailStr | None = None
    reference: str = ""
    receivable_account_id: int | None = None
    payable_account_id: int | None = None


class ContactRead(ORMBase):
    id: int
    company_id: int
    name: str
    address: str
    vat: str
    tin: str
    phone: str
    email: str | None = None
    reference: str
    receivable_account_id: int | None = None
    payable_account_id: int | None = None


class ContactUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    vat: str | None = None
    tin: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    reference: str | None = None
    receivable_account_id: int | None = None
    payable_account_id: int | None = None
