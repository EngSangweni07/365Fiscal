import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Calculator,
  CheckCircle,
  ChevronDown,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Globe,
  Layers,
  PieChart,
  Plus,
  Search,
  Settings,
  Trash2,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { apiFetch } from "../api";
import { useCompanies } from "../hooks/useCompanies";
import { useMe } from "../hooks/useMe";
import { SidebarMenu } from "../components/SidebarMenu";
import type { SidebarMenuItem } from "../components/SidebarMenu";

/* ── Types ───────────────────────────────────────────── */
interface AccountingOverview {
  year: number;
  ytd_revenue: number;
  ytd_expenses: number;
  ytd_net_profit: number;
  outstanding_receivables: number;
  overdue_receivables: number;
  total_payables: number;
  cash_balance: number;
  invoice_count: number;
  unpaid_invoice_count: number;
  expense_count: number;
  payment_count: number;
  recent_journal_entries: {
    id: number;
    reference: string;
    entry_date: string;
    journal_name: string;
    total_debit: number;
    status: string;
  }[];
  monthly_revenue: { month: string; revenue: number; expenses: number }[];
  bank_journals: { id: number; name: string; code: string; balance: number }[];
}

type Account = {
  id: number;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
  currency_code: string;
};

type Journal = {
  id: number;
  name: string;
  code: string;
  journal_type: string;
  is_active: boolean;
};

type JournalEntryLine = {
  account_id: number | "";
  label: string;
  debit: number;
  credit: number;
  currency_code: string;
};

type JournalEntry = {
  id: number;
  journal_id: number;
  reference: string;
  entry_date: string;
  status: string;
  narration: string;
  lines: (JournalEntryLine & { id: number; account_id: number })[];
};

type SectionKey =
  | "overview"
  | "journal_entries"
  | "payments"
  | "reports"
  | "configuration";

const SECTION_LABELS: Record<SectionKey, string> = {
  overview: "Overview",
  journal_entries: "Journal Entries",
  payments: "Payments",
  reports: "Reports",
  configuration: "Configuration",
};

