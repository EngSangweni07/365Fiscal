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
  Layers,
  PieChart,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import { apiFetch } from "../api";
import { useCompanies } from "../hooks/useCompanies";
import { useMe } from "../hooks/useMe";
import { SidebarMenu } from "../components/SidebarMenu";
import type { SidebarMenuItem } from "../components/SidebarMenu";

/* ── Types ───────────────────────────────────────────── */
interface BalanceSheet {
  as_of: string;
  assets: { cash_and_bank: number; accounts_receivable: number; inventory: number; total: number };
  liabilities: { accounts_payable: number; total: number };
  equity: { retained_earnings: number; total: number };
}

interface ProfitAndLoss {
  period_from: string;
  period_to: string;
  revenue: { gross_sales: number; sales_tax: number; credit_notes: number; net_revenue: number; invoice_count: number };
  cost_of_goods_sold: number;
  gross_profit: number;
  operating_expenses: { total: number; by_category: { category: string; amount: number }[] };
  net_profit: number;
}

interface CashFlow {
  period_from: string;
  period_to: string;
  operating_activities: {
    cash_received: number;
    by_method: { method: string; amount: number }[];
    cash_paid: number;
    by_category: { category: string; amount: number }[];
    net_operating: number;
  };
  net_cash_change: number;
}

interface ExecutiveSummary {
  year: number;
  ytd_revenue: number;
  ytd_expenses: number;
  ytd_net_profit: number;
  outstanding_receivables: number;
  overdue_receivables: number;
}

interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type: string;
  debit: number;
  credit: number;
  balance: number;
}

interface TrialBalance {
  as_of: string;
  rows: TrialBalanceRow[];
  total_debit: number;
  total_credit: number;
  difference: number;
}

interface GeneralLedgerEntry {
  date: string;
  reference: string;
  type: string;
  party: string;
  debit: number;
  credit: number;
  description: string;
  running_balance: number;
}

interface GeneralLedger {
  period_from: string;
  period_to: string;
  entries: GeneralLedgerEntry[];
  total_debit: number;
  total_credit: number;
}

interface AgedRow {
  customer_id?: number;
  customer_name?: string;
  supplier_id?: number;
  supplier_name?: string;
  current: number;
  "1_30": number;
  "31_60": number;
  "61_90": number;
  over_90: number;
  total: number;
}

interface AgedReport {
  as_of: string;
  rows: AgedRow[];
  totals: { current: number; "1_30": number; "31_60": number; "61_90": number; over_90: number; total: number };
}

interface TaxReturn {
  period_from: string;
  period_to: string;
  output_vat: number;
  credit_note_vat: number;
  input_vat: number;
  net_vat_payable: number;
}

