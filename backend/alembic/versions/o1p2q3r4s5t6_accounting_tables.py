"""accounting tables

Revision ID: o1p2q3r4s5t6
Revises: n7o8p9q0r1s2
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "o1p2q3r4s5t6"
down_revision = "n7o8p9q0r1s2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- accounts ---
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("account_type", sa.String(length=50), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("is_reconcilable", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("currency_code", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["parent_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_accounts_company_id", "accounts", ["company_id"])
    op.create_index("ix_accounts_code", "accounts", ["code"])

    # --- journals ---
    op.create_table(
        "journals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=10), nullable=False),
        sa.Column("journal_type", sa.String(length=20), nullable=False),
        sa.Column("default_account_id", sa.Integer(), nullable=True),
        sa.Column("currency_code", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["default_account_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_journals_company_id", "journals", ["company_id"])

    # --- journal_entries ---
    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("journal_id", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(length=100), nullable=False),
        sa.Column("entry_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("narration", sa.Text(), nullable=False, server_default=""),
        sa.Column("invoice_id", sa.Integer(), nullable=True),
        sa.Column("payment_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["journal_id"], ["journals.id"]),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_journal_entries_company_id", "journal_entries", ["company_id"])
    op.create_index("ix_journal_entries_journal_id", "journal_entries", ["journal_id"])
    op.create_index("ix_journal_entries_reference", "journal_entries", ["reference"])

    # --- journal_entry_lines ---
    op.create_table(
        "journal_entry_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entry_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("contact_id", sa.Integer(), nullable=True),
        sa.Column("label", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("debit", sa.Float(), nullable=False, server_default="0"),
        sa.Column("credit", sa.Float(), nullable=False, server_default="0"),
        sa.Column("currency_code", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["entry_id"], ["journal_entries.id"]),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_journal_entry_lines_entry_id", "journal_entry_lines", ["entry_id"])
    op.create_index("ix_journal_entry_lines_account_id", "journal_entry_lines", ["account_id"])

    # --- payment_terms ---
    op.create_table(
        "payment_terms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("due_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("discount_percentage", sa.Float(), nullable=False, server_default="0"),
        sa.Column("discount_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payment_terms_company_id", "payment_terms", ["company_id"])

    # --- fiscal_positions ---
    op.create_table(
        "fiscal_positions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("auto_apply", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fiscal_positions_company_id", "fiscal_positions", ["company_id"])

    # --- fiscal_position_taxes ---
    op.create_table(
        "fiscal_position_taxes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("fiscal_position_id", sa.Integer(), nullable=False),
        sa.Column("source_tax_id", sa.Integer(), nullable=True),
        sa.Column("destination_tax_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["fiscal_position_id"], ["fiscal_positions.id"]),
        sa.ForeignKeyConstraint(["source_tax_id"], ["tax_settings.id"]),
        sa.ForeignKeyConstraint(["destination_tax_id"], ["tax_settings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fiscal_position_taxes_fp_id", "fiscal_position_taxes", ["fiscal_position_id"])

    # --- budgets ---
    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("date_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("date_to", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_budgets_company_id", "budgets", ["company_id"])

    # --- budget_lines ---
    op.create_table(
        "budget_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("budget_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=True),
        sa.Column("planned_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("practical_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["budget_id"], ["budgets.id"]),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_budget_lines_budget_id", "budget_lines", ["budget_id"])


def downgrade() -> None:
    op.drop_table("budget_lines")
    op.drop_table("budgets")
    op.drop_table("fiscal_position_taxes")
    op.drop_table("fiscal_positions")
    op.drop_table("payment_terms")
    op.drop_table("journal_entry_lines")
    op.drop_table("journal_entries")
    op.drop_table("journals")
    op.drop_table("accounts")
