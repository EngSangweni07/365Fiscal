import html
import smtplib
from email.message import EmailMessage
from pathlib import Path

from app.core.config import settings


LOGO_PATH = Path(__file__).resolve().parents[3] / "frontend" / "public" / "three.png"
APP_LABELS = {
    "dashboard": "Dashboard",
    "invoices": "Invoices",
    "purchases": "Purchases",
    "contacts": "Contacts",
    "quotations": "Quotations",
    "inventory": "Inventory",
    "pos": "Point of Sale",
    "devices": "Devices",
    "expenses": "Expenses",
    "reports": "Financial Reports",
    "settings": "Settings",
}


def _build_message(
    *,
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    embed_logo: bool = False,
    cc_emails: list[str] | None = None,
) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = (
        f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        if settings.smtp_from_name
        else settings.smtp_from_email
    )
    message["To"] = to_email
    if cc_emails:
        message["Cc"] = ", ".join(cc_emails)
    message.set_content(body)

    if html_body:
        message.add_alternative(html_body, subtype="html")
        if embed_logo and LOGO_PATH.exists():
            with LOGO_PATH.open("rb") as logo_file:
                logo_data = logo_file.read()
            message.get_payload()[-1].add_related(
                logo_data,
                maintype="image",
                subtype="png",
                cid="<three65-logo>",
                filename="three.png",
                disposition="inline",
            )

    return message


def _deliver_message(message: EmailMessage) -> None:
    if settings.otp_dev_mode:
        print(f"[DEV EMAIL] To: {message['To']}")
        print(f"[DEV EMAIL] Subject: {message['Subject']}")
        print(message)
        return

    if not settings.smtp_host or not settings.smtp_from_email:
        raise NotImplementedError("SMTP provider not configured")

    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=30) as server:
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
        server.ehlo()
        if settings.smtp_use_tls:
            server.starttls()
            server.ehlo()
        if settings.smtp_username and settings.smtp_password:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


def _deliver_email(
    *,
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    embed_logo: bool = False,
    cc_emails: list[str] | None = None,
) -> None:
    message = _build_message(
        to_email=to_email,
        subject=subject,
        body=body,
        html_body=html_body,
        embed_logo=embed_logo,
        cc_emails=cc_emails,
    )
    _deliver_message(message)


def send_otp_email(to_email: str, otp_code: str) -> None:
    _deliver_email(
        to_email=to_email,
        subject="Your Three65 OTP code",
        body=f"Your one-time password is: {otp_code}",
    )


def send_plain_email(to_email: str, subject: str, body: str) -> None:
    _deliver_email(to_email=to_email, subject=subject, body=body)


def _summary_row(label: str, value: str, accent: bool = False) -> str:
    safe_label = html.escape(label)
    safe_value = html.escape(value)
    value_style = (
        "font-weight:700;color:#0b4550;"
        if accent
        else "font-weight:600;color:#0f172a;"
    )


def _format_requested_apps(requested_apps: list[str] | None) -> str:
    labels = [APP_LABELS.get(item, item.replace("_", " ").title()) for item in (requested_apps or [])]
    return ", ".join(labels) or "-"
    return (
        "<tr>"
        f"<td style=\"padding:10px 0;color:#64748b;font-size:12px;font-weight:700;"
        f"letter-spacing:.08em;text-transform:uppercase;vertical-align:top;\">{safe_label}</td>"
        f"<td style=\"padding:10px 0 10px 18px;font-size:15px;line-height:1.5;{value_style}\">{safe_value}</td>"
        "</tr>"
    )


