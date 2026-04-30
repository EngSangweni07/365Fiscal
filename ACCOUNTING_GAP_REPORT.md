# 365Fiscal Accounting Gap Report and Roadmap

Date: 2026-04-30

## Scope

This audit compares the existing `365Fiscal` repository against the supplied Odoo Accounting function list. The repository is not an installable Odoo addon: there is no `__manifest__.py`. It is a standalone FastAPI and React application with Odoo sync hooks, so this report treats it as a custom accounting/fiscalization system rather than a native Odoo Accounting module.

## Current Coverage

Implemented foundations:

- FastAPI backend with SQLAlchemy models and Alembic migrations.
- React/Vite frontend with pages for invoices, purchases, payments, inventory, reports, accounting overview, accounting reports, and accounting configuration.
- Multi-company access via companies, company users, roles, and portal app access.
- Invoices, credit notes, payments, purchase orders, expenses, products, stock moves, stock valuation, fiscal devices, ZIMRA tax settings, and audit logs.
- Accounting primitives: chart of accounts, journals, journal entries, journal entry lines, payment terms, fiscal positions, budgets, and account mappings.
- Automated journal posting for invoices, payments, expenses, purchases, POS, and stock moves.
- Financial reports: Balance Sheet, Profit and Loss, Cash Flow, Executive Summary, Trial Balance, General Ledger, Partner Ledger, Aged Receivable, Aged Payable, and Tax Return.

Implemented during this audit:

- Partner Ledger backend endpoint: `GET /api/accounting/reports/partner-ledger`.
- Partner Ledger frontend report tab under Accounting Reports.

## Gap Matrix

| Area | Existing coverage | Gap status | Main gaps |
| --- | --- | --- | --- |
| Invoicing and Billing | Customer invoices, quotation-to-invoice flow, invoice sequences, credit notes, invoice PDF/print UI, ZIMRA fiscalization, invoice lifecycle. | Partial | No automatic invoicing from sales orders, tasks, delivery orders, or recurring contracts. Vendor bills are represented as purchase orders, not full AP bills. No multilingual invoice sending, Peppol/e-invoicing, or full template designer comparable to Odoo. |
| Payments and Accounts Receivable | Payment records, payment methods, partial/full invoice payment, payment reconciliation status, payment summary, journal posting. | Partial | No automated overdue reminders, escalation rules, batch payments, SEPA transfers, check printing, payment providers for AR settlement, or bank statement payment matching. |
| Bank and Reconciliation | Bank/cash journals, payment posting, basic reconcile flag. | Major gap | No bank account model, bank statement import/API sync, reconciliation rules, match suggestions, bank feed, statement line model, or interactive reconciliation workspace. |
| General Ledger and Journal Entries | Double-entry validation, draft/post/cancel/reverse journal entries, generic chart install, journal backfill from operations, account mappings. | Strong partial | No fiscal period lock/close, recurring journal entries, mass journal editing, opening balance wizard, journal sequencing controls, or full audit drilldown per report line. |
| Tax Management | Tax settings, ZIMRA tax pull from FDMS, tax fields on invoices/expenses, tax return summary. | Partial | No tax grids, cash-basis tax reporting, tax-on-tax, partial exemptions engine, tax audit line drilldown, regional packs beyond Zimbabwe/ZIMRA, electronic tax filing workflow, or multi-jurisdiction rules. |
| Financial Reporting | Balance Sheet, P&L, Cash Flow, Trial Balance, General Ledger, Partner Ledger, Aged AR/AP, Tax Return, Executive Summary, print/PDF path. | Partial to strong | Reports mix true journal data with operational fallbacks; Balance Sheet/P&L need to be fully journal-account based. Accounting reports lack first-class Excel export and report definitions/comparative periods. |
| Analytic Accounting and Budgeting | Account-level budgets with planned vs practical amounts. | Major gap | No analytic accounts, analytic plans/sub-plans, project/department/cost-center dimensions, analytic distributions, applicability rules, or analytic item mass editing. |
| Fixed Assets and Depreciation | Fixed asset accounts exist in the generic chart. | Major gap | No asset register, depreciation boards, automated depreciation entries, disposal workflow, asset categories, or amortization schedules. |
| Multi-Currency and Multi-Company | Company-specific currencies and rates, invoice/payment currencies, multi-company access. | Partial | No dual company/transaction currency amounts on journal lines, FX revaluation, realized/unrealized FX gains/losses, consolidated reports, or automated intercompany entries. |
| AI and Automation | Automated journal creation/backfill; FDMS device ping automation. | Major gap | No AI invoice/bill OCR, document digitization queue, AI reconciliation, automated cash-flow forecasting, or workflow recommendations. |
| Fiscal Localization and Compliance | ZIMRA fiscalization, tax pull from FDMS, fiscal devices, audit logs. | Partial | No country localization package installer, fiscal period closing workflows, legal statement templates, statutory exports, or immutable accounting lock dates. |
| Integration with Other Modules | Integrated custom modules for invoices, purchases, inventory, POS, products, contacts, expenses; Odoo demo-interest sync via JSON-2/XML-RPC. | Partial | Not a native Odoo module. No direct CRM/sales/manufacturing/HR accounting integration. No broad import/export framework across all accounting documents. |
| Security and Access Control | JWT auth, role permissions, company access checks, audit logs, portal modes. | Partial | No explicit data-at-rest encryption implementation, backup orchestration, accountant firm mode, maker/checker approvals, or field-level sensitive accounting access rules. |

