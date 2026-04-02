from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Three65"
    env: str = "dev"
    secret_key: str
    access_token_expire_minutes: int = 60
    database_url: str
    otp_ttl_minutes: int = 10
    otp_dev_mode: bool = True
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_from_email: str | None = None
    smtp_from_name: str = "Three65"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    default_admin_email: str | None = None
    default_admin_password: str | None = None
    default_portal_email: str | None = None
    default_portal_password: str | None = None
    default_portal_company: str | None = None
    fdms_api_url: str = "https://fdmsapitest.zimra.co.zw"
    fdms_verify_ssl: bool = True
    fdms_timeout_seconds: int = 30
    paynow_integration_id: str | None = None
    paynow_integration_key: str | None = None
    paynow_return_url: str | None = None
    paynow_result_url: str | None = None
    paynow_monthly_amount_usd: float = 13.0
    paynow_yearly_amount_usd: float = 130.0
    odoo_url: str | None = None
    odoo_database: str | None = None
    odoo_login: str | None = None
    odoo_api_key: str | None = None
    odoo_bearer_token: str | None = None
    odoo_timeout_seconds: int = 30

    class Config:
        env_file = ".env"


settings = Settings()