def send_demo_interest_email(
    *,
    to_email: str,
    demo_email: str,
    company_name: str,
    phone_number: str,
    num_users: int,
    wants_actual_three65: bool,
    requested_apps: list[str] | None = None,
    wants_zimra_fdms: bool,
    tin: str = "",
    vat_number: str = "",
    trade_name: str = "",
    address: str = "",
) -> None:
    cc_emails = ["support@geenet.co.zw", "info@geenet.co.zw"]
    subject = f"Three65 demo follow-up: {company_name}"
    wants_main_system = "Yes" if wants_actual_three65 else "No"
    wants_fiscalization = "Yes" if wants_zimra_fdms else "No"
    apps_summary = _format_requested_apps(requested_apps)
    plain_body = "\n".join(
        [
            "A demo user requested follow-up.",
            "",
            f"Main system requested: {wants_main_system}",
            f"Company name: {company_name}",
            f"Contact email: {demo_email}",
            f"Phone number: {phone_number}",
            f"Required users: {num_users}",
            f"Requested apps: {apps_summary}",
            f"Wants ZIMRA fiscalization: {wants_fiscalization}",
            f"TIN: {tin or '-'}",
            f"VAT: {vat_number or '-'}",
            f"Trade name: {trade_name or '-'}",
            f"Address: {address or '-'}",
        ]
    )

    html_body = f"""
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#eef2ff;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2ff;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid rgba(148,163,184,.18);box-shadow:0 28px 60px rgba(15,23,42,.14);">
            <tr>
              <td style="padding:0;background:linear-gradient(135deg,#0b4550 0%,#114f5b 58%,#1d6070 100%);">
                <div style="height:8px;background:#d1e826;"></div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:24px 32px 22px;">
                      <img src="cid:three65-logo" alt="Three65" style="display:block;width:88px;max-width:88px;height:auto;margin:0 0 16px;" />
                      <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);color:#f8fafc;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Demo follow-up</div>
                      <h1 style="margin:16px 0 8px;font-size:30px;line-height:1.05;color:#ffffff;">New Three65 lead</h1>
                      <p style="margin:0;max-width:40ch;font-size:15px;line-height:1.6;color:rgba(248,250,252,.82);">A demo user has confirmed interest in the main system. Their business details are ready for follow-up.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 14px;background:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="33.33%" style="padding-right:10px;">
                      <div style="border-radius:20px;background:#f8fafc;border:1px solid rgba(148,163,184,.14);padding:16px 18px;">
                        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Company</div>
                        <div style="margin-top:8px;font-size:18px;font-weight:800;color:#0f172a;">{html.escape(company_name)}</div>
                      </div>
                    </td>
                    <td width="33.33%" style="padding:0 5px;">
                      <div style="border-radius:20px;background:#f8fafc;border:1px solid rgba(148,163,184,.14);padding:16px 18px;">
                        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Users</div>
                        <div style="margin-top:8px;font-size:18px;font-weight:800;color:#0b4550;">{num_users}</div>
                      </div>
                    </td>
                    <td width="33.33%" style="padding-left:10px;">
                      <div style="border-radius:20px;background:#f8fafc;border:1px solid rgba(148,163,184,.14);padding:16px 18px;">
                        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Apps selected</div>
                        <div style="margin-top:8px;font-size:14px;font-weight:800;color:#0f172a;line-height:1.45;">{html.escape(apps_summary)}</div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 12px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid rgba(148,163,184,.16);border-radius:24px;overflow:hidden;">
                  <tr>
                    <td style="padding:18px 22px;background:linear-gradient(180deg, rgba(11,69,80,.04), rgba(11,69,80,.01));border-bottom:1px solid rgba(148,163,184,.12);">
                      <div style="font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0b4550;">Lead summary</div>
                      <div style="margin-top:6px;font-size:14px;line-height:1.6;color:#475569;">Everything submitted by the client is listed below for follow-up and onboarding.</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 22px 8px;background:#ffffff;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        {_summary_row("Main system requested", wants_main_system, accent=True)}
                        {_summary_row("Contact email", demo_email, accent=True)}
                        {_summary_row("Phone number", phone_number)}
                        {_summary_row("Requested apps", apps_summary, accent=True)}
                        {_summary_row("ZIMRA fiscalization", wants_fiscalization)}
                        {_summary_row("Trade name", trade_name or "-")}
                        {_summary_row("TIN", tin or "-")}
                        {_summary_row("VAT", vat_number or "-")}
                        {_summary_row("Address", address or "-")}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 30px;">
                <div style="padding:16px 18px;border-radius:18px;background:rgba(11,69,80,.06);color:#334155;font-size:13px;line-height:1.6;">
                  This message was generated automatically from the Three65 demo portal follow-up form.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()

    _deliver_email(
        to_email=to_email,
        subject=subject,
        body=plain_body,
        html_body=html_body,
        embed_logo=True,
        cc_emails=cc_emails,
    )