## Functional Specification

### Product Goal

365Fiscal should become a fiscal-compliant accounting and business operations system for small and mid-sized companies, with a clear accounting core that can operate standalone or integrate with Odoo as a source/sink for commercial documents.

### Primary Users

- Company administrator: configures companies, users, fiscal devices, taxes, chart of accounts, and settings.
- Accountant: manages invoices, payments, expenses, journals, reports, tax returns, and audit trail.
- Sales user: creates customers, quotations, and invoices.
- Inventory manager: manages products, warehouses, stock, and valuation entries.
- External accountant: future role with scoped accounting access.

### Required Workflows

- Customer invoice: draft, post, optional fiscalize, send/print, partial/full payment, reconcile, credit note.
- Vendor bill: draft, validate, post payable, pay, reconcile, refund/debit note.
- Bank reconciliation: import/sync statement lines, auto-match to open invoices/payments, create write-off or bank fee entries, reconcile.
- Manual journals: draft balanced entry, post, reverse, cancel if allowed by lock dates.
- Period close: review unreconciled items, post recurring/accrual/depreciation entries, lock period, produce reports.
- Tax return: compute tax by configured tax grids, drill down to source lines, export or file.
- Multi-currency: store transaction and company currency, post FX differences, revalue open items.

## Roadmap

1. Architecture decision: keep 365Fiscal standalone, or create a true Odoo addon with `__manifest__.py` depending on Odoo `account`, `sale`, `purchase`, `stock`, and localization modules.
2. Accounting integrity: make all financial reports journal-entry based, add accounting periods, lock dates, opening balances, journal sequences, recurring entries, and vendor bills.
3. Bank and reconciliation: add bank accounts, statements, imports, matching rules, reconciliation UI, partial reconciliation, write-offs, and bank charges.
4. Taxes and compliance: implement tax grids, repartition/account mapping, included/excluded pricing, cash-basis mode, tax audit report, fiscal periods, and statutory exports.
5. Analytics, assets, and multi-currency: add analytic dimensions, asset register/depreciation/disposal, transaction/company currency journal amounts, FX gains/losses, and consolidation.
6. Automation and AI: add document OCR, automated payment reminders, cash-flow forecasts, and assisted reconciliation.

Highest priority gaps for Odoo Accounting parity:

1. Bank statements and reconciliation.
2. Vendor bills and accounts payable lifecycle.
3. Period locks, closing workflow, and journal-based reports.
4. Tax grids/audit report and statutory exports.
5. Multi-currency accounting on journal lines.
6. Analytic accounting.
7. Fixed assets.
8. Automated reminders and batch payments.
9. Native Odoo addon packaging only if the deployment target is Odoo itself.

