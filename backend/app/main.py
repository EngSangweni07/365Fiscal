from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.api.routes import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
import app.models  # noqa: F401
from app.models.user import User
from app.models.company import Company
from app.models.company_user import CompanyUser
from app.models.role import Role, SYSTEM_ROLES
from app.security.security import hash_password

app = FastAPI(
    title=settings.app_name,
    description="Multi-Company Invoicing & Fiscalization System",
    version="2.0.0",
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if origins:
    app.add_middleware(
        CORSMiddleware,
        # allow_origins=[origins]
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix="/api")

_startup_logger = logging.getLogger("startup")


@app.on_event("startup")
def ensure_required_tables_exist():
    """Create any missing mapped tables if migrations were not applied."""
    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except Exception:
        _startup_logger.exception("Failed ensuring required database tables")
        raise


@app.on_event("startup")
def ensure_new_columns():
    """Add columns that create_all cannot add to existing tables.

    create_all (above) handles brand-new tables (pos_tills, pos_till_employees),
    but it will NOT alter an existing pos_orders table to add new columns.
    This function inspects the live schema and patches it.
    """
    from sqlalchemy import inspect as sa_inspect, text

    _startup_logger.info(">>> ensure_new_columns: STARTING column migration check")
    try:
        insp = sa_inspect(engine)
        table_names = set(insp.get_table_names())
        _startup_logger.info(">>> ensure_new_columns: found %d tables", len(table_names))

        with engine.begin() as conn:
            if "pos_orders" in table_names:
                cols = {c["name"] for c in insp.get_columns("pos_orders")}
                _startup_logger.info(">>> ensure_new_columns: pos_orders columns = %s", cols)

                if "cashier_name" not in cols:
                    _startup_logger.info(">>> Adding cashier_name column to pos_orders")
                    conn.execute(text(
                        "ALTER TABLE pos_orders ADD COLUMN cashier_name VARCHAR(200) DEFAULT ''"
                    ))
                    _startup_logger.info(">>> cashier_name column added successfully")
                else:
                    _startup_logger.info(">>> cashier_name column already exists")

                if "till_id" not in cols:
                    _startup_logger.info(">>> Adding till_id column to pos_orders")
                    conn.execute(text(
                        "ALTER TABLE pos_orders ADD COLUMN till_id INTEGER"
                    ))
                    _startup_logger.info(">>> till_id column added successfully")
                else:
                    _startup_logger.info(">>> till_id column already exists")
            else:
                _startup_logger.info(">>> ensure_new_columns: pos_orders table not found — skipping pos_orders patch")

            if "locations" in table_names:
                location_cols = {c["name"] for c in insp.get_columns("locations")}
                if "is_scrap" not in location_cols:
                    _startup_logger.info(">>> Adding is_scrap column to locations")
                    conn.execute(text(
                        "ALTER TABLE locations ADD COLUMN is_scrap BOOLEAN DEFAULT FALSE"
                    ))
                    _startup_logger.info(">>> is_scrap column added successfully")
                else:
                    _startup_logger.info(">>> is_scrap column already exists")

            if "companies" in table_names:
                company_cols = {c["name"] for c in insp.get_columns("companies")}
                if "portal_apps" not in company_cols:
                    _startup_logger.info(">>> Adding portal_apps column to companies")
                    conn.execute(text(
                        "ALTER TABLE companies ADD COLUMN portal_apps VARCHAR(1000) DEFAULT ''"
                    ))
                    _startup_logger.info(">>> portal_apps column added successfully")
                else:
                    _startup_logger.info(">>> portal_apps column already exists")

            if "company_users" in table_names:
                company_user_cols = {c["name"] for c in insp.get_columns("company_users")}
                if "portal_apps" not in company_user_cols:
                    _startup_logger.info(">>> Adding portal_apps column to company_users")
                    conn.execute(text(
                        "ALTER TABLE company_users ADD COLUMN portal_apps VARCHAR(1000) DEFAULT ''"
                    ))
                    _startup_logger.info(">>> company_users.portal_apps column added successfully")
                else:
                    _startup_logger.info(">>> company_users.portal_apps column already exists")

            if "users" in table_names:
                user_cols = {c["name"] for c in insp.get_columns("users")}
                if "name" not in user_cols:
                    _startup_logger.info(">>> Adding name column to users")
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN name VARCHAR(255) DEFAULT ''"
                    ))
                    _startup_logger.info(">>> users.name column added successfully")
                else:
                    _startup_logger.info(">>> users.name column already exists")

            if "demo_accounts" in table_names:
                demo_cols = {c["name"] for c in insp.get_columns("demo_accounts")}
                if "user_id" not in demo_cols:
                    _startup_logger.info(">>> Adding user_id column to demo_accounts")
                    conn.execute(text(
                        "ALTER TABLE demo_accounts ADD COLUMN user_id INTEGER"
                    ))
                else:
                    _startup_logger.info(">>> demo_accounts.user_id column already exists")

                if "company_id" not in demo_cols:
                    _startup_logger.info(">>> Adding company_id column to demo_accounts")
                    conn.execute(text(
                        "ALTER TABLE demo_accounts ADD COLUMN company_id INTEGER"
                    ))
                else:
                    _startup_logger.info(">>> demo_accounts.company_id column already exists")

                if "wants_actual_three65" not in demo_cols:
                    _startup_logger.info(">>> Adding wants_actual_three65 column to demo_accounts")
                    conn.execute(text(
                        "ALTER TABLE demo_accounts ADD COLUMN wants_actual_three65 BOOLEAN DEFAULT FALSE"
                    ))

                if "requested_apps" not in demo_cols:
                    _startup_logger.info(">>> Adding requested_apps column to demo_accounts")
                    conn.execute(text(
                        "ALTER TABLE demo_accounts ADD COLUMN requested_apps VARCHAR(1000) DEFAULT ''"
                    ))

                if "subscription_period" not in demo_cols:
                    _startup_logger.info(">>> Adding subscription_period column to demo_accounts")
                    conn.execute(text(
                        "ALTER TABLE demo_accounts ADD COLUMN subscription_period VARCHAR(20) DEFAULT 'monthly'"
                    ))

                if "payment_link" not in demo_cols:
                    _startup_logger.info(">>> Adding payment_link column to demo_accounts")
                    conn.execute(text(
                        "ALTER TABLE demo_accounts ADD COLUMN payment_link VARCHAR(1000) DEFAULT ''"
                    ))

                if "tin" not in demo_cols:
                    _startup_logger.info(">>> Adding tin column to demo_accounts")
                    conn.execute(text(
                        "ALTER TABLE demo_accounts ADD COLUMN tin VARCHAR(100) DEFAULT ''"
                    ))

                if "vat_number" not in demo_cols:
                    _startup_logger.info(">>> Adding vat_number column to demo_accounts")
                    conn.execute(text(
                        "ALTER TABLE demo_accounts ADD COLUMN vat_number VARCHAR(100) DEFAULT ''"
                    ))

                if "trade_name" not in demo_cols:
                    _startup_logger.info(">>> Adding trade_name column to demo_accounts")
                    conn.execute(text(
                        "ALTER TABLE demo_accounts ADD COLUMN trade_name VARCHAR(255) DEFAULT ''"
                    ))

                if "address" not in demo_cols:
                    _startup_logger.info(">>> Adding address column to demo_accounts")
                    conn.execute(text(
                        "ALTER TABLE demo_accounts ADD COLUMN address VARCHAR(1000) DEFAULT ''"
                    ))

            if "pos_tills" in table_names:
                till_cols = {c["name"] for c in insp.get_columns("pos_tills")}
                if "warehouse_id" not in till_cols:
                    _startup_logger.info(">>> Adding warehouse_id column to pos_tills")
                    conn.execute(text(
                        "ALTER TABLE pos_tills ADD COLUMN warehouse_id INTEGER"
                    ))
                    _startup_logger.info(">>> Adding foreign key fk_pos_tills_warehouse_id")
                    conn.execute(text(
                        "ALTER TABLE pos_tills ADD CONSTRAINT fk_pos_tills_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)"
                    ))
                    _startup_logger.info(">>> warehouse_id column added successfully")
                else:
                    _startup_logger.info(">>> warehouse_id column already exists")

                if "fiscal_device_id" not in till_cols:
                    _startup_logger.info(">>> Adding fiscal_device_id column to pos_tills")
                    conn.execute(text(
                        "ALTER TABLE pos_tills ADD COLUMN fiscal_device_id INTEGER"
                    ))
                    _startup_logger.info(">>> Adding foreign key fk_pos_tills_fiscal_device_id")
                    conn.execute(text(
                        "ALTER TABLE pos_tills ADD CONSTRAINT fk_pos_tills_fiscal_device_id FOREIGN KEY (fiscal_device_id) REFERENCES devices(id)"
                    ))
                    _startup_logger.info(">>> fiscal_device_id column added successfully")
                else:
                    _startup_logger.info(">>> fiscal_device_id column already exists")

            _startup_logger.info(">>> ensure_new_columns: COMPLETE")

            # Stamp alembic so 'alembic upgrade head' won't re-run this migration
            if "alembic_version" in table_names:
                row = conn.execute(text(
                    "SELECT version_num FROM alembic_version"
                )).fetchone()
                current = row[0] if row else None
                if current and current != "z2x3c4v5b6":
                    _startup_logger.info(
                        "Stamping alembic to z2x3c4v5b6 (was %s)", current
                    )
                    conn.execute(text(
                        "UPDATE alembic_version SET version_num = 'z2x3c4v5b6'"
                    ))
    except Exception:
        _startup_logger.exception("!!! ensure_new_columns FAILED — will continue startup")