/* ── Styles ──────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  border: "1px solid var(--border, #e5e7eb)",
  padding: "1.25rem",
  marginBottom: "1rem",
};
const kpiCard: React.CSSProperties = {
  ...card,
  textAlign: "center",
  padding: "1.25rem 1rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
};
const kpiValue: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: "var(--text-primary, #111)",
};
const kpiLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted, #6b7280)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginTop: 4,
};
const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted, #6b7280)",
  borderBottom: "2px solid var(--border, #e5e7eb)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  borderBottom: "1px solid #f3f4f6",
};
const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "var(--text-primary, #111)",
  marginBottom: 12,
};
const journalCard: React.CSSProperties = {
  ...card,
  cursor: "pointer",
  transition: "box-shadow 0.15s",
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "1rem 1.25rem",
};
const statusBadge = (color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  background: color === "green" ? "#dcfce7" : color === "orange" ? "#fff7ed" : color === "red" ? "#fef2f2" : "#f3f4f6",
  color: color === "green" ? "#166534" : color === "orange" ? "#9a3412" : color === "red" ? "#991b1b" : "#374151",
});

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Component ───────────────────────────────────────── */
export default function AccountingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { me } = useMe();
  const { companies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [editingJournalEntryId, setEditingJournalEntryId] = useState<number | null>(null);
  const [savingJournalEntry, setSavingJournalEntry] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [journalForm, setJournalForm] = useState({
    journal_id: "",
    reference: "",
    entry_date: new Date().toISOString().slice(0, 16),
    narration: "",
    lines: [
      { account_id: "", label: "", debit: 0, credit: 0, currency_code: "USD" },
      { account_id: "", label: "", debit: 0, credit: 0, currency_code: "USD" },
    ] as JournalEntryLine[],
  });

  // Auto-select company for portal
  useEffect(() => {
    if (!isAdmin && me?.company_ids?.length && !companyId) {
      setCompanyId(me.company_ids[0]);
    }
  }, [isAdmin, me?.company_ids, companyId]);

  useEffect(() => {
    const requestedCompanyId = Number(searchParams.get("company_id") || 0);
    if (requestedCompanyId > 0) {
      setCompanyId(requestedCompanyId);
    }
  }, [searchParams]);

  const filteredCompanies = useMemo(() => {
    if (!companyQuery.trim()) return companies;
    const q = companyQuery.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tin && c.tin.toLowerCase().includes(q)),
    );
  }, [companies, companyQuery]);

  // Fetch overview data
  const fetchOverview = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AccountingOverview>(
        `/accounting/overview?company_id=${companyId}`,
      );
      setOverview(data);
    } catch (err: any) {
      setError(err?.detail || err?.message || "Failed to load accounting overview");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (activeSection === "overview") fetchOverview();
  }, [fetchOverview, activeSection]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section === "journal_entries") {
      setActiveSection("journal_entries");
    }
  }, [searchParams]);

  const fetchJournalEntries = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [entries, accountList, journalList] = await Promise.all([
        apiFetch<JournalEntry[]>(`/accounting/journal-entries?company_id=${companyId}`),
        apiFetch<Account[]>(`/accounting/accounts?company_id=${companyId}`),
        apiFetch<Journal[]>(`/accounting/journals?company_id=${companyId}`),
      ]);
      setJournalEntries(entries);
      setAccounts(accountList.filter((a) => a.is_active));
      setJournals(journalList.filter((j) => j.is_active));
      setJournalForm((prev) => ({
        ...prev,
        journal_id: prev.journal_id || String(journalList.find((j) => j.is_active)?.id || ""),
      }));
    } catch (err: any) {
      setError(err?.detail || err?.message || "Failed to load journal entries");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (activeSection === "journal_entries") fetchJournalEntries();
  }, [fetchJournalEntries, activeSection]);

  // Navigate to sub-pages
  const handleSectionSelect = (key: string) => {
    if (key === "payments") {
      navigate(companyId ? `/payments?company_id=${companyId}` : "/payments");
      return;
    }
    if (key === "reports") {
      navigate("/accounting/reports");
      return;
    }
    if (key === "configuration") {
      navigate("/accounting/configuration");
      return;
    }
    setActiveSection(key as SectionKey);
  };

  const journalTotals = useMemo(() => {
    const debit = journalForm.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const credit = journalForm.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    return { debit, credit, difference: debit - credit };
  }, [journalForm.lines]);

  const resetJournalForm = () => {
    setShowJournalForm(false);
    setEditingJournalEntryId(null);
    setError(null);
    setJournalForm({
      journal_id: String(journals[0]?.id || ""),
      reference: "",
      entry_date: new Date().toISOString().slice(0, 16),
      narration: "",
      lines: [
        { account_id: "", label: "", debit: 0, credit: 0, currency_code: "USD" },
        { account_id: "", label: "", debit: 0, credit: 0, currency_code: "USD" },
      ],
    });
  };

  const saveJournalEntry = async () => {
    if (!companyId) return;
    const lines = journalForm.lines
      .filter((line) => line.account_id && (Number(line.debit) || Number(line.credit)))
      .map((line) => ({
        ...line,
        account_id: Number(line.account_id),
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      }));
    setSavingJournalEntry(true);
    setError(null);
    try {
      const endpoint = editingJournalEntryId
        ? `/accounting/journal-entries/${editingJournalEntryId}`
        : "/accounting/journal-entries";
      await apiFetch(endpoint, {
        method: editingJournalEntryId ? "PATCH" : "POST",
        body: JSON.stringify({
          company_id: companyId,
          journal_id: Number(journalForm.journal_id),
          reference: journalForm.reference,
          entry_date: new Date(journalForm.entry_date).toISOString(),
          narration: journalForm.narration,
          lines,
        }),
      });
      resetJournalForm();
      fetchJournalEntries();
    } catch (err: any) {
      setError(err?.detail || err?.message || "Failed to save journal entry");
    } finally {
      setSavingJournalEntry(false);
    }
  };

  const editJournalEntry = (entry: JournalEntry) => {
    if (entry.status !== "draft") return;
    setEditingJournalEntryId(entry.id);
    setJournalForm({
      journal_id: String(entry.journal_id),
      reference: entry.reference,
      entry_date: entry.entry_date ? new Date(entry.entry_date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
      narration: entry.narration || "",
      lines: entry.lines.map((line) => ({
        account_id: line.account_id,
        label: line.label || "",
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        currency_code: line.currency_code || "USD",
      })),
    });
    setShowJournalForm(true);
  };

  const updateJournalEntryStatus = async (entryId: number, action: "post" | "cancel") => {
    setError(null);
    try {
      await apiFetch(`/accounting/journal-entries/${entryId}/${action}`, { method: "POST" });
      fetchJournalEntries();
      if (activeSection === "overview") fetchOverview();
    } catch (err: any) {
      setError(err?.detail || err?.message || `Failed to ${action} journal entry`);
    }
  };

  const deleteJournalEntry = async (entryId: number) => {
    if (!confirm("Delete this draft journal entry?")) return;
    setError(null);
    try {
      await apiFetch(`/accounting/journal-entries/${entryId}`, { method: "DELETE" });
      fetchJournalEntries();
    } catch (err: any) {
      setError(err?.detail || err?.message || "Failed to delete journal entry");
    }
  };

  const runBackfill = async () => {
    if (!companyId) return;
    setBackfilling(true);
    setError(null);
    try {
      await apiFetch(`/accounting/backfill?company_id=${companyId}`, { method: "POST" });
      fetchOverview();
      if (activeSection === "journal_entries") fetchJournalEntries();
    } catch (err: any) {
      setError(err?.detail || err?.message || "Failed to backfill accounting entries");
    } finally {
      setBackfilling(false);
    }
  };

  const sidebarItems: SidebarMenuItem[] = [
    { key: "overview", label: "OVERVIEW", icon: Layers, color: "#4a7de6" },
    { key: "journal_entries", label: "JOURNAL ENTRIES", icon: BookOpen, color: "#4a7de6" },
    { key: "payments", label: "PAYMENTS", icon: CreditCard, color: "#4a7de6" },
    { key: "reports", label: "REPORTS", icon: BarChart3, color: "#4a7de6" },
    { key: "configuration", label: "CONFIGURATION", icon: Settings, color: "#4a7de6" },
  ];

  /* ── Company Selector ── */
  const companySelector = (
    <div style={{ marginBottom: 16 }}>
      {isAdmin && (
        <div style={{ position: "relative" }}>
          <Search
            size={14}
            style={{ position: "absolute", left: 10, top: 10, color: "#9ca3af" }}
          />
          <input
            placeholder="Search company…"
            value={companyQuery}
            onChange={(e) => setCompanyQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px 7px 30px",
              fontSize: 13,
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 6,
              marginBottom: 6,
            }}
          />
          {companyQuery && filteredCompanies.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "#fff",
                border: "1px solid var(--border, #e5e7eb)",
                borderRadius: 6,
                maxHeight: 200,
                overflowY: "auto",
                zIndex: 20,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
            >
              {filteredCompanies.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setCompanyId(c.id);
                    setCompanyQuery("");
                  }}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    cursor: "pointer",
                    background: c.id === companyId ? "#f3f0ff" : "transparent",
                  }}
                >
                  {c.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {companyId && (
        <div style={{ fontSize: 12, color: "var(--text-muted, #6b7280)" }}>
          Company:{" "}
          <strong>
            {companies.find((c) => c.id === companyId)?.name ?? companyId}
          </strong>
        </div>
      )}
    </div>
  );

  /* ── Overview Section ── */
  const renderOverview = () => {
    if (!companyId) {
      return (
        <div style={card}>
          <p style={{ color: "var(--text-muted, #6b7280)", textAlign: "center", padding: 40 }}>
            Select a company to view the accounting overview
          </p>
        </div>
      );
    }

    if (loading) {
      return (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" />
          <p style={{ color: "var(--text-muted, #6b7280)", marginTop: 8 }}>
            Loading accounting data…
          </p>
        </div>
      );
    }

    if (error) {
      return (
        <div style={{ ...card, background: "#fef2f2", borderColor: "#fecaca" }}>
          <p style={{ color: "#991b1b", fontSize: 13 }}>{error}</p>
        </div>
      );
    }

    if (!overview) return null;

    return (
      <>
        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
          <div style={kpiCard}>
            <TrendingUp size={22} color="#16a34a" />
            <div style={kpiValue}>{fmt(overview.ytd_revenue)}</div>
            <div style={kpiLabel}>YTD Revenue</div>
          </div>
          <div style={kpiCard}>
            <DollarSign size={22} color="#dc2626" />
            <div style={kpiValue}>{fmt(overview.ytd_expenses)}</div>
            <div style={kpiLabel}>YTD Expenses</div>
          </div>
          <div style={kpiCard}>
            <PieChart size={22} color={overview.ytd_net_profit >= 0 ? "#16a34a" : "#dc2626"} />
            <div style={{ ...kpiValue, color: overview.ytd_net_profit >= 0 ? "#16a34a" : "#dc2626" }}>
              {fmt(overview.ytd_net_profit)}
            </div>
            <div style={kpiLabel}>Net Profit</div>
          </div>
          <div style={kpiCard}>
            <FileText size={22} color="#2563eb" />
            <div style={kpiValue}>{fmt(overview.outstanding_receivables)}</div>
            <div style={kpiLabel}>Receivables</div>
          </div>
          <div style={kpiCard}>
            <Clock size={22} color="#ea580c" />
            <div style={{ ...kpiValue, color: overview.overdue_receivables > 0 ? "#ea580c" : undefined }}>
              {fmt(overview.overdue_receivables)}
            </div>
            <div style={kpiLabel}>Overdue</div>
          </div>
          <div style={kpiCard}>
            <Users size={22} color="#7c3aed" />
            <div style={kpiValue}>{fmt(overview.total_payables)}</div>
            <div style={kpiLabel}>Payables</div>
          </div>
          <div style={kpiCard}>
            <CreditCard size={22} color="#0891b2" />
            <div style={kpiValue}>{fmt(overview.cash_balance)}</div>
            <div style={kpiLabel}>Cash Balance</div>
          </div>
        </div>

        {/* Bank & Cash Journals */}
        {overview.bank_journals.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={sectionTitle}>Bank & Cash</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {overview.bank_journals.map((j) => (
                <div key={j.id} style={journalCard}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "linear-gradient(135deg, #4a7de6, #5b8def)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <DollarSign size={20} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{j.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{j.code}</div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(j.balance)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monthly Revenue vs Expenses Chart (simple bar) */}
        {overview.monthly_revenue.length > 0 && (
          <div style={card}>
            <div style={sectionTitle}>Monthly Revenue vs Expenses</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160, padding: "0 8px" }}>
              {overview.monthly_revenue.map((m) => {
                const maxVal = Math.max(
                  ...overview.monthly_revenue.map((x) => Math.max(x.revenue, x.expenses)),
                  1,
                );
                const revH = (m.revenue / maxVal) * 140;
                const expH = (m.expenses / maxVal) * 140;
                return (
                  <div
                    key={m.month}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140 }}>
                      <div
                        style={{
                          width: 14,
                          height: revH,
                          background: "#16a34a",
                          borderRadius: "3px 3px 0 0",
                        }}
                        title={`Revenue: ${fmt(m.revenue)}`}
                      />
                      <div
                        style={{
                          width: 14,
                          height: expH,
                          background: "#dc2626",
                          borderRadius: "3px 3px 0 0",
                        }}
                        title={`Expenses: ${fmt(m.expenses)}`}
                      />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.month}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 12, fontSize: 11 }}>
              <span>
                <span style={{ display: "inline-block", width: 10, height: 10, background: "#16a34a", borderRadius: 2, marginRight: 4 }} />
                Revenue
              </span>
              <span>
                <span style={{ display: "inline-block", width: 10, height: 10, background: "#dc2626", borderRadius: 2, marginRight: 4 }} />
                Expenses
              </span>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{overview.invoice_count}</div>
            <div style={kpiLabel}>Total Invoices</div>
          </div>
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#ea580c" }}>{overview.unpaid_invoice_count}</div>
            <div style={kpiLabel}>Unpaid Invoices</div>
          </div>
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{overview.expense_count}</div>
            <div style={kpiLabel}>Expenses Posted</div>
          </div>
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#16a34a" }}>{overview.payment_count}</div>
            <div style={kpiLabel}>Payments</div>
          </div>
        </div>

        {/* Recent Journal Entries */}
        {overview.recent_journal_entries.length > 0 && (
          <div style={card}>
            <div style={sectionTitle}>Recent Journal Entries</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Reference</th>
                  <th style={thStyle}>Journal</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Debit</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent_journal_entries.map((je) => (
                  <tr key={je.id}>
                    <td style={tdStyle}>
                      {je.entry_date ? new Date(je.entry_date).toLocaleDateString() : "—"}
                    </td>
                    <td style={tdStyle}>{je.reference}</td>
                    <td style={tdStyle}>{je.journal_name}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmt(je.total_debit)}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={statusBadge(
                          je.status === "posted" ? "green" : je.status === "draft" ? "orange" : "gray",
                        )}
                      >
                        {je.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Quick Actions */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/invoices/new")}
            style={{
              padding: "8px 18px",
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
            }}
          >
            <FileText size={14} /> New Invoice
          </button>
          <button
            onClick={() =>
              navigate(companyId ? `/payments?company_id=${companyId}` : "/payments")
            }
            style={{
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary, #111)",
              background: "transparent",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 6,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <CreditCard size={14} /> Register Payment
          </button>
          <button
            onClick={() => navigate("/accounting/reports")}
            style={{
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary, #111)",
              background: "transparent",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 6,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <BarChart3 size={14} /> View Reports
          </button>
          <button
            onClick={() => navigate("/accounting/configuration")}
            style={{
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary, #111)",
              background: "transparent",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 6,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Settings size={14} /> Configuration
          </button>
          <button
            onClick={runBackfill}
            disabled={backfilling}
            style={{
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary, #111)",
              background: "transparent",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 6,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <BookOpen size={14} /> {backfilling ? "Backfilling..." : "Backfill Entries"}
          </button>
        </div>
      </>
    );
  };

  const renderJournalEntries = () => {
    if (!companyId) {
      return (
        <div style={card}>
          <p style={{ color: "var(--text-muted, #6b7280)", textAlign: "center", padding: 40 }}>
            Select a company to manage journal entries
          </p>
        </div>
      );
    }

    const journalName = (id: number) => journals.find((j) => j.id === id)?.name || "Journal";
    const accountLabel = (id: number | "") => {
      const account = accounts.find((a) => a.id === Number(id));
      return account ? `${account.code} ${account.name}` : "Account";
    };
    const referenceFilter = searchParams.get("reference") || "";
    const visibleEntries = referenceFilter
      ? journalEntries.filter((entry) => entry.reference === referenceFilter)
      : journalEntries;

    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              <BookOpen size={20} style={{ marginRight: 8, verticalAlign: "text-bottom" }} />
              Journal Entries
            </h2>
            <div style={{ fontSize: 12, color: "var(--text-muted, #6b7280)", marginTop: 4 }}>
              Create balanced manual entries, then post them into the ledger.
            </div>
          </div>
          <button
            onClick={() => setShowJournalForm(true)}
            style={{
              padding: "8px 16px",
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
            }}
          >
            <Plus size={14} /> New Entry
          </button>
        </div>

        {error && (
          <div style={{ ...card, background: "#fef2f2", borderColor: "#fecaca", color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}

        {showJournalForm && (
          <div style={card}>
            <div style={sectionTitle}>{editingJournalEntryId ? "Edit Draft Journal Entry" : "New Journal Entry"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={kpiLabel}>Journal</div>
                <select
                  value={journalForm.journal_id}
                  onChange={(e) => setJournalForm({ ...journalForm, journal_id: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                >
                  <option value="">Select journal...</option>
                  {journals.map((j) => (
                    <option key={j.id} value={j.id}>{j.code} - {j.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={kpiLabel}>Reference</div>
                <input
                  value={journalForm.reference}
                  onChange={(e) => setJournalForm({ ...journalForm, reference: e.target.value })}
                  placeholder="e.g. MISC/2026/0001"
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                />
              </div>
              <div>
                <div style={kpiLabel}>Date</div>
                <input
                  type="datetime-local"
                  value={journalForm.entry_date}
                  onChange={(e) => setJournalForm({ ...journalForm, entry_date: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                />
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Account</th>
                  <th style={thStyle}>Label</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Debit</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Credit</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {journalForm.lines.map((line, index) => (
                  <tr key={index}>
                    <td style={tdStyle}>
                      <select
                        value={line.account_id}
                        onChange={(e) => {
                          const lines = [...journalForm.lines];
                          lines[index] = { ...line, account_id: Number(e.target.value) || "" };
                          setJournalForm({ ...journalForm, lines });
                        }}
                        style={{ width: "100%", padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                      >
                        <option value="">Select account...</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input
                        value={line.label}
                        onChange={(e) => {
                          const lines = [...journalForm.lines];
                          lines[index] = { ...line, label: e.target.value };
                          setJournalForm({ ...journalForm, lines });
                        }}
                        style={{ width: "100%", padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        min="0"
                        value={line.debit || ""}
                        onChange={(e) => {
                          const lines = [...journalForm.lines];
                          lines[index] = { ...line, debit: Number(e.target.value || 0), credit: e.target.value ? 0 : line.credit };
                          setJournalForm({ ...journalForm, lines });
                        }}
                        style={{ width: "100%", padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: 6, textAlign: "right" }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        min="0"
                        value={line.credit || ""}
                        onChange={(e) => {
                          const lines = [...journalForm.lines];
                          lines[index] = { ...line, credit: Number(e.target.value || 0), debit: e.target.value ? 0 : line.debit };
                          setJournalForm({ ...journalForm, lines });
                        }}
                        style={{ width: "100%", padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: 6, textAlign: "right" }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => setJournalForm({ ...journalForm, lines: journalForm.lines.filter((_, i) => i !== index) })}
                        disabled={journalForm.lines.length <= 2}
                        style={{ border: "none", background: "transparent", color: "#dc2626", cursor: "pointer" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: "#f9fafb" }}>
                  <td style={tdStyle} colSpan={2}>Totals</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(journalTotals.debit)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(journalTotals.credit)}</td>
                  <td style={{ ...tdStyle, color: Math.abs(journalTotals.difference) < 0.01 ? "#059669" : "#dc2626" }}>
                    {fmt(Math.abs(journalTotals.difference))}
                  </td>
                </tr>
              </tbody>
            </table>

            <button
              onClick={() => setJournalForm({
                ...journalForm,
                lines: [...journalForm.lines, { account_id: "", label: "", debit: 0, credit: 0, currency_code: "USD" }],
              })}
              style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "7px 12px", fontSize: 13, cursor: "pointer" }}
            >
              <Plus size={13} style={{ verticalAlign: "text-bottom", marginRight: 4 }} /> Add Line
            </button>

            <div style={{ marginTop: 12 }}>
              <div style={kpiLabel}>Narration</div>
              <textarea
                value={journalForm.narration}
                onChange={(e) => setJournalForm({ ...journalForm, narration: e.target.value })}
                rows={3}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                onClick={saveJournalEntry}
                disabled={savingJournalEntry}
                style={{ padding: "8px 16px", background: "#4a7de6", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
              >
                {savingJournalEntry ? "Saving..." : editingJournalEntryId ? "Update Draft" : "Save Draft"}
              </button>
              <button
                onClick={resetJournalForm}
                style={{ padding: "8px 16px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={card}>
          {loading ? (
            <p style={{ color: "#6b7280", textAlign: "center", padding: 30 }}>Loading journal entries...</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Reference</th>
                  <th style={thStyle}>Journal</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Debit</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Credit</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>
                      {referenceFilter ? `No journal entry found for ${referenceFilter}.` : "No journal entries yet."}
                    </td>
                  </tr>
                )}
                {visibleEntries.map((entry) => {
                  const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
                  const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
                  return (
                    <tr key={entry.id}>
                      <td style={tdStyle}>{entry.entry_date ? new Date(entry.entry_date).toLocaleDateString() : "-"}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        <div>{entry.reference}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          {entry.lines.slice(0, 2).map((line) => accountLabel(line.account_id)).join(" / ")}
                        </div>
                      </td>
                      <td style={tdStyle}>{journalName(entry.journal_id)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(debit)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(credit)}</td>
                      <td style={tdStyle}>
                        <span style={statusBadge(entry.status === "posted" ? "green" : entry.status === "cancelled" ? "red" : "orange")}>
                          {entry.status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {entry.status === "draft" && (
                            <button onClick={() => editJournalEntry(entry)} title="Edit draft" style={{ border: "none", background: "transparent", color: "#2563eb", cursor: "pointer" }}>
                              <FileText size={16} />
                            </button>
                          )}
                          {entry.status === "draft" && (
                            <button onClick={() => updateJournalEntryStatus(entry.id, "post")} title="Post" style={{ border: "none", background: "transparent", color: "#16a34a", cursor: "pointer" }}>
                              <CheckCircle size={16} />
                            </button>
                          )}
                          {entry.status !== "cancelled" && (
                            <button onClick={() => updateJournalEntryStatus(entry.id, "cancel")} title="Cancel" style={{ border: "none", background: "transparent", color: "#ea580c", cursor: "pointer" }}>
                              <XCircle size={16} />
                            </button>
                          )}
                          {entry.status === "draft" && (
                            <button onClick={() => deleteJournalEntry(entry.id)} title="Delete draft" style={{ border: "none", background: "transparent", color: "#dc2626", cursor: "pointer" }}>
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "100%" }}>
      <SidebarMenu
        title="Accounting"
        items={sidebarItems}
        activeKey={activeSection}
        onSelect={handleSectionSelect}
      />
      <div style={{ flex: 1, padding: "1.5rem", overflowY: "auto" }}>
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
              onClick={() => setActiveSection("overview")}
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
        {companySelector}
        {activeSection === "overview" && renderOverview()}
        {activeSection === "journal_entries" && renderJournalEntries()}
      </div>
    </div>
  );
}
