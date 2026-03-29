from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from paynow import Paynow

from app.core.config import settings


class PaynowError(ValueError):
    pass


@dataclass
class PaynowTransactionResult:
    status: str
    reference: str
    poll_url: str
    redirect_url: str


def paynow_is_configured() -> bool:
    return bool(settings.paynow_integration_id and settings.paynow_integration_key)


def _amount(value: Decimal | float | int) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _client(return_url: str, result_url: str) -> Paynow:
    return Paynow(
        settings.paynow_integration_id or "",
        settings.paynow_integration_key or "",
        return_url,
        result_url,
    )


def create_paynow_transaction(
    *,
    reference: str,
    amount_usd: Decimal | float | int,
    additional_info: str,
    customer_email: str,
    return_url: str,
    result_url: str,
    payment_method: str,
    ecocash_phone_number: str = "",
) -> PaynowTransactionResult:
    if not paynow_is_configured():
        raise PaynowError("Paynow is not configured.")

    paynow = _client(return_url, result_url)
    payment = paynow.create_payment(reference, customer_email)
    payment.add(additional_info, _amount(amount_usd))

    try:
        if payment_method == "ecocash":
            response = paynow.send_mobile(payment, ecocash_phone_number.strip(), "ecocash")
        else:
            response = paynow.send(payment)
    except Exception as exc:
        raise PaynowError(f"Paynow request failed: {exc}") from exc

    if not getattr(response, "success", False):
        data = getattr(response, "data", {}) or {}
        detail = data.get("error") or data.get("status") or "Unknown Paynow error"
        raise PaynowError(str(detail))

    data = getattr(response, "data", {}) or {}
    return PaynowTransactionResult(
        status=str(data.get("status") or "Ok"),
        reference=reference,
        poll_url=str(getattr(response, "poll_url", "") or ""),
        redirect_url=str(getattr(response, "redirect_url", "") or ""),
    )


def verify_paynow_transaction(
    *,
    poll_url: str,
    return_url: str,
    result_url: str,
) -> str:
    if not paynow_is_configured():
        raise PaynowError("Paynow is not configured.")

    paynow = _client(return_url, result_url)
    try:
        status_result = paynow.check_transaction_status(poll_url)
    except Exception as exc:
        raise PaynowError(f"Failed to check Paynow transaction: {exc}") from exc
    return str(getattr(status_result, "status", "") or "")

