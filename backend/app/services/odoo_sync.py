from __future__ import annotations

import logging
import xmlrpc.client
from dataclasses import dataclass
from typing import Any

import requests

from app.core.config import settings


_logger = logging.getLogger(__name__)
USER_LICENSE_PRODUCT = "Three65 User License Fee"
SYSTEM_TRAINING_PRODUCT = "Three65 System Training"
IMPLEMENTATION_SUPPORT_PRODUCT = "Three65 Implementation Support"
ZIMRA_PRODUCT = "Three65 ZIMRA Fiscalization Integration"


class OdooSyncError(RuntimeError):
    """Raised when the Odoo synchronization fails."""


@dataclass
class OdooQuotationPayload:
    company_name: str
    email: str
    phone_number: str
    num_users: int
    wants_zimra_fdms: bool = False
    wants_training_enhanced: bool = False
    wants_implementation_enhanced: bool = False
    subscription_period: str = "monthly"
    trade_name: str = ""
    vat_number: str = ""
    tin: str = ""
    address: str = ""


def sync_demo_interest_to_odoo(payload: OdooQuotationPayload) -> dict[str, Any]:
    base_url = _normalize_odoo_base_url(settings.odoo_url)
    if not base_url:
        raise OdooSyncError("ODOO_URL is not configured.")

    if settings.odoo_bearer_token:
        return _sync_with_json2(base_url, settings.odoo_bearer_token, payload)

    if settings.odoo_database and settings.odoo_login and settings.odoo_api_key:
        return _sync_with_xmlrpc(
            base_url=base_url,
            database=settings.odoo_database,
            login=settings.odoo_login,
            api_key=settings.odoo_api_key,
            payload=payload,
        )

    raise OdooSyncError(
        "Odoo credentials are incomplete. Configure either ODOO_BEARER_TOKEN or "
        "ODOO_DATABASE + ODOO_LOGIN + ODOO_API_KEY."
    )


def _normalize_odoo_base_url(raw_url: str | None) -> str:
    url = (raw_url or "").strip().rstrip("/")
    if url.endswith("/odoo"):
        url = url[:-5]
    return url


def _build_partner_vals(payload: OdooQuotationPayload) -> dict[str, Any]:
    comment_parts = []
    if payload.trade_name:
        comment_parts.append(f"Trade name: {payload.trade_name}")
    if payload.tin:
        comment_parts.append(f"TIN: {payload.tin}")
    if payload.vat_number:
        comment_parts.append(f"VAT: {payload.vat_number}")
    if payload.subscription_period:
        comment_parts.append(f"Subscription period: {payload.subscription_period}")

    vals: dict[str, Any] = {
        "name": payload.company_name.strip(),
        "company_type": "company",
        "is_company": True,
        "email": payload.email.strip(),
        "phone": payload.phone_number.strip(),
        "customer_rank": 1,
    }
    if payload.address.strip():
        vals["street"] = payload.address.strip()
    if payload.vat_number.strip():
        vals["vat"] = payload.vat_number.strip()
    if comment_parts:
        vals["comment"] = "\n".join(comment_parts)
    return vals


def _build_line_specs(payload: OdooQuotationPayload) -> list[dict[str, Any]]:
    lines = [
        {
            "product_name": USER_LICENSE_PRODUCT,
            "line_name": f"User License Fee ({max(payload.num_users, 1)} X $10.00)",
            "quantity": max(payload.num_users, 1),
            "price_unit": 10.0,
            "default_list_price": 10.0,
        }
    ]
    if payload.wants_training_enhanced:
        lines.append(
            {
                "product_name": SYSTEM_TRAINING_PRODUCT,
                "line_name": "System training",
                "quantity": 1,
                "price_unit": 0.0,
                "default_list_price": 0.0,
            }
        )
    if payload.wants_implementation_enhanced:
        lines.append(
            {
                "product_name": IMPLEMENTATION_SUPPORT_PRODUCT,
                "line_name": "Implementation support",
                "quantity": 1,
                "price_unit": 0.0,
                "default_list_price": 0.0,
            }
        )
    if payload.wants_zimra_fdms:
        lines.append(
            {
                "product_name": ZIMRA_PRODUCT,
                "line_name": "ZIMRA fiscalization Integration",
                "quantity": 1,
                "price_unit": 0.0,
                "default_list_price": 0.0,
            }
        )
    return lines


