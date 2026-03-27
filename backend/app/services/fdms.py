import base64
import hashlib
import json
import logging
import tempfile
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

logger = logging.getLogger(__name__)

# ZIMRA devices are in Central Africa Time (CAT = UTC+2)
_CAT = timezone(timedelta(hours=2))

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa

from app.core.config import settings
from app.models.company_certificate import CompanyCertificate
from app.models.device import Device
from app.models.invoice import Invoice
from app.models.product import Product
from app.models.quotation import Quotation
from app.models.quotation_line import QuotationLine
from app.models.tax_setting import TaxSetting


def _write_temp_file(data: bytes, suffix: str) -> str:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(data)
    tmp.flush()
    return tmp.name


def _unpadded_device_id(device: Device) -> str:
    """Return the device ID stripped of leading zeros for use in ZIMRA API URL paths.

    ZIMRA expects the numeric device ID without leading zeros in URL paths
    (e.g. 32322 not 0000032322), while the padded form is used in signatures
    and QR code generation.
    """
    return str(int(device.device_id))


def _get_company_cert_paths(company_id: int, db) -> tuple[str, str]:
    cert = db.query(CompanyCertificate).filter(CompanyCertificate.company_id == company_id).first()
    if not cert or not cert.crt_data or not cert.key_data:
        raise ValueError("Company certificate or key not configured")
    crt_path = _write_temp_file(cert.crt_data, ".crt")
    key_path = _write_temp_file(cert.key_data, ".key")
    return crt_path, key_path


def _get_device_cert_paths(device: Device) -> tuple[str, str] | None:
    """Return temp file paths for the device's own certificate + key, if available."""
    if device.crt_data and device.key_data:
        crt_path = _write_temp_file(device.crt_data, ".crt")
        key_path = _write_temp_file(device.key_data, ".key")
        return crt_path, key_path
    return None


def _call_fdms(
    device: Device,
    db,
    endpoint: str,
    method: str = "POST",
    payload: dict | None = None,
    use_certificate: bool = True,
) -> dict:
    """Call an FDMS API endpoint with proper headers and mutual-TLS."""
    url = f"{settings.fdms_api_url.rstrip('/')}/{endpoint.lstrip('/')}"

    # ZIMRA requires these headers on EVERY request
    headers = {
        "Content-Type": "application/json",
        "DeviceModelName": device.model or "Three65",
        "DeviceModelVersion": "1.0",
    }

    cert_paths: tuple[str, str] | None = None
    if use_certificate:
        # Prefer device cert (returned during registration) over company cert
        cert_paths = _get_device_cert_paths(device)
        if not cert_paths:
            cert_paths = _get_company_cert_paths(device.company_id, db)

    try:
        resp = requests.request(
            method=method,
            url=url,
            json=payload,
            headers=headers,
            cert=cert_paths,
            verify=settings.fdms_verify_ssl,
            timeout=settings.fdms_timeout_seconds,
        )
        if not resp.ok:
            # Try to extract a clean error message from FDMS JSON response
            err_msg = ""
            err_code = ""
            try:
                err_data = resp.json() if resp.text else {}
                err_msg = err_data.get("message", "") or ""
                err_code = err_data.get("errorCode", "") or ""
            except Exception:
                pass
            if err_msg and err_code:
                raise ValueError(f"[{err_code}] {err_msg}")
            elif err_msg:
                raise ValueError(err_msg)
            elif err_code:
                raise ValueError(f"FDMS error code: {err_code}")
            else:
                raise ValueError(f"FDMS error {resp.status_code}: {resp.text}")
        if resp.text:
            return resp.json()
        return {}
    finally:
        if cert_paths:
            for path in cert_paths:
                try:
                    import os

                    os.unlink(path)
                except Exception:
                    pass


def get_status(device: Device, db) -> dict:
    """GET /Device/v1/{deviceID}/GetStatus – returns fiscal day status, counters etc."""
    did = _unpadded_device_id(device)
    return _call_fdms(device, db, f"Device/v1/{did}/GetStatus", method="GET")


def get_config(device: Device, db) -> dict:
    """GET /Device/v1/{deviceID}/GetConfig – returns device configuration & tax tables."""
    did = _unpadded_device_id(device)
    return _call_fdms(device, db, f"Device/v1/{did}/GetConfig", method="GET")


