import smtplib
from email.message import EmailMessage

from app.core.config import settings


def _deliver_email(to_email: str, subject: str, body: str) -> None:
    if settings.otp_dev_mode:
        print(f"[DEV EMAIL] To: {to_email}")
        print(f"[DEV EMAIL] Subject: {subject}")
        print(body)
        return

    if not settings.smtp_host or not settings.smtp_from_email:
        raise NotImplementedError("SMTP provider not configured")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = (
        f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        if settings.smtp_from_name
        else settings.smtp_from_email
    )
    message["To"] = to_email
    message.set_content(body)

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


def send_otp_email(to_email: str, otp_code: str) -> None:
    _deliver_email(
        to_email=to_email,
        subject="Your Three65 OTP code",
        body=f"Your one-time password is: {otp_code}",
    )


def send_plain_email(to_email: str, subject: str, body: str) -> None:
    _deliver_email(to_email=to_email, subject=subject, body=body)


def send_demo_interest_email(
    *,
    to_email: str,
    demo_email: str,
    company_name: str,
    phone_number: str,
    num_users: int,
    wants_actual_three65: bool,
    wants_zimra_fdms: bool,
    tin: str = "",
    vat_number: str = "",
    trade_name: str = "",
    address: str = "",
) -> None:
    subject = f"Three65 demo follow-up: {company_name}"
    body = "\n".join(
        [
            "A demo user requested follow-up.",
            "",
            f"Actual Three65 requested: {'Yes' if wants_actual_three65 else 'No'}",
            f"Company name: {company_name}",
            f"Contact email: {demo_email}",
            f"Phone number: {phone_number}",
            f"Required users: {num_users}",
            f"Wants ZIMRA fiscalization: {'Yes' if wants_zimra_fdms else 'No'}",
            f"TIN: {tin or '-'}",
            f"VAT: {vat_number or '-'}",
            f"Trade name: {trade_name or '-'}",
            f"Address: {address or '-'}",
        ]
    )
    send_plain_email(to_email, subject, body)