def _build_order_note(payload: OdooQuotationPayload) -> str:
    notes = [
        "Created from Three65 demo interest form.",
        f"Subscription period: {payload.subscription_period}",
    ]
    if payload.trade_name:
        notes.append(f"Trade name: {payload.trade_name}")
    if payload.tin:
        notes.append(f"TIN: {payload.tin}")
    if payload.vat_number:
        notes.append(f"VAT: {payload.vat_number}")
    if payload.address:
        notes.append(f"Address: {payload.address}")
    return "\n".join(notes)


def _sync_with_json2(base_url: str, bearer_token: str, payload: OdooQuotationPayload) -> dict[str, Any]:
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"bearer {bearer_token}",
            "Content-Type": "application/json",
            "User-Agent": "Three65-Odoo-Sync",
        }
    )

    partner_id = _json2_find_or_create_partner(session, base_url, payload)
    order_id = _json2_create_sale_order(session, base_url, partner_id, payload)
    order_name = _json2_read_sale_order_name(session, base_url, order_id)
    return {"partner_id": partner_id, "sale_order_id": order_id, "sale_order_name": order_name}


def _json2_call(
    session: requests.Session,
    base_url: str,
    model: str,
    method: str,
    payload: dict[str, Any],
) -> Any:
    response = session.post(
        f"{base_url}/json/2/{model}/{method}",
        json=payload,
        timeout=settings.odoo_timeout_seconds,
    )
    content_type = (response.headers.get("content-type") or "").lower()
    if "application/json" not in content_type:
        raise OdooSyncError(
            f"JSON-2 request returned non-JSON content for {model}.{method}. "
            "This usually means the host redirected to a login page or JSON-2 is unavailable."
        )
    if response.status_code >= 400:
        raise OdooSyncError(f"JSON-2 request failed for {model}.{method}: {response.text}")
    return response.json()


def _json2_find_or_create_partner(
    session: requests.Session,
    base_url: str,
    payload: OdooQuotationPayload,
) -> int:
    search_domains: list[list[list[str]]] = [
        [["name", "=", payload.company_name.strip()]],
    ]
    if payload.email.strip():
        search_domains.append([["email", "=", payload.email.strip()]])
    for domain in search_domains:
        existing = _json2_call(
            session,
            base_url,
            "res.partner",
            "search_read",
            {"domain": domain, "fields": ["id", "name"], "limit": 1},
        )
        if existing:
            return int(existing[0]["id"])
    return int(
        _json2_call(
            session,
            base_url,
            "res.partner",
            "create",
            {"vals_list": [_build_partner_vals(payload)]},
        )[0]
    )


def _json2_find_or_create_service_product(
    session: requests.Session,
    base_url: str,
    product_name: str,
    default_list_price: float,
) -> int:
    records = _json2_call(
        session,
        base_url,
        "product.product",
        "search_read",
        {
            "domain": [["name", "=", product_name]],
            "fields": ["id", "name"],
            "limit": 1,
        },
    )
    if records:
        return int(records[0]["id"])

    product_ids = _json2_call(
        session,
        base_url,
        "product.product",
        "create",
        {
            "vals_list": [
                {
                    "name": product_name,
                    "type": "service",
                    "sale_ok": True,
                    "purchase_ok": False,
                    "list_price": default_list_price,
                }
            ]
        },
    )
    return int(product_ids[0])


def _json2_create_sale_order(
    session: requests.Session,
    base_url: str,
    partner_id: int,
    payload: OdooQuotationPayload,
) -> int:
    order_line_commands = []
    for spec in _build_line_specs(payload):
        product_id = _json2_find_or_create_service_product(
            session,
            base_url,
            spec["product_name"],
            spec["default_list_price"],
        )
        order_line_commands.append(
            [
                0,
                0,
                {
                    "product_id": product_id,
                    "name": spec["line_name"],
                    "product_uom_qty": spec["quantity"],
                    "price_unit": spec["price_unit"],
                },
            ]
        )

    order_ids = _json2_call(
        session,
        base_url,
        "sale.order",
        "create",
        {
            "vals_list": [
                {
                    "partner_id": partner_id,
                    "origin": "Three65 demo interest",
                    "client_order_ref": payload.subscription_period,
                    "note": _build_order_note(payload),
                    "order_line": order_line_commands,
                }
            ]
        },
    )
    return int(order_ids[0])


def _json2_read_sale_order_name(
    session: requests.Session,
    base_url: str,
    sale_order_id: int,
) -> str:
    records = _json2_call(
        session,
        base_url,
        "sale.order",
        "read",
        {"ids": [sale_order_id], "fields": ["name"]},
    )
    if not records:
        return str(sale_order_id)
    return str(records[0].get("name") or sale_order_id)


