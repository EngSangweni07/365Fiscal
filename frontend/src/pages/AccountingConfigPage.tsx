import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Briefcase,
  Calculator,
  ChevronDown,
  Clock,
  DollarSign,
  Download,
  FileText,
  Globe,
  Layers,
  PencilLine,
  Plus,
  Search,
  Settings,
  Trash2,
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
  tax_mappings: { id: number; source_tax_id: number | null; destination_tax_id: number | null }[];
};

type BudgetItem = {
  id: number;
  company_id: number;
  name: string;
  date_from: string;
  date_to: string;
  status: string;
  notes: string;
  lines: { id: number; account_id: number | null; planned_amount: number; practical_amount: number }[];
};

type SectionKey =
  | "chart_of_accounts"
  | "journals"
  | "payment_terms"
  | "fiscal_positions"
  | "budgets";

const ACCOUNT_TYPES = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];

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
  background: "var(--primary, #714b67)",
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
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);

  // Forms
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

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
        apiFetch<BudgetItem[]>(`/accounting/budgets?company_id=${companyId}`)
          .then(setBudgets)
          .catch(() => setBudgets([])),
    };
    fetchMap[activeSection]();
  }, [companyId, activeSection]);

  // Sidebar
  const sidebarItems: SidebarMenuItem[] = [
    { key: "chart_of_accounts", label: "CHART OF ACCOUNTS", icon: BookOpen, color: "#714b67" },
    { key: "journals", label: "JOURNALS", icon: FileText, color: "#714b67" },
    { key: "payment_terms", label: "PAYMENT TERMS", icon: Clock, color: "#714b67" },
    { key: "fiscal_positions", label: "FISCAL POSITIONS", icon: Globe, color: "#714b67" },
    { key: "budgets", label: "FINANCIAL BUDGETS", icon: DollarSign, color: "#714b67" },
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
      };
      const endpoint = endpointMap[activeSection];
      if (editingId) {
        await apiFetch(`${endpoint}/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(formData),
        });
      } else {
        await apiFetch(endpoint, {
          method: "POST",
          body: JSON.stringify({ ...formData, company_id: companyId }),
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
          { key: "date_from", label: "From", type: "date" },
          { key: "date_to", label: "To", type: "date" },
          { key: "notes", label: "Notes", type: "text", fullWidth: true },
        ];
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
      default:
        return null;
    }
  };

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
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background:
                    a.account_type === "asset"
                      ? "#dbeafe"
                      : a.account_type === "liability"
                      ? "#fde68a"
                      : a.account_type === "income"
                      ? "#d1fae5"
                      : a.account_type === "expense"
                      ? "#fee2e2"
                      : "#e5e7eb",
                  color:
                    a.account_type === "asset"
                      ? "#1e40af"
                      : a.account_type === "liability"
                      ? "#92400e"
                      : a.account_type === "income"
                      ? "#065f46"
                      : a.account_type === "expense"
                      ? "#991b1b"
                      : "#374151",
                }}
              >
                {a.account_type}
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
          <th style={thStyle}>Tax Mappings</th>
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
            <td style={tdStyle}>{fp.tax_mappings?.length || 0}</td>
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
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Lines</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {budgets.length === 0 && (
          <tr>
            <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>
              No budgets yet. Click "New" to create one.
            </td>
          </tr>
        )}
        {budgets.map((b) => (
          <tr key={b.id}>
            <td style={{ ...tdStyle, fontWeight: 600 }}>{b.name}</td>
            <td style={tdStyle}>
              {new Date(b.date_from).toLocaleDateString()} — {new Date(b.date_to).toLocaleDateString()}
            </td>
            <td style={tdStyle}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: b.status === "confirmed" ? "#d1fae5" : b.status === "done" ? "#dbeafe" : "#fef3c7",
                  color: b.status === "confirmed" ? "#065f46" : b.status === "done" ? "#1e40af" : "#92400e",
                }}
              >
                {b.status}
              </span>
            </td>
            <td style={tdStyle}>{b.lines?.length || 0}</td>
            <td style={tdStyle}>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }}
                  onClick={() => handleEdit(b)}
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
        ))}
      </tbody>
    </table>
  );

  /* ── Render ── */
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
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
      <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
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
                        ? "2px solid var(--primary, #714b67)"
                        : "1px solid var(--border, #e5e7eb)",
                    background: companyId === c.id ? "rgba(113,75,103,0.08)" : "#fff",
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
                <button
                  style={btnPrimary}
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                >
                  <Plus size={14} /> New
                </button>
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
