import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Calculator,
  CheckCircle,
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
import { Sidebar } from "../components/Sidebar";
import { TablePagination } from "../components/TablePagination";
import type { SidebarSection } from "../types/sidebar";

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
  overdue_invoice_count: number;
  expense_count: number;
  payment_count: number;
  customer_invoices: {
    unpaid_count: number;
    unpaid_amount: number;
    overdue_count: number;
    overdue_amount: number;
  };
  vendor_bills: {
    to_validate_count: number;
    to_validate_amount: number;
    open_count: number;
    open_amount: number;
  };
  recent_journal_entries: {
    id: number;
    reference: string;
    entry_date: string;
    journal_name: string;
    total_debit: number;
    status: string;
  }[];
  monthly_revenue: { month: string; revenue: number; expenses: number }[];
  bank_journals: {
    id: number;
    name: string;
    code: string;
    journal_type: string;
    balance: number;
    payment_total: number;
  }[];
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
  const [journalEntrySearch, setJournalEntrySearch] = useState("");
  const [journalEntryStatusFilter, setJournalEntryStatusFilter] = useState("all");
  const [journalEntryJournalFilter, setJournalEntryJournalFilter] = useState("all");
  const [selectedJournalEntry, setSelectedJournalEntry] = useState<JournalEntry | null>(null);
  const [journalEntriesPage, setJournalEntriesPage] = useState(1);
  const [journalEntriesPageSize, setJournalEntriesPageSize] = useState(10);
  const [reportsMenuOpen, setReportsMenuOpen] = useState(false);
  const [configurationMenuOpen, setConfigurationMenuOpen] = useState(false);
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

  useEffect(() => {
    if (activeSection !== "journal_entries") return;
    setJournalEntrySearch(searchParams.get("reference") || "");
  }, [activeSection, searchParams]);

  useEffect(() => {
    setJournalEntriesPage(1);
  }, [journalEntrySearch, journalEntryStatusFilter, journalEntryJournalFilter, journalEntriesPageSize]);

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

  const updateJournalEntryStatus = async (entryId: number, action: "post" | "cancel" | "reverse") => {
    setError(null);
    try {
      await apiFetch(`/accounting/journal-entries/${entryId}/${action}`, { method: "POST" });
      setSelectedJournalEntry(null);
      fetchJournalEntries();
      fetchOverview();
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

  const accountingSidebarSections: SidebarSection[] = [
    {
      id: "accounting-menu",
      title: "MENU",
      items: [
        {
          id: "accounting-overview",
          label: "OVERVIEW",
          icon: (
            <Layers size={18} strokeWidth={1.5} aria-hidden="true" color="#4a7de6" />
          ),
          isActive: activeSection === "overview",
          onClick: () => handleSectionSelect("overview"),
          iconColor: "#4a7de6",
          iconBackground: "rgba(74, 125, 230, 0.15)",
        },
        {
          id: "accounting-payments",
          label: "PAYMENTS",
          icon: (
            <CreditCard size={18} strokeWidth={1.5} aria-hidden="true" color="#4a7de6" />
          ),
          isActive: false,
          onClick: () => handleSectionSelect("payments"),
          iconColor: "#4a7de6",
          iconBackground: "rgba(74, 125, 230, 0.15)",
        },
        {
          id: "accounting-reports",
          label: "REPORTS",
          icon: (
            <BarChart3 size={18} strokeWidth={1.5} aria-hidden="true" color="#4a7de6" />
          ),
          isActive: reportsMenuOpen,
          onClick: () => {
            setReportsMenuOpen((prev) => !prev);
            setConfigurationMenuOpen(false);
          },
          iconColor: "#4a7de6",
          iconBackground: "rgba(74, 125, 230, 0.15)",
          dropdownItems: [
            {
              id: "accounting-reports-overview",
              label: "Accounting Reports",
              onClick: () => navigate("/accounting/reports"),
            },
            {
              id: "accounting-reports-financial",
              label: "Financial Reports",
              onClick: () => navigate("/reports"),
            },
          ],
        },
        {
          id: "accounting-configuration",
          label: "CONFIGURATION",
          icon: (
            <Settings size={18} strokeWidth={1.5} aria-hidden="true" color="#4a7de6" />
          ),
          isActive: configurationMenuOpen,
          onClick: () => {
            setConfigurationMenuOpen((prev) => !prev);
            setReportsMenuOpen(false);
          },
          iconColor: "#4a7de6",
          iconBackground: "rgba(74, 125, 230, 0.15)",
          dropdownItems: [
            {
              id: "accounting-configuration-main",
              label: "Accounting Settings",
              onClick: () => navigate("/accounting/configuration"),
            },
          ],
        },
      ],
    },
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

    const money = (value: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value || 0);

    const createLineGeometry = (values: number[], width = 320, height = 148, padding = 18) => {
      const normalized = values.map((value) => Math.max(Number(value) || 0, 0));
      const safeValues = normalized.length > 0 ? normalized : [0];
      const maxValue = Math.max(...safeValues, 1);
      const innerWidth = width - padding * 2;
      const innerHeight = height - padding * 2;
      const stepX = safeValues.length > 1 ? innerWidth / (safeValues.length - 1) : 0;
      const baseline = height - padding;
      const points = safeValues.map((value, index) => ({
        x: padding + stepX * index,
        y: baseline - (value / maxValue) * innerHeight,
        value,
      }));
      const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
      const areaPath = points.length > 0
        ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
        : "";

      return { points, linePath, areaPath, baseline };
    };

    const renderTrendChart = ({
      id,
      values,
      labels,
      stroke,
      fillStart,
      fillEnd,
      accent,
      valueLabel,
    }: {
      id: string;
      values: number[];
      labels: string[];
      stroke: string;
      fillStart: string;
      fillEnd: string;
      accent: string;
      valueLabel: string;
    }) => {
      const width = 320;
      const height = 148;
      const { points, linePath, areaPath, baseline } = createLineGeometry(values, width, height, 18);

      return (
        <div style={{ padding: "0.8rem 0.9rem 0.7rem", borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{valueLabel}</span>
            <span style={statPill(accent, stroke)}>{labels.length} months</span>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 150, display: "block" }} preserveAspectRatio="none">
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillStart} stopOpacity="0.35" />
                <stop offset="100%" stopColor={fillEnd} stopOpacity="0.05" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={`${id}-grid-${ratio}`}
                x1="18"
                y1={18 + (height - 36) * ratio}
                x2={width - 18}
                y2={18 + (height - 36) * ratio}
                stroke="#dbe4f0"
                strokeDasharray="4 6"
              />
            ))}
            <line x1="18" y1={baseline} x2={width - 18} y2={baseline} stroke="#cbd5e1" />
            {areaPath ? <path d={areaPath} fill={`url(#${id}-fill)`} /> : null}
            {linePath ? <path d={linePath} fill="none" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
            {points.map((point, index) => (
              <g key={`${id}-point-${index}`}>
                <circle cx={point.x} cy={point.y} r="5.5" fill="#ffffff" stroke={stroke} strokeWidth="2.5" />
                <circle cx={point.x} cy={point.y} r="2.25" fill={stroke} />
              </g>
            ))}
          </svg>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(labels.length, 1)}, minmax(0, 1fr))`, gap: 6, marginTop: 4 }}>
            {labels.map((label) => (
              <div key={`${id}-${label}`} style={{ textAlign: "center", fontSize: 11, color: "#64748b" }}>{label}</div>
            ))}
          </div>
        </div>
      );
    };

    const renderDonutChart = ({
      id,
      segments,
      centerValue,
      centerLabel,
    }: {
      id: string;
      segments: { label: string; value: number; color: string; accent: string }[];
      centerValue: string;
      centerLabel: string;
    }) => {
      const total = Math.max(segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0), 1);
      const radius = 38;
      const circumference = 2 * Math.PI * radius;
      let currentOffset = 0;

      return (
        <div style={{ padding: "0.8rem 0.9rem", borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <svg viewBox="0 0 120 120" style={{ width: 132, height: 132 }}>
              <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
              {segments.map((segment, index) => {
                const segmentLength = (Math.max(segment.value, 0) / total) * circumference;
                const dashArray = `${segmentLength} ${circumference - segmentLength}`;
                const dashOffset = -currentOffset;
                currentOffset += segmentLength;

                return (
                  <circle
                    key={`${id}-segment-${index}`}
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="12"
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                );
              })}
              <circle cx="60" cy="60" r="26" fill="#ffffff" />
              <text x="60" y="54" textAnchor="middle" style={{ fontSize: 18, fontWeight: 800, fill: "#0f172a" }}>{centerValue}</text>
              <text x="60" y="71" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{centerLabel}</text>
            </svg>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {segments.map((segment) => (
              <div key={`${id}-${segment.label}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: segment.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{segment.label}</span>
                </div>
                <span style={statPill(segment.accent, segment.color)}>{segment.value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    };

    const renderComparisonChart = ({
      id,
      items,
    }: {
      id: string;
      items: { label: string; value: number; color: string }[];
    }) => {
      const width = 360;
      const height = 180;
      const paddingTop = 18;
      const paddingBottom = 36;
      const paddingX = 20;
      const safeItems = items.length > 0 ? items : [{ label: "None", value: 0, color: "#cbd5e1" }];
      const maxValue = Math.max(...safeItems.map((item) => Math.max(item.value, 0)), 1);
      const chartWidth = width - paddingX * 2;
      const chartHeight = height - paddingTop - paddingBottom;
      const columnWidth = chartWidth / safeItems.length;

      return (
        <div style={{ padding: "0.8rem 0.9rem 0.7rem", borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 188, display: "block" }} preserveAspectRatio="none">
            {[0, 0.33, 0.66, 1].map((ratio) => (
              <line
                key={`${id}-grid-${ratio}`}
                x1={paddingX}
                y1={paddingTop + chartHeight * ratio}
                x2={width - paddingX}
                y2={paddingTop + chartHeight * ratio}
                stroke="#dbe4f0"
                strokeDasharray="4 6"
              />
            ))}
            {safeItems.map((item, index) => {
              const barHeight = (Math.max(item.value, 0) / maxValue) * (chartHeight - 8);
              const x = paddingX + index * columnWidth + columnWidth * 0.2;
              const y = paddingTop + chartHeight - barHeight;
              const barWidth = columnWidth * 0.6;
              return (
                <g key={`${id}-${item.label}`}>
                  <rect x={x} y={y} width={barWidth} height={barHeight} rx="14" fill={item.color} opacity="0.92" />
                  <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "#334155" }}>
                    {item.value >= 1000 ? `${Math.round(item.value / 1000)}k` : Math.round(item.value).toString()}
                  </text>
                  <text x={x + barWidth / 2} y={height - 12} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "#64748b" }}>
                    {item.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      );
    };

    const overviewInk = "#24445f";
    const overviewMuted = "#70859a";
    const overviewBorder = "#dce5ee";
    const overviewPrimary = "#4a8198";
    const overviewPrimaryBorder = "#86acbd";
    const overviewSurface = "#fbfdff";

    const widgetCardStyle: React.CSSProperties = {
      background: "#ffffff",
      border: `1px solid ${overviewBorder}`,
      borderRadius: 20,
      padding: "1.2rem 1.2rem 1.1rem",
      boxShadow: "0 16px 34px rgba(103, 132, 160, 0.08)",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      minHeight: 320,
    };

    const cardLabelStyle: React.CSSProperties = {
      fontSize: 12,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#64748b",
      fontWeight: 700,
    };

    const cardTitleStyle: React.CSSProperties = {
      fontSize: 20,
      fontWeight: 600,
      color: overviewInk,
      marginTop: 4,
      lineHeight: 1.25,
    };

    const widgetButton = (tone: "primary" | "secondary" = "secondary"): React.CSSProperties => ({
      border: tone === "primary" ? `1px solid ${overviewPrimaryBorder}` : `1px solid ${overviewBorder}`,
      background: tone === "primary" ? overviewPrimary : overviewSurface,
      color: tone === "primary" ? "#ffffff" : overviewInk,
      borderRadius: 999,
      padding: "0.48rem 0.9rem",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
    });

    const statPill = (background: string, color: string): React.CSSProperties => ({
      padding: "0.2rem 0.55rem",
      borderRadius: 999,
      background,
      color,
      fontSize: 11,
      fontWeight: 700,
    });

    const invoiceBars = overview.monthly_revenue.map((month) => month.revenue);
    const vendorBars = overview.monthly_revenue.map((month) => month.expenses);

    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18, marginBottom: 18, alignItems: "start" }}>
          <div style={widgetCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={cardLabelStyle}>Customers</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => navigate("/invoices/new")} style={widgetButton("primary")}>
                  <Plus size={14} /> New
                </button>
                <button onClick={() => navigate("/invoices")} style={widgetButton()}>
                  <FileText size={14} /> Open
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem 0.9rem", borderRadius: 14, background: "#eef9f7" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#3f7e78" }}>To collect</div>
                  <div style={{ fontSize: 12, color: "#5e918b", marginTop: 2 }}>
                    {overview.customer_invoices.unpaid_count} unpaid invoices
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#3f7e78" }}>
                  {money(overview.customer_invoices.unpaid_amount)}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem 0.9rem", borderRadius: 14, background: "#fff4ea" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#c67b4a" }}>Late</div>
                  <div style={{ fontSize: 12, color: "#d19363", marginTop: 2 }}>
                    {overview.customer_invoices.overdue_count} overdue invoices
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#c67b4a" }}>
                  {money(overview.customer_invoices.overdue_amount)}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.45fr) minmax(260px, 1fr)", gap: 14, alignItems: "stretch" }}>
              {renderTrendChart({
                id: "customer-invoices",
                values: invoiceBars,
                labels: overview.monthly_revenue.map((month) => month.month),
                stroke: "#4f948d",
                fillStart: "#89d6cf",
                fillEnd: "#eef9f7",
                accent: "#dff3ef",
                valueLabel: "Revenue trend",
              })}
              {renderDonutChart({
                id: "customer-donut",
                segments: [
                  { label: "Unpaid", value: overview.customer_invoices.unpaid_count, color: "#4f948d", accent: "#dff3ef" },
                  { label: "Overdue", value: overview.customer_invoices.overdue_count, color: "#d19363", accent: "#fff0e2" },
                ],
                centerValue: `${overview.customer_invoices.unpaid_count + overview.customer_invoices.overdue_count}`,
                centerLabel: "Invoices",
              })}
            </div>
          </div>

          <div style={widgetCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={cardLabelStyle}>Vendors</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => navigate("/purchases")} style={widgetButton("primary")}>
                  <Plus size={14} /> New
                </button>
                <button onClick={() => navigate("/purchases")} style={widgetButton()}>
                  <Download size={14} /> Open
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem 0.9rem", borderRadius: 14, background: "#eef5ff" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#5b8ccf" }}>To validate</div>
                  <div style={{ fontSize: 12, color: "#78a2dc", marginTop: 2 }}>
                    {overview.vendor_bills.to_validate_count} draft bills
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#5b8ccf" }}>
                  {money(overview.vendor_bills.to_validate_amount)}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem 0.9rem", borderRadius: 14, background: "#f6f2ff" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#8c6ccc" }}>Open bills</div>
                  <div style={{ fontSize: 12, color: "#a286d9", marginTop: 2 }}>
                    {overview.vendor_bills.open_count} confirmed or received
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#8c6ccc" }}>
                  {money(overview.vendor_bills.open_amount)}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.45fr) minmax(260px, 1fr)", gap: 14, alignItems: "stretch" }}>
              {renderTrendChart({
                id: "vendor-bills",
                values: vendorBars,
                labels: overview.monthly_revenue.map((month) => month.month),
                stroke: "#8c6ccc",
                fillStart: "#c9b2ee",
                fillEnd: "#f2ecff",
                accent: "#f2ecff",
                valueLabel: "Expense trend",
              })}
              {renderDonutChart({
                id: "vendor-donut",
                segments: [
                  { label: "Draft", value: overview.vendor_bills.to_validate_count, color: "#6f9bda", accent: "#eaf2ff" },
                  { label: "Open", value: overview.vendor_bills.open_count, color: "#9e84da", accent: "#f2ecff" },
                ],
                centerValue: `${overview.vendor_bills.to_validate_count + overview.vendor_bills.open_count}`,
                centerLabel: "Bills",
              })}
            </div>
          </div>

          {overview.bank_journals.length > 0 ? (
            overview.bank_journals.map((journal) => {
              const journalSeries = [
                journal.balance * 0.32,
                journal.payment_total * 0.58,
                journal.balance * 0.46,
                journal.payment_total * 0.82,
                journal.balance * 0.68,
                Math.max(journal.balance, journal.payment_total),
              ];

              return (
                <div key={journal.id} style={widgetCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={cardLabelStyle}>{journal.journal_type === "cash" ? "Cash" : "Bank"}</div>
                      <div style={{ fontSize: 12, color: overviewMuted, marginTop: 4 }}>{journal.code}</div>
                    </div>
                    <span style={statPill(journal.journal_type === "cash" ? "#fff0df" : "#eaf2ff", journal.journal_type === "cash" ? "#cf8b55" : "#6f9bda")}>
                      {journal.journal_type === "cash" ? "Cash journal" : "Bank journal"}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                    <div style={{ padding: "0.9rem", borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Balance</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>{money(journal.balance)}</div>
                    </div>
                    <div style={{ padding: "0.9rem", borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Payments</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>{money(journal.payment_total)}</div>
                    </div>
                  </div>

                  {renderTrendChart({
                    id: `journal-${journal.id}`,
                    values: journalSeries,
                    labels: overview.monthly_revenue.map((month) => month.month),
                    stroke: journal.journal_type === "cash" ? "#cf8b55" : "#6f9bda",
                    fillStart: journal.journal_type === "cash" ? "#f0bf8a" : "#9cc1eb",
                    fillEnd: journal.journal_type === "cash" ? "#fff0df" : "#eaf2ff",
                    accent: journal.journal_type === "cash" ? "#fff0df" : "#eaf2ff",
                    valueLabel: "Activity",
                  })}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => navigate(companyId ? `/payments?company_id=${companyId}` : "/payments")}
                      style={widgetButton("primary")}
                    >
                      <CreditCard size={14} /> New payment
                    </button>
                    <button onClick={() => setActiveSection("journal_entries")} style={widgetButton()}>
                      <BookOpen size={14} /> Journal entries
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={widgetCardStyle}>
              <div>
                <div style={cardLabelStyle}>Bank and cash</div>
              </div>
              <div style={{ color: overviewMuted, fontSize: 13, lineHeight: 1.6 }}>
                Create at least one bank or cash journal to track balances and payment activity from the overview.
              </div>
              <div style={{ marginTop: "auto" }}>
                <button onClick={() => navigate("/accounting/configuration")} style={widgetButton("primary")}>
                  <Settings size={14} /> Open configuration
                </button>
              </div>
            </div>
          )}

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
    const filteredEntries = journalEntries.filter((entry) => {
      if (referenceFilter && entry.reference !== referenceFilter) {
        return false;
      }
      if (journalEntryStatusFilter !== "all" && entry.status !== journalEntryStatusFilter) {
        return false;
      }
      if (journalEntryJournalFilter !== "all" && String(entry.journal_id) !== journalEntryJournalFilter) {
        return false;
      }
      const searchValue = journalEntrySearch.trim().toLowerCase();
      if (!searchValue) {
        return true;
      }
      const searchHaystack = [
        entry.reference,
        entry.narration,
        journalName(entry.journal_id),
        ...entry.lines.map((line) => line.label),
        ...entry.lines.map((line) => accountLabel(line.account_id)),
      ]
        .join(" ")
        .toLowerCase();
      return searchHaystack.includes(searchValue);
    });
    const totalJournalEntryPages = Math.max(1, Math.ceil(filteredEntries.length / journalEntriesPageSize));
    const safeJournalEntriesPage = Math.min(journalEntriesPage, totalJournalEntryPages);
    const visibleEntries = filteredEntries.slice(
      (safeJournalEntriesPage - 1) * journalEntriesPageSize,
      safeJournalEntriesPage * journalEntriesPageSize,
    );

    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              <BookOpen size={20} style={{ marginRight: 8, verticalAlign: "text-bottom" }} />
              Journal Entries
            </h2>
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

        <div style={{ ...card, display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) minmax(160px, 0.8fr) minmax(180px, 0.9fr) auto", gap: 12, alignItems: "end" }}>
          <div>
            <div style={kpiLabel}>Search</div>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#9ca3af" }} />
              <input
                value={journalEntrySearch}
                onChange={(e) => setJournalEntrySearch(e.target.value)}
                placeholder="Search reference, narration, journal, or lines"
                style={{ width: "100%", padding: "8px 10px 8px 30px", border: "1px solid #e5e7eb", borderRadius: 6 }}
              />
            </div>
          </div>
          <div>
            <div style={kpiLabel}>Status</div>
            <select
              value={journalEntryStatusFilter}
              onChange={(e) => setJournalEntryStatusFilter(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <div style={kpiLabel}>Journal</div>
            <select
              value={journalEntryJournalFilter}
              onChange={(e) => setJournalEntryJournalFilter(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
            >
              <option value="all">All journals</option>
              {journals.map((journal) => (
                <option key={journal.id} value={String(journal.id)}>{journal.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={kpiLabel}>Rows</div>
            <select
              value={journalEntriesPageSize}
              onChange={(e) => setJournalEntriesPageSize(Number(e.target.value))}
              style={{ width: "100%", minWidth: 90, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
            >
              {[5, 10, 20, 50].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
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
            <>
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
                        {referenceFilter ? `No journal entry found for ${referenceFilter}.` : "No journal entries match the current filters."}
                      </td>
                    </tr>
                  )}
                  {visibleEntries.map((entry) => {
                    const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
                    const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
                    const isSelected = selectedJournalEntry?.id === entry.id;
                    return (
                      <tr
                        key={entry.id}
                        onClick={() => setSelectedJournalEntry(entry)}
                        style={{
                          background: isSelected ? "rgba(74,125,230,0.06)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <td style={tdStyle}>{entry.entry_date ? new Date(entry.entry_date).toLocaleDateString() : "-"}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          <div style={{ color: "#2563eb" }}>{entry.reference}</div>
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
                              <button onClick={(event) => {
                                event.stopPropagation();
                                editJournalEntry(entry);
                              }} title="Edit draft" style={{ border: "none", background: "transparent", color: "#2563eb", cursor: "pointer" }}>
                                <FileText size={16} />
                              </button>
                            )}
                            {entry.status === "draft" && (
                              <button onClick={(event) => {
                                event.stopPropagation();
                                updateJournalEntryStatus(entry.id, "post");
                              }} title="Post" style={{ border: "none", background: "transparent", color: "#16a34a", cursor: "pointer" }}>
                                <CheckCircle size={16} />
                              </button>
                            )}
                            {entry.status !== "cancelled" && (
                              <button onClick={(event) => {
                                event.stopPropagation();
                                updateJournalEntryStatus(entry.id, "cancel");
                              }} title="Cancel" style={{ border: "none", background: "transparent", color: "#ea580c", cursor: "pointer" }}>
                                <XCircle size={16} />
                              </button>
                            )}
                            {entry.status === "draft" && (
                              <button onClick={(event) => {
                                event.stopPropagation();
                                deleteJournalEntry(entry.id);
                              }} title="Delete draft" style={{ border: "none", background: "transparent", color: "#dc2626", cursor: "pointer" }}>
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

              <div style={{ marginTop: 12 }}>
                <TablePagination
                  page={safeJournalEntriesPage}
                  pageSize={journalEntriesPageSize}
                  totalItems={filteredEntries.length}
                  onPageChange={setJournalEntriesPage}
                  onPageSizeChange={setJournalEntriesPageSize}
                />
              </div>
            </>
          )}
        </div>

        {selectedJournalEntry && (
          <div
            onClick={() => setSelectedJournalEntry(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.5rem",
              zIndex: 1200,
            }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(920px, 100%)",
                maxHeight: "85vh",
                overflowY: "auto",
                background: "#fff",
                borderRadius: 14,
                border: "1px solid #e5e7eb",
                boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
                padding: "1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedJournalEntry.reference}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    {journalName(selectedJournalEntry.journal_id)}
                    {selectedJournalEntry.entry_date ? ` • ${new Date(selectedJournalEntry.entry_date).toLocaleString()}` : ""}
                  </div>
                  {selectedJournalEntry.narration && (
                    <div style={{ fontSize: 13, color: "#475569", marginTop: 8 }}>{selectedJournalEntry.narration}</div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedJournalEntry(null)}
                  style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Close
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {selectedJournalEntry.status === "draft" && (
                  <button
                    onClick={() => editJournalEntry(selectedJournalEntry)}
                    style={{ padding: "8px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
                  >
                    Edit Draft
                  </button>
                )}
                {selectedJournalEntry.status === "draft" && (
                  <button
                    onClick={() => updateJournalEntryStatus(selectedJournalEntry.id, "post")}
                    style={{ padding: "8px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
                  >
                    Post
                  </button>
                )}
                {selectedJournalEntry.status === "posted" && !selectedJournalEntry.reference.startsWith("REV/") && (
                  <button
                    onClick={() => updateJournalEntryStatus(selectedJournalEntry.id, "reverse")}
                    style={{ padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
                  >
                    Reverse
                  </button>
                )}
                {selectedJournalEntry.status !== "cancelled" && (
                  <button
                    onClick={() => updateJournalEntryStatus(selectedJournalEntry.id, "cancel")}
                    style={{ padding: "8px 14px", background: "#fff", border: "1px solid #f59e0b", color: "#b45309", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                )}
                {selectedJournalEntry.status === "draft" && (
                  <button
                    onClick={() => deleteJournalEntry(selectedJournalEntry.id)}
                    style={{ padding: "8px 14px", background: "#fff", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
                  >
                    Delete Draft
                  </button>
                )}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Account</th>
                    <th style={thStyle}>Label</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Debit</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedJournalEntry.lines.map((line) => (
                    <tr key={line.id}>
                      <td style={tdStyle}>{accountLabel(line.account_id)}</td>
                      <td style={tdStyle}>{line.label || "-"}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(Number(line.debit || 0))}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(Number(line.credit || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ display: "flex", gap: 0, minHeight: 0, height: "100%" }}>
      <Sidebar sections={accountingSidebarSections} />
      <div style={{ flex: 1, minHeight: 0, padding: "1.5rem", overflowY: "auto" }}>
        <div
          className="o-control-panel"
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
            padding: "8px 0",
          }}
        >
          <button
            className="btn btn-sm btn-light border"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
        </div>
        {companySelector}
        {activeSection === "overview" && renderOverview()}
        {activeSection === "journal_entries" && renderJournalEntries()}
      </div>
    </div>
  );
}
