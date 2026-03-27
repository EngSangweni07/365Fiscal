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


def _format_requested_apps(requested_apps: list[str] | None) -> list[str]:
    values = requested_apps or []
    return [APP_LABELS.get(item, item.replace("_", " ").title()) for item in values]


def _summary_row(label: str, value: str) -> str:
    return (
        "<tr>"
        f"<td style=\"padding:10px 0;color:#667085;font-size:12px;font-weight:700;"
        f"letter-spacing:.08em;text-transform:uppercase;vertical-align:top;width:170px;\">{html.escape(label)}</td>"
        f"<td style=\"padding:10px 0;color:#101828;font-size:15px;line-height:1.6;font-weight:600;\">{html.escape(value)}</td>"
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
    subscription_period: str = "monthly",
    payment_link: str = "",
    portal_username: str = "",
    portal_password: str = "",
    wants_zimra_fdms: bool,
    tin: str = "",
    vat_number: str = "",
    trade_name: str = "",
    address: str = "",
    cc_emails: list[str] | None = None,
) -> None:
    apps = _format_requested_apps(requested_apps)
    apps_summary = ", ".join(apps) or "Dashboard, Settings"
    period_label = "1 Year" if subscription_period == "yearly" else "1 Month"
    wants_main_system = "Yes" if wants_actual_three65 else "No"
    wants_fiscalization = "Yes" if wants_zimra_fdms else "No"

    plain_body = "\n".join(
        [
            f"Hello {company_name},",
            "",
            "Thank you for exploring Three65.",
            "Your main system sign-up details are ready.",
            "",
            f"Portal username: {portal_username or demo_email}",
            f"Portal password: {portal_password or '-'}",
            f"Subscription period: {period_label}",
            f"Payment link: {payment_link or '-'}",
            f"Apps enabled: {apps_summary}",
            "",
            f"Company name: {company_name}",
            f"Contact email: {demo_email}",
            f"Phone number: {phone_number}",
            f"Required users: {num_users}",
            f"Main system requested: {wants_main_system}",
            f"ZIMRA fiscalization: {wants_fiscalization}",
            f"TIN: {tin or '-'}",
            f"VAT: {vat_number or '-'}",
            f"Trade name: {trade_name or '-'}",
            f"Address: {address or '-'}",
            "",
            "This message was generated automatically from the Three65 demo portal follow-up form.",
        ]
    )

    app_badges = "".join(
        f"<span style=\"display:inline-block;margin:0 8px 8px 0;padding:8px 12px;border-radius:999px;background:#f5f8fa;border:1px solid #d7e2e8;color:#0b4550;font-size:13px;font-weight:700;\">{html.escape(app_name)}</span>"
        for app_name in apps
    ) or "<span style=\"display:inline-block;padding:8px 12px;border-radius:999px;background:#f5f8fa;border:1px solid #d7e2e8;color:#0b4550;font-size:13px;font-weight:700;\">Dashboard</span><span style=\"display:inline-block;margin-left:8px;padding:8px 12px;border-radius:999px;background:#f5f8fa;border:1px solid #d7e2e8;color:#0b4550;font-size:13px;font-weight:700;\">Settings</span>"

    html_body = f"""
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#eef3f6;font-family:Segoe UI,Arial,sans-serif;color:#101828;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f6;padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #dbe5ea;box-shadow:0 24px 60px rgba(15,23,42,.12);">
            <tr>
              <td style="background:#0b4550;padding:22px 28px;border-bottom:4px solid #d1e826;">
                <img src="cid:three65-logo" alt="Three65" style="display:block;width:56px;max-width:56px;height:auto;margin:0 0 14px;" />
                <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#d7f25a;">Three65 Main System</div>
                <h1 style="margin:10px 0 8px;font-size:28px;line-height:1.15;color:#ffffff;">Your sign-up details are ready</h1>
                <p style="margin:0;max-width:44ch;font-size:15px;line-height:1.7;color:rgba(255,255,255,.82);">Thank you for your interest in Three65. We have prepared your main system access, app selection, and subscription setup details below.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="50%" style="padding:0 8px 16px 0;">
                      <div style="background:#f8fbfc;border:1px solid #dbe5ea;border-radius:18px;padding:16px 18px;">
                        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#667085;">Portal username</div>
                        <div style="margin-top:8px;font-size:18px;font-weight:800;color:#0b4550;">{html.escape(portal_username or demo_email)}</div>
                      </div>
                    </td>
                    <td width="50%" style="padding:0 0 16px 8px;">
                      <div style="background:#f8fbfc;border:1px solid #dbe5ea;border-radius:18px;padding:16px 18px;">
                        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#667085;">Temporary password</div>
                        <div style="margin-top:8px;font-size:18px;font-weight:800;color:#101828;">{html.escape(portal_password or "-")}</div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td width="50%" style="padding:0 8px 16px 0;">
                      <div style="background:#f8fbfc;border:1px solid #dbe5ea;border-radius:18px;padding:16px 18px;">
                        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#667085;">Subscription period</div>
                        <div style="margin-top:8px;font-size:18px;font-weight:800;color:#101828;">{html.escape(period_label)}</div>
                      </div>
                    </td>
                    <td width="50%" style="padding:0 0 16px 8px;">
                      <div style="background:#f8fbfc;border:1px solid #dbe5ea;border-radius:18px;padding:16px 18px;">
                        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#667085;">Required users</div>
                        <div style="margin-top:8px;font-size:18px;font-weight:800;color:#101828;">{num_users}</div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 8px;">
                <div style="border:1px solid #dbe5ea;border-radius:20px;background:#ffffff;overflow:hidden;">
                  <div style="padding:18px 20px;border-bottom:1px solid #e7edf1;background:#f8fbfc;">
                    <div style="font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0b4550;">Apps included for your portal superuser</div>
                    <div style="margin-top:6px;font-size:14px;line-height:1.6;color:#475467;">Dashboard and Settings are included by default, alongside the modules you selected.</div>
                  </div>
                  <div style="padding:18px 20px 10px;">{app_badges}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 8px;">
                <a href="{html.escape(payment_link or '#')}" style="display:inline-block;background:#0b4550;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;padding:14px 22px;border-radius:14px;">Open payment and subscription link</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 18px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #dbe5ea;border-radius:20px;">
                  <tr>
                    <td style="padding:18px 20px;border-bottom:1px solid #e7edf1;background:#f8fbfc;">
                      <div style="font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0b4550;">Business details</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 20px 8px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        {_summary_row("Company", company_name)}
                        {_summary_row("Contact email", demo_email)}
                        {_summary_row("Phone number", phone_number)}
                        {_summary_row("Main system requested", wants_main_system)}
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
              <td style="padding:0 28px 28px;">
                <div style="padding:16px 18px;border-radius:16px;background:#f8fbfc;border:1px solid #dbe5ea;color:#475467;font-size:13px;line-height:1.7;">
                  This message was generated automatically from the Three65 demo portal follow-up form. Please keep the portal credentials safe and update the password after first sign-in.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

    _deliver_email(
        to_email=to_email,
        subject=f"Three65 main system setup for {company_name}",
        body=plain_body,
        html_body=html_body,
        embed_logo=True,
        cc_emails=cc_emails,
    )
