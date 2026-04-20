import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Calculator,
  ChevronDown,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Globe,
  Layers,
  PieChart,
  Search,
  Settings,
  TrendingUp,
  Users,
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

type SectionKey =
  | "overview"
  | "invoices"
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
  const { me } = useMe();
  const { companies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AccountingOverview | null>(null);

  // Auto-select company for portal
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

  // Navigate to sub-pages
  const handleSectionSelect = (key: string) => {
    if (key === "invoices") {
      navigate("/invoices");
      return;
    }
    if (key === "payments") {
      navigate("/payments");
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

  const sidebarItems: SidebarMenuItem[] = [
    { key: "overview", label: "OVERVIEW", icon: Layers, color: "#714b67" },
    { key: "invoices", label: "INVOICES", icon: FileText, color: "#714b67" },
    { key: "payments", label: "PAYMENTS", icon: CreditCard, color: "#714b67" },
    { key: "reports", label: "REPORTS", icon: BarChart3, color: "#714b67" },
    { key: "configuration", label: "CONFIGURATION", icon: Settings, color: "#714b67" },
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
                      background: "linear-gradient(135deg, #714b67, #8e6d83)",
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
              background: "var(--primary, #714b67)",
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
            onClick={() => navigate("/payments")}
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
        {companySelector}
        {activeSection === "overview" && renderOverview()}
      </div>
    </div>
  );
}