type ReportKey =
  | "balance_sheet"
  | "profit_loss"
  | "cash_flow"
  | "executive_summary"
  | "tax_return"
  | "trial_balance"
  | "general_ledger"
  | "aged_receivable"
  | "aged_payable";

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
  borderBottom: "2px solid var(--border, #e5e7eb)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  borderBottom: "1px solid #f3f4f6",
};
const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  fontSize: 13,
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 6,
};
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted, #6b7280)",
  marginBottom: 4,
};
const kpiCard: React.CSSProperties = {
  ...card,
  textAlign: "center",
  padding: "1rem",
};
const kpiValue: React.CSSProperties = {
  fontSize: 22,
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

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Component ───────────────────────────────────────── */
export default function AccountingReportsPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { companies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const [activeReport, setActiveReport] = useState<ReportKey>("balance_sheet");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Report data
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [profitLoss, setProfitLoss] = useState<ProfitAndLoss | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [execSummary, setExecSummary] = useState<ExecutiveSummary | null>(null);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [generalLedger, setGeneralLedger] = useState<GeneralLedger | null>(null);
  const [agedReceivable, setAgedReceivable] = useState<AgedReport | null>(null);
  const [agedPayable, setAgedPayable] = useState<AgedReport | null>(null);
  const [taxReturn, setTaxReturn] = useState<TaxReturn | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

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

  // Fetch report when company/report/dates change
  const fetchReport = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ company_id: String(companyId) });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (dateFrom) params.set("as_of", dateTo || new Date().toISOString().slice(0, 10));

    try {
      const base = "/accounting/reports";
      switch (activeReport) {
        case "balance_sheet":
          setBalanceSheet(await apiFetch(`${base}/balance-sheet?${params}`));
          break;
        case "profit_loss":
          setProfitLoss(await apiFetch(`${base}/profit-and-loss?${params}`));
          break;
        case "cash_flow":
          setCashFlow(await apiFetch(`${base}/cash-flow?${params}`));
          break;
        case "executive_summary":
          setExecSummary(await apiFetch(`${base}/executive-summary?${params}`));
          break;
        case "tax_return":
          setTaxReturn(await apiFetch(`${base}/tax-return?${params}`));
          break;
        case "trial_balance":
          setTrialBalance(await apiFetch(`${base}/trial-balance?${params}`));
          break;
        case "general_ledger":
          setGeneralLedger(await apiFetch(`${base}/general-ledger?${params}`));
          break;
        case "aged_receivable":
          setAgedReceivable(await apiFetch(`${base}/aged-receivable?${params}`));
          break;
        case "aged_payable":
          setAgedPayable(await apiFetch(`${base}/aged-payable?${params}`));
          break;
      }
    } catch (err: any) {
      setError(err?.detail || err?.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [companyId, activeReport, dateFrom, dateTo]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Sidebar items (matching Odoo menus)
  const sidebarItems: SidebarMenuItem[] = [
    { key: "balance_sheet", label: "BALANCE SHEET", icon: Layers, color: "#714b67" },
    { key: "profit_loss", label: "PROFIT AND LOSS", icon: TrendingUp, color: "#714b67" },
    { key: "cash_flow", label: "CASH FLOW", icon: DollarSign, color: "#714b67" },
    { key: "executive_summary", label: "EXECUTIVE SUMMARY", icon: PieChart, color: "#714b67" },
    { key: "tax_return", label: "TAX RETURN", icon: Calculator, color: "#714b67" },
    { key: "trial_balance", label: "TRIAL BALANCE", icon: BookOpen, color: "#714b67" },
    { key: "general_ledger", label: "GENERAL LEDGER", icon: FileText, color: "#714b67" },
    { key: "aged_receivable", label: "AGED RECEIVABLE", icon: Users, color: "#714b67" },
    { key: "aged_payable", label: "AGED PAYABLE", icon: CreditCard, color: "#714b67" },
  ];

  const needsDateRange = ["profit_loss", "cash_flow", "general_ledger", "tax_return"].includes(activeReport);

  const handlePrint = () => {
    if (printRef.current) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <html><head><title>Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 13px; }
            th { font-weight: 600; background: #f9fafb; }
            h2, h3 { margin: 0 0 8px; }
          </style>
          </head><body>${printRef.current.innerHTML}</body></html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  /* ── Report Renderers ── */
  const renderBalanceSheet = () => {
    if (!balanceSheet) return null;
    const { assets, liabilities, equity } = balanceSheet;
    return (
      <div ref={printRef}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          Balance Sheet as of {new Date(balanceSheet.as_of).toLocaleDateString()}
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
          {/* Assets */}
          <div style={card}>
            <div style={{ ...kpiLabel, color: "#2563eb", marginBottom: 12 }}>ASSETS</div>
            <div style={{ fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span>Cash & Bank</span><span style={{ fontWeight: 600 }}>{fmt(assets.cash_and_bank)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span>Accounts Receivable</span><span style={{ fontWeight: 600 }}>{fmt(assets.accounts_receivable)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span>Inventory</span><span style={{ fontWeight: 600 }}>{fmt(assets.inventory)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 700, borderTop: "2px solid #e5e7eb", marginTop: 4 }}>
                <span>Total Assets</span><span style={{ color: "#2563eb" }}>{fmt(assets.total)}</span>
              </div>
            </div>
          </div>
          {/* Liabilities */}
          <div style={card}>
            <div style={{ ...kpiLabel, color: "#dc2626", marginBottom: 12 }}>LIABILITIES</div>
            <div style={{ fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span>Accounts Payable</span><span style={{ fontWeight: 600 }}>{fmt(liabilities.accounts_payable)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 700, borderTop: "2px solid #e5e7eb", marginTop: 4 }}>
                <span>Total Liabilities</span><span style={{ color: "#dc2626" }}>{fmt(liabilities.total)}</span>
              </div>
            </div>
          </div>
          {/* Equity */}
          <div style={card}>
            <div style={{ ...kpiLabel, color: "#059669", marginBottom: 12 }}>EQUITY</div>
            <div style={{ fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span>Retained Earnings</span><span style={{ fontWeight: 600 }}>{fmt(equity.retained_earnings)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 700, borderTop: "2px solid #e5e7eb", marginTop: 4 }}>
                <span>Total Equity</span><span style={{ color: "#059669" }}>{fmt(equity.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProfitLoss = () => {
    if (!profitLoss) return null;
    const { revenue, cost_of_goods_sold, gross_profit, operating_expenses, net_profit } = profitLoss;
    return (
      <div ref={printRef}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          Profit and Loss: {new Date(profitLoss.period_from).toLocaleDateString()} — {new Date(profitLoss.period_to).toLocaleDateString()}
        </h3>
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr style={{ background: "#f9fafb" }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>Revenue</td>
                <td style={{ ...tdStyle, textAlign: "right" }}></td>
              </tr>
              <tr><td style={tdStyle}>Gross Sales</td><td style={{ ...tdStyle, textAlign: "right" }}>{fmt(revenue.gross_sales)}</td></tr>
              <tr><td style={tdStyle}>Sales Tax Collected</td><td style={{ ...tdStyle, textAlign: "right" }}>{fmt(revenue.sales_tax)}</td></tr>
              <tr><td style={tdStyle}>Less: Credit Notes</td><td style={{ ...tdStyle, textAlign: "right", color: "#dc2626" }}>({fmt(revenue.credit_notes)})</td></tr>
              <tr style={{ fontWeight: 700 }}>
                <td style={tdStyle}>Net Revenue</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(revenue.net_revenue)}</td>
              </tr>
              <tr><td style={tdStyle}>Cost of Goods Sold</td><td style={{ ...tdStyle, textAlign: "right", color: "#dc2626" }}>({fmt(cost_of_goods_sold)})</td></tr>
              <tr style={{ fontWeight: 700, background: "#f0fdf4" }}>
                <td style={tdStyle}>Gross Profit</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#059669" }}>{fmt(gross_profit)}</td>
              </tr>
              <tr style={{ background: "#f9fafb" }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>Operating Expenses</td>
                <td style={{ ...tdStyle, textAlign: "right" }}></td>
              </tr>
              {operating_expenses.by_category.map((c) => (
                <tr key={c.category}>
                  <td style={{ ...tdStyle, paddingLeft: 28 }}>{c.category}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(c.amount)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td style={tdStyle}>Total Operating Expenses</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#dc2626" }}>({fmt(operating_expenses.total)})</td>
              </tr>
              <tr style={{ fontWeight: 700, background: net_profit >= 0 ? "#f0fdf4" : "#fef2f2", fontSize: 15 }}>
                <td style={{ ...tdStyle, borderTop: "2px solid #e5e7eb" }}>Net Profit / (Loss)</td>
                <td style={{ ...tdStyle, textAlign: "right", borderTop: "2px solid #e5e7eb", color: net_profit >= 0 ? "#059669" : "#dc2626" }}>
                  {net_profit >= 0 ? fmt(net_profit) : `(${fmt(Math.abs(net_profit))})`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCashFlow = () => {
    if (!cashFlow) return null;
    const { operating_activities, net_cash_change } = cashFlow;
    return (
      <div ref={printRef}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          Cash Flow Statement: {new Date(cashFlow.period_from).toLocaleDateString()} — {new Date(cashFlow.period_to).toLocaleDateString()}
        </h3>
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr style={{ background: "#f9fafb", fontWeight: 700 }}>
                <td style={tdStyle}>Operating Activities</td><td style={{ ...tdStyle, textAlign: "right" }}></td>
              </tr>
              <tr style={{ fontWeight: 600 }}><td style={tdStyle}>Cash Received</td><td style={{ ...tdStyle, textAlign: "right", color: "#059669" }}>{fmt(operating_activities.cash_received)}</td></tr>
              {operating_activities.by_method.map((m) => (
                <tr key={m.method}><td style={{ ...tdStyle, paddingLeft: 28 }}>{m.method}</td><td style={{ ...tdStyle, textAlign: "right" }}>{fmt(m.amount)}</td></tr>
              ))}
              <tr style={{ fontWeight: 600 }}><td style={tdStyle}>Cash Paid</td><td style={{ ...tdStyle, textAlign: "right", color: "#dc2626" }}>({fmt(operating_activities.cash_paid)})</td></tr>
              {operating_activities.by_category.map((c) => (
                <tr key={c.category}><td style={{ ...tdStyle, paddingLeft: 28 }}>{c.category}</td><td style={{ ...tdStyle, textAlign: "right" }}>{fmt(c.amount)}</td></tr>
              ))}
              <tr style={{ fontWeight: 700, fontSize: 15, background: net_cash_change >= 0 ? "#f0fdf4" : "#fef2f2" }}>
                <td style={{ ...tdStyle, borderTop: "2px solid #e5e7eb" }}>Net Cash Change</td>
                <td style={{ ...tdStyle, textAlign: "right", borderTop: "2px solid #e5e7eb", color: net_cash_change >= 0 ? "#059669" : "#dc2626" }}>
                  {net_cash_change >= 0 ? fmt(net_cash_change) : `(${fmt(Math.abs(net_cash_change))})`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderExecutiveSummary = () => {
    if (!execSummary) return null;
    return (
      <div ref={printRef}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          Executive Summary — {execSummary.year}
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
          <div style={kpiCard}>
            <div style={{ ...kpiValue, color: "#059669" }}>{fmt(execSummary.ytd_revenue)}</div>
            <div style={kpiLabel}>YTD Revenue</div>
          </div>
          <div style={kpiCard}>
            <div style={{ ...kpiValue, color: "#dc2626" }}>{fmt(execSummary.ytd_expenses)}</div>
            <div style={kpiLabel}>YTD Expenses</div>
          </div>
          <div style={kpiCard}>
            <div style={{ ...kpiValue, color: execSummary.ytd_net_profit >= 0 ? "#059669" : "#dc2626" }}>
              {fmt(execSummary.ytd_net_profit)}
            </div>
            <div style={kpiLabel}>YTD Net Profit</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={kpiCard}>
            <div style={{ ...kpiValue, color: "#2563eb" }}>{fmt(execSummary.outstanding_receivables)}</div>
            <div style={kpiLabel}>Outstanding Receivables</div>
          </div>
          <div style={kpiCard}>
            <div style={{ ...kpiValue, color: "#ea580c" }}>{fmt(execSummary.overdue_receivables)}</div>
            <div style={kpiLabel}>Overdue Receivables</div>
          </div>
        </div>
      </div>
    );
  };

  const renderTaxReturn = () => {
    if (!taxReturn) return null;
    return (
      <div ref={printRef}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          Tax Return: {new Date(taxReturn.period_from).toLocaleDateString()} — {new Date(taxReturn.period_to).toLocaleDateString()}
        </h3>
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={tdStyle}>Output VAT (Sales)</td><td style={{ ...tdStyle, textAlign: "right" }}>{fmt(taxReturn.output_vat)}</td></tr>
              <tr><td style={tdStyle}>Less: Credit Note VAT</td><td style={{ ...tdStyle, textAlign: "right", color: "#dc2626" }}>({fmt(taxReturn.credit_note_vat)})</td></tr>
              <tr><td style={tdStyle}>Less: Input VAT (Expenses)</td><td style={{ ...tdStyle, textAlign: "right", color: "#dc2626" }}>({fmt(taxReturn.input_vat)})</td></tr>
              <tr style={{ fontWeight: 700, background: taxReturn.net_vat_payable >= 0 ? "#fef2f2" : "#f0fdf4", fontSize: 15 }}>
                <td style={{ ...tdStyle, borderTop: "2px solid #e5e7eb" }}>
                  {taxReturn.net_vat_payable >= 0 ? "Net VAT Payable" : "Net VAT Refundable"}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", borderTop: "2px solid #e5e7eb", color: taxReturn.net_vat_payable >= 0 ? "#dc2626" : "#059669" }}>
                  {fmt(Math.abs(taxReturn.net_vat_payable))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTrialBalance = () => {
    if (!trialBalance) return null;
    return (
      <div ref={printRef}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          Trial Balance as of {new Date(trialBalance.as_of).toLocaleDateString()}
        </h3>
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Code</th>
                <th style={thStyle}>Account</th>
                <th style={thStyle}>Type</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Debit</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Credit</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {trialBalance.rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{r.account_code}</td>
                  <td style={tdStyle}>{r.account_name}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: r.account_type === "asset" ? "#dbeafe" : r.account_type === "income" ? "#d1fae5" : r.account_type === "expense" ? "#fee2e2" : "#e5e7eb",
                      color: r.account_type === "asset" ? "#1e40af" : r.account_type === "income" ? "#065f46" : r.account_type === "expense" ? "#991b1b" : "#374151",
                    }}>{r.account_type}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{r.debit ? fmt(r.debit) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{r.credit ? fmt(r.credit) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: r.balance >= 0 ? "#059669" : "#dc2626" }}>
                    {fmt(r.balance)}
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: "#f9fafb" }}>
                <td style={tdStyle} colSpan={3}>Totals</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(trialBalance.total_debit)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(trialBalance.total_credit)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: trialBalance.difference === 0 ? "#059669" : "#dc2626" }}>
                  {fmt(trialBalance.difference)}
                </td>
              </tr>
            </tbody>
          </table>
          {trialBalance.difference !== 0 && (
            <div style={{ marginTop: 8, color: "#dc2626", fontSize: 12, fontWeight: 600 }}>
              ⚠ Trial balance is out of balance by {fmt(Math.abs(trialBalance.difference))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGeneralLedger = () => {
    if (!generalLedger) return null;
    return (
      <div ref={printRef}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          General Ledger: {new Date(generalLedger.period_from).toLocaleDateString()} — {new Date(generalLedger.period_to).toLocaleDateString()}
        </h3>
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Reference</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Party</th>
                <th style={thStyle}>Description</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Debit</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Credit</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {generalLedger.entries.length === 0 && (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>No entries for this period</td></tr>
              )}
              {generalLedger.entries.map((e, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{e.date ? new Date(e.date).toLocaleDateString() : "—"}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{e.reference}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: e.type === "invoice" ? "#d1fae5" : e.type === "payment" ? "#dbeafe" : e.type === "expense" ? "#fee2e2" : "#fef3c7",
                      color: e.type === "invoice" ? "#065f46" : e.type === "payment" ? "#1e40af" : e.type === "expense" ? "#991b1b" : "#92400e",
                    }}>{e.type}</span>
                  </td>
                  <td style={tdStyle}>{e.party}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{e.debit ? fmt(e.debit) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{e.credit ? fmt(e.credit) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: e.running_balance >= 0 ? "#059669" : "#dc2626" }}>
                    {fmt(e.running_balance)}
                  </td>
                </tr>
              ))}
              {generalLedger.entries.length > 0 && (
                <tr style={{ fontWeight: 700, background: "#f9fafb" }}>
                  <td style={tdStyle} colSpan={5}>Totals</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(generalLedger.total_debit)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(generalLedger.total_credit)}</td>
                  <td style={tdStyle}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderAgedReport = (data: AgedReport | null, nameField: "customer_name" | "supplier_name") => {
    if (!data) return null;
    const title = nameField === "customer_name" ? "Aged Receivable" : "Aged Payable";
    return (
      <div ref={printRef}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          {title} as of {new Date(data.as_of).toLocaleDateString()}
        </h3>
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>{nameField === "customer_name" ? "Customer" : "Supplier"}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Current</th>
                <th style={{ ...thStyle, textAlign: "right" }}>1-30 Days</th>
                <th style={{ ...thStyle, textAlign: "right" }}>31-60 Days</th>
                <th style={{ ...thStyle, textAlign: "right" }}>61-90 Days</th>
                <th style={{ ...thStyle, textAlign: "right" }}>90+ Days</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>No outstanding amounts</td></tr>
              )}
              {data.rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{(r as any)[nameField]}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{r.current ? fmt(r.current) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{r["1_30"] ? fmt(r["1_30"]) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: r["31_60"] ? "#ea580c" : undefined }}>{r["31_60"] ? fmt(r["31_60"]) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: r["61_90"] ? "#dc2626" : undefined }}>{r["61_90"] ? fmt(r["61_90"]) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: r.over_90 ? "#991b1b" : undefined, fontWeight: r.over_90 ? 700 : 400 }}>
                    {r.over_90 ? fmt(r.over_90) : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{fmt(r.total)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: "#f9fafb" }}>
                <td style={tdStyle}>Totals</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(data.totals.current)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(data.totals["1_30"])}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(data.totals["31_60"])}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(data.totals["61_90"])}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(data.totals.over_90)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(data.totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderReport = () => {
    if (loading) {
      return (
        <div style={{ ...card, textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
          <div className="spinner" style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTopColor: "#714b67", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          Loading report...
        </div>
      );
    }
    if (error) {
      return <div style={{ ...card, color: "#dc2626", textAlign: "center", padding: "2rem" }}>{error}</div>;
    }
    switch (activeReport) {
      case "balance_sheet": return renderBalanceSheet();
      case "profit_loss": return renderProfitLoss();
      case "cash_flow": return renderCashFlow();
      case "executive_summary": return renderExecutiveSummary();
      case "tax_return": return renderTaxReturn();
      case "trial_balance": return renderTrialBalance();
      case "general_ledger": return renderGeneralLedger();
      case "aged_receivable": return renderAgedReport(agedReceivable, "customer_name");
      case "aged_payable": return renderAgedReport(agedPayable, "supplier_name");
      default: return null;
    }
  };

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
          title="Reporting"
          items={sidebarItems}
          activeKey={activeReport}
          onSelect={(key) => setActiveReport(key as ReportKey)}
        />
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
        {/* Company Selector */}
        {isAdmin && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ position: "relative", maxWidth: 320 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#9ca3af" }} />
              <input
                type="text"
                placeholder="Search company..."
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 30, width: "100%" }}
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
                    border: companyId === c.id ? "2px solid var(--primary, #714b67)" : "1px solid var(--border, #e5e7eb)",
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
            <BarChart3 size={48} strokeWidth={1} style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>Select a company to view reports</div>
          </div>
        ) : (
          <>
            {/* Date Filters & Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              {needsDateRange && (
                <>
                  <div>
                    <div style={labelStyle}>From</div>
                    <input
                      type="date"
                      style={inputStyle}
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <div style={labelStyle}>To</div>
                    <input
                      type="date"
                      style={inputStyle}
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button
                  onClick={fetchReport}
                  style={{
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
                  }}
                >
                  Refresh
                </button>
                <button
                  onClick={handlePrint}
                  style={{
                    padding: "7px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary, #111)",
                    background: "#fff",
                    border: "1px solid var(--border, #e5e7eb)",
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Download size={14} /> Print / PDF
                </button>
              </div>
            </div>

            {/* Report Content */}
            {renderReport()}
          </>
        )}
      </div>
    </div>
  );
}
