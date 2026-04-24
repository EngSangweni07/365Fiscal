import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Calculator,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Layers,
  PencilLine,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import { apiFetch } from "../api";
import { useCompanies, Company } from "../hooks/useCompanies";
import { useMe } from "../hooks/useMe";
import { SidebarMenu } from "../components/SidebarMenu";
import type { SidebarMenuItem } from "../components/SidebarMenu";

/* ── Types ───────────────────────────────────────────── */
type Account = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  account_type: string;
  parent_id: number | null;
  is_reconcilable: boolean;
  is_active: boolean;
  currency_code: string;
  notes: string;
};

type Journal = {
  id: number;
  company_id: number;
  name: string;
  code: string;
  journal_type: string;
  default_account_id: number | null;
  currency_code: string;
  is_active: boolean;
};

type PaymentTermItem = {
  id: number;
  company_id: number;
  name: string;
  description: string;
  due_days: number;
  discount_percentage: number;
  discount_days: number;
  is_active: boolean;
};

type FiscalPosition = {
  id: number;
  company_id: number;
  name: string;
  description: string;
  auto_apply: boolean;
  is_active: boolean;
};

type Budget = {
  id: number;
  company_id: number;
  name: string;
  date_from: string;
  date_to: string;
  status: string;
  notes: string;
  lines: { id: number; account_id: number | null; planned_amount: number; practical_amount: number }[];
};

type ProductMapping = {
  id: number;
  name: string;
  reference: string;
  income_account_id: number | null;
  expense_account_id: number | null;
  inventory_account_id: number | null;
  cogs_account_id: number | null;
};

type CategoryMapping = {
  id: number;
  name: string;
  income_account_id: number | null;
  expense_account_id: number | null;
  inventory_account_id: number | null;
  cogs_account_id: number | null;
};

type ContactMapping = {
  id: number;
  name: string;
  reference: string;
  receivable_account_id: number | null;
  payable_account_id: number | null;
};

type SectionKey =
  | "chart_of_accounts"
  | "journals"
  | "payment_terms"
  | "fiscal_positions"
  | "budgets"
  | "account_mappings";

const SECTION_LABELS: Record<SectionKey, string> = {
  chart_of_accounts: "Chart of Accounts",
  journals: "Journals",
  payment_terms: "Payment Terms",
  fiscal_positions: "Fiscal Positions",
  budgets: "Budgets",
  account_mappings: "Account Mappings",
};

const ACCOUNT_TYPES = [
  { value: "asset", label: "Asset" },
  { value: "current_asset", label: "Current Asset" },
  { value: "fixed_asset", label: "Fixed Asset" },
  { value: "non_current_asset", label: "Non-Current Asset" },
  { value: "bank_cash", label: "Bank and Cash" },
  { value: "receivable", label: "Accounts Receivable" },
  { value: "prepayment", label: "Prepayments" },
  { value: "liability", label: "Liability" },
  { value: "current_liability", label: "Current Liability" },
  { value: "non_current_liability", label: "Non-Current Liability" },
  { value: "payable", label: "Accounts Payable" },
  { value: "credit_card", label: "Credit Card" },
  { value: "equity", label: "Equity" },
  { value: "current_year_earnings", label: "Current Year Earnings" },
  { value: "income", label: "Income" },
  { value: "other_income", label: "Other Income" },
  { value: "expense", label: "Expense" },
  { value: "direct_cost", label: "Direct Cost / Cost of Sales" },
  { value: "depreciation", label: "Depreciation" },
  { value: "off_balance", label: "Off-Balance" },
];

const ACCOUNT_TYPE_LABELS = new Map(
  ACCOUNT_TYPES.map((option) => [option.value, option.label]),
);

const accountTypeFamily = (accountType: string): "asset" | "liability" | "equity" | "income" | "expense" | "other" => {
  const normalized = (accountType || "").toLowerCase().trim();
  if (
    [
      "asset",
      "current_asset",
      "fixed_asset",
      "non_current_asset",
      "bank_cash",
      "receivable",
      "prepayment",
    ].includes(normalized)
  ) {
    return "asset";
  }
  if (
    [
      "liability",
      "current_liability",
      "non_current_liability",
      "payable",
      "credit_card",
    ].includes(normalized)
  ) {
    return "liability";
  }
  if (["equity", "current_year_earnings"].includes(normalized)) {
    return "equity";
  }
  if (["income", "other_income"].includes(normalized)) {
    return "income";
  }
  if (["expense", "direct_cost", "depreciation"].includes(normalized)) {
    return "expense";
  }
  return "other";
};