def ping_device(device: Device, db) -> dict:
    """POST /Device/v1/{deviceID}/Ping – heartbeat, returns reportingFrequency."""
    did = _unpadded_device_id(device)
    payload = {"deviceID": int(did)}
    return _call_fdms(device, db, f"Device/v1/{did}/Ping", method="POST", payload=payload)


def _generate_ecc_csr(device: Device) -> tuple[str, str]:
    """Generate an ECC P-256 private key and CSR for ZIMRA registration.

    Returns (private_key_pem, csr_pem).
    """
    private_key = ec.generate_private_key(ec.SECP256R1())
    device_id_padded = str(int(device.device_id)).zfill(10)
    common_name = f"ZIMRA-{device.serial_number}-{device_id_padded}"

    from cryptography import x509
    from cryptography.x509.oid import NameOID

    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)]))
        .sign(private_key, hashes.SHA256())
    )
    private_key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode("utf-8")
    return private_key_pem, csr_pem


def register_device(device: Device, db) -> dict:
    """POST /Public/v1/{deviceID}/RegisterDevice.

    Generates an ECC CSR, sends it with the activation key to FDMS,
    and stores the returned certificate + private key on the device.
    """
    if not device.activation_key:
        raise ValueError("Activation key is required for device registration")

    private_key_pem, csr_pem = _generate_ecc_csr(device)

    payload = {
        "certificateRequest": csr_pem,
        "activationKey": device.activation_key.strip().upper(),
    }
    result = _call_fdms(
        device, db,
        f"Public/v1/{_unpadded_device_id(device)}/RegisterDevice",
        payload=payload,
        use_certificate=False,
    )

    # Store the returned certificate and our generated private key
    returned_cert = result.get("certificate", "")
    if returned_cert:
        device.crt_data = returned_cert.encode("utf-8")
        device.crt_filename = f"device_{device.device_id}.crt"
    device.key_data = private_key_pem.encode("utf-8")
    device.key_filename = f"device_{device.device_id}.key"
    db.commit()
    db.refresh(device)

    return result


def open_day(device: Device, db) -> dict:
    """POST /Device/v1/{deviceID}/OpenDay – open a new fiscal day.

    Fetches GetStatus first to determine the correct next day number.
    Stores the opened timestamp on the device for CloseDay signature.
    """
    # Get current status from FDMS to find the correct next day
    try:
        status = get_status(device, db)
        last_day = status.get("lastFiscalDayNo", device.last_fiscal_day_no or 0)
        # Persist status fields while we have them
        if "fiscalDayStatus" in status:
            raw = status["fiscalDayStatus"]
            device.fiscal_day_status = (
                "open" if raw == "FiscalDayOpened"
                else "closed" if raw in ("FiscalDayClosed", "") else raw
            )
        if "lastFiscalDayNo" in status:
            device.last_fiscal_day_no = status["lastFiscalDayNo"]
        if "lastReceiptCounter" in status:
            device.last_receipt_counter = status["lastReceiptCounter"]
        if "lastReceiptGlobalNo" in status:
            device.last_receipt_global_no = status["lastReceiptGlobalNo"]
        db.commit()
    except Exception:
        last_day = device.last_fiscal_day_no or device.current_fiscal_day_no or 0

    next_day_no = last_day + 1
    # Capture the timestamp BEFORE sending the request (same approach as farmware)
    now_utc = datetime.now(timezone.utc)
    now_str = now_utc.strftime("%Y-%m-%dT%H:%M:%S")
    payload = {
        "fiscalDayNo": next_day_no,
        "fiscalDayOpened": now_str,
    }
    result = _call_fdms(device, db, f"Device/v1/{_unpadded_device_id(device)}/OpenDay", payload=payload)

    # Store the opened timestamp on the device so CloseDay can compute the
    # correct fiscalDayDate for the signature (must be the date the day was
    # opened in local time, not the date the day is closed).
    device.fiscal_day_opened_at = now_utc
    db.commit()

    return result


