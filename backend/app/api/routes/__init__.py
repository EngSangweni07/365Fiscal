from fastapi import APIRouter

from app.api.routes import auth, users, companies, products, contacts, quotations
from app.api.routes import devices, categories, warehouses, locations, company_users, invoices
from app.api.routes import tax_settings, company_certificates, dashboard, stock, company_settings
from app.api.routes import roles, audit_logs, payments, purchases, subscriptions
from app.api.routes import pos
from app.api.routes import expenses
from app.api.routes import expense_categories
from app.api.routes import currencies
from app.api.routes import notifications
from app.api.routes import demo

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(companies.router)
api_router.include_router(products.router)
api_router.include_router(contacts.router)
api_router.include_router(quotations.router)
api_router.include_router(devices.router)
api_router.include_router(categories.router)
api_router.include_router(warehouses.router)
api_router.include_router(locations.router)
api_router.include_router(company_users.router)
api_router.include_router(invoices.router)
api_router.include_router(tax_settings.router)
api_router.include_router(company_certificates.router)
api_router.include_router(dashboard.router)
api_router.include_router(stock.router)
api_router.include_router(company_settings.router)
api_router.include_router(roles.router)
api_router.include_router(audit_logs.router)
api_router.include_router(payments.router)
api_router.include_router(purchases.router)
api_router.include_router(subscriptions.router)
api_router.include_router(pos.router)
api_router.include_router(expenses.router)
api_router.include_router(expense_categories.router)
api_router.include_router(currencies.router)
api_router.include_router(notifications.router)
api_router.include_router(demo.router)