@app.on_event("startup")
def ensure_system_roles():
    """Initialize or update system roles on startup."""
    db = SessionLocal()
    try:
        for role_data in SYSTEM_ROLES:
            existing = db.query(Role).filter(Role.name == role_data["name"]).first()
            if existing:
                # Update existing role
                for key, value in role_data.items():
                    setattr(existing, key, value)
            else:
                # Create new role
                role = Role(**role_data)
                db.add(role)
        db.commit()
    except Exception as e:
        # Race condition: another worker may have already inserted the rows
        db.rollback()
    finally:
        db.close()


@app.on_event("startup")
def ensure_default_admin():
    if not settings.default_admin_email or not settings.default_admin_password:
        return
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == settings.default_admin_email).first()
        if not existing:
            admin = User(
                email=settings.default_admin_email,
                hashed_password=hash_password(settings.default_admin_password),
                is_admin=True,
                is_active=True,
            )
            db.add(admin)
        else:
            existing.hashed_password = hash_password(settings.default_admin_password)
            existing.is_admin = True
            existing.is_active = True
        db.commit()
    except Exception:
        # Race condition: another worker already created the admin user
        db.rollback()
    finally:
        db.close()


@app.on_event("startup")
def ensure_default_portal_user():
    if not settings.default_portal_email or not settings.default_portal_password or not settings.default_portal_company:
        return
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.name == settings.default_portal_company).first()
        if not company:
            company = Company(name=settings.default_portal_company)
            db.add(company)
            db.flush()
        user = db.query(User).filter(User.email == settings.default_portal_email).first()
        if not user:
            user = User(
                email=settings.default_portal_email,
                hashed_password=hash_password(settings.default_portal_password),
                is_admin=False,
                is_active=True,
            )
            db.add(user)
            db.flush()
        else:
            user.hashed_password = hash_password(settings.default_portal_password)
            user.is_admin = False
            user.is_active = True
        
        # Get company_admin role
        company_admin_role = db.query(Role).filter(Role.name == "company_admin").first()
        
        link = (
            db.query(CompanyUser)
            .filter(CompanyUser.company_id == company.id, CompanyUser.user_id == user.id)
            .first()
        )
        if not link:
            db.add(CompanyUser(
                company_id=company.id, 
                user_id=user.id, 
                role="company_admin",
                role_id=company_admin_role.id if company_admin_role else None,
                is_active=True,
                is_company_admin=True,
            ))
        else:
            link.role = "company_admin"
            link.is_company_admin = True
            if company_admin_role:
                link.role_id = company_admin_role.id
        db.commit()
    except Exception:
        # Race condition: another worker already created the portal user/company
        db.rollback()
    finally:
        db.close()


