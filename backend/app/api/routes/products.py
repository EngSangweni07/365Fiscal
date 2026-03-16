from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
import base64

from app.api.deps import get_db, ensure_company_access, require_company_access, require_portal_user, log_audit
from app.models.audit_log import AuditAction, ResourceType
from app.models.company import Company
from app.models.product import Product
from app.models.invoice_line import InvoiceLine
from app.models.purchase_order_line import PurchaseOrderLine
from app.models.quotation_line import QuotationLine
from app.models.pos_session import POSOrderLine
from app.models.stock_move import StockMove
from app.models.stock_quant import StockQuant
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate, ProductWithStock

router = APIRouter(prefix="/products", tags=["products"])


@router.post("", response_model=ProductRead)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    ensure_company_access(db, user, payload.company_id)
    product = Product(**payload.dict())
    db.add(product)
    db.commit()
    db.refresh(product)
    company = db.query(Company).filter(Company.id == product.company_id).first()
    log_audit(
        db=db,
        user=user,
        action=AuditAction.CREATE,
        resource_type=ResourceType.PRODUCT,
        resource_id=product.id,
        resource_reference=product.reference or product.name,
        company_id=product.company_id,
        company_name=company.name if company else "",
        new_values={
            "name": product.name,
            "reference": product.reference,
            "sale_price": product.sale_price,
        },
        changes_summary=f"Product {product.name} created",
    )
    db.commit()
    return product


@router.get("", response_model=list[ProductRead])
def list_products(
    company_id: int,
    category_id: int | None = None,
    search: str | None = None,
    is_active: bool | None = None,
    can_be_sold: bool | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
):
    query = db.query(Product).filter(Product.company_id == company_id)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if search:
        like = f"%{search}%"
        query = query.filter(
            Product.name.ilike(like) | 
            Product.barcode.ilike(like) |
            Product.reference.ilike(like)
        )
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
    if can_be_sold is not None:
        query = query.filter(Product.can_be_sold == can_be_sold)
    return query.order_by(Product.name).all()


@router.get("/with-stock", response_model=list[ProductWithStock])
def list_products_with_stock(
    company_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
    _=Depends(require_company_access),
):
    """List products with their stock quantities."""
    products = db.query(Product).filter(Product.company_id == company_id).all()
    result = []
    for product in products:
        stock_data = db.query(
            func.sum(StockQuant.quantity).label("qty"),
            func.sum(StockQuant.available_quantity).label("available"),
            func.sum(StockQuant.reserved_quantity).label("reserved"),
            func.sum(StockQuant.total_value).label("value")
        ).filter(
            StockQuant.product_id == product.id,
            StockQuant.company_id == company_id
        ).first()
        
        product_dict = {
            **product.__dict__,
            "quantity_on_hand": stock_data.qty or 0 if stock_data else 0,
            "quantity_available": stock_data.available or 0 if stock_data else 0,
            "quantity_reserved": stock_data.reserved or 0 if stock_data else 0,
            "stock_value": stock_data.value or 0 if stock_data else 0
        }
        result.append(ProductWithStock(**product_dict))
    return result


@router.get("/{product_id}", response_model=ProductRead)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    ensure_company_access(db, user, product.company_id)
    return product


@router.patch("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    ensure_company_access(db, user, product.company_id)
    company = db.query(Company).filter(Company.id == product.company_id).first()
    old_values = {
        "name": product.name,
        "reference": product.reference,
        "sale_price": product.sale_price,
    }
    updates = payload.dict(exclude_unset=True)
    for field, value in updates.items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    log_audit(
        db=db,
        user=user,
        action=AuditAction.UPDATE,
        resource_type=ResourceType.PRODUCT,
        resource_id=product.id,
        resource_reference=product.reference or product.name,
        company_id=product.company_id,
        company_name=company.name if company else "",
        old_values=old_values,
        new_values={
            "name": product.name,
            "reference": product.reference,
            "sale_price": product.sale_price,
        },
        changes_summary=f"Product {product.name} updated",
    )
    db.commit()
    return product


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    ensure_company_access(db, user, product.company_id)
    
    # Check if product has stock
    has_stock = db.query(StockQuant).filter(
        StockQuant.product_id == product_id,
        StockQuant.quantity > 0
    ).first()
    if has_stock:
        raise HTTPException(status_code=400, detail="Cannot delete product with stock on hand")
    usage_checks = [
        (InvoiceLine, "invoice lines"),
        (PurchaseOrderLine, "purchase orders"),
        (QuotationLine, "quotations"),
        (POSOrderLine, "POS orders"),
        (StockMove, "stock moves"),
        (StockQuant, "inventory records"),
    ]
    for model, label in usage_checks:
        exists = db.query(model.id).filter(model.product_id == product_id).first()
        if exists:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete product because it is already used in {label}",
            )
            
    company = db.query(Company).filter(Company.id == product.company_id).first()
    product_reference = product.reference or product.name
    product_name = product.name
    db.delete(product)
    db.commit()
    log_audit(
        db=db,
        user=user,
        action=AuditAction.DELETE,
        resource_type=ResourceType.PRODUCT,
        resource_id=product_id,
        resource_reference=product_reference,
        company_id=product.company_id,
        company_name=company.name if company else "",
        old_values={
            "name": product_name,
            "reference": product_reference,
        },
        changes_summary=f"Product {product_name} deleted",
    )
    db.commit()
    return {"status": "deleted"}


@router.post("/{product_id}/image", response_model=ProductRead)
def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Upload a product image. Stores as base64 data URL."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    ensure_company_access(db, user, product.company_id)

    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Invalid image type. Allowed: JPEG, PNG, GIF, WebP, SVG")

    # Read and encode
    content = file.file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail="Image too large. Max 5MB")

    b64 = base64.b64encode(content).decode("utf-8")
    product.image_url = f"data:{file.content_type};base64,{b64}"
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}/image", response_model=ProductRead)
def delete_product_image(
    product_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_portal_user),
):
    """Remove a product image."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    ensure_company_access(db, user, product.company_id)
    product.image_url = ""
    db.commit()
    db.refresh(product)
    return product