def _sync_with_xmlrpc(
    base_url: str,
    database: str,
    login: str,
    api_key: str,
    payload: OdooQuotationPayload,
) -> dict[str, Any]:
    common = xmlrpc.client.ServerProxy(f"{base_url}/xmlrpc/2/common", allow_none=True)
    uid = common.authenticate(database, login, api_key, {})
    if not uid:
        raise OdooSyncError("Odoo XML-RPC authentication failed. Check ODOO_DATABASE, ODOO_LOGIN, and ODOO_API_KEY.")

    models = xmlrpc.client.ServerProxy(f"{base_url}/xmlrpc/2/object", allow_none=True)
    partner_id = _xmlrpc_find_or_create_partner(models, database, uid, api_key, payload)
    sale_order_id = _xmlrpc_create_sale_order(models, database, uid, api_key, partner_id, payload)
    sale_order = models.execute_kw(
        database,
        uid,
        api_key,
        "sale.order",
        "read",
        [[sale_order_id]],
        {"fields": ["name"]},
    )
    sale_order_name = sale_order[0]["name"] if sale_order else str(sale_order_id)
    return {
        "partner_id": partner_id,
        "sale_order_id": sale_order_id,
        "sale_order_name": sale_order_name,
    }


def _xmlrpc_find_or_create_partner(
    models: xmlrpc.client.ServerProxy,
    database: str,
    uid: int,
    api_key: str,
    payload: OdooQuotationPayload,
) -> int:
    domain = [["email", "=", payload.email.strip()]] if payload.email.strip() else [["name", "=", payload.company_name.strip()]]
    existing = models.execute_kw(
        database,
        uid,
        api_key,
        "res.partner",
        "search_read",
        [domain],
        {"fields": ["id", "name"], "limit": 1},
    )
    if existing:
        return int(existing[0]["id"])
    return int(
        models.execute_kw(
            database,
            uid,
            api_key,
            "res.partner",
            "create",
            [_build_partner_vals(payload)],
        )
    )


def _xmlrpc_find_or_create_service_product(
    models: xmlrpc.client.ServerProxy,
    database: str,
    uid: int,
    api_key: str,
    product_name: str,
    default_list_price: float,
) -> int:
    existing = models.execute_kw(
        database,
        uid,
        api_key,
        "product.template",
        "search_read",
        [[["name", "=", product_name]]],
        {"fields": ["id", "product_variant_id"], "limit": 1},
    )
    if existing:
        variant = existing[0].get("product_variant_id")
        if isinstance(variant, list) and variant:
            return int(variant[0])
        raise OdooSyncError(f"Product template '{product_name}' has no variant.")

    template_id = models.execute_kw(
        database,
        uid,
        api_key,
        "product.template",
        "create",
        [
            {
                "name": product_name,
                "detailed_type": "service",
                "sale_ok": True,
                "purchase_ok": False,
                "list_price": default_list_price,
            }
        ],
    )
    created = models.execute_kw(
        database,
        uid,
        api_key,
        "product.template",
        "read",
        [[template_id]],
        {"fields": ["product_variant_id"]},
    )
    variant = created[0].get("product_variant_id") if created else None
    if isinstance(variant, list) and variant:
        return int(variant[0])
    raise OdooSyncError(f"Created product template '{product_name}' but could not resolve its variant.")


def _xmlrpc_create_sale_order(
    models: xmlrpc.client.ServerProxy,
    database: str,
    uid: int,
    api_key: str,
    partner_id: int,
    payload: OdooQuotationPayload,
) -> int:
    order_line_commands = []
    for spec in _build_line_specs(payload):
        product_id = _xmlrpc_find_or_create_service_product(
            models,
            database,
            uid,
            api_key,
            spec["product_name"],
            spec["default_list_price"],
        )
        order_line_commands.append(
            [
                0,
                0,
                {
                    "product_id": product_id,
                    "name": spec["line_name"],
                    "product_uom_qty": spec["quantity"],
                    "price_unit": spec["price_unit"],
                },
            ]
        )

    try:
        return int(
            models.execute_kw(
                database,
                uid,
                api_key,
                "sale.order",
                "create",
                [
                    {
                        "partner_id": partner_id,
                        "origin": "Three65 demo interest",
                        "client_order_ref": payload.subscription_period,
                        "note": _build_order_note(payload),
                        "order_line": order_line_commands,
                    }
                ],
            )
        )
    except Exception as exc:
        _logger.exception("Failed to create Odoo draft quotation")
        raise OdooSyncError(f"Failed to create Odoo draft quotation: {exc}") from exc