# --------------- Background device ping scheduler ---------------
import threading
import time
import logging
import sys
import os

_ping_logger = logging.getLogger("device_ping")
_ping_logger.setLevel(logging.INFO)
if not _ping_logger.handlers:
    _handler = logging.StreamHandler(sys.stderr)
    _handler.setFormatter(logging.Formatter("[%(asctime)s] %(name)s %(levelname)s: %(message)s"))
    _ping_logger.addHandler(_handler)

# Only start one ping thread across workers (use PID file to coordinate)
_PING_LOCK_FILE = "/tmp/365fiscal_ping.lock"


def _ping_all_devices():
    """Ping every registered device that has a certificate to keep them online."""
    from app.models.device import Device
    from app.services.fdms import ping_device
    from datetime import datetime

    db = SessionLocal()
    try:
        devices = (
            db.query(Device)
            .filter(Device.crt_data.isnot(None), Device.key_data.isnot(None))
            .all()
        )
        _ping_logger.info("Found %d registered devices to ping", len(devices))
        for device in devices:
            try:
                result = ping_device(device, db)
                device.last_ping_at = datetime.utcnow()
                if result.get("reportingFrequency"):
                    device.reporting_frequency = int(result["reportingFrequency"])
                db.commit()
                _ping_logger.info("Pinged device %s (ID %s) OK", device.device_id, device.id)
            except Exception as e:
                _ping_logger.warning("Ping failed for device %s: %s", device.device_id, e)
                db.rollback()
    except Exception as e:
        _ping_logger.error("Ping loop error: %s", e)
    finally:
        db.close()