def _sort_fiscal_counters(counters: list[dict]) -> list[dict]:
    """Sort fiscal counters per ZIMRA Section 13.3.1 spec and filter out non-positive values.

    CRITICAL: Only POSITIVE non-zero counters are included in the signature.
    Credit note adjustments can produce negative counter values which must be excluded.
    """
    _TYPE_ORDER = {
        "SaleByTax": 1,
        "SaleTaxByTax": 2,
        "CreditNoteByTax": 3,
        "CreditNoteTaxByTax": 4,
        "DebitNoteByTax": 5,
        "DebitNoteTaxByTax": 6,
        "BalanceByMoneyType": 7,
    }

    positive = []
    for c in counters:
        raw = c.get("fiscalCounterValue", 0) or 0
        val = Decimal(str(raw)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if val > Decimal("0.00"):
            positive.append(c)
        else:
            logger.debug("Excluding counter with value <= 0: type=%s, value=%s",
                         c.get("fiscalCounterType"), val)

    def _key(c):
        ct = str(c.get("fiscalCounterType", ""))
        order = _TYPE_ORDER.get(ct, 99)
        cur = str(c.get("fiscalCounterCurrency", "")).upper()
        if ct == "BalanceByMoneyType":
            mt = str(c.get("fiscalCounterMoneyType", "")).upper()
            return (order, cur, mt)
        tid = 0
        try:
            tid = int(c.get("fiscalCounterTaxID", 0) or 0)
        except (ValueError, TypeError):
            pass
        return (order, cur, tid)

    positive.sort(key=_key)
    return positive


def _build_counters_concat(counters: list[dict]) -> str:
    """Build canonical concatenation of fiscal counters per ZIMRA Section 13.3.1.

    All text values in UPPER CASE, amounts in cents.
    """
    parts: list[str] = []
    for counter in counters:
        raw_value = counter.get("fiscalCounterValue", 0) or 0
        value_dec = Decimal(str(raw_value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        counter_type = str(counter.get("fiscalCounterType", "")).upper()
        currency = str(counter.get("fiscalCounterCurrency", "")).upper()
        cents = str(int((value_dec * 100).to_integral_value(rounding=ROUND_HALF_UP)))

        if counter_type == "BALANCEBYMONEYTYPE":
            money_type = str(counter.get("fiscalCounterMoneyType", "")).upper()
            parts.append(f"{counter_type}{currency}{money_type}{cents}")
        else:
            tax_percent = counter.get("fiscalCounterTaxPercent")
            if tax_percent is not None:
                tp = Decimal(str(tax_percent)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                percent_str = f"{float(tp):.2f}"
            else:
                percent_str = ""  # exempt
            parts.append(f"{counter_type}{currency}{percent_str}{cents}")
    return "".join(parts)


def _sign_close_day(device: Device, db, current_day: int, fiscal_day_date: str, counters: list[dict]) -> dict:
    """Build and sign the CloseDay concatenation string.

    concat = deviceID + fiscalDayNo + fiscalDayDate + counters_concat
    Returns {"hash": b64, "signature": b64, "concat": str}
    """
    device_id_str = _unpadded_device_id(device)
    counters_concat = _build_counters_concat(counters)
    concat = f"{device_id_str}{current_day}{fiscal_day_date}{counters_concat}"

    payload_bytes = concat.encode("utf-8")
    hash_bytes = hashlib.sha256(payload_bytes).digest()
    hash_b64 = base64.b64encode(hash_bytes).decode("ascii")

    sign_key = device.key_data
    if not sign_key:
        cert = db.query(CompanyCertificate).filter(CompanyCertificate.company_id == device.company_id).first()
        if not cert or not cert.key_data:
            raise ValueError("No signing key available for CloseDay")
        sign_key = cert.key_data

    from cryptography.hazmat.primitives.asymmetric import utils as asym_utils
    key = serialization.load_pem_private_key(sign_key, password=None)
    if isinstance(key, ec.EllipticCurvePrivateKey):
        sig_bytes = key.sign(hash_bytes, ec.ECDSA(asym_utils.Prehashed(hashes.SHA256())))
    elif isinstance(key, rsa.RSAPrivateKey):
        sig_bytes = key.sign(hash_bytes, padding.PKCS1v15(), asym_utils.Prehashed(hashes.SHA256()))
    else:
        raise ValueError("Unsupported key type for CloseDay signature")

    sig_b64 = base64.b64encode(sig_bytes).decode("ascii")
    return {"hash": hash_b64, "signature": sig_b64, "concat": concat}


def close_day(device: Device, db) -> dict:
    """POST /Device/v1/{deviceID}/CloseDay – close the current fiscal day.

    Fetches GetStatus first to get counters from ZIMRA, then signs and submits.
    ZIMRA requires: fiscalDayNo, fiscalDayCounters, fiscalDayDeviceSignature, receiptCounter

    CRITICAL NOTES:
    - lastFiscalDayNo from GetStatus is the last CLOSED day, NOT the current open day.
      When a day is open the current day = lastFiscalDayNo + 1.
    - fiscalDayDate in the signature must be the date the day was OPENED (local time),
      not the date it is being closed.
    - Only positive non-zero counter values are included in the signature.
    """
    # 1. Get current status from ZIMRA
    status = get_status(device, db)
    receipt_counter = status.get("lastReceiptCounter", device.last_receipt_counter or 0)

    # 2. Determine the CORRECT current fiscal day number
    #    GetStatus.lastFiscalDayNo = last CLOSED day.
    #    When day is open: current open day = lastFiscalDayNo + 1
    fiscal_day_status = status.get("fiscalDayStatus", "")
    last_closed_day = status.get("lastFiscalDayNo", device.last_fiscal_day_no or 0)

    if fiscal_day_status == "FiscalDayOpened":
        current_day = last_closed_day + 1
    else:
        # Fallback: use device's stored value (set during OpenDay)
        current_day = device.current_fiscal_day_no or last_closed_day

    logger.info(
        "CloseDay: lastFiscalDayNo=%s, fiscalDayStatus=%s → current_day=%s",
        last_closed_day, fiscal_day_status, current_day,
    )

    # 3. Get fiscal day counters from ZIMRA status (they may be in either key)
    raw_counters = status.get("fiscalDayCounter") or status.get("fiscalDayCounters") or []

    # 4. Sort and filter out non-positive counters
    sorted_counters = _sort_fiscal_counters(raw_counters)

    # 5. Determine the correct fiscal_day_date
    #    Must be the LOCAL date when the fiscal day was OPENED, not the current date.
    if device.fiscal_day_opened_at:
        # Convert stored UTC timestamp to local time (CAT = UTC+2)
        local_opened = device.fiscal_day_opened_at.replace(tzinfo=timezone.utc).astimezone(_CAT) \
            if device.fiscal_day_opened_at.tzinfo is None \
            else device.fiscal_day_opened_at.astimezone(_CAT)
        fiscal_day_date = local_opened.strftime("%Y-%m-%d")
        logger.info("CloseDay: Using stored opened date → %s (from %s)", fiscal_day_date, device.fiscal_day_opened_at)
    else:
        # Fallback: current local date (CAT)
        fiscal_day_date = datetime.now(_CAT).strftime("%Y-%m-%d")
        logger.warning("CloseDay: No fiscal_day_opened_at stored, using current local date → %s", fiscal_day_date)

    # 6. Build and sign
    sig = _sign_close_day(device, db, current_day, fiscal_day_date, sorted_counters)
    logger.info("CloseDay: concat=%s", sig.get("concat", ""))

    payload = {
        "fiscalDayNo": current_day,
        "fiscalDayCounters": sorted_counters,
        "fiscalDayDeviceSignature": {
            "hash": sig["hash"],
            "signature": sig["signature"],
        },
        "receiptCounter": receipt_counter,
    }
    return _call_fdms(device, db, f"Device/v1/{_unpadded_device_id(device)}/CloseDay", payload=payload)


def _to_cents(value: Decimal) -> str:
    return str(int((value * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)))


def _sign_receipt(receipt: dict, private_key_pem: bytes) -> dict:
    """Sign receipt per ZIMRA Section 13.2.1 spec.

    Matches the proven working implementation exactly:
    concat = deviceID + receiptType + currency + globalNo + receiptDate + totalCents
           + for each tax sorted by taxID: taxCode(empty) + percent + taxAmountCents + salesAmountCents
           + previousReceiptHash (if chained)
    hash   = SHA256(concat)
    sig    = sign(hash, Prehashed(SHA256))
    """
    from cryptography.hazmat.primitives.asymmetric import utils as asym_utils

    key = serialization.load_pem_private_key(private_key_pem, password=None)

    # Use integer form of device ID (no leading zeros) for signature concatenation
    device_id = str(int(receipt.get("deviceID", 0)))
    receipt_type = str(receipt.get("receiptType", "")).upper()
    currency = str(receipt.get("receiptCurrency", "")).upper()
    global_no = str(int(receipt.get("receiptGlobalNo", 0)))
    receipt_date = str(receipt.get("receiptDate", ""))
    total_cents = _to_cents(Decimal(str(receipt.get("receiptTotal", 0))))

    concat = f"{device_id}{receipt_type}{currency}{global_no}{receipt_date}{total_cents}"

    # Sort taxes by taxID ascending
    taxes = sorted(receipt.get("receiptTaxes", []), key=lambda x: int(x.get("taxID", 0)))
    for tax in taxes:
        # taxCode is empty string per working implementation
        tax_code = ""

        tax_percent_raw = tax.get("taxPercent", "")
        if tax_percent_raw == "" or tax_percent_raw is None:
            percent_str = ""
        else:
            percent_str = f"{float(tax_percent_raw):.2f}"

        tax_amount_cents = _to_cents(Decimal(str(tax.get("taxAmount", 0))))
        sales_amount_cents = _to_cents(Decimal(str(tax.get("salesAmountWithTax", 0))))

        # For credit notes, amounts must be negative in signature
        if receipt_type == "CREDITNOTE":
            if tax_amount_cents != "0":
                tax_amount_cents = str(-abs(int(tax_amount_cents)))
            if sales_amount_cents != "0":
                sales_amount_cents = str(-abs(int(sales_amount_cents)))

        concat += f"{tax_code}{percent_str}{tax_amount_cents}{sales_amount_cents}"

    # Append previous receipt hash for chained receipts (counter > 1)
    prev_hash = receipt.get("previousReceiptHash")
    if prev_hash:
        concat += str(prev_hash).strip()

    # Step 1: hash = SHA256(concat)
    data = concat.encode("utf-8")
    digest = hashlib.sha256(data).digest()
    hash_b64 = base64.b64encode(digest).decode("ascii")

    # Step 2: signature = sign(digest, Prehashed(SHA256))
    if isinstance(key, rsa.RSAPrivateKey):
        signature = key.sign(digest, padding.PKCS1v15(), asym_utils.Prehashed(hashes.SHA256()))
    elif isinstance(key, ec.EllipticCurvePrivateKey):
        signature = key.sign(digest, ec.ECDSA(asym_utils.Prehashed(hashes.SHA256())))
    else:
        raise ValueError("Unsupported private key type")

    signature_b64 = base64.b64encode(signature).decode("ascii")
    return {"signature": signature_b64, "hash": hash_b64, "concat": concat}


def _generate_qr(signature_b64: str, receipt_global_no: int, device_id: str, qr_base: str) -> dict:
    sig_bytes = base64.b64decode(signature_b64)
    # ZIMRA verifier token uses MD5(signature_bytes) (working script logic)
    md5_hash = hashlib.md5(sig_bytes).hexdigest().upper()
    # Use local date (ddMMyyyy) like the working implementations
    date_str = datetime.now().strftime("%d%m%Y")
    device_padded = str(int(device_id)).zfill(10)
    global_padded = str(int(receipt_global_no)).zfill(10)
    hash_part = md5_hash[:16]
    url = f"{qr_base.rstrip('/')}/{device_padded}{date_str}{global_padded}{hash_part}"
    code = "-".join(hash_part[i : i + 4] for i in range(0, len(hash_part), 4))
    return {"code": code, "url": url}


def _normalize_hs_code(raw: str) -> str:
    """Normalize an HS code to exactly 8 digits as required by ZIMRA.

    - Strips non-digit characters (dots, spaces, dashes)
    - Right-pads with zeros if shorter than 8 digits
    - Truncates to 8 digits if longer
    - Returns '00000000' as fallback for empty/invalid codes
    """
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if not digits:
        return "00000000"
    if len(digits) < 8:
        return digits.ljust(8, "0")
    return digits[:8]


def _build_receipt(invoice: Invoice, lines: list[Any], device_id_str: str, db=None) -> dict:
    receipt_counter = (invoice.zimra_receipt_counter or 0) or 0
    receipt_global = (invoice.zimra_receipt_global_no or 0) or 0
    receipt_date = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")

    receipt_lines = []
    tax_summary: dict[str, dict[str, Any]] = {}
    total_with_tax = Decimal("0.00")

    for idx, line in enumerate(lines, start=1):
        qty = Decimal(str(getattr(line, "quantity", 0) or 0))
        price = Decimal(str(getattr(line, "unit_price", 0) or 0))
        vat_rate = Decimal(str(getattr(line, "vat_rate", 0) or 0))
        desc = getattr(line, "description", "") or "Item"
        uom_val = getattr(line, "uom", "") or "Units"

        # Resolve ZIMRA tax ID and HS code from the product's linked tax setting
        zimra_tax_id = 1  # default fallback
        hs_code = "00000000"  # default HS code
        product_id = getattr(line, "product_id", None)
        if product_id and db:
            product = db.query(Product).filter(Product.id == product_id).first()
            if product:
                # HS code from product
                hs_code = _normalize_hs_code(getattr(product, "hs_code", "") or "")
                if product.tax_id:
                    tax_setting = db.query(TaxSetting).filter(TaxSetting.id == product.tax_id).first()
                    if tax_setting and tax_setting.zimra_tax_id is not None:
                        zimra_tax_id = tax_setting.zimra_tax_id
                        vat_rate = Decimal(str(tax_setting.rate))

        # receiptLinesTaxInclusive = True means price must be tax-inclusive
        # so that receiptLineTotal = receiptLinePrice * receiptLineQuantity
        price_incl = (price * (Decimal("1") + vat_rate / Decimal("100"))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        line_total = (qty * price_incl).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_with_tax += line_total

        receipt_lines.append(
            {
                "receiptLineType": "Sale",
                "receiptLineNo": idx,
                "receiptLineName": desc,
                "receiptLineQuantity": float(qty),
                "receiptLinePrice": float(price_incl),
                "receiptLineTotal": float(line_total),
                "receiptLineUnit": uom_val,
                "taxID": str(zimra_tax_id),
                "taxPercent": float(vat_rate),
                "receiptLineHSCode": hs_code,
            }
        )

        tax_key = str(zimra_tax_id)
        if tax_key not in tax_summary:
            tax_summary[tax_key] = {
                "zimra_tax_id": zimra_tax_id,
                "taxPercent": vat_rate,
                "taxAmount": Decimal("0.00"),
                "salesAmountWithTax": Decimal("0.00"),
            }
        sales_amount = line_total
        net = (sales_amount / (Decimal("1") + vat_rate / Decimal("100"))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        tax_amount = (sales_amount - net).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        tax_summary[tax_key]["taxAmount"] += tax_amount
        tax_summary[tax_key]["salesAmountWithTax"] += sales_amount

    receipt_taxes = []
    for key, data in tax_summary.items():
        receipt_taxes.append(
            {
                "taxID": str(data["zimra_tax_id"]),
                "taxPercent": float(data["taxPercent"]),
                "taxAmount": float(data["taxAmount"]),
                "salesAmountWithTax": float(data["salesAmountWithTax"]),
            }
        )

    # Build invoice number for ZIMRA (required field)
    invoice_no = getattr(invoice, "reference", "") or getattr(invoice, "invoice_number", "") or ""
    if not invoice_no:
        invoice_no = f"INV-{receipt_global}"

    # Determine receipt type based on invoice type
    invoice_type = getattr(invoice, "invoice_type", "invoice") or "invoice"
    if invoice_type == "credit_note":
        receipt_type = "CreditNote"
    elif invoice_type == "debit_note":
        receipt_type = "DebitNote"
    else:
        receipt_type = "FiscalInvoice"

    receipt = {
        "deviceID": int(device_id_str),
        "receiptType": receipt_type,
        "receiptCurrency": (invoice.currency or "USD").upper(),
        "receiptCounter": receipt_counter,
        "receiptGlobalNo": receipt_global,
        "invoiceNo": invoice_no,
        "receiptDate": receipt_date,
        "receiptLinesTaxInclusive": True,
        "receiptPrintForm": "Receipt48",
        "receiptLines": receipt_lines,
        "receiptTaxes": receipt_taxes,
        "receiptTotal": float(total_with_tax),
        "receiptPayments": [
            {"moneyTypeCode": "Cash", "paymentAmount": float(total_with_tax)}
        ],
    }

    # Credit notes / debit notes must reference the original receipt
    if receipt_type in ("CreditNote", "DebitNote"):
        reversed_id = getattr(invoice, "reversed_invoice_id", None)
        if reversed_id and db:
            original = db.query(Invoice).filter(Invoice.id == reversed_id).first()
            if original and original.zimra_receipt_global_no:
                receipt["receiptRefNo"] = str(original.zimra_receipt_global_no)

    return receipt


def _ensure_device_online(device: Device, db) -> None:
    """Ping the device if it hasn't been pinged recently to keep it online with ZIMRA."""
    from datetime import timedelta, timezone
    freq = device.reporting_frequency or 5
    now = datetime.now(timezone.utc)
    if device.last_ping_at:
        last_ping = device.last_ping_at
        # Make comparison tz-aware regardless of DB driver behaviour
        if last_ping.tzinfo is None:
            last_ping = last_ping.replace(tzinfo=timezone.utc)
        if (now - last_ping) < timedelta(minutes=max(1, freq - 1)):
            return  # pinged recently enough
    try:
        result = ping_device(device, db)
        device.last_ping_at = now.replace(tzinfo=None)  # store as naive UTC for consistency
        if result.get("reportingFrequency"):
            device.reporting_frequency = int(result["reportingFrequency"])
        db.commit()
    except Exception:
        pass  # don't fail fiscalization if ping fails


def submit_invoice(invoice: Invoice, db) -> dict:
    if not invoice.device_id:
        raise ValueError("Invoice has no device assigned")
    device = db.query(Device).filter(Device.id == invoice.device_id).first()
    if not device:
        raise ValueError("Device not found")

    # Keep device online with ZIMRA before submitting
    _ensure_device_online(device, db)

    lines: list[Any] = list(invoice.lines) if invoice.lines else []
    if not lines and invoice.quotation_id:
        quotation = db.query(Quotation).filter(Quotation.id == invoice.quotation_id).first()
        if quotation:
            lines = list(quotation.lines)

    if not lines:
        raise ValueError("Invoice has no lines to fiscalize")

    invoice.zimra_receipt_counter = (device.last_receipt_counter or 0) + 1
    invoice.zimra_receipt_global_no = (device.last_receipt_global_no or 0) + 1

    did = _unpadded_device_id(device)
    receipt = _build_receipt(invoice, lines, did, db=db)
    if invoice.zimra_receipt_counter > 1 and device.last_receipt_hash:
        receipt["previousReceiptHash"] = device.last_receipt_hash

    # Prefer device private key (from registration), fall back to company key
    sign_key = device.key_data
    if not sign_key:
        cert = db.query(CompanyCertificate).filter(CompanyCertificate.company_id == invoice.company_id).first()
        if not cert or not cert.key_data:
            raise ValueError("No signing key available – register the device or upload a company key")
        sign_key = cert.key_data

    sig = _sign_receipt(receipt, sign_key)
    receipt["receiptDeviceSignature"] = {
        "hash": sig["hash"],
        "signature": sig["signature"],
    }

    submit_payload = {"deviceID": int(did), "receipt": receipt}
    result = _call_fdms(device, db, f"Device/v1/{did}/SubmitReceipt", payload=submit_payload)

    invoice.zimra_status = "submitted"
    invoice.zimra_receipt_id = result.get("receiptID", "")
    invoice.zimra_device_signature = sig["signature"]
    invoice.zimra_device_hash = sig["hash"]
    invoice.zimra_payload = json.dumps(submit_payload)
    invoice.fiscalized_at = datetime.utcnow()

    qr_base = (device.qr_url or "").strip() or "https://fdmstest.zimra.co.zw"
    # Some configs mistakenly include a trailing /Receipt path, but the verifier expects the token at the root.
    # Example: https://fdmstest.zimra.co.zw/00000...
    tail = qr_base.rstrip("/")
    if tail.lower().endswith("/receipt"):
        qr_base = tail[: -len("/receipt")]
    qr = _generate_qr(sig["signature"], invoice.zimra_receipt_global_no, str(device.device_id), qr_base)
    invoice.zimra_verification_code = qr["code"]
    invoice.zimra_verification_url = qr["url"]

    device.last_receipt_counter = invoice.zimra_receipt_counter
    device.last_receipt_global_no = invoice.zimra_receipt_global_no
    device.last_receipt_hash = sig["hash"]
    device.last_receipt_signature = sig["signature"]

    return result
