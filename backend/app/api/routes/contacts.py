import csv
import io
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, ensure_company_access, require_company_access, require_portal_user
from app.models.contact import Contact
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.pos_session import POSOrder
from app.models.purchase_order import PurchaseOrder
from app.models.quotation import Quotation
from app.schemas.contact import ContactCreate, ContactRead, ContactUpdate

router = APIRouter(prefix="/contacts", tags=["contacts"])


class BatchContactIds(BaseModel):
    ids: List[int]


def get_contact_usage_reason(db: Session, contact_id: int) -> str | None:
    purchase = (
        db.query(PurchaseOrder.reference)
        .filter(PurchaseOrder.supplier_id == contact_id)
        .first()
    )
    if purchase:
        return f"it is used on purchase order {purchase.reference}"

    invoice = (
        db.query(Invoice.reference)
        .filter(Invoice.customer_id == contact_id)
        .first()
    )
    if invoice:
        return f"it is used on invoice {invoice.reference}"

    quotation = (
        db.query(Quotation.reference)
        .filter(Quotation.customer_id == contact_id)
        .first()
    )
    if quotation:
        return f"it is used on quotation {quotation.reference}"

    pos_order = (
        db.query(POSOrder.reference)
        .filter(POSOrder.customer_id == contact_id)
        .first()
    )
    if pos_order:
        return f"it is used on POS order {pos_order.reference}"

    payment = (
        db.query(Payment.reference)
        .filter(Payment.contact_id == contact_id)
        .first()
    )
    if payment:
        return f"it is used on payment {payment.reference}"

    return None


@router.post("", response_model=ContactRead)
def create_contact(
    payload: ContactCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    contact = Contact(**payload.dict())
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.get("", response_model=list[ContactRead])
def list_contacts(
    company_id: int,
    response: Response,
    search: str | None = None,
    contact_type: str | None = None,
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
):
    query = db.query(Contact).filter(Contact.company_id == company_id)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            Contact.name.ilike(like)
            | Contact.email.ilike(like)
            | Contact.phone.ilike(like)
            | Contact.reference.ilike(like)
            | Contact.tin.ilike(like)
            | Contact.vat.ilike(like)
        )
    if contact_type == "company":
        query = query.filter((Contact.vat != "") | (Contact.tin != ""))
    elif contact_type == "personal":
        query = query.filter((Contact.vat == "") & (Contact.tin == ""))
    response.headers["X-Total-Count"] = str(query.count())
    return query.order_by(Contact.name).offset(offset).limit(limit).all()


@router.post("/batch-delete")
def batch_delete_contacts(
    payload: BatchContactIds,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Delete multiple contacts by IDs."""
    contacts = db.query(Contact).filter(Contact.id.in_(payload.ids)).all()
    if not contacts:
        raise HTTPException(status_code=404, detail="No contacts found")
    for contact in contacts:
        ensure_company_access(db, user, contact.company_id)
        reason = get_contact_usage_reason(db, contact.id)
        if reason:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete contact '{contact.name}' because {reason}.",
            )
    for contact in contacts:
        db.delete(contact)
    db.commit()
    return {"deleted": len(contacts)}


@router.post("/export-csv")
def export_contacts_csv(
    payload: BatchContactIds,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Export selected contacts as CSV."""
    contacts = db.query(Contact).filter(Contact.id.in_(payload.ids)).all()
    if not contacts:
        raise HTTPException(status_code=404, detail="No contacts found")
    for contact in contacts:
        ensure_company_access(db, user, contact.company_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "VAT", "TIN", "Phone", "Email", "Address", "Reference"])
    for c in contacts:
        writer.writerow([c.name, c.vat, c.tin, c.phone, c.email or "", c.address, c.reference])
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contacts_export.csv"},
    )


@router.patch("/{contact_id}", response_model=ContactRead)
def update_contact(
    contact_id: int,
    payload: ContactUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        return None
    ensure_company_access(db, user, contact.company_id)
    updates = payload.dict(exclude_unset=True)
    for field, value in updates.items():
        setattr(contact, field, value)
    db.commit()
    db.refresh(contact)
    return contact


@router.put("/{contact_id}", response_model=ContactRead)
def replace_contact(
    contact_id: int,
    payload: ContactUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """
    Full update using PUT. Accepts the same fields as ContactUpdate
    and applies provided values to the contact record.
    """
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        return None
    ensure_company_access(db, user, contact.company_id)
    updates = payload.dict(exclude_unset=True)
    for field, value in updates.items():
        setattr(contact, field, value)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=204)
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Delete a single contact."""
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    ensure_company_access(db, user, contact.company_id)
    reason = get_contact_usage_reason(db, contact.id)
    if reason:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete contact '{contact.name}' because {reason}.",
        )
    db.delete(contact)
    db.commit()
    return None