def _ping_loop():
    """Background thread that pings devices every 3 minutes."""
    _ping_logger.info("Ping loop thread started, first ping in 10 seconds...")
    time.sleep(10)  # wait for app to be fully ready
    while True:
        try:
            _ping_all_devices()
        except Exception as e:
            _ping_logger.error("Ping loop exception: %s", e)
        time.sleep(180)  # 3 minutes


@app.on_event("startup")
def start_ping_scheduler():
    """Start the background ping thread on app startup (only in first worker)."""
    try:
        # Simple coordination: only the first worker to grab the lock file starts the thread
        pid = str(os.getpid())
        if os.path.exists(_PING_LOCK_FILE):
            try:
                with open(_PING_LOCK_FILE) as f:
                    old_pid = f.read().strip()
                # Check if old process is still alive
                if old_pid and os.path.exists(f"/proc/{old_pid}"):
                    _ping_logger.info("Ping scheduler already running in PID %s, skipping", old_pid)
                    return
            except Exception:
                pass
        with open(_PING_LOCK_FILE, "w") as f:
            f.write(pid)
        t = threading.Thread(target=_ping_loop, daemon=True, name="device-ping")
        t.start()
        _ping_logger.info("Device ping scheduler started in PID %s (every 3 min)", pid)
    except Exception as e:
        _ping_logger.error("Failed to start ping scheduler: %s", e)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db-check")
def db_check():
    """Diagnostic: show pos_orders columns and table list."""
    from sqlalchemy import inspect as sa_inspect
    try:
        insp = sa_inspect(engine)
        tables = sorted(insp.get_table_names())
        pos_cols = []
        if "pos_orders" in tables:
            pos_cols = [c["name"] for c in insp.get_columns("pos_orders")]
        return {
            "tables": tables,
            "pos_orders_columns": pos_cols,
            "has_cashier_name": "cashier_name" in pos_cols,
            "has_till_id": "till_id" in pos_cols,
            "has_pos_tills": "pos_tills" in tables,
            "has_pos_till_employees": "pos_till_employees" in tables,
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": "2.0.0",
        "description": "Multi-Company Invoicing & Fiscalization System",
        "docs": "/docs",
        "health": "/health",
    }