const accountTypeBadgeStyle = (accountType: string): React.CSSProperties => {
  const family = accountTypeFamily(accountType);
  return {
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    background:
      family === "asset"
        ? "#dbeafe"
        : family === "liability"
          ? "#fde68a"
          : family === "equity"
            ? "#ede9fe"
            : family === "income"
              ? "#d1fae5"
              : family === "expense"
                ? "#fee2e2"
                : "#e5e7eb",
    color:
      family === "asset"
        ? "#1e40af"
        : family === "liability"
          ? "#92400e"
          : family === "equity"
            ? "#6d28d9"
            : family === "income"
              ? "#065f46"
              : family === "expense"
                ? "#991b1b"
                : "#374151",
  };
};

const accountTypeLabel = (accountType: string) =>
  ACCOUNT_TYPE_LABELS.get(accountType) ?? accountType.replace(/_/g, " ");

const JOURNAL_TYPES = [
  { value: "sale", label: "Sales" },
  { value: "purchase", label: "Purchases" },
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
  { value: "general", label: "Miscellaneous" },
];

/* ── Styles ──────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  border: "1px solid var(--border, #e5e7eb)",
  padding: "1.25rem",
  marginBottom: "1rem",
};
const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted, #6b7280)",
  borderBottom: "1px solid var(--border, #e5e7eb)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  borderBottom: "1px solid #f3f4f6",
};
const btnPrimary: React.CSSProperties = {
  padding: "7px 16px",
  fontSize: 13,
  fontWeight: 600,
  color: "#fff",
  background: "var(--primary, #4a7de6)",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};
const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  background: "transparent",
  color: "var(--text-primary, #111)",
  border: "1px solid var(--border, #e5e7eb)",
};
const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  fontSize: 13,
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 6,
  width: "100%",
};
const selectStyle: React.CSSProperties = { ...inputStyle };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-muted, #6b7280)", marginBottom: 4 };

/* ── Component ───────────────────────────────────────── */
export default function AccountingConfigPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { companies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey>("chart_of_accounts");

  // Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermItem[]>([]);
  const [fiscalPositions, setFiscalPositions] = useState<FiscalPosition[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [productMappings, setProductMappings] = useState<ProductMapping[]>([]);
  const [categoryMappings, setCategoryMappings] = useState<CategoryMapping[]>([]);
  const [contactMappings, setContactMappings] = useState<ContactMapping[]>([]);

  // Forms
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [exportingMappings, setExportingMappings] = useState(false);
  const [importingMappings, setImportingMappings] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const loadAccountMappings = async (targetCompanyId: number) => {
    const [accountList, products, categories, contacts] = await Promise.all([
      apiFetch<Account[]>(`/accounting/accounts?company_id=${targetCompanyId}`),
      apiFetch<ProductMapping[]>(`/products?company_id=${targetCompanyId}`),
      apiFetch<CategoryMapping[]>(`/categories?company_id=${targetCompanyId}`),
      apiFetch<ContactMapping[]>(`/contacts?company_id=${targetCompanyId}`),
    ]);
    setAccounts(accountList.filter((a) => a.is_active));
    setProductMappings(products);
    setCategoryMappings(categories);
    setContactMappings(contacts);
  };

  // Company selection
  useEffect(() => {
    if (!isAdmin && me?.company_ids?.length && !companyId) {
      setCompanyId(me.company_ids[0]);
    }
  }, [isAdmin, me?.company_ids, companyId]);

  const filteredCompanies = useMemo(() => {
    if (!companyQuery.trim()) return companies;
    const q = companyQuery.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tin && c.tin.toLowerCase().includes(q)),
    );
  }, [companies, companyQuery]);

  const currentCompany = useMemo(
    () => companies.find((company) => company.id === companyId) ?? null,
    [companies, companyId],
  );

  // Fetch data on company/section change
  useEffect(() => {
    if (!companyId) return;
    setError(null);
    const fetchMap: Record<SectionKey, () => void> = {
      chart_of_accounts: () =>
        apiFetch<Account[]>(`/accounting/accounts?company_id=${companyId}`)
          .then(setAccounts)
          .catch(() => setAccounts([])),
      journals: () =>
        apiFetch<Journal[]>(`/accounting/journals?company_id=${companyId}`)
          .then(setJournals)
          .catch(() => setJournals([])),
      payment_terms: () =>
        apiFetch<PaymentTermItem[]>(`/accounting/payment-terms?company_id=${companyId}`)
          .then(setPaymentTerms)
          .catch(() => setPaymentTerms([])),
      fiscal_positions: () =>
        apiFetch<FiscalPosition[]>(`/accounting/fiscal-positions?company_id=${companyId}`)
          .then(setFiscalPositions)
          .catch(() => setFiscalPositions([])),
      budgets: () =>
        Promise.all([
          apiFetch<Budget[]>(`/accounting/budgets?company_id=${companyId}`),
          apiFetch<Account[]>(`/accounting/accounts?company_id=${companyId}`),
        ])
          .then(([budgetList, accountList]) => {
            setBudgets(budgetList);
            setAccounts(accountList.filter((a) => a.is_active));
          })
          .catch(() => {
            setBudgets([]);
            setAccounts([]);
          }),
      account_mappings: () =>
        loadAccountMappings(companyId)
          .catch(() => {
            setAccounts([]);
            setProductMappings([]);
            setCategoryMappings([]);
            setContactMappings([]);
          }),
    };
    fetchMap[activeSection]();
  }, [companyId, activeSection]);

  // Sidebar
  const sidebarItems: SidebarMenuItem[] = [
    { key: "chart_of_accounts", label: "CHART OF ACCOUNTS", icon: BookOpen, color: "#4a7de6" },
    { key: "journals", label: "JOURNALS", icon: FileText, color: "#4a7de6" },
    { key: "payment_terms", label: "PAYMENT TERMS", icon: Clock, color: "#4a7de6" },
    { key: "fiscal_positions", label: "FISCAL POSITIONS", icon: Layers, color: "#4a7de6" },
    { key: "budgets", label: "BUDGETS", icon: Calculator, color: "#4a7de6" },
    { key: "account_mappings", label: "ACCOUNT MAPPINGS", icon: Settings, color: "#4a7de6" },
  ];

  // CRUD helpers
  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({});
    setError(null);
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      const endpointMap: Record<SectionKey, string> = {
        chart_of_accounts: "/accounting/accounts",
        journals: "/accounting/journals",
        payment_terms: "/accounting/payment-terms",
        fiscal_positions: "/accounting/fiscal-positions",
        budgets: "/accounting/budgets",
        account_mappings: "",
      };
      const endpoint = endpointMap[activeSection];
      const payloadData =
        activeSection === "budgets"
          ? {
              ...formData,
              lines: (formData.lines || [])
                .filter((line: any) => line.account_id)
                .map((line: any) => ({
                  account_id: Number(line.account_id),
                  planned_amount: Number(line.planned_amount || 0),
                })),
            }
          : formData;
      if (editingId) {
        await apiFetch(`${endpoint}/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payloadData),
        });
      } else {
        await apiFetch(endpoint, {
          method: "POST",
          body: JSON.stringify({ ...payloadData, company_id: companyId }),
        });
      }
      resetForm();
      // Re-fetch
      setActiveSection((prev) => prev);
      // Force re-fetch by toggling a counter
      setCompanyId((prev) => {
        setTimeout(() => setCompanyId(prev), 0);
        return null;
      });
      setTimeout(() => setCompanyId(companyId), 50);
    } catch (err: any) {
      setError(err?.detail || err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (endpoint: string, id: number) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await apiFetch(`${endpoint}/${id}`, { method: "DELETE" });
      setTimeout(() => setCompanyId(companyId), 50);
      setCompanyId(null);
    } catch {
      // ignore
    }
  };

  const handleInstallChart = async () => {
    if (!companyId) return;
    setInstalling(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; accounts_created: number; journals_created: number }>(
        `/accounting/install-chart?company_id=${companyId}`,
        { method: "POST" },
      );
      // Refresh accounts list
      apiFetch<Account[]>(`/accounting/accounts?company_id=${companyId}`)
        .then(setAccounts)
        .catch(() => setAccounts([]));
      apiFetch<Journal[]>(`/accounting/journals?company_id=${companyId}`)
        .then(setJournals)
        .catch(() => setJournals([]));
    } catch (err: any) {
      setError(err?.detail || err?.message || "Failed to install chart of accounts");
    } finally {
      setInstalling(false);
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    const { id, company_id, ...rest } = item;
    setFormData(rest);
    setShowForm(true);
  };

  /* ── Form Rendering ── */
  const renderForm = () => {
    if (!showForm) return null;
    if (activeSection === "budgets") return renderBudgetForm();
    const fields = getFormFields();
    return (
      <div style={card}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
          {editingId ? "Edit" : "New"} {getSectionTitle()}
        </h4>
        {error && (
          <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{error}</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {fields.map((f) => (
            <div key={f.key} style={f.fullWidth ? { gridColumn: "1 / -1" } : {}}>
              <div style={labelStyle}>{f.label}</div>
              {f.type === "select" ? (
                <select
                  style={selectStyle}
                  value={formData[f.key] ?? ""}
                  onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                >
                  <option value="">Select...</option>
                  {f.options?.map((o: any) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={!!formData[f.key]}
                  onChange={(e) => setFormData({ ...formData, [f.key]: e.target.checked })}
                />
              ) : f.type === "number" ? (
                <input
                  type="number"
                  style={inputStyle}
                  value={formData[f.key] ?? ""}
                  onChange={(e) => setFormData({ ...formData, [f.key]: parseFloat(e.target.value) || 0 })}
                />
              ) : f.type === "date" ? (
                <input
                  type="datetime-local"
                  style={inputStyle}
                  value={formData[f.key] ?? ""}
                  onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  type="text"
                  style={inputStyle}
                  value={formData[f.key] ?? ""}
                  onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button style={btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button style={btnSecondary} onClick={resetForm}>
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const getSectionTitle = (): string => {
    const m: Record<SectionKey, string> = {
      chart_of_accounts: "Account",
      journals: "Journal",
      payment_terms: "Payment Term",
      fiscal_positions: "Fiscal Position",
      budgets: "Budget",
      account_mappings: "Account Mapping",
    };
    return m[activeSection];
  };

  type FormField = {
    key: string;
    label: string;
    type: "text" | "number" | "select" | "checkbox" | "date";
    options?: { value: string; label: string }[];
    fullWidth?: boolean;
  };

  const getFormFields = (): FormField[] => {
    switch (activeSection) {
      case "chart_of_accounts":
        return [
          { key: "code", label: "Code", type: "text" },
          { key: "name", label: "Name", type: "text" },
          { key: "account_type", label: "Type", type: "select", options: ACCOUNT_TYPES },
          { key: "currency_code", label: "Currency", type: "text" },
          { key: "is_reconcilable", label: "Reconcilable", type: "checkbox" },
          { key: "notes", label: "Notes", type: "text", fullWidth: true },
        ];
      case "journals":
        return [
          { key: "name", label: "Name", type: "text" },
          { key: "code", label: "Short Code", type: "text" },
          { key: "journal_type", label: "Type", type: "select", options: JOURNAL_TYPES },
          { key: "currency_code", label: "Currency", type: "text" },
        ];
      case "payment_terms":
        return [
          { key: "name", label: "Name", type: "text" },
          { key: "description", label: "Description", type: "text", fullWidth: true },
          { key: "due_days", label: "Due Days", type: "number" },
          { key: "discount_percentage", label: "Discount (%)", type: "number" },
          { key: "discount_days", label: "Discount Days", type: "number" },
        ];
      case "fiscal_positions":
        return [
          { key: "name", label: "Name", type: "text" },
          { key: "description", label: "Description", type: "text", fullWidth: true },
          { key: "auto_apply", label: "Auto Apply", type: "checkbox" },
        ];
      case "budgets":
        return [
          { key: "name", label: "Name", type: "text" },
          { key: "date_from", label: "Date From", type: "date" },
          { key: "date_to", label: "Date To", type: "date" },
          { key: "notes", label: "Notes", type: "text", fullWidth: true },
        ];
      case "account_mappings":
        return [];
      default:
        return [];
    }
  };

  /* ── Table Rendering ── */
  const renderContent = () => {
    switch (activeSection) {
      case "chart_of_accounts":
        return renderAccountsTable();
      case "journals":
        return renderJournalsTable();
      case "payment_terms":
        return renderPaymentTermsTable();
      case "fiscal_positions":
        return renderFiscalPositionsTable();
      case "budgets":
        return renderBudgetsTable();
      case "account_mappings":
        return renderAccountMappings();
      default:
        return null;
    }
  };

  const budgetLines = (formData.lines || [
    { account_id: "", planned_amount: 0 },
  ]) as { account_id: number | ""; planned_amount: number; practical_amount?: number }[];

  const renderBudgetForm = () => (
    <div style={card}>
      <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
        {editingId ? "Edit" : "New"} Budget
      </h4>
      {error && (
        <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{error}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div>
          <div style={labelStyle}>Name</div>
          <input
            type="text"
            style={inputStyle}
            value={formData.name ?? ""}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div>
          <div style={labelStyle}>Date From</div>
          <input
            type="datetime-local"
            style={inputStyle}
            value={formData.date_from ?? ""}
            onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
          />
        </div>
        <div>
          <div style={labelStyle}>Date To</div>
          <input
            type="datetime-local"
            style={inputStyle}
            value={formData.date_to ?? ""}
            onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
          />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={labelStyle}>Budget Lines</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Account</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Planned</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Actual</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Variance</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {budgetLines.map((line, index) => {
              const planned = Number(line.planned_amount || 0);
              const actual = Number(line.practical_amount || 0);
              return (
                <tr key={index}>
                  <td style={tdStyle}>
                    <select
                      style={selectStyle}
                      value={line.account_id ?? ""}
                      onChange={(e) => {
                        const lines = [...budgetLines];
                        lines[index] = { ...line, account_id: Number(e.target.value) || "" };
                        setFormData({ ...formData, lines });
                      }}
                    >
                      <option value="">Select account...</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      style={{ ...inputStyle, textAlign: "right" }}
                      value={line.planned_amount ?? 0}
                      onChange={(e) => {
                        const lines = [...budgetLines];
                        lines[index] = { ...line, planned_amount: Number(e.target.value || 0) };
                        setFormData({ ...formData, lines });
                      }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{actual.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: planned - actual >= 0 ? "#059669" : "#dc2626" }}>
                    {(planned - actual).toFixed(2)}
                  </td>
                  <td style={tdStyle}>
                    <button
                      style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11, color: "#ef4444" }}
                      onClick={() => setFormData({ ...formData, lines: budgetLines.filter((_, i) => i !== index) })}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          style={{ ...btnSecondary, marginTop: 8 }}
          onClick={() => setFormData({
            ...formData,
            lines: [...budgetLines, { account_id: "", planned_amount: 0 }],
          })}
        >
          <Plus size={14} /> Add Line
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={labelStyle}>Notes</div>
        <input
          type="text"
          style={inputStyle}
          value={formData.notes ?? ""}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button style={btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button style={btnSecondary} onClick={resetForm}>
          Cancel
        </button>
      </div>
    </div>
  );

  const accountSelect = (
    value: number | null,
    onChange: (next: number | null) => void,
    type?: string,
  ) => (
    <select
      style={selectStyle}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">Generic default</option>
      {accounts
        .filter((a) => !type || a.account_type === type)
        .map((a) => (
          <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
        ))}
    </select>
  );

  const saveMapping = async (kind: "product" | "category" | "contact", item: any) => {
    const endpoint =
      kind === "product"
        ? `/products/${item.id}`
        : kind === "category"
        ? `/categories/${item.id}`
        : `/contacts/${item.id}`;
    const fields =
      kind === "contact"
        ? {
            receivable_account_id: item.receivable_account_id,
            payable_account_id: item.payable_account_id,
          }
        : {
            income_account_id: item.income_account_id,
            expense_account_id: item.expense_account_id,
            inventory_account_id: item.inventory_account_id,
            cogs_account_id: item.cogs_account_id,
          };
    await apiFetch(endpoint, { method: "PATCH", body: JSON.stringify(fields) });
  };

  const exportMappings = async () => {
    if (!companyId) return;
    setExportingMappings(true);
    setError(null);
    try {
      const payload = await apiFetch<any>(`/accounting/account-mappings/export?company_id=${companyId}`);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `account-mappings-company-${companyId}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Failed to export account mappings");
    } finally {
      setExportingMappings(false);
    }
  };

  const importMappings = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !companyId) return;
    setImportingMappings(true);
    setError(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const result = await apiFetch<any>(`/accounting/account-mappings/import`, {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          overwrite_nulls: true,
          products: parsed.products || [],
          categories: parsed.categories || [],
          contacts: parsed.contacts || [],
        }),
      });
      await loadAccountMappings(companyId);
      const messages = [
        `Updated products: ${result.updated_products}`,
        `Updated categories: ${result.updated_categories}`,
        `Updated contacts: ${result.updated_contacts}`,
      ];
      if (result.unknown_account_codes?.length) {
        messages.push(`Unknown account codes: ${result.unknown_account_codes.join(", ")}`);
      }
      if (result.unmatched_products?.length || result.unmatched_categories?.length || result.unmatched_contacts?.length) {
        messages.push("Some records could not be matched in this company.");
      }
      window.alert(messages.join("\n"));
    } catch (err: any) {
      setError(err?.message || "Failed to import account mappings");
    } finally {
      event.target.value = "";
      setImportingMappings(false);
    }
  };

  const renderAccountMappings = () => (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ ...card, marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary, #111)" }}>
              Mapping Rollout
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted, #6b7280)", marginTop: 4 }}>
              Export portable account-code mappings from one company and import them into another.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btnSecondary} onClick={exportMappings} disabled={exportingMappings || !companyId}>
              <Download size={14} /> {exportingMappings ? "Exporting..." : "Export JSON"}
            </button>
            <button style={btnPrimary} onClick={() => importFileRef.current?.click()} disabled={importingMappings || !companyId}>
              <Upload size={14} /> {importingMappings ? "Importing..." : "Import JSON"}
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={importMappings}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Products</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>Income</th>
              <th style={thStyle}>Expense</th>
              <th style={thStyle}>Inventory</th>
              <th style={thStyle}>COGS</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {productMappings.map((p, index) => (
              <tr key={p.id}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{p.reference ? `${p.reference} - ${p.name}` : p.name}</td>
                {(["income_account_id", "expense_account_id", "inventory_account_id", "cogs_account_id"] as const).map((field) => (
                  <td style={tdStyle} key={field}>
                    {accountSelect(p[field], (next) => {
                      const rows = [...productMappings];
                      rows[index] = { ...p, [field]: next };
                      setProductMappings(rows);
                    })}
                  </td>
                ))}
                <td style={tdStyle}>
                  <button style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }} onClick={() => saveMapping("product", p)}>Save</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Product Categories</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Income</th>
              <th style={thStyle}>Expense</th>
              <th style={thStyle}>Inventory</th>
              <th style={thStyle}>COGS</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categoryMappings.map((c, index) => (
              <tr key={c.id}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{c.name}</td>
                {(["income_account_id", "expense_account_id", "inventory_account_id", "cogs_account_id"] as const).map((field) => (
                  <td style={tdStyle} key={field}>
                    {accountSelect(c[field], (next) => {
                      const rows = [...categoryMappings];
                      rows[index] = { ...c, [field]: next };
                      setCategoryMappings(rows);
                    })}
                  </td>
                ))}
                <td style={tdStyle}>
                  <button style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }} onClick={() => saveMapping("category", c)}>Save</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Customers and Suppliers</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Contact</th>
              <th style={thStyle}>Receivable</th>
              <th style={thStyle}>Payable</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {contactMappings.map((c, index) => (
              <tr key={c.id}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{c.reference ? `${c.reference} - ${c.name}` : c.name}</td>
                <td style={tdStyle}>
                  {accountSelect(c.receivable_account_id, (next) => {
                    const rows = [...contactMappings];
                    rows[index] = { ...c, receivable_account_id: next };
                    setContactMappings(rows);
                  }, "asset")}
                </td>
                <td style={tdStyle}>
                  {accountSelect(c.payable_account_id, (next) => {
                    const rows = [...contactMappings];
                    rows[index] = { ...c, payable_account_id: next };
                    setContactMappings(rows);
                  }, "liability")}
                </td>
                <td style={tdStyle}>
                  <button style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }} onClick={() => saveMapping("contact", c)}>Save</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAccountsTable = () => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thStyle}>Code</th>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Type</th>
          <th style={thStyle}>Currency</th>
          <th style={thStyle}>Reconcilable</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {accounts.length === 0 && (
          <tr>
            <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>
              No accounts yet. Click "New" to create one.
            </td>
          </tr>
        )}
        {accounts.map((a) => (
          <tr key={a.id}>
            <td style={{ ...tdStyle, fontWeight: 600 }}>{a.code}</td>
            <td style={tdStyle}>{a.name}</td>
            <td style={tdStyle}>
              <span style={accountTypeBadgeStyle(a.account_type)}>
                {accountTypeLabel(a.account_type)}
              </span>
            </td>
            <td style={tdStyle}>{a.currency_code}</td>
            <td style={tdStyle}>{a.is_reconcilable ? "Yes" : "No"}</td>
            <td style={tdStyle}>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }}
                  onClick={() => handleEdit(a)}
                >
                  <PencilLine size={12} /> Edit
                </button>
                <button
                  style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11, color: "#ef4444" }}
                  onClick={() => handleDelete("/accounting/accounts", a.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderJournalsTable = () => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thStyle}>Code</th>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Type</th>
          <th style={thStyle}>Currency</th>
          <th style={thStyle}>Active</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {journals.length === 0 && (
          <tr>
            <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>
              No journals yet. Click "New" to create one.
            </td>
          </tr>
        )}
        {journals.map((j) => (
          <tr key={j.id}>
            <td style={{ ...tdStyle, fontWeight: 600 }}>{j.code}</td>
            <td style={tdStyle}>{j.name}</td>
            <td style={tdStyle}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background:
                    j.journal_type === "sale"
                      ? "#d1fae5"
                      : j.journal_type === "purchase"
                      ? "#fee2e2"
                      : j.journal_type === "bank"
                      ? "#dbeafe"
                      : j.journal_type === "cash"
                      ? "#fef3c7"
                      : "#e5e7eb",
                  color:
                    j.journal_type === "sale"
                      ? "#065f46"
                      : j.journal_type === "purchase"
                      ? "#991b1b"
                      : j.journal_type === "bank"
                      ? "#1e40af"
                      : j.journal_type === "cash"
                      ? "#92400e"
                      : "#374151",
                }}
              >
                {JOURNAL_TYPES.find((t) => t.value === j.journal_type)?.label || j.journal_type}
              </span>
            </td>
            <td style={tdStyle}>{j.currency_code}</td>
            <td style={tdStyle}>{j.is_active ? "✓" : "—"}</td>
            <td style={tdStyle}>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }}
                  onClick={() => handleEdit(j)}
                >
                  <PencilLine size={12} /> Edit
                </button>
                <button
                  style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11, color: "#ef4444" }}
                  onClick={() => handleDelete("/accounting/journals", j.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderPaymentTermsTable = () => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Description</th>
          <th style={thStyle}>Due Days</th>
          <th style={thStyle}>Discount %</th>
          <th style={thStyle}>Discount Days</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {paymentTerms.length === 0 && (
          <tr>
            <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>
              No payment terms yet. Click "New" to create one.
            </td>
          </tr>
        )}
        {paymentTerms.map((pt) => (
          <tr key={pt.id}>
            <td style={{ ...tdStyle, fontWeight: 600 }}>{pt.name}</td>
            <td style={tdStyle}>{pt.description || "—"}</td>
            <td style={tdStyle}>{pt.due_days}</td>
            <td style={tdStyle}>{pt.discount_percentage}%</td>
            <td style={tdStyle}>{pt.discount_days}</td>
            <td style={tdStyle}>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }}
                  onClick={() => handleEdit(pt)}
                >
                  <PencilLine size={12} /> Edit
                </button>
                <button
                  style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11, color: "#ef4444" }}
                  onClick={() => handleDelete("/accounting/payment-terms", pt.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderFiscalPositionsTable = () => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Description</th>
          <th style={thStyle}>Auto Apply</th>
          <th style={thStyle}>Active</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {fiscalPositions.length === 0 && (
          <tr>
            <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>
              No fiscal positions yet. Click "New" to create one.
            </td>
          </tr>
        )}
        {fiscalPositions.map((fp) => (
          <tr key={fp.id}>
            <td style={{ ...tdStyle, fontWeight: 600 }}>{fp.name}</td>
            <td style={tdStyle}>{fp.description || "—"}</td>
            <td style={tdStyle}>{fp.auto_apply ? "Yes" : "No"}</td>
            <td style={tdStyle}>{fp.is_active ? "Yes" : "No"}</td>
            <td style={tdStyle}>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }}
                  onClick={() => handleEdit(fp)}
                >
                  <PencilLine size={12} /> Edit
                </button>
                <button
                  style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11, color: "#ef4444" }}
                  onClick={() => handleDelete("/accounting/fiscal-positions", fp.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderBudgetsTable = () => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Period</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Planned</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Actual</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Variance</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {budgets.length === 0 && (
          <tr>
            <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>
              No budgets yet. Click "New" to create one.
            </td>
          </tr>
        )}
        {budgets.map((b) => {
          const planned = (b.lines || []).reduce((sum, line) => sum + Number(line.planned_amount || 0), 0);
          const actual = (b.lines || []).reduce((sum, line) => sum + Number(line.practical_amount || 0), 0);
          const variance = planned - actual;
          return (
            <tr key={b.id}>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{b.name}</td>
              <td style={tdStyle}>
                {new Date(b.date_from).toLocaleDateString()} - {new Date(b.date_to).toLocaleDateString()}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{planned.toFixed(2)}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{actual.toFixed(2)}</td>
              <td style={{ ...tdStyle, textAlign: "right", color: variance >= 0 ? "#059669" : "#dc2626" }}>{variance.toFixed(2)}</td>
              <td style={tdStyle}>{b.status}</td>
              <td style={tdStyle}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }}
                    onClick={() => handleEdit({
                      ...b,
                      date_from: b.date_from?.slice(0, 16),
                      date_to: b.date_to?.slice(0, 16),
                      lines: (b.lines || []).map((line) => ({
                        account_id: line.account_id || "",
                        planned_amount: line.planned_amount,
                        practical_amount: line.practical_amount,
                      })),
                    })}
                  >
                    <PencilLine size={12} /> Edit
                  </button>
                  <button
                    style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11, color: "#ef4444" }}
                    onClick={() => handleDelete("/accounting/budgets", b.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  /* ── Render ── */
  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, overflow: "hidden" }}>
      {/* Sidebar */}
      <div
        style={{
          width: 240,
          minWidth: 240,
          borderRight: "1px solid var(--border, #e5e7eb)",
          overflowY: "auto",
          background: "var(--sidebar-bg, #fafafa)",
          padding: "8px 0",
        }}
      >
        <SidebarMenu
          title="Accounting"
          items={sidebarItems}
          activeKey={activeSection}
          onSelect={(key) => {
            setActiveSection(key as SectionKey);
            resetForm();
          }}
        />
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1.25rem" }}>
        <div
          className="o-control-panel"
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
            padding: "8px 0",
          }}
        >
          <div className="o-breadcrumb">
            <span
              className="o-breadcrumb-item"
              style={{ cursor: "pointer" }}
              onClick={() => navigate("/accounting")}
            >
              Accounting
            </span>
            <span className="o-breadcrumb-separator">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
            <span className="o-breadcrumb-current">{SECTION_LABELS[activeSection]}</span>
          </div>
        </div>

        {/* Company Selector */}
        {isAdmin && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ position: "relative", maxWidth: 320 }}>
              <Search
                size={14}
                style={{ position: "absolute", left: 10, top: 10, color: "#9ca3af" }}
              />
              <input
                type="text"
                placeholder="Search company..."
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 30 }}
              />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {filteredCompanies.slice(0, 12).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCompanyId(c.id)}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: companyId === c.id ? 700 : 500,
                    borderRadius: 6,
                    border:
                      companyId === c.id
                        ? "2px solid var(--primary, #4a7de6)"
                        : "1px solid var(--border, #e5e7eb)",
                    background: companyId === c.id ? "rgba(74,125,230,0.08)" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {!companyId ? (
          <div style={{ ...card, textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
            <Settings size={48} strokeWidth={1} style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>Select a company to configure accounting</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                <Calculator size={20} style={{ marginRight: 8, verticalAlign: "text-bottom" }} />
                {getSectionTitle()}s
              </h2>
              <div style={{ display: "flex", gap: 8 }}>
                {activeSection === "chart_of_accounts" && (
                  <button
                    style={{ ...btnSecondary, background: "#f0fdf4", borderColor: "#86efac", color: "#166534" }}
                    onClick={handleInstallChart}
                    disabled={installing}
                  >
                    <Download size={14} /> {installing ? "Installing..." : "Install Generic Chart"}
                  </button>
                )}
                {activeSection !== "account_mappings" && (
                  <button
                    style={btnPrimary}
                    onClick={() => {
                      resetForm();
                      setShowForm(true);
                    }}
                  >
                    <Plus size={14} /> New
                  </button>
                )}
              </div>
            </div>

            {/* Form */}
            {renderForm()}

            {/* Table */}
            <div style={card}>{renderContent()}</div>
          </>
        )}
      </div>
    </div>
  );
}
