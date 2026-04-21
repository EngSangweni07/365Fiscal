"""account mapping fields

Revision ID: a1b2c3d4e5f7
Revises: o1p2q3r4s5t6
Create Date: 2026-04-21 17:05:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f7"
down_revision = "o1p2q3r4s5t6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table_name in ("products", "categories"):
        op.add_column(table_name, sa.Column("income_account_id", sa.Integer(), nullable=True))
        op.add_column(table_name, sa.Column("expense_account_id", sa.Integer(), nullable=True))
        op.add_column(table_name, sa.Column("inventory_account_id", sa.Integer(), nullable=True))
        op.add_column(table_name, sa.Column("cogs_account_id", sa.Integer(), nullable=True))
        op.create_foreign_key(f"fk_{table_name}_income_account_id", table_name, "accounts", ["income_account_id"], ["id"])
        op.create_foreign_key(f"fk_{table_name}_expense_account_id", table_name, "accounts", ["expense_account_id"], ["id"])
        op.create_foreign_key(f"fk_{table_name}_inventory_account_id", table_name, "accounts", ["inventory_account_id"], ["id"])
        op.create_foreign_key(f"fk_{table_name}_cogs_account_id", table_name, "accounts", ["cogs_account_id"], ["id"])

    op.add_column("contacts", sa.Column("receivable_account_id", sa.Integer(), nullable=True))
    op.add_column("contacts", sa.Column("payable_account_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_contacts_receivable_account_id", "contacts", "accounts", ["receivable_account_id"], ["id"])
    op.create_foreign_key("fk_contacts_payable_account_id", "contacts", "accounts", ["payable_account_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_contacts_payable_account_id", "contacts", type_="foreignkey")
    op.drop_constraint("fk_contacts_receivable_account_id", "contacts", type_="foreignkey")
    op.drop_column("contacts", "payable_account_id")
    op.drop_column("contacts", "receivable_account_id")

    for table_name in ("categories", "products"):
        op.drop_constraint(f"fk_{table_name}_cogs_account_id", table_name, type_="foreignkey")
        op.drop_constraint(f"fk_{table_name}_inventory_account_id", table_name, type_="foreignkey")
        op.drop_constraint(f"fk_{table_name}_expense_account_id", table_name, type_="foreignkey")
        op.drop_constraint(f"fk_{table_name}_income_account_id", table_name, type_="foreignkey")
        op.drop_column(table_name, "cogs_account_id")
        op.drop_column(table_name, "inventory_account_id")
        op.drop_column(table_name, "expense_account_id")
        op.drop_column(table_name, "income_account_id")
