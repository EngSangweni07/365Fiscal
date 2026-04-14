import {
  CSSProperties,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { Sidebar } from "../components/Sidebar";
import type { SidebarSection } from "../types/sidebar";
import { TablePagination } from "../components/TablePagination";
import { useMe } from "../hooks/useMe";
import { useCompanies, Company } from "../hooks/useCompanies";
import {
  buildRevenueTrendChart,
  RevenueTrendChart,
} from "../utils/revenueTrend";
import {
  BarChart,
  CreditCard,
  FileText,
  Layers,
  Monitor,
  Percent,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { CurrencyItem } from "../types/currency";

/* ── Interfaces ──────────────────────────────────────── */

interface InvoiceLine {
  id: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  vat_rate: number;
  subtotal: number;
  tax_amount: number;
  total_price: number;
}

interface Invoice {
  id: number;
  reference: string;
  status: string;
  invoice_date: string | null;
  total_amount: number;
  amount_paid: number;
  tax_amount: number;
  subtotal: number;
  customer_id: number | null;
  invoice_type: string;
  lines: InvoiceLine[];
  created_at: string;
}

interface Product {
  id: number;
  name: string;
  sale_price: number;
  purchase_cost: number;
  category_id: number | null;
  product_type: string;
  uom: string;
  reorder_point: number;
  is_active: boolean;
}

interface StockQuant {
  id: number;
  product_id: number;
  quantity: number;
  available_quantity: number;
  reserved_quantity: number;
  unit_cost: number;
  total_value: number;
}

interface StockMoveItem {
  id: number;
  product_id: number;
  move_type: string;
  quantity: number;
  reference: string;
  state: string;
  created_at: string;
}

interface PaymentItem {
  id: number;
  reference: string;
  invoice_id: number | null;
  amount: number;
  payment_method: string;
  payment_date: string | null;
  status: string;
  reconciled_at: string | null;
  created_at: string;
}

interface PurchaseOrderLine {
  id: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  vat_rate: number;
  subtotal: number;
  tax_amount: number;
  total_price: number;
}

interface PurchaseOrder {
  id: number;
  reference: string;
  status: string;
  paid_state?: string;
  order_date: string | null;
  supplier_id: number | null;
  subtotal?: number;
  discount_amount?: number;
  total_amount: number;
  tax_amount: number;
  lines: PurchaseOrderLine[];
}

interface Expense {
  id: number;
  reference: string;
  description: string;
  category: string;
  supplier_id: number | null;
  expense_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: string;
}

interface CompanySettings {
  currency_code?: string;
  currency_symbol?: string;
}

type CurrencyOption = {
  code: string;
  label: string;
};

const normalizeCurrency = (value: string | null | undefined) => {
  const code = (value || "").trim().toUpperCase();
  if (!code) return "";
  if (code === "ZWL") return "ZWG";
  return code;
};

/* ── Report data shapes ──────────────────────────────── */

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface MonthlySales {
  month: string;
  amount: number;
  count: number;
}

interface SalesReport {
  total_sales: number;
  total_invoices: number;
  paid_invoices: number;
  pending_invoices: number;
  total_tax: number;
  average_invoice: number;
  top_products: TopProduct[];
  sales_by_month: MonthlySales[];
}

const EMPTY_REVENUE_TREND_CHART: RevenueTrendChart = {
  bars: [],
  axisTicks: [],
  axisSteps: 4,
  totalRevenue: 0,
  latestValue: 0,
  latestLabel: "",
};

interface IncomeStatementReport {
  gross_revenue_ex_vat: number;
  expenses_ex_vat: number;
  net_revenue_ex_vat: number;
  invoices: {
    reference: string;
    customer: string;
    date: string;
    subtotal: number;
    tax: number;
    total: number;
    status: string;
  }[];
  expenses: {
    reference: string;
    supplier: string;
    category: string;
    description: string;
    date: string;
    subtotal: number;
    tax: number;
    total: number;
  }[];
}

interface StockReport {
  total_products: number;
  total_value: number;
  low_stock_items: {
    name: string;
    on_hand: number;
    available: number;
    reorder: number;
  }[];
  stock_summary: {
    name: string;
    on_hand: number;
    available: number;
    reserved: number;
    value: number;
  }[];
  recent_movements: {
    product: string;
    type: string;
    quantity: number;
    reference: string;
    date: string;
    state: string;
  }[];
}

interface DebtorsReport {
  total_invoices: number;
  unpaid_invoices: number;
  partial_invoices: number;
  total_invoiced: number;
  total_due: number;
  average_due: number;
  recent_unpaid: {
    reference: string;
    customer: string;
    total: number;
    paid: number;
    due: number;
    date: string;
    status: string;
  }[];
}

interface CreditorsReport {
  total_orders: number;
  open_orders: number;
  total_amount: number;
  by_status: { status: string; count: number; amount: number }[];
  by_supplier: { name: string; count: number; amount: number }[];
  recent_orders: {
    reference: string;
    supplier: string;
    amount: number;
    date: string;
    status: string;
    paid_state: string;
  }[];
}

interface VatRateBucket {
  rate: number;
  taxable_amount: number;
  tax_amount: number;
  total: number;
  count: number;
}

interface VatReport {
  sales_total: number;
  purchases_total: number;
  profit: number;
  output_tax: number;
  input_tax: number;
  net_tax: number;
  invoices_count: number;
  purchases_count: number;
  credit_notes_count: number;
  credit_notes_tax: number;
  sales_by_rate: VatRateBucket[];
  purchases_by_rate: VatRateBucket[];
  period_from: string;
  period_to: string;
}

interface PurchaseReportData {
  total_orders: number;
  total_amount: number;
  total_tax: number;
  average_order: number;
  by_status: { status: string; count: number; amount: number }[];
  by_supplier: { name: string; count: number; amount: number }[];
  by_month: { month: string; amount: number; count: number }[];
  recent_orders: {
    reference: string;
    supplier: string;
    amount: number;
    date: string;
    status: string;
  }[];
}

interface POSOrderReportItem {
  reference: string;
  cashier: string;
  till: string;
  date: string;
  status: string;
  currency: string;
  total: number;
  cash: number;
  card: number;
  mobile: number;
  fiscalized: boolean;
}

interface POSOrdersReportData {
  total_orders: number;
  fiscalized_orders: number;
  refunded_orders: number;
  by_currency: {
    currency: string;
    count: number;
    total: number;
    cash: number;
    card: number;
    mobile: number;
  }[];
  by_status: { status: string; count: number }[];
  recent_orders: POSOrderReportItem[];
}

interface ProfitLossJournalEntry {
  date: string;
  source: string;
  reference: string;
  party: string;
  description: string;
  debit: number;
  credit: number;
  running_profit: number;
  status: string;
}

interface ProfitLossJournalReport {
  total_credits: number;
  total_debits: number;
  net_profit: number;
  entries: ProfitLossJournalEntry[];
}

interface QpdScheduleEntry {
  quarter: string;
  due_date: string;
  installment_percentage: number;
  cumulative_percentage: number;
  cumulative_tax_due: number;
  prior_qpds_due: number;
  amount_due: number;
  remittance_form: string;
}

interface QpdReport {
  tax_year: number;
  tax_rate: number;
  period_taxable_income: number;
  annualisation_factor: number;
  estimated_annual_taxable_income: number;
  estimated_annual_tax_due: number;
  payment_schedule: QpdScheduleEntry[];
}

interface POSOrderReportRaw {
  id: number;
  reference: string;
  status: string;
  order_date: string;
  total_amount: number;
  cash_amount: number;
  card_amount: number;
  mobile_amount: number;
  currency: string;
  is_fiscalized: boolean;
  cashier_name: string;
  till_id: number | null;
}

interface POSTillListItem {
  id: number;
  name: string;
}

type ReportType =
  | "sales"
  | "stock"
  | "debtors"
  | "creditors"
  | "income_statement"
  | "profit_loss_journal"
  | "qpd"
  | "vat"
  | "purchases"
  | "pos_orders";

type ReportMenuItem = {
  key: ReportType;
  label: string;
  icon: LucideIcon;
  color: string;
  background: string;
};

const REPORT_MENU_ITEMS: ReportMenuItem[] = [
  {
    key: "sales",
    label: "REVENUE",
    icon: TrendingUp,
    color: "var(--emerald-500)",
    background: "rgba(16, 185, 129, 0.15)",
  },
  {
    key: "stock",
    label: "STOCK VALUATION",
    icon: Layers,
    color: "var(--amber-500)",
    background: "rgba(234, 179, 8, 0.15)",
  },
  {
    key: "debtors",
    label: "DEBTORS",
    icon: FileText,
    color: "var(--blue-500)",
    background: "rgba(37, 99, 235, 0.15)",
  },
  {
    key: "creditors",
    label: "CREDITORS",
    icon: CreditCard,
    color: "var(--rose-500)",
    background: "rgba(244, 63, 94, 0.12)",
  },
  {
    key: "income_statement",
    label: "INCOME STATEMENT",
    icon: BarChart,
    color: "var(--indigo-500)",
    background: "rgba(79, 70, 229, 0.15)",
  },
  {
    key: "profit_loss_journal",
    label: "P&L JOURNAL",
    icon: FileText,
    color: "var(--cyan-600)",
    background: "rgba(8, 145, 178, 0.14)",
  },
  {
    key: "qpd",
    label: "QPD TAX REPORT",
    icon: Percent,
    color: "var(--fuchsia-600)",
    background: "rgba(192, 38, 211, 0.12)",
  },
  {
    key: "vat",
    label: "VAT RETURN",
    icon: Percent,
    color: "var(--violet-500)",
    background: "rgba(168, 85, 247, 0.12)",
  },
  {
    key: "purchases",
    label: "PURCHASE REPORT",
    icon: ShoppingCart,
    color: "var(--orange-500)",
    background: "rgba(249, 115, 22, 0.15)",
  },
  {
    key: "pos_orders",
    label: "POS ORDERS REPORT",
    icon: Monitor,
    color: "var(--teal-500)",
    background: "rgba(45, 212, 191, 0.15)",
  },
];

type VatSectionTab =
  | "sales_vat"
  | "purchases_vat"
  | "credit_notes"
  | "net_vat"
  | "profit_summary";

type IncomeSectionTab = "summary" | "revenue" | "expenses";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const PROVISIONAL_TAX_RATE = 25.75;

const QPD_INSTALLMENTS = [
  { quarter: "Q1", month: 2, day: 25, installmentPercentage: 10 },
  { quarter: "Q2", month: 5, day: 25, installmentPercentage: 25 },
  { quarter: "Q3", month: 8, day: 25, installmentPercentage: 30 },
  { quarter: "Q4", month: 11, day: 20, installmentPercentage: 35 },
] as const;

const getDaysInclusive = (from: Date | null, to: Date | null) => {
  if (!from || !to) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / msPerDay) + 1);
};

const getTaxYearLength = (year: number) => {
  const isLeapYear =
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeapYear ? 366 : 365;
};

/* ── Component ───────────────────────────────────────── */

export default function ReportsPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { companies: allCompanies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    null,
  );
  const [companyQuery, setCompanyQuery] = useState("");

  // Portal users auto-select their first company
  useEffect(() => {
    if (!isAdmin && me?.company_ids?.length && !selectedCompanyId) {
      setSelectedCompanyId(me.company_ids[0]);
    }
  }, [isAdmin, me?.company_ids, selectedCompanyId]);

  const companyId = selectedCompanyId;

  const company =
    me?.companies?.find((c) => c.id === companyId) ||
    allCompanies.find((c) => c.id === companyId);

  const filteredCompanies = useMemo(() => {
    if (!companyQuery.trim()) return allCompanies;
    const q = companyQuery.toLowerCase();
    return allCompanies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tin && c.tin.toLowerCase().includes(q)) ||
        (c.vat && c.vat.toLowerCase().includes(q)),
    );
  }, [allCompanies, companyQuery]);

  const [activeReport, setActiveReport] = useState<ReportType>("sales");
  const reportsSidebarSections = useMemo<SidebarSection[]>(() => {
    const items = REPORT_MENU_ITEMS.map((item) => {
      const Icon = item.icon;
      return {
        id: `report-menu-${item.key}`,
        label: item.label,
        icon: (
          <Icon
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            color={item.color}
          />
        ),
        isActive: activeReport === item.key,
        onClick: () => setActiveReport(item.key),
        iconColor: item.color,
        iconBackground: item.background,
      };
    });

    return [
      {
        id: "reports-menu",
        title: "FINANCIAL REPORTS",
        items,
      },
    ];
  }, [activeReport]);
  const [activeIncomeTab, setActiveIncomeTab] =
    useState<IncomeSectionTab>("summary");
  const [activeVatTab, setActiveVatTab] = useState<VatSectionTab>("sales_vat");
  const [tablePages, setTablePages] = useState<Record<string, number>>({});
  const [tablePageSizes, setTablePageSizes] = useState<Record<string, number>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [reportCurrency, setReportCurrency] = useState("");

  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [salesTrendChart, setSalesTrendChart] = useState<RevenueTrendChart>(
    () => ({
      ...EMPTY_REVENUE_TREND_CHART,
    }),
  );
  const [stockReport, setStockReport] = useState<StockReport | null>(null);
  const [debtorsReport, setDebtorsReport] = useState<DebtorsReport | null>(
    null,
  );
  const [creditorsReport, setCreditorsReport] =
    useState<CreditorsReport | null>(null);
  const [incomeStatementReport, setIncomeStatementReport] =
    useState<IncomeStatementReport | null>(null);
  const [profitLossJournalReport, setProfitLossJournalReport] =
    useState<ProfitLossJournalReport | null>(null);
  const [qpdReport, setQpdReport] = useState<QpdReport | null>(null);
  const [vatReport, setVatReport] = useState<VatReport | null>(null);
  const [purchaseReport, setPurchaseReport] =
    useState<PurchaseReportData | null>(null);
  const [posOrdersReport, setPosOrdersReport] =
    useState<POSOrdersReportData | null>(null);
  const [companySettings, setCompanySettings] =
    useState<CompanySettings | null>(null);
  const [currencyList, setCurrencyList] = useState<CurrencyItem[]>([]);

  // Set default date range to cover the last six months so trends show prior data
  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setDateRange({
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0],
    });
  }, []);

  // Load company settings for currency
  useEffect(() => {
    if (!companyId) return;
    apiFetch<CompanySettings>(`/company-settings?company_id=${companyId}`)
      .then(setCompanySettings)
      .catch(() => {});
  }, [companyId]);

  // Load configured currencies (to resolve symbols by code)
  useEffect(() => {
    if (!companyId) return;
    apiFetch<CurrencyItem[]>(
      `/currencies?company_id=${companyId}&active_only=true`,
    )
      .then((list) => setCurrencyList(list || []))
      .catch(() => setCurrencyList([]));
  }, [companyId]);

  const defaultCurrency =
    currencyList.find((c) => c.is_default) || currencyList[0] || null;
  const baseCurrencyCode =
    normalizeCurrency(companySettings?.currency_code) || "USD";
  const baseCurrencySymbol =
    (companySettings?.currency_symbol || "$").trim() || "$";
  const effectiveBaseCode =
    normalizeCurrency(defaultCurrency?.code) || baseCurrencyCode || "USD";
  const effectiveBaseSymbol =
    (defaultCurrency?.symbol || baseCurrencySymbol || "$").trim() || "$";

  const reportCurrencyCode = normalizeCurrency(reportCurrency);
  const currencyOptions = useMemo<CurrencyOption[]>(() => {
    const byCode = new Map<string, CurrencyOption>();

    const addOption = (
      codeRaw: string | null | undefined,
      symbolRaw?: string | null,
    ) => {
      const code = normalizeCurrency(codeRaw);
      if (!code || byCode.has(code)) return;
      const symbol = (symbolRaw || "").trim();
      const label = symbol && symbol !== code ? `${code} (${symbol})` : code;
      byCode.set(code, { code, label });
    };

    addOption(effectiveBaseCode, effectiveBaseSymbol);
    for (const currency of currencyList) {
      addOption(currency.code, currency.symbol);
    }

    return Array.from(byCode.values());
  }, [currencyList, effectiveBaseCode, effectiveBaseSymbol]);

  const resolvedCurrencyPrefix = useMemo(() => {
    if (reportCurrencyCode) {
      const cur = currencyList.find(
        (c) => normalizeCurrency(c.code) === reportCurrencyCode,
      );
      const symbol = (cur?.symbol || "").trim();
      return symbol || reportCurrencyCode;
    }

    // When not filtering by currency, default to the company's base currency symbol
    return effectiveBaseSymbol || "$";
  }, [currencyList, effectiveBaseSymbol, reportCurrencyCode]);

  const formatCurrency = useCallback(
    (amount: number) => {
      const abs = Math.abs(amount);
      const formatted = abs.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const prefix = resolvedCurrencyPrefix || "$";
      const prefixWithSpacing = /^[A-Z]{3,}$/.test(prefix)
        ? `${prefix} `
        : prefix;
      return `${amount < 0 ? "-" : ""}${prefixWithSpacing}${formatted}`;
    },
    [resolvedCurrencyPrefix],
  );

  const loadIncomeStatementSourceData = useCallback(async () => {
    if (!companyId) return null;

    const currencyParam = reportCurrency
      ? `&currency=${encodeURIComponent(reportCurrency)}`
      : "";

    const [invoices, expenses, contacts] = await Promise.all([
      apiFetch<Invoice[]>(
        `/invoices?company_id=${companyId}${currencyParam}`,
      ).catch(() => [] as Invoice[]),
      apiFetch<Expense[]>(
        `/expenses?company_id=${companyId}${currencyParam}`,
      ).catch(() => [] as Expense[]),
      apiFetch<{ id: number; name: string }[]>(
        `/contacts?company_id=${companyId}`,
      ).catch(() => [] as { id: number; name: string }[]),
    ]);

    const contactLookup = new Map(contacts.map((c) => [c.id, c.name]));
    const fromDate = dateRange.from ? new Date(`${dateRange.from}T00:00:00`) : null;
    const toDate = dateRange.to ? new Date(`${dateRange.to}T23:59:59`) : null;

    const inRange = (value: string | null | undefined, fallback: string) => {
      const dateValue = value ? new Date(value) : new Date(fallback);
      if (fromDate && dateValue < fromDate) return false;
      if (toDate && dateValue > toDate) return false;
      return true;
    };

    const salesInvoices = invoices.filter((inv) => {
      if (inv.invoice_type === "credit_note") return false;
      if (inv.status === "cancelled") return false;
      return inRange(inv.invoice_date, inv.created_at);
    });

    const creditNotes = invoices.filter((inv) => {
      if (inv.invoice_type !== "credit_note") return false;
      if (inv.status === "cancelled") return false;
      return inRange(inv.invoice_date, inv.created_at);
    });

    const filteredExpenses = expenses.filter((ex) => {
      if (ex.status === "cancelled") return false;
      return inRange(ex.expense_date, ex.expense_date || "");
    });

    return {
      salesInvoices,
      creditNotes,
      filteredExpenses,
      contactLookup,
      fromDate,
      toDate,
    };
  }, [companyId, dateRange.from, dateRange.to, reportCurrency]);

  /* ── Data loaders ──────────────────────────────── */

  const loadSalesReport = useCallback(async () => {
    if (!companyId) return;
    const currencyParam = reportCurrency
      ? `&currency=${encodeURIComponent(reportCurrency)}`
      : "";
    const [invoices, products] = await Promise.all([
      apiFetch<Invoice[]>(`/invoices?company_id=${companyId}${currencyParam}`),
      apiFetch<Product[]>(`/products?company_id=${companyId}`),
    ]);

    const fromDate = dateRange.from ? new Date(dateRange.from) : null;
    const toDate = dateRange.to ? new Date(dateRange.to + "T23:59:59") : null;

    // Filter invoices by date range — only count actual invoices (not credit notes)
    const filtered = invoices.filter((inv) => {
      if (inv.invoice_type === "credit_note") return false;
      const d = inv.invoice_date
        ? new Date(inv.invoice_date)
        : new Date(inv.created_at);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });

    const totalSales = filtered.reduce((s, i) => s + (i.total_amount || 0), 0);
    const totalTax = filtered.reduce((s, i) => s + (i.tax_amount || 0), 0);
    const paidInvoices = filtered.filter(
      (i) =>
        i.status === "paid" ||
        i.status === "fiscalized" ||
        i.amount_paid >= i.total_amount,
    );
    const pendingInvoices = filtered.filter(
      (i) =>
        i.status !== "paid" &&
        i.status !== "fiscalized" &&
        i.status !== "cancelled",
    );

    // Aggregate top products from real invoice lines
    const productMap = new Map<
      number,
      { name: string; qty: number; revenue: number }
    >();
    const prodLookup = new Map(products.map((p) => [p.id, p]));

    for (const inv of filtered) {
      if (!inv.lines) continue;
      for (const line of inv.lines) {
        const pid = line.product_id;
        if (!pid) continue;
        const existing = productMap.get(pid);
        const prodName =
          prodLookup.get(pid)?.name || line.description || `Product #${pid}`;
        if (existing) {
          existing.qty += line.quantity;
          existing.revenue += line.total_price || line.subtotal || 0;
        } else {
          productMap.set(pid, {
            name: prodName,
            qty: line.quantity,
            revenue: line.total_price || line.subtotal || 0,
          });
        }
      }
    }
    const topProducts: TopProduct[] = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((p) => ({
        name: p.name,
        quantity: Math.round(p.qty * 100) / 100,
        revenue: p.revenue,
      }));

    // Monthly breakdown
    const monthlyMap = new Map<string, { amount: number; count: number }>();
    for (const inv of filtered) {
      const d = inv.invoice_date
        ? new Date(inv.invoice_date)
        : new Date(inv.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      const existing = monthlyMap.get(key);
      if (existing) {
        existing.amount += inv.total_amount || 0;
        existing.count++;
      } else {
        monthlyMap.set(key, { amount: inv.total_amount || 0, count: 1 });
      }
    }
    const salesByMonth: MonthlySales[] = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => {
        const [, m] = key.split("-");
        return {
          month: `${MONTH_NAMES[parseInt(m)]}`,
          amount: val.amount,
          count: val.count,
        };
      });

    setSalesTrendChart(
      buildRevenueTrendChart({
        invoices: filtered,
        from: dateRange.from,
        to: dateRange.to,
      }),
    );

    setSalesReport({
      total_sales: totalSales,
      total_invoices: filtered.length,
      paid_invoices: paidInvoices.length,
      pending_invoices: pendingInvoices.length,
      total_tax: totalTax,
      average_invoice: filtered.length > 0 ? totalSales / filtered.length : 0,
      top_products: topProducts,
      sales_by_month: salesByMonth,
    });
  }, [companyId, dateRange, reportCurrency]);

  const loadIncomeStatementReport = useCallback(async () => {
    const sourceData = await loadIncomeStatementSourceData();
    if (!sourceData) return;

    const { salesInvoices, filteredExpenses, contactLookup } = sourceData;

    const grossRevenueExVat = salesInvoices.reduce(
      (s, inv) =>
        s + (inv.subtotal ?? (inv.total_amount || 0) - (inv.tax_amount || 0)),
      0,
    );
    const expensesExVat = filteredExpenses.reduce(
      (s, ex) => s + (ex.subtotal || 0),
      0,
    );

    setIncomeStatementReport({
      gross_revenue_ex_vat: grossRevenueExVat,
      expenses_ex_vat: expensesExVat,
      net_revenue_ex_vat: grossRevenueExVat - expensesExVat,
      invoices: salesInvoices
        .sort((a, b) => {
          const da = a.invoice_date
            ? new Date(a.invoice_date).getTime()
            : new Date(a.created_at).getTime();
          const db = b.invoice_date
            ? new Date(b.invoice_date).getTime()
            : new Date(b.created_at).getTime();
          return db - da;
        })
        .map((inv) => ({
          reference: inv.reference,
          customer: inv.customer_id
            ? contactLookup.get(inv.customer_id) || "-"
            : "-",
          date: inv.invoice_date
            ? new Date(inv.invoice_date).toLocaleDateString()
            : new Date(inv.created_at).toLocaleDateString(),
          subtotal:
            inv.subtotal ?? (inv.total_amount || 0) - (inv.tax_amount || 0),
          tax: inv.tax_amount || 0,
          total: inv.total_amount || 0,
          status: inv.status,
        })),
      expenses: filteredExpenses
        .sort((a, b) => {
          const da = a.expense_date ? new Date(a.expense_date).getTime() : 0;
          const db = b.expense_date ? new Date(b.expense_date).getTime() : 0;
          return db - da;
        })
        .map((ex) => ({
          reference: ex.reference || "-",
          supplier: ex.supplier_id
            ? contactLookup.get(ex.supplier_id) || "-"
            : "-",
          category: ex.category || "-",
          description: ex.description || "-",
          date: ex.expense_date
            ? new Date(ex.expense_date).toLocaleDateString()
            : "-",
          subtotal: ex.subtotal || 0,
          tax: ex.tax_amount || 0,
          total: ex.total_amount || 0,
        })),
    });
  }, [loadIncomeStatementSourceData]);

  const loadProfitAndLossJournalReport = useCallback(async () => {
    const sourceData = await loadIncomeStatementSourceData();
    if (!sourceData) return;

    const { salesInvoices, creditNotes, filteredExpenses, contactLookup } =
      sourceData;

    const datedEntries = [
      ...salesInvoices.map((inv) => ({
        sortDate: inv.invoice_date || inv.created_at,
        entry: {
          date: inv.invoice_date
            ? new Date(inv.invoice_date).toLocaleDateString()
            : new Date(inv.created_at).toLocaleDateString(),
          source: "Invoice",
          reference: inv.reference,
          party: inv.customer_id
            ? contactLookup.get(inv.customer_id) || "-"
            : "-",
          description: "Revenue recognised from invoice",
          debit: 0,
          credit:
            inv.subtotal ?? (inv.total_amount || 0) - (inv.tax_amount || 0),
          running_profit: 0,
          status: inv.status,
        } satisfies ProfitLossJournalEntry,
      })),
      ...creditNotes.map((inv) => ({
        sortDate: inv.invoice_date || inv.created_at,
        entry: {
          date: inv.invoice_date
            ? new Date(inv.invoice_date).toLocaleDateString()
            : new Date(inv.created_at).toLocaleDateString(),
          source: "Credit Note",
          reference: inv.reference,
          party: inv.customer_id
            ? contactLookup.get(inv.customer_id) || "-"
            : "-",
          description: "Revenue reversal from credit note",
          debit:
            inv.subtotal ?? (inv.total_amount || 0) - (inv.tax_amount || 0),
          credit: 0,
          running_profit: 0,
          status: inv.status,
        } satisfies ProfitLossJournalEntry,
      })),
      ...filteredExpenses.map((ex) => ({
        sortDate: ex.expense_date || ex.reference || "",
        entry: {
          date: ex.expense_date
            ? new Date(ex.expense_date).toLocaleDateString()
            : "-",
          source: "Expense",
          reference: ex.reference || "-",
          party: ex.supplier_id ? contactLookup.get(ex.supplier_id) || "-" : "-",
          description: ex.description || ex.category || "Expense posted",
          debit: ex.subtotal || 0,
          credit: 0,
          running_profit: 0,
          status: ex.status,
        } satisfies ProfitLossJournalEntry,
      })),
    ].sort(
      (a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime(),
    );

    let runningProfit = 0;
    const entries = datedEntries.map(({ entry }) => {
      runningProfit += entry.credit - entry.debit;
      return {
        ...entry,
        running_profit: runningProfit,
      };
    });

    const totalCredits = entries.reduce((sum, entry) => sum + entry.credit, 0);
    const totalDebits = entries.reduce((sum, entry) => sum + entry.debit, 0);

    setProfitLossJournalReport({
      total_credits: totalCredits,
      total_debits: totalDebits,
      net_profit: totalCredits - totalDebits,
      entries,
    });
  }, [loadIncomeStatementSourceData]);

  const loadQpdReport = useCallback(async () => {
    const sourceData = await loadIncomeStatementSourceData();
    if (!sourceData) return;

    const { salesInvoices, creditNotes, filteredExpenses, fromDate, toDate } =
      sourceData;

    const periodRevenue = salesInvoices.reduce(
      (sum, inv) =>
        sum + (inv.subtotal ?? (inv.total_amount || 0) - (inv.tax_amount || 0)),
      0,
    );
    const periodCreditNotes = creditNotes.reduce(
      (sum, inv) =>
        sum + (inv.subtotal ?? (inv.total_amount || 0) - (inv.tax_amount || 0)),
      0,
    );
    const periodExpenses = filteredExpenses.reduce(
      (sum, ex) => sum + (ex.subtotal || 0),
      0,
    );
    const periodTaxableIncome = Math.max(
      0,
      periodRevenue - periodCreditNotes - periodExpenses,
    );
    const taxYear =
      (dateRange.to ? new Date(`${dateRange.to}T12:00:00`) : new Date()).getFullYear();
    const daysInPeriod = getDaysInclusive(fromDate, toDate);
    const annualisationFactor =
      daysInPeriod > 0 ? getTaxYearLength(taxYear) / daysInPeriod : 1;
    const estimatedAnnualTaxableIncome = Math.max(
      0,
      periodTaxableIncome * annualisationFactor,
    );
    const estimatedAnnualTaxDue =
      estimatedAnnualTaxableIncome * (PROVISIONAL_TAX_RATE / 100);

    let cumulativePercentage = 0;
    let priorQpdsDue = 0;
    const paymentSchedule = QPD_INSTALLMENTS.map((item) => {
      cumulativePercentage += item.installmentPercentage;
      const cumulativeTaxDue =
        estimatedAnnualTaxDue * (cumulativePercentage / 100);
      const amountDue = Math.max(0, cumulativeTaxDue - priorQpdsDue);
      const dueDate = new Date(taxYear, item.month, item.day);
      const entry = {
        quarter: item.quarter,
        due_date: dueDate.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        installment_percentage: item.installmentPercentage,
        cumulative_percentage: cumulativePercentage,
        cumulative_tax_due: cumulativeTaxDue,
        prior_qpds_due: priorQpdsDue,
        amount_due: amountDue,
        remittance_form: "ITF 12B",
      };
      priorQpdsDue = cumulativeTaxDue;
      return entry;
    });

    setQpdReport({
      tax_year: taxYear,
      tax_rate: PROVISIONAL_TAX_RATE,
      period_taxable_income: periodTaxableIncome,
      annualisation_factor: annualisationFactor,
      estimated_annual_taxable_income: estimatedAnnualTaxableIncome,
      estimated_annual_tax_due: estimatedAnnualTaxDue,
      payment_schedule: paymentSchedule,
    });
  }, [dateRange.to, loadIncomeStatementSourceData]);

  const loadStockReport = useCallback(async () => {
    if (!companyId) return;
    const [products, quants, moves] = await Promise.all([
      apiFetch<Product[]>(`/products?company_id=${companyId}`),
      apiFetch<StockQuant[]>(`/stock/quants?company_id=${companyId}`).catch(
        () => [] as StockQuant[],
      ),
      apiFetch<StockMoveItem[]>(`/stock/moves?company_id=${companyId}`).catch(
        () => [] as StockMoveItem[],
      ),
    ]);

    const prodLookup = new Map(products.map((p) => [p.id, p]));

    // Build stock summary from quants
    const stockSummary = quants.map((q) => {
      const prod = prodLookup.get(q.product_id);
      return {
        name: prod?.name || `Product #${q.product_id}`,
        on_hand: q.quantity,
        available: q.available_quantity,
        reserved: q.reserved_quantity,
        value: q.total_value || q.quantity * q.unit_cost,
      };
    });

    const totalValue = stockSummary.reduce((s, i) => s + i.value, 0);

    // Low stock = quantity below reorder point
    const lowStock = quants
      .map((q) => {
        const prod = prodLookup.get(q.product_id);
        if (!prod) return null;
        const reorder = prod.reorder_point || 0;
        if (reorder > 0 && q.available_quantity <= reorder) {
          return {
            name: prod.name,
            on_hand: q.quantity,
            available: q.available_quantity,
            reorder,
          };
        }
        return null;
      })
      .filter(Boolean) as StockReport["low_stock_items"];

    // Recent movements
    const recentMoves = moves.slice(0, 15).map((m) => {
      const prod = prodLookup.get(m.product_id);
      return {
        product: prod?.name || `Product #${m.product_id}`,
        type: m.move_type.toUpperCase(),
        quantity: m.quantity,
        reference: m.reference,
        date: new Date(m.created_at).toLocaleDateString(),
        state: m.state,
      };
    });

    setStockReport({
      total_products: products.filter((p) => p.is_active).length,
      total_value: totalValue,
      low_stock_items: lowStock,
      stock_summary: stockSummary
        .sort((a, b) => b.value - a.value)
        .slice(0, 20),
      recent_movements: recentMoves,
    });
  }, [companyId]);

  // Payments report replaced by Debtors + Creditors

  const loadDebtorsReport = useCallback(async () => {
    if (!companyId) return;

    const currencyParam = reportCurrency
      ? `&currency=${encodeURIComponent(reportCurrency)}`
      : "";

    const [invoices, contacts] = await Promise.all([
      apiFetch<Invoice[]>(
        `/invoices?company_id=${companyId}${currencyParam}`,
      ).catch(() => [] as Invoice[]),
      apiFetch<{ id: number; name: string }[]>(
        `/contacts?company_id=${companyId}`,
      ).catch(() => [] as { id: number; name: string }[]),
    ]);

    const fromDate = dateRange.from ? new Date(dateRange.from) : null;
    const toDate = dateRange.to ? new Date(dateRange.to + "T23:59:59") : null;

    const contactLookup = new Map(contacts.map((c) => [c.id, c.name]));

    const filtered = invoices.filter((inv) => {
      if (inv.invoice_type === "credit_note") return false;
      if (inv.status === "cancelled") return false;
      const d = inv.invoice_date
        ? new Date(inv.invoice_date)
        : new Date(inv.created_at);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });

    const withDue = filtered
      .map((inv) => {
        const total = inv.total_amount || 0;
        const paid = inv.amount_paid || 0;
        const due = Math.max(0, total - paid);
        return { inv, total, paid, due };
      })
      .filter(({ due }) => due > 0.00001);

    const unpaid = withDue.filter(({ paid }) => (paid || 0) <= 0.00001);
    const partial = withDue.filter(({ paid }) => (paid || 0) > 0.00001);

    const totalInvoiced = filtered.reduce(
      (s, i) => s + (i.total_amount || 0),
      0,
    );
    const totalDue = withDue.reduce((s, x) => s + x.due, 0);

    const recent = withDue
      .slice()
      .sort((a, b) => {
        const da = a.inv.invoice_date
          ? new Date(a.inv.invoice_date)
          : new Date(a.inv.created_at);
        const db = b.inv.invoice_date
          ? new Date(b.inv.invoice_date)
          : new Date(b.inv.created_at);
        return db.getTime() - da.getTime();
      })
      .slice(0, 25)
      .map(({ inv, total, paid, due }) => ({
        reference: inv.reference,
        customer: inv.customer_id
          ? contactLookup.get(inv.customer_id) || `Customer #${inv.customer_id}`
          : "-",
        total,
        paid,
        due,
        date: inv.invoice_date
          ? new Date(inv.invoice_date).toLocaleDateString()
          : new Date(inv.created_at).toLocaleDateString(),
        status: inv.status,
      }));

    setDebtorsReport({
      total_invoices: filtered.length,
      unpaid_invoices: unpaid.length,
      partial_invoices: partial.length,
      total_invoiced: totalInvoiced,
      total_due: totalDue,
      average_due: withDue.length > 0 ? totalDue / withDue.length : 0,
      recent_unpaid: recent,
    });
  }, [companyId, dateRange, reportCurrency]);

  const loadCreditorsReport = useCallback(async () => {
    if (!companyId) return;

    const currencyParam = reportCurrency
      ? `&currency=${encodeURIComponent(reportCurrency)}`
      : "";

    const [purchases, contacts] = await Promise.all([
      apiFetch<PurchaseOrder[]>(
        `/purchases?company_id=${companyId}${currencyParam}`,
      ).catch(() => [] as PurchaseOrder[]),
      apiFetch<{ id: number; name: string }[]>(
        `/contacts?company_id=${companyId}`,
      ).catch(() => [] as { id: number; name: string }[]),
    ]);

    const fromDate = dateRange.from ? new Date(dateRange.from) : null;
    const toDate = dateRange.to ? new Date(dateRange.to + "T23:59:59") : null;

    const contactLookup = new Map(contacts.map((c) => [c.id, c.name]));

    const filtered = purchases.filter((po) => {
      if (po.status === "cancelled") return false;
      const d = po.order_date ? new Date(po.order_date) : null;
      if (fromDate && d && d < fromDate) return false;
      if (toDate && d && d > toDate) return false;
      return true;
    });

    // Treat "unpaid" purchase orders as any PO that is not marked paid.
    const open = filtered.filter(
      (po) => (po.paid_state || "unpaid") !== "paid",
    );

    const totalAmount = open.reduce((s, p) => s + (p.total_amount || 0), 0);

    const statusMap = new Map<string, { count: number; amount: number }>();
    for (const po of open) {
      const st = po.status || "draft";
      const ex = statusMap.get(st) || { count: 0, amount: 0 };
      ex.count++;
      ex.amount += po.total_amount || 0;
      statusMap.set(st, ex);
    }

    const supplierMap = new Map<
      number,
      { name: string; count: number; amount: number }
    >();
    for (const po of open) {
      const vid = po.supplier_id || 0;
      const vname = po.supplier_id
        ? contactLookup.get(po.supplier_id) || `Supplier #${po.supplier_id}`
        : "No Supplier";
      const ex = supplierMap.get(vid) || { name: vname, count: 0, amount: 0 };
      ex.count++;
      ex.amount += po.total_amount || 0;
      supplierMap.set(vid, ex);
    }

    const recentOrders = open
      .slice()
      .sort((a, b) => {
        const da = a.order_date ? new Date(a.order_date).getTime() : 0;
        const db = b.order_date ? new Date(b.order_date).getTime() : 0;
        return db - da;
      })
      .slice(0, 25)
      .map((po) => ({
        reference: po.reference,
        supplier: po.supplier_id
          ? contactLookup.get(po.supplier_id) || `Supplier #${po.supplier_id}`
          : "-",
        amount: po.total_amount || 0,
        date: po.order_date
          ? new Date(po.order_date).toLocaleDateString()
          : "-",
        status: po.status,
        paid_state: po.paid_state || "unpaid",
      }));

    setCreditorsReport({
      total_orders: filtered.length,
      open_orders: open.length,
      total_amount: totalAmount,
      by_status: Array.from(statusMap.entries())
        .sort(([, a], [, b]) => b.amount - a.amount)
        .map(([status, data]) => ({
          status,
          count: data.count,
          amount: data.amount,
        })),
      by_supplier: Array.from(supplierMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
      recent_orders: recentOrders,
    });
  }, [companyId, dateRange, reportCurrency]);

  const loadVatReport = useCallback(async () => {
    if (!companyId) return;

    const currencyParam = reportCurrency
      ? `&currency=${encodeURIComponent(reportCurrency)}`
      : "";

    const [invoices, purchases] = await Promise.all([
      apiFetch<Invoice[]>(
        `/invoices?company_id=${companyId}${currencyParam}`,
      ).catch(() => [] as Invoice[]),
      apiFetch<PurchaseOrder[]>(
        `/purchases?company_id=${companyId}${currencyParam}`,
      ).catch(() => [] as PurchaseOrder[]),
    ]);

    const fromDate = dateRange.from ? new Date(dateRange.from) : null;
    const toDate = dateRange.to ? new Date(dateRange.to + "T23:59:59") : null;

    // Separate credit notes
    const creditNotes = invoices.filter((inv) => {
      if (inv.invoice_type !== "credit_note") return false;
      if (inv.status === "cancelled") return false;
      const d = inv.invoice_date
        ? new Date(inv.invoice_date)
        : new Date(inv.created_at);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });

    const filteredInvoices = invoices.filter((inv) => {
      if (inv.invoice_type === "credit_note") return false;
      if (inv.status === "cancelled") return false;
      const d = inv.invoice_date
        ? new Date(inv.invoice_date)
        : new Date(inv.created_at);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });

    const filteredPurchases = purchases.filter((po) => {
      if (po.status === "cancelled") return false;
      const d = po.order_date ? new Date(po.order_date) : null;
      if (fromDate && d && d < fromDate) return false;
      if (toDate && d && d > toDate) return false;
      return true;
    });

    // Break down by VAT rate — sales
    const salesRateMap = new Map<number, VatRateBucket>();
    for (const inv of filteredInvoices) {
      if (!inv.lines || inv.lines.length === 0) {
        // Invoice with no lines — use header totals, assume single rate
        const rate =
          inv.tax_amount && inv.subtotal
            ? Math.round((inv.tax_amount / inv.subtotal) * 100)
            : 0;
        const existing = salesRateMap.get(rate) || {
          rate,
          taxable_amount: 0,
          tax_amount: 0,
          total: 0,
          count: 0,
        };
        existing.taxable_amount += inv.subtotal || 0;
        existing.tax_amount += inv.tax_amount || 0;
        existing.total += inv.total_amount || 0;
        existing.count++;
        salesRateMap.set(rate, existing);
      } else {
        for (const line of inv.lines) {
          const rate = line.vat_rate || 0;
          const existing = salesRateMap.get(rate) || {
            rate,
            taxable_amount: 0,
            tax_amount: 0,
            total: 0,
            count: 0,
          };
          existing.taxable_amount += line.subtotal || 0;
          existing.tax_amount += line.tax_amount || 0;
          existing.total += line.total_price || 0;
          existing.count++;
          salesRateMap.set(rate, existing);
        }
      }
    }

    // Break down by VAT rate — purchases
    const purchaseRateMap = new Map<number, VatRateBucket>();
    for (const po of filteredPurchases) {
      if (!po.lines || po.lines.length === 0) {
        const rate =
          po.tax_amount && po.total_amount - po.tax_amount > 0
            ? Math.round(
                (po.tax_amount / (po.total_amount - po.tax_amount)) * 100,
              )
            : 0;
        const existing = purchaseRateMap.get(rate) || {
          rate,
          taxable_amount: 0,
          tax_amount: 0,
          total: 0,
          count: 0,
        };
        existing.taxable_amount += po.total_amount - po.tax_amount || 0;
        existing.tax_amount += po.tax_amount || 0;
        existing.total += po.total_amount || 0;
        existing.count++;
        purchaseRateMap.set(rate, existing);
      } else {
        for (const line of po.lines) {
          const rate = line.vat_rate || 0;
          const sub =
            line.subtotal ||
            line.quantity * line.unit_price * (1 - (line.discount || 0) / 100);
          const tax = line.tax_amount || (sub * rate) / 100;
          const total = line.total_price || sub + tax;
          const existing = purchaseRateMap.get(rate) || {
            rate,
            taxable_amount: 0,
            tax_amount: 0,
            total: 0,
            count: 0,
          };
          existing.taxable_amount += sub;
          existing.tax_amount += tax;
          existing.total += total;
          existing.count++;
          purchaseRateMap.set(rate, existing);
        }
      }
    }

    const salesTotal = filteredInvoices.reduce(
      (s, i) => s + (i.total_amount || 0),
      0,
    );
    const outputTax = filteredInvoices.reduce(
      (s, i) => s + (i.tax_amount || 0),
      0,
    );
    const purchasesTotal = filteredPurchases.reduce(
      (s, p) => s + (p.total_amount || 0),
      0,
    );
    const inputTax = filteredPurchases.reduce(
      (s, p) => s + (p.tax_amount || 0),
      0,
    );
    const cnTax = creditNotes.reduce(
      (s, cn) => s + Math.abs(cn.tax_amount || 0),
      0,
    );

    setVatReport({
      sales_total: salesTotal,
      purchases_total: purchasesTotal,
      profit: salesTotal - purchasesTotal,
      output_tax: outputTax,
      input_tax: inputTax,
      net_tax: outputTax - inputTax - cnTax,
      invoices_count: filteredInvoices.length,
      purchases_count: filteredPurchases.length,
      credit_notes_count: creditNotes.length,
      credit_notes_tax: cnTax,
      sales_by_rate: Array.from(salesRateMap.values()).sort(
        (a, b) => a.rate - b.rate,
      ),
      purchases_by_rate: Array.from(purchaseRateMap.values()).sort(
        (a, b) => a.rate - b.rate,
      ),
      period_from: dateRange.from,
      period_to: dateRange.to,
    });
  }, [companyId, dateRange, reportCurrency]);

  const loadPurchaseReport = useCallback(async () => {
    if (!companyId) return;

    const currencyParam = reportCurrency
      ? `&currency=${encodeURIComponent(reportCurrency)}`
      : "";

    const [purchases, contacts] = await Promise.all([
      apiFetch<PurchaseOrder[]>(
        `/purchases?company_id=${companyId}${currencyParam}`,
      ).catch(() => [] as PurchaseOrder[]),
      apiFetch<{ id: number; name: string }[]>(
        `/contacts?company_id=${companyId}`,
      ).catch(() => [] as { id: number; name: string }[]),
    ]);

    const fromDate = dateRange.from ? new Date(dateRange.from) : null;
    const toDate = dateRange.to ? new Date(dateRange.to + "T23:59:59") : null;

    const filtered = purchases.filter((po) => {
      if (po.status === "cancelled") return false;
      const d = po.order_date ? new Date(po.order_date) : null;
      if (fromDate && d && d < fromDate) return false;
      if (toDate && d && d > toDate) return false;
      return true;
    });

    const contactLookup = new Map(contacts.map((c) => [c.id, c.name]));

    const totalAmount = filtered.reduce((s, p) => s + (p.total_amount || 0), 0);
    const totalTax = filtered.reduce((s, p) => s + (p.tax_amount || 0), 0);

    // By status
    const statusMap = new Map<string, { count: number; amount: number }>();
    for (const po of filtered) {
      const st = po.status || "draft";
      const ex = statusMap.get(st) || { count: 0, amount: 0 };
      ex.count++;
      ex.amount += po.total_amount || 0;
      statusMap.set(st, ex);
    }

    // By supplier
    const supplierMap = new Map<
      number,
      { name: string; count: number; amount: number }
    >();
    for (const po of filtered) {
      const vid = po.supplier_id || 0;
      const vname = po.supplier_id
        ? contactLookup.get(po.supplier_id) || `Supplier #${po.supplier_id}`
        : "No Supplier";
      const ex = supplierMap.get(vid) || { name: vname, count: 0, amount: 0 };
      ex.count++;
      ex.amount += po.total_amount || 0;
      supplierMap.set(vid, ex);
    }

    // By month
    const monthMap = new Map<string, { amount: number; count: number }>();
    for (const po of filtered) {
      const d = po.order_date ? new Date(po.order_date) : null;
      if (!d) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      const ex = monthMap.get(key) || { amount: 0, count: 0 };
      ex.amount += po.total_amount || 0;
      ex.count++;
      monthMap.set(key, ex);
    }

    setPurchaseReport({
      total_orders: filtered.length,
      total_amount: totalAmount,
      total_tax: totalTax,
      average_order: filtered.length > 0 ? totalAmount / filtered.length : 0,
      by_status: Array.from(statusMap.entries())
        .sort(([, a], [, b]) => b.amount - a.amount)
        .map(([status, data]) => ({
          status,
          count: data.count,
          amount: data.amount,
        })),
      by_supplier: Array.from(supplierMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
      by_month: Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => {
          const [, m] = key.split("-");
          return {
            month: MONTH_NAMES[parseInt(m)],
            amount: val.amount,
            count: val.count,
          };
        }),
      recent_orders: filtered.slice(0, 15).map((po) => ({
        reference: po.reference,
        supplier: po.supplier_id
          ? contactLookup.get(po.supplier_id) || "-"
          : "-",
        amount: po.total_amount || 0,
        date: po.order_date
          ? new Date(po.order_date).toLocaleDateString()
          : "-",
        status: po.status,
      })),
    });
  }, [companyId, dateRange, reportCurrency]);

  const loadPosOrdersReport = useCallback(async () => {
    if (!companyId) return;

    const currencyParam = reportCurrency
      ? `&currency=${encodeURIComponent(reportCurrency)}`
      : "";

    const [orders, tills] = await Promise.all([
      apiFetch<POSOrderReportRaw[]>(
        `/pos/orders?company_id=${companyId}${currencyParam}&limit=500`,
      ).catch(() => [] as POSOrderReportRaw[]),
      apiFetch<POSTillListItem[]>(`/pos/tills?company_id=${companyId}`).catch(
        () => [] as POSTillListItem[],
      ),
    ]);

    const tillNameById = new Map(tills.map((till) => [till.id, till.name]));
    const fromDate = dateRange.from ? new Date(dateRange.from) : null;
    const toDate = dateRange.to ? new Date(dateRange.to + "T23:59:59") : null;

    const filtered = orders.filter((order) => {
      const orderDate = new Date(order.order_date);
      if (Number.isNaN(orderDate.getTime())) return false;
      if (fromDate && orderDate < fromDate) return false;
      if (toDate && orderDate > toDate) return false;
      return true;
    });

    const byCurrency = new Map<
      string,
      {
        count: number;
        total: number;
        cash: number;
        card: number;
        mobile: number;
      }
    >();
    const byStatus = new Map<string, number>();

    let fiscalizedOrders = 0;
    let refundedOrders = 0;

    for (const order of filtered) {
      const currency = normalizeCurrency(order.currency) || effectiveBaseCode;
      const existing = byCurrency.get(currency) || {
        count: 0,
        total: 0,
        cash: 0,
        card: 0,
        mobile: 0,
      };
      existing.count += 1;
      existing.total += order.total_amount || 0;
      existing.cash += order.cash_amount || 0;
      existing.card += order.card_amount || 0;
      existing.mobile += order.mobile_amount || 0;
      byCurrency.set(currency, existing);

      const status = (order.status || "draft").toLowerCase();
      byStatus.set(status, (byStatus.get(status) || 0) + 1);

      if (order.is_fiscalized || status === "fiscalized") fiscalizedOrders += 1;
      if (status === "refunded") refundedOrders += 1;
    }

    const recentOrders = [...filtered]
      .sort(
        (a, b) =>
          new Date(b.order_date).getTime() - new Date(a.order_date).getTime(),
      )
      .slice(0, 100)
      .map((order) => ({
        reference: order.reference,
        cashier: order.cashier_name || "-",
        till: order.till_id
          ? tillNameById.get(order.till_id) || `Till #${order.till_id}`
          : "-",
        date: order.order_date
          ? new Date(order.order_date).toLocaleString()
          : "-",
        status: order.status || "-",
        currency: normalizeCurrency(order.currency) || effectiveBaseCode,
        total: order.total_amount || 0,
        cash: order.cash_amount || 0,
        card: order.card_amount || 0,
        mobile: order.mobile_amount || 0,
        fiscalized: Boolean(order.is_fiscalized),
      }));

    setPosOrdersReport({
      total_orders: filtered.length,
      fiscalized_orders: fiscalizedOrders,
      refunded_orders: refundedOrders,
      by_currency: Array.from(byCurrency.entries())
        .map(([currency, value]) => ({
          currency,
          count: value.count,
          total: value.total,
          cash: value.cash,
          card: value.card,
          mobile: value.mobile,
        }))
        .sort((a, b) => b.total - a.total),
      by_status: Array.from(byStatus.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      recent_orders: recentOrders,
    });
  }, [companyId, dateRange, reportCurrency, effectiveBaseCode]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (activeReport === "sales") await loadSalesReport();
      else if (activeReport === "income_statement")
        await loadIncomeStatementReport();
      else if (activeReport === "profit_loss_journal")
        await loadProfitAndLossJournalReport();
      else if (activeReport === "qpd") await loadQpdReport();
      else if (activeReport === "stock") await loadStockReport();
      else if (activeReport === "debtors") await loadDebtorsReport();
      else if (activeReport === "creditors") await loadCreditorsReport();
      else if (activeReport === "vat") await loadVatReport();
      else if (activeReport === "purchases") await loadPurchaseReport();
      else if (activeReport === "pos_orders") await loadPosOrdersReport();
    } catch (err: any) {
      console.error("Report load error:", err);
      setError(err?.message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [
    activeReport,
    loadSalesReport,
    loadIncomeStatementReport,
    loadProfitAndLossJournalReport,
    loadQpdReport,
    loadStockReport,
    loadDebtorsReport,
    loadCreditorsReport,
    loadVatReport,
    loadPurchaseReport,
    loadPosOrdersReport,
  ]);

  useEffect(() => {
    if (!companyId || !dateRange.from || !dateRange.to) return;
    loadReport();
  }, [companyId, activeReport, dateRange.from, dateRange.to, reportCurrency]);

  useEffect(() => {
    if (activeReport !== "vat") setActiveVatTab("sales_vat");
  }, [activeReport]);

  useEffect(() => {
    if (activeReport !== "income_statement") setActiveIncomeTab("summary");
  }, [activeReport]);

  useEffect(() => {
    if (
      vatReport &&
      vatReport.credit_notes_count === 0 &&
      activeVatTab === "credit_notes"
    ) {
      setActiveVatTab("sales_vat");
    }
  }, [vatReport, activeVatTab]);

  useEffect(() => {
    setTablePages({});
  }, [
    companyId,
    activeReport,
    activeIncomeTab,
    activeVatTab,
    dateRange.from,
    dateRange.to,
  ]);

  /* ── Export functions ──────────────────────────── */

  const exportVatExcel = () => {
    if (!(activeReport === "vat" && vatReport)) return;

    const periodFrom = vatReport.period_from || dateRange.from;
    const periodTo = vatReport.period_to || dateRange.to;
    const reportCode = reportCurrencyCode || effectiveBaseCode || "USD";
    const generatedAt = new Date().toLocaleString();

    const escapeXml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    const safeNum = (value: number) =>
      Number.isFinite(value) ? value.toFixed(2) : "0.00";
    const safeInt = (value: number) =>
      Number.isFinite(value) ? Math.round(value).toString() : "0";

    const cellText = (value: string, styleId = "Text", mergeAcross?: number) =>
      `<Cell ss:StyleID="${styleId}"${
        typeof mergeAcross === "number"
          ? ` ss:MergeAcross="${mergeAcross}"`
          : ""
      }><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;

    const cellNum = (value: number, styleId = "Number", mergeAcross?: number) =>
      `<Cell ss:StyleID="${styleId}"${
        typeof mergeAcross === "number"
          ? ` ss:MergeAcross="${mergeAcross}"`
          : ""
      }><Data ss:Type="Number">${safeNum(value)}</Data></Cell>`;

    const cellInt = (value: number, styleId = "Integer") =>
      `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${safeInt(value)}</Data></Cell>`;

    const rows: string[] = [];

    rows.push(
      `<Row ss:Height="28">${cellText("VAT RETURN", "Title", 4)}</Row>`,
    );
    rows.push(
      `<Row>${cellText(
        `Reporting Period: ${periodFrom} to ${periodTo}`,
        "SubTitle",
        4,
      )}</Row>`,
    );
    rows.push(
      `<Row>${cellText(
        `Currency: ${reportCode}    Generated: ${generatedAt}`,
        "Meta",
        4,
      )}</Row>`,
    );
    rows.push('<Row ss:Height="10"/>');

    rows.push(
      `<Row ss:Height="22">${cellText("OUTPUT VAT (SALES)", "Section", 4)}</Row>`,
    );
    rows.push(
      `<Row>${cellText("Rate", "Header")}${cellText(
        "Taxable Amount",
        "Header",
      )}${cellText("VAT Amount", "Header")}${cellText("Total", "Header")}${cellText(
        "Transactions",
        "Header",
      )}</Row>`,
    );
    vatReport.sales_by_rate.forEach((bucket) => {
      rows.push(
        `<Row>${cellNum((bucket.rate || 0) / 100, "PercentCenter")}${cellNum(
          bucket.taxable_amount,
        )}${cellNum(bucket.tax_amount)}${cellNum(bucket.total)}${cellInt(
          bucket.count,
        )}</Row>`,
      );
    });
    rows.push(
      `<Row>${cellText("TOTAL OUTPUT VAT", "TotalLabel")}${cellNum(
        vatReport.sales_total - vatReport.output_tax,
        "TotalNumber",
      )}${cellNum(vatReport.output_tax, "TotalNumber")}${cellNum(
        vatReport.sales_total,
        "TotalNumber",
      )}${cellInt(vatReport.invoices_count, "TotalInteger")}</Row>`,
    );

    rows.push('<Row ss:Height="8"/>');
    rows.push(
      `<Row ss:Height="22">${cellText("INPUT VAT (PURCHASES)", "Section", 4)}</Row>`,
    );
    rows.push(
      `<Row>${cellText("Rate", "Header")}${cellText(
        "Taxable Amount",
        "Header",
      )}${cellText("VAT Amount", "Header")}${cellText("Total", "Header")}${cellText(
        "Transactions",
        "Header",
      )}</Row>`,
    );
    vatReport.purchases_by_rate.forEach((bucket) => {
      rows.push(
        `<Row>${cellNum((bucket.rate || 0) / 100, "PercentCenter")}${cellNum(
          bucket.taxable_amount,
        )}${cellNum(bucket.tax_amount)}${cellNum(bucket.total)}${cellInt(
          bucket.count,
        )}</Row>`,
      );
    });
    rows.push(
      `<Row>${cellText("TOTAL INPUT VAT", "TotalLabel")}${cellNum(
        vatReport.purchases_total - vatReport.input_tax,
        "TotalNumber",
      )}${cellNum(vatReport.input_tax, "TotalNumber")}${cellNum(
        vatReport.purchases_total,
        "TotalNumber",
      )}${cellInt(vatReport.purchases_count, "TotalInteger")}</Row>`,
    );

    if (vatReport.credit_notes_count > 0 || vatReport.credit_notes_tax > 0) {
      rows.push('<Row ss:Height="8"/>');
      rows.push(
        `<Row ss:Height="22">${cellText("CREDIT NOTES", "Section", 4)}</Row>`,
      );
      rows.push(
        `<Row>${cellText("Credit Notes Issued", "TextBold", 3)}${cellInt(
          vatReport.credit_notes_count,
        )}</Row>`,
      );
      rows.push(
        `<Row>${cellText("VAT on Credit Notes", "TextBold", 2)}${cellNum(
          vatReport.credit_notes_tax,
          "Number",
          1,
        )}${cellText("", "Text")}</Row>`,
      );
    }

    rows.push('<Row ss:Height="10"/>');
    rows.push(
      `<Row ss:Height="22">${cellText("NET VAT SUMMARY", "Section", 4)}</Row>`,
    );
    rows.push(
      `<Row>${cellText("Output VAT (Sales)", "SummaryLabel", 2)}${cellNum(
        vatReport.output_tax,
        "SummaryNumber",
        1,
      )}${cellText("", "Text")}</Row>`,
    );
    rows.push(
      `<Row>${cellText(
        "Less: Input VAT (Purchases)",
        "SummaryLabel",
        2,
      )}${cellNum(-vatReport.input_tax, "SummaryNumber", 1)}${cellText(
        "",
        "Text",
      )}</Row>`,
    );
    rows.push(
      `<Row>${cellText(
        "Less: Credit Note VAT",
        "SummaryLabel",
        2,
      )}${cellNum(-vatReport.credit_notes_tax, "SummaryNumber", 1)}${cellText(
        "",
        "Text",
      )}</Row>`,
    );
    rows.push(
      `<Row>${cellText(
        `Net VAT ${vatReport.net_tax >= 0 ? "Payable" : "Refundable"}`,
        "NetLabel",
        2,
      )}${cellNum(
        vatReport.net_tax,
        vatReport.net_tax >= 0 ? "NetPayable" : "NetRefundable",
        1,
      )}${cellText("", "Text")}</Row>`,
    );

    const workbookXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Calibri" ss:Size="11"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="Title">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1F4E78" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="SubTitle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#1F2937"/>
      <Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Meta">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#334155"/>
    </Style>
    <Style ss:ID="Section">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#2F75B5" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
      <Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Text">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
    </Style>
    <Style ss:ID="TextBold">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    </Style>
    <Style ss:ID="Number">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <NumberFormat ss:Format="#,##0.00"/>
    </Style>
    <Style ss:ID="Integer">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="PercentCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <NumberFormat ss:Format="0.00%"/>
    </Style>
    <Style ss:ID="TotalLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="TotalNumber">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0.00"/>
    </Style>
    <Style ss:ID="TotalInteger">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="SummaryLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    </Style>
    <Style ss:ID="SummaryNumber">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
      <NumberFormat ss:Format="#,##0.00"/>
    </Style>
    <Style ss:ID="NetLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
      </Borders>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
      <Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="NetPayable">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
      </Borders>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#991B1B"/>
      <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0.00"/>
    </Style>
    <Style ss:ID="NetRefundable">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
      </Borders>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#065F46"/>
      <Interior ss:Color="#D1FAE5" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0.00"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="VAT Return">
    <Table>
      <Column ss:Width="160"/>
      <Column ss:Width="145"/>
      <Column ss:Width="125"/>
      <Column ss:Width="125"/>
      <Column ss:Width="105"/>
      ${rows.join("")}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <Selected/>
      <ProtectObjects>False</ProtectObjects>
      <ProtectScenarios>False</ProtectScenarios>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;

    downloadBlob(
      workbookXml,
      `vat-return-${periodFrom}-to-${periodTo}.xls`,
      "application/vnd.ms-excel;charset=utf-8",
    );
  };

  const exportExcel = () => {
    const escapeXml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    const buildWorkbookXml = (
      worksheetName: string,
      title: string,
      subtitle: string,
      sections: Array<{ title: string; headers?: string[]; rows: string[][] }>,
      columnWidths: number[],
    ) => {
      const generatedAt = new Date().toLocaleString();
      const maxColumns = Math.max(columnWidths.length, 1);
      const mergeAcross = Math.max(0, maxColumns - 1);
      const rowXml: string[] = [];

      const textCell = (value: string, styleId = "Text", span = 0) =>
        `<Cell ss:StyleID="${styleId}"${span > 0 ? ` ss:MergeAcross="${span}"` : ""}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;

      rowXml.push(
        `<Row ss:Height="28">${textCell(title, "Title", mergeAcross)}</Row>`,
      );
      rowXml.push(`<Row>${textCell(subtitle, "SubTitle", mergeAcross)}</Row>`);
      rowXml.push(
        `<Row>${textCell(`Generated: ${generatedAt}`, "Meta", mergeAcross)}</Row>`,
      );
      rowXml.push('<Row ss:Height="10"/>');

      sections.forEach((section, sectionIndex) => {
        rowXml.push(
          `<Row ss:Height="22">${textCell(section.title, "Section", mergeAcross)}</Row>`,
        );
        if (section.headers?.length) {
          rowXml.push(
            `<Row>${section.headers.map((header) => textCell(header, "Header")).join("")}</Row>`,
          );
        }
        section.rows.forEach((row, rowIndex) => {
          const styleId =
            rowIndex === section.rows.length - 1 &&
            row[0]?.toUpperCase().includes("TOTAL")
              ? "Total"
              : "Text";
          rowXml.push(
            `<Row>${row
              .map((cell, cellIndex) =>
                textCell(cell, cellIndex === 0 ? styleId : `${styleId}Right`),
              )
              .join("")}</Row>`,
          );
        });
        if (sectionIndex < sections.length - 1)
          rowXml.push('<Row ss:Height="8"/>');
      });

      return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11"/>
    </Style>
    <Style ss:ID="Title">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1F4E78" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="SubTitle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#1F2937"/>
      <Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Meta">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#334155"/>
    </Style>
    <Style ss:ID="Section">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#2F75B5" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
      <Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Text">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
    </Style>
    <Style ss:ID="TextRight">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
    </Style>
    <Style ss:ID="Total">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="TotalRight">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${escapeXml(worksheetName)}">
    <Table>
      ${columnWidths.map((width) => `<Column ss:Width="${width}"/>`).join("")}
      ${rowXml.join("")}
    </Table>
  </Worksheet>
</Workbook>`;
    };

    let workbookXml = "";
    let filename = "report.xls";

    if (activeReport === "sales" && salesReport) {
      filename = `revenue-${dateRange.from}-to-${dateRange.to}.xls`;
      workbookXml = buildWorkbookXml(
        "Revenue",
        "REVENUE REPORT",
        `${dateRange.from} to ${dateRange.to}`,
        [
          {
            title: "SUMMARY",
            rows: [
              ["Total Revenue", salesReport.total_sales.toFixed(2)],
              ["Total Invoices", String(salesReport.total_invoices)],
              ["Paid Invoices", String(salesReport.paid_invoices)],
              ["Pending Invoices", String(salesReport.pending_invoices)],
              ["Total Tax", salesReport.total_tax.toFixed(2)],
              ["Average Invoice", salesReport.average_invoice.toFixed(2)],
            ],
          },
          {
            title: "TOP PRODUCTS",
            headers: ["Product", "Qty Sold", "Revenue"],
            rows: salesReport.top_products.map((p) => [
              p.name,
              String(p.quantity),
              p.revenue.toFixed(2),
            ]),
          },
          {
            title: "REVENUE BY MONTH",
            headers: ["Month", "Amount", "Invoice Count"],
            rows: salesReport.sales_by_month.map((m) => [
              m.month,
              m.amount.toFixed(2),
              String(m.count),
            ]),
          },
        ],
        [220, 120, 120],
      );
    } else if (activeReport === "income_statement" && incomeStatementReport) {
      filename = `income-statement-${dateRange.from}-to-${dateRange.to}.xls`;
      workbookXml = buildWorkbookXml(
        "Income Statement",
        "INCOME STATEMENT",
        `${dateRange.from} to ${dateRange.to}`,
        [
          {
            title: "SUMMARY",
            rows: [
              [
                "Gross Revenue (VAT excl.)",
                incomeStatementReport.gross_revenue_ex_vat.toFixed(2),
              ],
              [
                "Expenses (VAT excl.)",
                incomeStatementReport.expenses_ex_vat.toFixed(2),
              ],
              [
                "Net Revenue (VAT excl.)",
                incomeStatementReport.net_revenue_ex_vat.toFixed(2),
              ],
            ],
          },
          {
            title: "REVENUE - INVOICES",
            headers: [
              "Reference",
              "Customer",
              "Date",
              "Subtotal",
              "Tax",
              "Total",
              "Status",
            ],
            rows: incomeStatementReport.invoices.map((inv) => [
              inv.reference,
              inv.customer,
              inv.date,
              inv.subtotal.toFixed(2),
              inv.tax.toFixed(2),
              inv.total.toFixed(2),
              inv.status,
            ]),
          },
          {
            title: "EXPENSES",
            headers: [
              "Reference",
              "Supplier",
              "Category",
              "Description",
              "Date",
              "Subtotal",
              "Tax",
              "Total",
            ],
            rows: incomeStatementReport.expenses.map((ex) => [
              ex.reference,
              ex.supplier,
              ex.category,
              ex.description,
              ex.date,
              ex.subtotal.toFixed(2),
              ex.tax.toFixed(2),
              ex.total.toFixed(2),
            ]),
          },
        ],
        [130, 150, 110, 120, 110, 110, 110, 110],
      );
    } else if (
      activeReport === "profit_loss_journal" &&
      profitLossJournalReport
    ) {
      filename = `profit-loss-journal-${dateRange.from}-to-${dateRange.to}.xls`;
      workbookXml = buildWorkbookXml(
        "P&L Journal",
        "PROFIT AND LOSS JOURNAL",
        `${dateRange.from} to ${dateRange.to}`,
        [
          {
            title: "SUMMARY",
            rows: [
              ["Income Credits", profitLossJournalReport.total_credits.toFixed(2)],
              ["Expense / Contra Debits", profitLossJournalReport.total_debits.toFixed(2)],
              ["Net Profit", profitLossJournalReport.net_profit.toFixed(2)],
            ],
          },
          {
            title: "JOURNAL ENTRIES",
            headers: [
              "Date",
              "Source",
              "Reference",
              "Party",
              "Description",
              "Debit",
              "Credit",
              "Running Profit",
              "Status",
            ],
            rows: profitLossJournalReport.entries.map((entry) => [
              entry.date,
              entry.source,
              entry.reference,
              entry.party,
              entry.description,
              entry.debit.toFixed(2),
              entry.credit.toFixed(2),
              entry.running_profit.toFixed(2),
              entry.status,
            ]),
          },
        ],
        [100, 100, 120, 140, 210, 100, 100, 110, 90],
      );
    } else if (activeReport === "qpd" && qpdReport) {
      filename = `qpd-report-${qpdReport.tax_year}.xls`;
      workbookXml = buildWorkbookXml(
        "QPD Report",
        "QPD PROVISIONAL TAX REPORT",
        `Tax Year ${qpdReport.tax_year}`,
        [
          {
            title: "SUMMARY",
            rows: [
              ["Taxable Income In Period", qpdReport.period_taxable_income.toFixed(2)],
              ["Annualisation Factor", qpdReport.annualisation_factor.toFixed(4)],
              ["Estimated Annual Taxable Income", qpdReport.estimated_annual_taxable_income.toFixed(2)],
              ["Tax Rate", `${qpdReport.tax_rate.toFixed(2)}%`],
              ["Estimated Annual Tax Due", qpdReport.estimated_annual_tax_due.toFixed(2)],
              ["Remittance Form", "ITF 12B"],
            ],
          },
          {
            title: "PAYMENT SCHEDULE",
            headers: [
              "Quarter",
              "Due Date",
              "Installment %",
              "Cumulative %",
              "Cumulative Tax Due",
              "Less Previous QPDs",
              "Amount Due",
              "Form",
            ],
            rows: qpdReport.payment_schedule.map((entry) => [
              entry.quarter,
              entry.due_date,
              `${entry.installment_percentage.toFixed(2)}%`,
              `${entry.cumulative_percentage.toFixed(2)}%`,
              entry.cumulative_tax_due.toFixed(2),
              entry.prior_qpds_due.toFixed(2),
              entry.amount_due.toFixed(2),
              entry.remittance_form,
            ]),
          },
        ],
        [90, 130, 100, 100, 120, 120, 110, 90],
      );
    } else if (activeReport === "stock" && stockReport) {
      filename = `stock-report-${new Date().toISOString().split("T")[0]}.xls`;
      workbookXml = buildWorkbookXml(
        "Stock Valuation",
        "STOCK VALUATION",
        `Generated on ${new Date().toISOString().split("T")[0]}`,
        [
          {
            title: "SUMMARY",
            rows: [
              ["Total Products", String(stockReport.total_products)],
              ["Total Inventory Value", stockReport.total_value.toFixed(2)],
            ],
          },
          {
            title: "STOCK SUMMARY",
            headers: ["Product", "On Hand", "Available", "Reserved", "Value"],
            rows: stockReport.stock_summary.map((s) => [
              s.name,
              String(s.on_hand),
              String(s.available),
              String(s.reserved),
              s.value.toFixed(2),
            ]),
          },
          ...(stockReport.low_stock_items.length
            ? [
                {
                  title: "LOW STOCK ALERTS",
                  headers: ["Product", "On Hand", "Available", "Reorder Level"],
                  rows: stockReport.low_stock_items.map((s) => [
                    s.name,
                    String(s.on_hand),
                    String(s.available),
                    String(s.reorder),
                  ]),
                },
              ]
            : []),
        ],
        [220, 100, 100, 100, 120],
      );
    } else if (activeReport === "debtors" && debtorsReport) {
      filename = `debtors-${dateRange.from}-to-${dateRange.to}.xls`;
      workbookXml = buildWorkbookXml(
        "Debtors",
        "DEBTORS REPORT",
        `${dateRange.from} to ${dateRange.to}`,
        [
          {
            title: "SUMMARY",
            rows: [
              ["Total Invoices", String(debtorsReport.total_invoices)],
              ["Unpaid Invoices", String(debtorsReport.unpaid_invoices)],
              ["Partial Invoices", String(debtorsReport.partial_invoices)],
              ["Total Invoiced", debtorsReport.total_invoiced.toFixed(2)],
              ["Total Outstanding", debtorsReport.total_due.toFixed(2)],
            ],
          },
          {
            title: "UNPAID INVOICES",
            headers: [
              "Reference",
              "Customer",
              "Total",
              "Paid",
              "Due",
              "Date",
              "Status",
            ],
            rows: debtorsReport.recent_unpaid.map((i) => [
              i.reference,
              i.customer,
              i.total.toFixed(2),
              i.paid.toFixed(2),
              i.due.toFixed(2),
              i.date,
              i.status,
            ]),
          },
        ],
        [130, 160, 100, 100, 100, 110, 110],
      );
    } else if (activeReport === "creditors" && creditorsReport) {
      filename = `creditors-${dateRange.from}-to-${dateRange.to}.xls`;
      workbookXml = buildWorkbookXml(
        "Creditors",
        "CREDITORS REPORT",
        `${dateRange.from} to ${dateRange.to}`,
        [
          {
            title: "SUMMARY",
            rows: [
              ["Total Purchase Orders", String(creditorsReport.total_orders)],
              ["Unpaid Purchase Orders", String(creditorsReport.open_orders)],
              ["Total Outstanding", creditorsReport.total_amount.toFixed(2)],
            ],
          },
          {
            title: "BY SUPPLIER",
            headers: ["Supplier", "Orders", "Amount"],
            rows: creditorsReport.by_supplier.map((v) => [
              v.name,
              String(v.count),
              v.amount.toFixed(2),
            ]),
          },
          {
            title: "BY STATUS",
            headers: ["Status", "Count", "Amount"],
            rows: creditorsReport.by_status.map((s) => [
              s.status,
              String(s.count),
              s.amount.toFixed(2),
            ]),
          },
          {
            title: "RECENT OPEN ORDERS",
            headers: [
              "Reference",
              "Supplier",
              "Amount",
              "Date",
              "Status",
              "Paid State",
            ],
            rows: creditorsReport.recent_orders.map((o) => [
              o.reference,
              o.supplier,
              o.amount.toFixed(2),
              o.date,
              o.status,
              o.paid_state,
            ]),
          },
        ],
        [140, 160, 100, 110, 110, 110],
      );
    } else if (activeReport === "purchases" && purchaseReport) {
      filename = `purchase-report-${dateRange.from}-to-${dateRange.to}.xls`;
      workbookXml = buildWorkbookXml(
        "Purchases",
        "PURCHASE REPORT",
        `${dateRange.from} to ${dateRange.to}`,
        [
          {
            title: "SUMMARY",
            rows: [
              ["Total Orders", String(purchaseReport.total_orders)],
              ["Total Amount", purchaseReport.total_amount.toFixed(2)],
              ["Total Tax", purchaseReport.total_tax.toFixed(2)],
              ["Average Order", purchaseReport.average_order.toFixed(2)],
            ],
          },
          {
            title: "BY SUPPLIER",
            headers: ["Supplier", "Orders", "Amount"],
            rows: purchaseReport.by_supplier.map((v) => [
              v.name,
              String(v.count),
              v.amount.toFixed(2),
            ]),
          },
          {
            title: "BY STATUS",
            headers: ["Status", "Count", "Amount"],
            rows: purchaseReport.by_status.map((s) => [
              s.status,
              String(s.count),
              s.amount.toFixed(2),
            ]),
          },
          {
            title: "MONTHLY TREND",
            headers: ["Month", "Amount", "Orders"],
            rows: purchaseReport.by_month.map((m) => [
              m.month,
              m.amount.toFixed(2),
              String(m.count),
            ]),
          },
        ],
        [170, 100, 120],
      );
    } else if (activeReport === "pos_orders" && posOrdersReport) {
      filename = `point-orders-report-${dateRange.from}-to-${dateRange.to}.xls`;
      workbookXml = buildWorkbookXml(
        "POS Orders",
        "POS ORDERS REPORT",
        `${dateRange.from} to ${dateRange.to}`,
        [
          {
            title: "SUMMARY",
            rows: [
              ["Total Orders", String(posOrdersReport.total_orders)],
              ["Fiscalized Orders", String(posOrdersReport.fiscalized_orders)],
              ["Refunded Orders", String(posOrdersReport.refunded_orders)],
              ["Currencies", String(posOrdersReport.by_currency.length)],
            ],
          },
          {
            title: "SALES BY CURRENCY",
            headers: [
              "Currency",
              "Orders",
              "Total Sales",
              "Cash Sales",
              "Card Sales",
              "Mobile Sales",
            ],
            rows: posOrdersReport.by_currency.map((entry) => [
              entry.currency,
              String(entry.count),
              entry.total.toFixed(2),
              entry.cash.toFixed(2),
              entry.card.toFixed(2),
              entry.mobile.toFixed(2),
            ]),
          },
          {
            title: "ORDERS BY STATUS",
            headers: ["Status", "Count"],
            rows: posOrdersReport.by_status.map((entry) => [
              entry.status,
              String(entry.count),
            ]),
          },
          {
            title: "RECENT POS ORDERS",
            headers: [
              "Reference",
              "Date",
              "Cashier",
              "Till",
              "Status",
              "Currency",
              "Total",
              "Cash",
              "Card",
              "Mobile",
              "Fiscalized",
            ],
            rows: posOrdersReport.recent_orders.map((order) => [
              order.reference,
              order.date,
              order.cashier,
              order.till,
              order.status,
              order.currency,
              order.total.toFixed(2),
              order.cash.toFixed(2),
              order.card.toFixed(2),
              order.mobile.toFixed(2),
              order.fiscalized ? "Yes" : "No",
            ]),
          },
        ],
        [120, 100, 120, 120, 100, 90, 100, 90, 90, 90, 90],
      );
    }

    if (!workbookXml) return;
    downloadBlob(
      workbookXml,
      filename,
      "application/vnd.ms-excel;charset=utf-8",
    );
  };

  const exportPDF = () => {
    const title =
      activeReport === "sales"
        ? "Revenue"
        : activeReport === "stock"
          ? "Stock Valuation"
          : activeReport === "debtors"
            ? "Debtors"
            : activeReport === "creditors"
              ? "Creditors"
              : activeReport === "income_statement"
                ? "Income Statement"
                : activeReport === "profit_loss_journal"
                  ? "Profit and Loss Journal"
                  : activeReport === "qpd"
                    ? "QPD Provisional Tax"
                : activeReport === "purchases"
                  ? "Purchase Report"
                  : activeReport === "pos_orders"
                    ? "POS Orders Report"
                    : "VAT RETURN";
    const period =
      activeReport === "stock"
        ? new Date().toLocaleDateString()
        : `${dateRange.from} to ${dateRange.to}`;

    let bodyHTML = "";

    if (activeReport === "sales" && salesReport) {
      bodyHTML = `
        <div class="summary-grid">
          <div class="summary-box"><div class="label">Total Revenue</div><div class="val">${formatCurrency(salesReport.total_sales)}</div></div>
          <div class="summary-box"><div class="label">Total Invoices</div><div class="val">${salesReport.total_invoices}</div></div>
          <div class="summary-box"><div class="label">Paid</div><div class="val">${salesReport.paid_invoices}</div></div>
          <div class="summary-box"><div class="label">Pending</div><div class="val">${salesReport.pending_invoices}</div></div>
          <div class="summary-box"><div class="label">Total Tax</div><div class="val">${formatCurrency(salesReport.total_tax)}</div></div>
          <div class="summary-box"><div class="label">Avg Invoice</div><div class="val">${formatCurrency(salesReport.average_invoice)}</div></div>
        </div>
        <h3>Top Selling Products</h3>
        <table><thead><tr><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Revenue</th></tr></thead><tbody>
          ${salesReport.top_products.map((p) => `<tr><td>${p.name}</td><td style="text-align:right">${p.quantity}</td><td style="text-align:right">${formatCurrency(p.revenue)}</td></tr>`).join("")}
        </tbody></table>
        <h3>Monthly Breakdown</h3>
        <table><thead><tr><th>Month</th><th style="text-align:right">Amount</th><th style="text-align:right">Invoices</th></tr></thead><tbody>
          ${salesReport.sales_by_month.map((m) => `<tr><td>${m.month}</td><td style="text-align:right">${formatCurrency(m.amount)}</td><td style="text-align:right">${m.count}</td></tr>`).join("")}
        </tbody></table>`;
    } else if (activeReport === "income_statement" && incomeStatementReport) {
      bodyHTML = `
        <div class="summary-grid">
          <div class="summary-box"><div class="label">Gross Revenue (VAT excl.)</div><div class="val">${formatCurrency(incomeStatementReport.gross_revenue_ex_vat)}</div></div>
          <div class="summary-box"><div class="label">Expenses (VAT excl.)</div><div class="val">${formatCurrency(incomeStatementReport.expenses_ex_vat)}</div></div>
          <div class="summary-box"><div class="label">Net Revenue (VAT excl.)</div><div class="val">${formatCurrency(incomeStatementReport.net_revenue_ex_vat)}</div></div>
        </div>
        <h3>Summary</h3>
        <table style="max-width:520px"><tbody>
          <tr><td>Gross Revenue (VAT excl.)</td><td style="text-align:right">${formatCurrency(incomeStatementReport.gross_revenue_ex_vat)}</td></tr>
          <tr><td>Expenses (VAT excl.)</td><td style="text-align:right">${formatCurrency(incomeStatementReport.expenses_ex_vat)}</td></tr>
          <tr style="font-weight:700;border-top:2px solid #333"><td>Net Revenue (VAT excl.)</td><td style="text-align:right">${formatCurrency(incomeStatementReport.net_revenue_ex_vat)}</td></tr>
        </tbody></table>
        <h3>Revenue — Invoices (${incomeStatementReport.invoices.length})</h3>
        <table><thead><tr><th>Reference</th><th>Customer</th><th>Date</th><th style="text-align:right">Subtotal</th><th style="text-align:right">Tax</th><th style="text-align:right">Total</th><th>Status</th></tr></thead><tbody>
          ${incomeStatementReport.invoices.map((inv) => `<tr><td>${inv.reference}</td><td>${inv.customer}</td><td>${inv.date}</td><td style="text-align:right">${formatCurrency(inv.subtotal)}</td><td style="text-align:right">${formatCurrency(inv.tax)}</td><td style="text-align:right">${formatCurrency(inv.total)}</td><td>${inv.status}</td></tr>`).join("")}
        </tbody></table>
        <h3>Expenses (${incomeStatementReport.expenses.length})</h3>
        <table><thead><tr><th>Reference</th><th>Supplier</th><th>Category</th><th>Date</th><th style="text-align:right">Subtotal</th><th style="text-align:right">Tax</th><th style="text-align:right">Total</th></tr></thead><tbody>
          ${incomeStatementReport.expenses.map((ex) => `<tr><td>${ex.reference}</td><td>${ex.supplier}</td><td>${ex.category}</td><td>${ex.date}</td><td style="text-align:right">${formatCurrency(ex.subtotal)}</td><td style="text-align:right">${formatCurrency(ex.tax)}</td><td style="text-align:right">${formatCurrency(ex.total)}</td></tr>`).join("")}
        </tbody></table>`;
    } else if (
      activeReport === "profit_loss_journal" &&
      profitLossJournalReport
    ) {
      bodyHTML = `
        <div class="summary-grid">
          <div class="summary-box"><div class="label">Income Credits</div><div class="val">${formatCurrency(profitLossJournalReport.total_credits)}</div></div>
          <div class="summary-box"><div class="label">Expense / Contra Debits</div><div class="val">${formatCurrency(profitLossJournalReport.total_debits)}</div></div>
          <div class="summary-box"><div class="label">Net Profit</div><div class="val">${formatCurrency(profitLossJournalReport.net_profit)}</div></div>
        </div>
        <h3>Journal Entries</h3>
        <table><thead><tr><th>Date</th><th>Source</th><th>Reference</th><th>Party</th><th>Description</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Running Profit</th><th>Status</th></tr></thead><tbody>
          ${profitLossJournalReport.entries.map((entry) => `<tr><td>${entry.date}</td><td>${entry.source}</td><td>${entry.reference}</td><td>${entry.party}</td><td>${entry.description}</td><td style="text-align:right">${formatCurrency(entry.debit)}</td><td style="text-align:right">${formatCurrency(entry.credit)}</td><td style="text-align:right">${formatCurrency(entry.running_profit)}</td><td>${entry.status}</td></tr>`).join("")}
        </tbody></table>`;
    } else if (activeReport === "qpd" && qpdReport) {
      bodyHTML = `
        <div class="summary-grid">
          <div class="summary-box"><div class="label">Taxable Income In Period</div><div class="val">${formatCurrency(qpdReport.period_taxable_income)}</div></div>
          <div class="summary-box"><div class="label">Annualisation Factor</div><div class="val">${qpdReport.annualisation_factor.toFixed(2)}x</div></div>
          <div class="summary-box"><div class="label">Estimated Annual Taxable Income</div><div class="val">${formatCurrency(qpdReport.estimated_annual_taxable_income)}</div></div>
          <div class="summary-box"><div class="label">Estimated Annual Tax Due</div><div class="val">${formatCurrency(qpdReport.estimated_annual_tax_due)}</div></div>
        </div>
        <p><strong>Tax rate:</strong> ${qpdReport.tax_rate.toFixed(2)}% &nbsp; <strong>Remittance form:</strong> ITF 12B</p>
        <h3>QPD Schedule</h3>
        <table><thead><tr><th>Quarter</th><th>Due Date</th><th style="text-align:right">Installment %</th><th style="text-align:right">Cumulative %</th><th style="text-align:right">Cumulative Tax Due</th><th style="text-align:right">Less Previous QPDs</th><th style="text-align:right">Amount Due</th><th>Form</th></tr></thead><tbody>
          ${qpdReport.payment_schedule.map((entry) => `<tr><td>${entry.quarter}</td><td>${entry.due_date}</td><td style="text-align:right">${entry.installment_percentage.toFixed(2)}%</td><td style="text-align:right">${entry.cumulative_percentage.toFixed(2)}%</td><td style="text-align:right">${formatCurrency(entry.cumulative_tax_due)}</td><td style="text-align:right">${formatCurrency(entry.prior_qpds_due)}</td><td style="text-align:right">${formatCurrency(entry.amount_due)}</td><td>${entry.remittance_form}</td></tr>`).join("")}
        </tbody></table>`;
    } else if (activeReport === "stock" && stockReport) {
      bodyHTML = `
        <div class="summary-grid">
          <div class="summary-box"><div class="label">Total Products</div><div class="val">${stockReport.total_products}</div></div>
          <div class="summary-box"><div class="label">Inventory Value</div><div class="val">${formatCurrency(stockReport.total_value)}</div></div>
          <div class="summary-box"><div class="label">Low Stock Items</div><div class="val">${stockReport.low_stock_items.length}</div></div>
        </div>
        <h3>Stock Summary</h3>
        <table><thead><tr><th>Product</th><th style="text-align:right">On Hand</th><th style="text-align:right">Available</th><th style="text-align:right">Reserved</th><th style="text-align:right">Value</th></tr></thead><tbody>
          ${stockReport.stock_summary.map((s) => `<tr><td>${s.name}</td><td style="text-align:right">${s.on_hand}</td><td style="text-align:right">${s.available}</td><td style="text-align:right">${s.reserved}</td><td style="text-align:right">${formatCurrency(s.value)}</td></tr>`).join("")}
        </tbody></table>
        ${
          stockReport.low_stock_items.length > 0
            ? `
        <h3>Low Stock Alerts</h3>
        <table><thead><tr><th>Product</th><th style="text-align:right">On Hand</th><th style="text-align:right">Available</th><th style="text-align:right">Reorder Level</th></tr></thead><tbody>
          ${stockReport.low_stock_items.map((s) => `<tr><td>${s.name}</td><td style="text-align:right">${s.on_hand}</td><td style="text-align:right">${s.available}</td><td style="text-align:right">${s.reorder}</td></tr>`).join("")}
        </tbody></table>`
            : ""
        }`;
    } else if (activeReport === "debtors" && debtorsReport) {
      bodyHTML = `
        <div class="summary-grid">
          <div class="summary-box"><div class="label">Unpaid Invoices</div><div class="val">${debtorsReport.unpaid_invoices}</div></div>
          <div class="summary-box"><div class="label">Partial Invoices</div><div class="val">${debtorsReport.partial_invoices}</div></div>
          <div class="summary-box"><div class="label">Total Outstanding</div><div class="val">${formatCurrency(debtorsReport.total_due)}</div></div>
          <div class="summary-box"><div class="label">Avg Due</div><div class="val">${formatCurrency(debtorsReport.average_due)}</div></div>
        </div>
        <h3>Unpaid Invoices</h3>
        <table><thead><tr><th>Reference</th><th>Customer</th><th style="text-align:right">Total</th><th style="text-align:right">Paid</th><th style="text-align:right">Due</th><th>Date</th><th>Status</th></tr></thead><tbody>
          ${debtorsReport.recent_unpaid.map((i) => `<tr><td>${i.reference}</td><td>${i.customer}</td><td style="text-align:right">${formatCurrency(i.total)}</td><td style="text-align:right">${formatCurrency(i.paid)}</td><td style="text-align:right">${formatCurrency(i.due)}</td><td>${i.date}</td><td>${i.status}</td></tr>`).join("")}
        </tbody></table>`;
    } else if (activeReport === "creditors" && creditorsReport) {
      bodyHTML = `
        <div class="summary-grid">
          <div class="summary-box"><div class="label">Open Orders</div><div class="val">${creditorsReport.open_orders}</div></div>
          <div class="summary-box"><div class="label">Total Outstanding</div><div class="val">${formatCurrency(creditorsReport.total_amount)}</div></div>
          <div class="summary-box"><div class="label">Top Suppliers</div><div class="val">${creditorsReport.by_supplier.length}</div></div>
        </div>
        <h3>By Supplier</h3>
        <table><thead><tr><th>Supplier</th><th style="text-align:right">Orders</th><th style="text-align:right">Amount</th></tr></thead><tbody>
          ${creditorsReport.by_supplier.map((v) => `<tr><td>${v.name}</td><td style="text-align:right">${v.count}</td><td style="text-align:right">${formatCurrency(v.amount)}</td></tr>`).join("")}
        </tbody></table>
        <h3>Recent Open Orders</h3>
        <table><thead><tr><th>Reference</th><th>Supplier</th><th style="text-align:right">Amount</th><th>Date</th><th>Status</th><th>Paid State</th></tr></thead><tbody>
          ${creditorsReport.recent_orders.map((o) => `<tr><td>${o.reference}</td><td>${o.supplier}</td><td style="text-align:right">${formatCurrency(o.amount)}</td><td>${o.date}</td><td>${o.status}</td><td>${o.paid_state}</td></tr>`).join("")}
        </tbody></table>`;
    } else if (activeReport === "purchases" && purchaseReport) {
      bodyHTML = `
        <div class="summary-grid">
          <div class="summary-box"><div class="label">Total Orders</div><div class="val">${purchaseReport.total_orders}</div></div>
          <div class="summary-box"><div class="label">Total Amount</div><div class="val">${formatCurrency(purchaseReport.total_amount)}</div></div>
          <div class="summary-box"><div class="label">Total Tax</div><div class="val">${formatCurrency(purchaseReport.total_tax)}</div></div>
          <div class="summary-box"><div class="label">Average Order</div><div class="val">${formatCurrency(purchaseReport.average_order)}</div></div>
        </div>
        <h3>By Supplier</h3>
        <table><thead><tr><th>Supplier</th><th style="text-align:right">Orders</th><th style="text-align:right">Amount</th></tr></thead><tbody>
          ${purchaseReport.by_supplier.map((v) => `<tr><td>${v.name}</td><td style="text-align:right">${v.count}</td><td style="text-align:right">${formatCurrency(v.amount)}</td></tr>`).join("")}
        </tbody></table>
        <h3>By Status</h3>
        <table><thead><tr><th>Status</th><th style="text-align:right">Count</th><th style="text-align:right">Amount</th></tr></thead><tbody>
          ${purchaseReport.by_status.map((s) => `<tr><td style="text-transform:capitalize">${s.status}</td><td style="text-align:right">${s.count}</td><td style="text-align:right">${formatCurrency(s.amount)}</td></tr>`).join("")}
        </tbody></table>
        <h3>Monthly Trend</h3>
        <table><thead><tr><th>Month</th><th style="text-align:right">Amount</th><th style="text-align:right">Orders</th></tr></thead><tbody>
          ${purchaseReport.by_month.map((m) => `<tr><td>${m.month}</td><td style="text-align:right">${formatCurrency(m.amount)}</td><td style="text-align:right">${m.count}</td></tr>`).join("")}
        </tbody></table>`;
    } else if (activeReport === "pos_orders" && posOrdersReport) {
      bodyHTML = `
        <div class="summary-grid">
          <div class="summary-box"><div class="label">Total Orders</div><div class="val">${posOrdersReport.total_orders}</div></div>
          <div class="summary-box"><div class="label">Fiscalized Orders</div><div class="val">${posOrdersReport.fiscalized_orders}</div></div>
          <div class="summary-box"><div class="label">Refunded Orders</div><div class="val">${posOrdersReport.refunded_orders}</div></div>
          <div class="summary-box"><div class="label">Currencies</div><div class="val">${posOrdersReport.by_currency.length}</div></div>
        </div>
        <h3>Sales by Currency</h3>
        <table><thead><tr><th>Currency</th><th style="text-align:right">Orders</th><th style="text-align:right">Total Sales</th><th style="text-align:right">Cash</th><th style="text-align:right">Card</th><th style="text-align:right">Mobile</th></tr></thead><tbody>
          ${posOrdersReport.by_currency.map((entry) => `<tr><td>${entry.currency}</td><td style="text-align:right">${entry.count}</td><td style="text-align:right">${entry.currency} ${entry.total.toFixed(2)}</td><td style="text-align:right">${entry.currency} ${entry.cash.toFixed(2)}</td><td style="text-align:right">${entry.currency} ${entry.card.toFixed(2)}</td><td style="text-align:right">${entry.currency} ${entry.mobile.toFixed(2)}</td></tr>`).join("")}
        </tbody></table>
        <h3>Recent Orders</h3>
        <table><thead><tr><th>Reference</th><th>Date</th><th>Cashier</th><th>Till</th><th>Status</th><th>Currency</th><th style="text-align:right">Total</th><th style="text-align:right">Cash</th><th style="text-align:right">Card</th><th style="text-align:right">Mobile</th><th>Fiscalized</th></tr></thead><tbody>
          ${posOrdersReport.recent_orders.map((order) => `<tr><td>${order.reference}</td><td>${order.date}</td><td>${order.cashier}</td><td>${order.till}</td><td>${order.status}</td><td>${order.currency}</td><td style="text-align:right">${order.currency} ${order.total.toFixed(2)}</td><td style="text-align:right">${order.currency} ${order.cash.toFixed(2)}</td><td style="text-align:right">${order.currency} ${order.card.toFixed(2)}</td><td style="text-align:right">${order.currency} ${order.mobile.toFixed(2)}</td><td>${order.fiscalized ? "Yes" : "No"}</td></tr>`).join("")}
        </tbody></table>`;
    } else if (activeReport === "vat" && vatReport) {
      const vatPeriod = `${vatReport.period_from || dateRange.from} to ${vatReport.period_to || dateRange.to}`;
      bodyHTML = `
        <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px double #333">
          <h1 style="margin:0;font-size:24px;letter-spacing:2px">VAT RETURN</h1>
          <div style="color:#666;margin-top:4px">Tax Period: ${vatPeriod}</div>
        </div>
        <h3>1. Sales VAT</h3>
        <table><thead><tr><th>VAT Rate</th><th style="text-align:right">Taxable Amount</th><th style="text-align:right">VAT Amount</th><th style="text-align:right">Total Incl. VAT</th><th style="text-align:right">Transactions</th></tr></thead><tbody>
          ${vatReport.sales_by_rate.map((b) => `<tr><td>${b.rate}%</td><td style="text-align:right">${formatCurrency(b.taxable_amount)}</td><td style="text-align:right">${formatCurrency(b.tax_amount)}</td><td style="text-align:right">${formatCurrency(b.total)}</td><td style="text-align:right">${b.count}</td></tr>`).join("")}
          <tr style="font-weight:700;border-top:2px solid #333"><td>Total Output VAT</td><td style="text-align:right">${formatCurrency(vatReport.sales_total - vatReport.output_tax)}</td><td style="text-align:right">${formatCurrency(vatReport.output_tax)}</td><td style="text-align:right">${formatCurrency(vatReport.sales_total)}</td><td style="text-align:right">${vatReport.invoices_count}</td></tr>
        </tbody></table>
        <h3>2. INPUT VAT (Tax on Purchases)</h3>
        <table><thead><tr><th>VAT Rate</th><th style="text-align:right">Taxable Amount</th><th style="text-align:right">VAT Amount</th><th style="text-align:right">Total Incl. VAT</th><th style="text-align:right">Transactions</th></tr></thead><tbody>
          ${vatReport.purchases_by_rate.map((b) => `<tr><td>${b.rate}%</td><td style="text-align:right">${formatCurrency(b.taxable_amount)}</td><td style="text-align:right">${formatCurrency(b.tax_amount)}</td><td style="text-align:right">${formatCurrency(b.total)}</td><td style="text-align:right">${b.count}</td></tr>`).join("")}
          <tr style="font-weight:700;border-top:2px solid #333"><td>Total Input VAT</td><td style="text-align:right">${formatCurrency(vatReport.purchases_total - vatReport.input_tax)}</td><td style="text-align:right">${formatCurrency(vatReport.input_tax)}</td><td style="text-align:right">${formatCurrency(vatReport.purchases_total)}</td><td style="text-align:right">${vatReport.purchases_count}</td></tr>
        </tbody></table>
        ${
          vatReport.credit_notes_count > 0
            ? `
        <h3>3. Credit Notes</h3>
        <table><tbody>
          <tr><td>Credit Notes Issued</td><td style="text-align:right">${vatReport.credit_notes_count}</td></tr>
          <tr><td>VAT on Credit Notes</td><td style="text-align:right">${formatCurrency(vatReport.credit_notes_tax)}</td></tr>
        </tbody></table>`
            : ""
        }
        <h3 style="margin-top:32px">${vatReport.credit_notes_count > 0 ? "4" : "3"}. NET VAT CALCULATION</h3>
        <table style="max-width:500px">
          <tbody>
            <tr><td>Output VAT (Sales)</td><td style="text-align:right;font-weight:600">${formatCurrency(vatReport.output_tax)}</td></tr>
            <tr><td>Less: Input VAT (Purchases)</td><td style="text-align:right;font-weight:600;color:#dc2626">(${formatCurrency(vatReport.input_tax)})</td></tr>
            ${vatReport.credit_notes_tax > 0 ? `<tr><td>Less: Credit Note VAT</td><td style="text-align:right;font-weight:600;color:#dc2626">(${formatCurrency(vatReport.credit_notes_tax)})</td></tr>` : ""}
            <tr style="border-top:3px double #333;font-size:16px;font-weight:700"><td>Net VAT ${vatReport.net_tax >= 0 ? "Payable" : "Refundable"}</td><td style="text-align:right;color:${vatReport.net_tax >= 0 ? "#dc2626" : "#16a34a"}">${formatCurrency(Math.abs(vatReport.net_tax))}</td></tr>
          </tbody>
        </table>`;
    }

    const html = `<!DOCTYPE html><html><head><title>${title}</title><style>
      @page { size: A4; margin: 15mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--gray-900); margin: 0; padding: 20px; font-size: 12px; }
      h2 { margin: 0 0 4px; font-size: 20px; }
      h3 { margin: 24px 0 8px; font-size: 1rem; border-bottom: 2px solid var(--slate-200); padding-bottom: 6px; }
      .period { color: var(--gray-500); margin-bottom: 20px; }
      .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; }
      .summary-box { background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: 8px; padding: 12px; }
      .summary-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gray-500); margin-bottom: 4px; }
      .summary-box .val { font-size: 18px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
      th { background: var(--gray-100); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 10px; text-align: left; border-bottom: 2px solid var(--zinc-200); }
      td { padding: 7px 10px; border-bottom: 1px solid var(--zinc-100); }
      tr:nth-child(even) { background: var(--gray-50); }
      @media print { body { padding: 0; } }
    </style></head><body>
      <h2>${title}</h2>
      <div class="period">${period}</div>
      ${bodyHTML}
    </body></html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }
  };

  const downloadBlob = (
    content: string,
    filename: string,
    mimeType: string,
  ) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Render ────────────────────────────────────── */

  const getPaginatedTable = <T,>(key: string, rows: T[]) => {
    const pageSize = tablePageSizes[key] || 10;
    const totalItems = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(Math.max(tablePages[key] || 1, 1), totalPages);
    const start = (currentPage - 1) * pageSize;
    return {
      rows: rows.slice(start, start + pageSize),
      page: currentPage,
      pageSize,
      totalItems,
      setPage: (page: number) =>
        setTablePages((prev) => ({ ...prev, [key]: page })),
      setPageSize: (size: number) => {
        setTablePageSizes((prev) => ({ ...prev, [key]: size }));
        setTablePages((prev) => ({ ...prev, [key]: 1 }));
      },
    };
  };

  const reportAxisGridStyle = {
    "--trend-grid-count": salesTrendChart.axisSteps || 4,
  } as CSSProperties;

  const salesTopProductsTable = getPaginatedTable(
    "sales_top_products",
    salesReport?.top_products ?? [],
  );
  const incomeInvoicesTable = getPaginatedTable(
    "income_invoices",
    incomeStatementReport?.invoices ?? [],
  );
  const incomeExpensesTable = getPaginatedTable(
    "income_expenses",
    incomeStatementReport?.expenses ?? [],
  );
  const profitLossJournalTable = getPaginatedTable(
    "profit_loss_journal",
    profitLossJournalReport?.entries ?? [],
  );
  const qpdScheduleTable = getPaginatedTable(
    "qpd_schedule",
    qpdReport?.payment_schedule ?? [],
  );
  const stockLowItemsTable = getPaginatedTable(
    "stock_low_items",
    stockReport?.low_stock_items ?? [],
  );
  const stockSummaryTable = getPaginatedTable(
    "stock_summary",
    stockReport?.stock_summary ?? [],
  );
  const stockMovementsTable = getPaginatedTable(
    "stock_movements",
    stockReport?.recent_movements ?? [],
  );
  const debtorsUnpaidTable = getPaginatedTable(
    "debtors_unpaid",
    debtorsReport?.recent_unpaid ?? [],
  );
  const creditorsBySupplierTable = getPaginatedTable(
    "creditors_by_supplier",
    creditorsReport?.by_supplier ?? [],
  );
  const creditorsRecentTable = getPaginatedTable(
    "creditors_recent",
    creditorsReport?.recent_orders ?? [],
  );
  const vatSalesByRateTable = getPaginatedTable(
    "vat_sales_by_rate",
    vatReport?.sales_by_rate ?? [],
  );
  const vatPurchasesByRateTable = getPaginatedTable(
    "vat_purchases_by_rate",
    vatReport?.purchases_by_rate ?? [],
  );
  const purchasesBySupplierTable = getPaginatedTable(
    "purchases_by_supplier",
    purchaseReport?.by_supplier ?? [],
  );
  const purchasesByStatusTable = getPaginatedTable(
    "purchases_by_status",
    purchaseReport?.by_status ?? [],
  );
  const purchasesRecentTable = getPaginatedTable(
    "purchases_recent",
    purchaseReport?.recent_orders ?? [],
  );
  const posOrdersByCurrencyTable = getPaginatedTable(
    "pos_orders_by_currency",
    posOrdersReport?.by_currency ?? [],
  );
  const posOrdersByStatusTable = getPaginatedTable(
    "pos_orders_by_status",
    posOrdersReport?.by_status ?? [],
  );
  const posOrdersRecentTable = getPaginatedTable(
    "pos_orders_recent",
    posOrdersReport?.recent_orders ?? [],
  );

  const goBackToCompanies = () => {
    setSelectedCompanyId(null);
    setSalesReport(null);
    setStockReport(null);
    setDebtorsReport(null);
    setCreditorsReport(null);
    setProfitLossJournalReport(null);
    setQpdReport(null);
    setVatReport(null);
    setPurchaseReport(null);
    setPosOrdersReport(null);
    navigate("/reports");
  };

  if (companiesLoading && !companyId) {
    return <div className="loading-indicator">Loading companies...</div>;
  }
  if (!isAdmin && !companyId && allCompanies.length) {
    return <div className="loading-indicator">Loading companies...</div>;
  }

  // ─── Admin company selection view ───
  if (isAdmin && !companyId) {
    return (
      <div className="content">
        <div
          className=""
          style={{
            display: "flex",
            width: "auto",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div className="company-search">
            <input
              type="text"
              placeholder="Search company by name, VAT, or TIN"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="device-company-grid">
          {filteredCompanies.map((c) => (
            <button
              key={c.id}
              className="device-company-card"
              onClick={() => setSelectedCompanyId(c.id)}
            >
              <div className="device-company-icon">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                  <path d="M9 22v-4h6v4" />
                  <line x1="8" y1="6" x2="8" y2="6.01" />
                  <line x1="16" y1="6" x2="16" y2="6.01" />
                  <line x1="12" y1="6" x2="12" y2="6.01" />
                  <line x1="8" y1="10" x2="8" y2="10.01" />
                  <line x1="16" y1="10" x2="16" y2="10.01" />
                  <line x1="12" y1="10" x2="12" y2="10.01" />
                  <line x1="8" y1="14" x2="8" y2="14.01" />
                  <line x1="16" y1="14" x2="16" y2="14.01" />
                  <line x1="12" y1="14" x2="12" y2="14.01" />
                </svg>
              </div>
              <div className="device-company-info">
                <div className="device-company-name">{c.name}</div>
                {c.tin && (
                  <div className="device-company-detail">TIN: {c.tin}</div>
                )}
                {c.vat && (
                  <div className="device-company-detail">VAT: {c.vat}</div>
                )}
              </div>
              <div className="device-company-arrow">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}
          {!filteredCompanies.length && (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: 40,
                color: "var(--muted)",
              }}
            >
              {companyQuery.trim()
                ? "No companies match your search."
                : "No companies found. Create a company first."}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="reports-page">
      {/* Company breadcrumb for admin */}
      {/* {isAdmin && companyId && (
        <div
          className="o-control-panel"
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div className="o-breadcrumb">
            <span
              className="o-breadcrumb-item"
              style={{ cursor: "pointer" }}
              onClick={goBackToCompanies}
            >
              Financial Reports
            </span>
            <span className="o-breadcrumb-separator">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
            <span className="o-breadcrumb-current">
              {company?.name || "Company"}
            </span>
          </div>
        </div>
      )} */}
      <div className="two-panel two-panel-left">
        <Sidebar sections={reportsSidebarSections} />

        <div>
          {/* Top bar with date range and actions */}
          <div className="content-top-bar report-filter-bar">
            <div className="report-filter-group report-filter-group-dates">
              <label className="report-filter-label">From</label>
              <input
                type="date"
                className="report-filter-input"
                value={dateRange.from}
                onChange={(e) =>
                  setDateRange((prev) => ({ ...prev, from: e.target.value }))
                }
              />
              <label className="report-filter-label">To</label>
              <input
                type="date"
                className="report-filter-input"
                value={dateRange.to}
                onChange={(e) =>
                  setDateRange((prev) => ({ ...prev, to: e.target.value }))
                }
              />
            </div>
            <div className="d-flex-end">
              <div className="report-filter-group report-filter-group-currency">
                <label className="report-filter-label">Currency</label>
                <select
                  className="report-filter-select"
                  value={reportCurrency}
                  onChange={(e) =>
                    setReportCurrency(normalizeCurrency(e.target.value))
                  }
                  aria-label="Filter reports by currency"
                >
                  <option value="">All currencies</option>
                  {currencyOptions.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="report-filter-group report-filter-group-actions">
                <button
                  className={`o-btn ${loading ? "o-btn-primary" : "o-btn-secondary"}`}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={loadReport}
                  disabled={loading}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  {loading ? "Loading..." : "Refresh"}
                </button>
                <button
                  className="o-btn o-btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={
                    activeReport === "vat" ? exportVatExcel : exportExcel
                  }
                  disabled={loading}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export Excel
                </button>
                <button
                  className="o-btn o-btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={exportPDF}
                  disabled={loading}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  Export PDF
                </button>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="alert alert-danger" style={{ margin: "16px 0" }}>
              {error}
              <button
                onClick={() => setError("")}
                style={{
                  float: "right",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 18,
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div
              style={{
                textAlign: "center",
                padding: "60px 20px",
                color: "var(--gray-500)",
              }}
            >
              Loading report data...
            </div>
          )}

          {/* ─── Revenue ─── */}
          {!loading && activeReport === "sales" && salesReport && (
            <div className="report-content">
              <div className="metrics-row">
                <MetricCard
                  label="Total Revenue"
                  value={formatCurrency(salesReport.total_sales)}
                />
                <MetricCard
                  label="Total Invoices"
                  value={String(salesReport.total_invoices)}
                  variant="default"
                  onArrowClick={() =>
                    navigate(
                      `/invoices${selectedCompanyId ? `?company_id=${selectedCompanyId}` : ""}`,
                    )
                  }
                  arrowLabel="Open all invoices in Invoices app"
                />
                <MetricCard
                  label="Paid Invoices"
                  value={String(salesReport.paid_invoices)}
                  variant="success"
                  onArrowClick={() =>
                    navigate(
                      `/invoices?status=paid${selectedCompanyId ? `&company_id=${selectedCompanyId}` : ""}`,
                    )
                  }
                  arrowLabel="Open paid invoices in Invoices app"
                />
                <MetricCard
                  label="Pending Invoices"
                  value={String(salesReport.pending_invoices)}
                  variant="warning"
                  onArrowClick={() =>
                    navigate(
                      `/invoices?status=posted${selectedCompanyId ? `&company_id=${selectedCompanyId}` : ""}`,
                    )
                  }
                  arrowLabel="Open pending invoices in Invoices app"
                />
                <MetricCard
                  label="Total Tax"
                  value={formatCurrency(salesReport.total_tax)}
                />
                <MetricCard
                  label="Avg Invoice"
                  value={formatCurrency(salesReport.average_invoice)}
                />
              </div>

              <div className="report-grid">
                <div className="report-card">
                  <h3>Top Selling Products</h3>
                  {salesReport.top_products.length === 0 ? (
                    <p className="empty-state">
                      No product sales in this period.
                    </p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th className="text-right">Qty Sold</th>
                            <th className="text-right">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesTopProductsTable.rows.map((p, i) => (
                            <tr key={i}>
                              <td>{p.name}</td>
                              <td className="text-right">{p.quantity}</td>
                              <td className="text-right">
                                {formatCurrency(p.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={salesTopProductsTable.page}
                        pageSize={salesTopProductsTable.pageSize}
                        totalItems={salesTopProductsTable.totalItems}
                        onPageChange={salesTopProductsTable.setPage}
                        onPageSizeChange={salesTopProductsTable.setPageSize}
                      />
                    </>
                  )}
                </div>

                <div className="report-card">
                  <h3>Revenue Trend</h3>
                  {salesTrendChart.bars.length === 0 ? (
                    <p className="empty-state">No sales data in this period.</p>
                  ) : (
                    <div className="trend-chart-grid">
                      <div className="axis-labels" aria-hidden="true">
                        {salesTrendChart.axisTicks.map((value, index) => (
                          <span key={index}>{formatCurrency(value)}</span>
                        ))}
                      </div>
                      <div className="bar-axis">
                        <div
                          className="trend-bar-scroll"
                          role="img"
                          aria-label="Revenue trend bars"
                        >
                          <div
                            className="trend-bar-columns"
                            style={reportAxisGridStyle}
                          >
                            {salesTrendChart.bars.map((bar) => (
                              <div key={bar.key} className="trend-bar-column">
                                <div className="trend-bar-track">
                                  <span className="trend-bar-tooltip">
                                    {formatCurrency(bar.value)}
                                  </span>
                                  <div
                                    className="bar"
                                    style={{
                                      height: `${bar.heightPercent}%`,
                                    }}
                                    title={`${bar.label}: ${formatCurrency(
                                      bar.value,
                                    )}`}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div
                            className="trend-bar-label-row"
                            aria-hidden="true"
                          >
                            {salesTrendChart.bars.map((bar) => (
                              <span
                                key={`label-${bar.key}`}
                                className="trend-bar-label"
                              >
                                {bar.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Income Statement ─── */}
          {!loading &&
            activeReport === "income_statement" &&
            incomeStatementReport && (
              <div className="report-content">
                <div className="metrics-row">
                  <MetricCard
                    label="Gross Revenue (VAT excl.)"
                    value={formatCurrency(
                      incomeStatementReport.gross_revenue_ex_vat,
                    )}
                  />
                  <MetricCard
                    label="Expenses (VAT excl.)"
                    value={formatCurrency(
                      incomeStatementReport.expenses_ex_vat,
                    )}
                    variant="warning"
                  />
                  <MetricCard
                    label="Net Revenue (VAT excl.)"
                    value={formatCurrency(
                      incomeStatementReport.net_revenue_ex_vat,
                    )}
                    variant={
                      incomeStatementReport.net_revenue_ex_vat >= 0
                        ? "success"
                        : "danger"
                    }
                  />
                </div>

                <div className="tabs-nav" style={{ marginBottom: 20 }}>
                  <button
                    className={`tab-btn ${activeIncomeTab === "summary" ? "active" : ""}`}
                    onClick={() => setActiveIncomeTab("summary")}
                  >
                    Summary
                  </button>
                  <button
                    className={`tab-btn ${activeIncomeTab === "revenue" ? "active" : ""}`}
                    onClick={() => setActiveIncomeTab("revenue")}
                  >
                    Revenue
                  </button>
                  <button
                    className={`tab-btn ${activeIncomeTab === "expenses" ? "active" : ""}`}
                    onClick={() => setActiveIncomeTab("expenses")}
                  >
                    Expenses
                  </button>
                </div>

                {activeIncomeTab === "summary" && (
                  <div className="report-grid">
                    <div className="report-card">
                      <h3>Summary</h3>
                      <table className="report-table">
                        <tbody>
                          <tr>
                            <td style={{ fontWeight: 600 }}>
                              Gross Revenue (VAT excl.)
                            </td>
                            <td className="text-right">
                              {formatCurrency(
                                incomeStatementReport.gross_revenue_ex_vat,
                              )}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 600 }}>
                              Expenses (VAT excl.)
                            </td>
                            <td className="text-right">
                              {formatCurrency(
                                incomeStatementReport.expenses_ex_vat,
                              )}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 700 }}>
                              Net Revenue (VAT excl.)
                            </td>
                            <td
                              className="text-right"
                              style={{ fontWeight: 700 }}
                            >
                              {formatCurrency(
                                incomeStatementReport.net_revenue_ex_vat,
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeIncomeTab === "revenue" && (
                  <div className="report-card">
                    <h3>
                      Revenue — Invoices (
                      {incomeStatementReport.invoices.length})
                    </h3>
                    {incomeStatementReport.invoices.length === 0 ? (
                      <p className="empty-state">No invoices in this period.</p>
                    ) : (
                      <>
                        <table className="report-table">
                          <thead>
                            <tr>
                              <th>Reference</th>
                              <th>Customer</th>
                              <th>Date</th>
                              <th className="text-right">Subtotal</th>
                              <th className="text-right">Tax</th>
                              <th className="text-right">Total</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {incomeInvoicesTable.rows.map((inv, i) => (
                              <tr key={i}>
                                <td
                                  style={{
                                    fontFamily: "monospace",
                                    fontSize: 12,
                                  }}
                                >
                                  {inv.reference}
                                </td>
                                <td>{inv.customer}</td>
                                <td>{inv.date}</td>
                                <td className="text-right">
                                  {formatCurrency(inv.subtotal)}
                                </td>
                                <td className="text-right">
                                  {formatCurrency(inv.tax)}
                                </td>
                                <td className="text-right">
                                  {formatCurrency(inv.total)}
                                </td>
                                <td>
                                  <span
                                    className={`badge ${inv.status === "paid" ? "badge-success" : inv.status === "posted" ? "badge-info" : "badge-secondary"}`}
                                    style={{ textTransform: "capitalize" }}
                                  >
                                    {inv.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr
                              style={{
                                fontWeight: 700,
                                background: "var(--slate-50)",
                              }}
                            >
                              <td colSpan={3} className="text-right">
                                Total
                              </td>
                              <td className="text-right">
                                {formatCurrency(
                                  incomeStatementReport.gross_revenue_ex_vat,
                                )}
                              </td>
                              <td className="text-right">
                                {formatCurrency(
                                  incomeStatementReport.invoices.reduce(
                                    (s, inv) => s + inv.tax,
                                    0,
                                  ),
                                )}
                              </td>
                              <td className="text-right">
                                {formatCurrency(
                                  incomeStatementReport.invoices.reduce(
                                    (s, inv) => s + inv.total,
                                    0,
                                  ),
                                )}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                        <TablePagination
                          page={incomeInvoicesTable.page}
                          pageSize={incomeInvoicesTable.pageSize}
                          totalItems={incomeInvoicesTable.totalItems}
                          onPageChange={incomeInvoicesTable.setPage}
                          onPageSizeChange={incomeInvoicesTable.setPageSize}
                        />
                      </>
                    )}
                  </div>
                )}

                {activeIncomeTab === "expenses" && (
                  <div className="report-card">
                    <h3>Expenses ({incomeStatementReport.expenses.length})</h3>
                    {incomeStatementReport.expenses.length === 0 ? (
                      <p className="empty-state">No expenses in this period.</p>
                    ) : (
                      <>
                        <table className="report-table">
                          <thead>
                            <tr>
                              <th>Reference</th>
                              <th>Supplier</th>
                              <th>Category</th>
                              <th>Date</th>
                              <th className="text-right">Subtotal</th>
                              <th className="text-right">Tax</th>
                              <th className="text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {incomeExpensesTable.rows.map((ex, i) => (
                              <tr key={i}>
                                <td
                                  style={{
                                    fontFamily: "monospace",
                                    fontSize: 12,
                                  }}
                                >
                                  {ex.reference}
                                </td>
                                <td>{ex.supplier}</td>
                                <td>{ex.category}</td>
                                <td>{ex.date}</td>
                                <td className="text-right">
                                  {formatCurrency(ex.subtotal)}
                                </td>
                                <td className="text-right">
                                  {formatCurrency(ex.tax)}
                                </td>
                                <td className="text-right">
                                  {formatCurrency(ex.total)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr
                              style={{
                                fontWeight: 700,
                                background: "var(--slate-50)",
                              }}
                            >
                              <td colSpan={4} className="text-right">
                                Total
                              </td>
                              <td className="text-right">
                                {formatCurrency(
                                  incomeStatementReport.expenses_ex_vat,
                                )}
                              </td>
                              <td className="text-right">
                                {formatCurrency(
                                  incomeStatementReport.expenses.reduce(
                                    (s, ex) => s + ex.tax,
                                    0,
                                  ),
                                )}
                              </td>
                              <td className="text-right">
                                {formatCurrency(
                                  incomeStatementReport.expenses.reduce(
                                    (s, ex) => s + ex.total,
                                    0,
                                  ),
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                        <TablePagination
                          page={incomeExpensesTable.page}
                          pageSize={incomeExpensesTable.pageSize}
                          totalItems={incomeExpensesTable.totalItems}
                          onPageChange={incomeExpensesTable.setPage}
                          onPageSizeChange={incomeExpensesTable.setPageSize}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

          {!loading &&
            activeReport === "profit_loss_journal" &&
            profitLossJournalReport && (
              <div className="report-content">
                <div className="metrics-row">
                  <MetricCard
                    label="Income Credits"
                    value={formatCurrency(profitLossJournalReport.total_credits)}
                  />
                  <MetricCard
                    label="Expense / Contra Debits"
                    value={formatCurrency(profitLossJournalReport.total_debits)}
                    variant="warning"
                  />
                  <MetricCard
                    label="Net Profit"
                    value={formatCurrency(profitLossJournalReport.net_profit)}
                    variant={
                      profitLossJournalReport.net_profit >= 0
                        ? "success"
                        : "danger"
                    }
                  />
                </div>

                <div className="report-card">
                  <h3>Journal Entries</h3>
                  {profitLossJournalReport.entries.length === 0 ? (
                    <p className="empty-state">
                      No profit and loss entries in this period.
                    </p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Source</th>
                            <th>Reference</th>
                            <th>Party</th>
                            <th>Description</th>
                            <th className="text-right">Debit</th>
                            <th className="text-right">Credit</th>
                            <th className="text-right">Running Profit</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profitLossJournalTable.rows.map((entry, index) => (
                            <tr key={`${entry.reference}-${entry.date}-${index}`}>
                              <td>{entry.date}</td>
                              <td>{entry.source}</td>
                              <td
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: 12,
                                }}
                              >
                                {entry.reference}
                              </td>
                              <td>{entry.party}</td>
                              <td>{entry.description}</td>
                              <td className="text-right">
                                {entry.debit > 0 ? formatCurrency(entry.debit) : "-"}
                              </td>
                              <td className="text-right">
                                {entry.credit > 0
                                  ? formatCurrency(entry.credit)
                                  : "-"}
                              </td>
                              <td
                                className={`text-right ${entry.running_profit < 0 ? "report-negative-value" : ""}`}
                              >
                                {formatCurrency(entry.running_profit)}
                              </td>
                              <td>
                                <span
                                  className={`badge ${entry.status === "paid" || entry.status === "posted" || entry.status === "fiscalized" ? "badge-success" : entry.status === "cancelled" ? "badge-danger" : "badge-secondary"}`}
                                  style={{ textTransform: "capitalize" }}
                                >
                                  {entry.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={profitLossJournalTable.page}
                        pageSize={profitLossJournalTable.pageSize}
                        totalItems={profitLossJournalTable.totalItems}
                        onPageChange={profitLossJournalTable.setPage}
                        onPageSizeChange={profitLossJournalTable.setPageSize}
                      />
                    </>
                  )}
                </div>
              </div>
            )}

          {!loading && activeReport === "qpd" && qpdReport && (
            <div className="report-content">
              <div className="metrics-row">
                <MetricCard
                  label="Taxable Income In Period"
                  value={formatCurrency(qpdReport.period_taxable_income)}
                />
                <MetricCard
                  label="Annualisation Factor"
                  value={`${qpdReport.annualisation_factor.toFixed(2)}x`}
                />
                <MetricCard
                  label="Estimated Annual Taxable Income"
                  value={formatCurrency(qpdReport.estimated_annual_taxable_income)}
                />
                <MetricCard
                  label="Estimated Annual Tax Due"
                  value={formatCurrency(qpdReport.estimated_annual_tax_due)}
                  variant={qpdReport.estimated_annual_tax_due > 0 ? "warning" : "success"}
                />
              </div>

              <div className="report-grid">
                <div className="report-card">
                  <h3>QPD Calculation Summary</h3>
                  <table className="report-table">
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Tax Year</td>
                        <td className="text-right">{qpdReport.tax_year}</td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Tax Rate</td>
                        <td className="text-right">
                          {qpdReport.tax_rate.toFixed(2)}%
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>
                          Estimated Annual Tax Due
                        </td>
                        <td className="text-right">
                          {formatCurrency(qpdReport.estimated_annual_tax_due)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Remittance Form</td>
                        <td className="text-right">ITF 12B</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="empty-state" style={{ textAlign: "left", margin: 0 }}>
                    QPD due is calculated as cumulative tax due less QPDs already
                    due for earlier quarters.
                  </p>
                </div>

                <div className="report-card">
                  <h3>Quarterly Payment Dates</h3>
                  {qpdReport.payment_schedule.length === 0 ? (
                    <p className="empty-state">No QPD schedule available.</p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Quarter</th>
                            <th>Due Date</th>
                            <th className="text-right">Installment %</th>
                            <th className="text-right">Cumulative %</th>
                            <th className="text-right">Cumulative Tax Due</th>
                            <th className="text-right">Less Previous QPDs</th>
                            <th className="text-right">Amount Due</th>
                            <th>Form</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qpdScheduleTable.rows.map((entry) => (
                            <tr key={`${entry.quarter}-${entry.due_date}`}>
                              <td>{entry.quarter}</td>
                              <td>{entry.due_date}</td>
                              <td className="text-right">
                                {entry.installment_percentage.toFixed(2)}%
                              </td>
                              <td className="text-right">
                                {entry.cumulative_percentage.toFixed(2)}%
                              </td>
                              <td className="text-right">
                                {formatCurrency(entry.cumulative_tax_due)}
                              </td>
                              <td className="text-right">
                                {formatCurrency(entry.prior_qpds_due)}
                              </td>
                              <td className="text-right">
                                {formatCurrency(entry.amount_due)}
                              </td>
                              <td>{entry.remittance_form}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={qpdScheduleTable.page}
                        pageSize={qpdScheduleTable.pageSize}
                        totalItems={qpdScheduleTable.totalItems}
                        onPageChange={qpdScheduleTable.setPage}
                        onPageSizeChange={qpdScheduleTable.setPageSize}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Stock Report ─── */}
          {!loading && activeReport === "stock" && stockReport && (
            <div className="report-content">
              <div className="metrics-row">
                <MetricCard
                  label="Active Products"
                  value={String(stockReport.total_products)}
                />
                <MetricCard
                  label="Inventory Value"
                  value={formatCurrency(stockReport.total_value)}
                />
                <MetricCard
                  label="Low Stock Items"
                  value={String(stockReport.low_stock_items.length)}
                  variant={
                    stockReport.low_stock_items.length > 0
                      ? "danger"
                      : "success"
                  }
                />
                <MetricCard
                  label="Tracked Items"
                  value={String(stockReport.stock_summary.length)}
                />
              </div>

              <div className="report-grid">
                {stockReport.low_stock_items.length > 0 && (
                  <div className="report-card">
                    <h3>⚠️ Low Stock Alerts</h3>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th className="text-right">On Hand</th>
                          <th className="text-right">Available</th>
                          <th className="text-right">Reorder Level</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockLowItemsTable.rows.map((item, i) => (
                          <tr key={i}>
                            <td>{item.name}</td>
                            <td className="text-right">{item.on_hand}</td>
                            <td className="text-right">{item.available}</td>
                            <td className="text-right">{item.reorder}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <TablePagination
                      page={stockLowItemsTable.page}
                      pageSize={stockLowItemsTable.pageSize}
                      totalItems={stockLowItemsTable.totalItems}
                      onPageChange={stockLowItemsTable.setPage}
                      onPageSizeChange={stockLowItemsTable.setPageSize}
                    />
                  </div>
                )}

                <div className="report-card">
                  <h3>Stock Summary</h3>
                  {stockReport.stock_summary.length === 0 ? (
                    <p className="empty-state">No stock data available.</p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th className="text-right">On Hand</th>
                            <th className="text-right">Available</th>
                            <th className="text-right">Reserved</th>
                            <th className="text-right">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockSummaryTable.rows.map((s, i) => (
                            <tr key={i}>
                              <td>{s.name}</td>
                              <td className="text-right">{s.on_hand}</td>
                              <td className="text-right">{s.available}</td>
                              <td className="text-right">{s.reserved}</td>
                              <td className="text-right">
                                {formatCurrency(s.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={stockSummaryTable.page}
                        pageSize={stockSummaryTable.pageSize}
                        totalItems={stockSummaryTable.totalItems}
                        onPageChange={stockSummaryTable.setPage}
                        onPageSizeChange={stockSummaryTable.setPageSize}
                      />
                    </>
                  )}
                </div>
              </div>

              {stockReport.recent_movements.length > 0 && (
                <div className="report-card full-width">
                  <h3>Recent Stock Movements</h3>
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Type</th>
                        <th className="text-right">Qty</th>
                        <th>Reference</th>
                        <th>Date</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockMovementsTable.rows.map((m, i) => (
                        <tr key={i}>
                          <td>{m.product}</td>
                          <td>
                            <span
                              className={`badge ${m.type === "IN" ? "badge-success" : m.type === "OUT" ? "badge-warning" : "badge-info"}`}
                            >
                              {m.type}
                            </span>
                          </td>
                          <td className="text-right">{m.quantity}</td>
                          <td>{m.reference}</td>
                          <td>{m.date}</td>
                          <td>
                            <span
                              className={`badge ${m.state === "done" ? "badge-success" : m.state === "cancelled" ? "badge-danger" : "badge-secondary"}`}
                            >
                              {m.state}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePagination
                    page={stockMovementsTable.page}
                    pageSize={stockMovementsTable.pageSize}
                    totalItems={stockMovementsTable.totalItems}
                    onPageChange={stockMovementsTable.setPage}
                    onPageSizeChange={stockMovementsTable.setPageSize}
                  />
                </div>
              )}
            </div>
          )}

          {/* ─── Debtors (Unpaid Invoices) ─── */}
          {!loading && activeReport === "debtors" && debtorsReport && (
            <div className="report-content">
              <div className="metrics-row">
                <MetricCard
                  label="Unpaid Invoices"
                  value={String(debtorsReport.unpaid_invoices)}
                />
                <MetricCard
                  label="Total Outstanding"
                  value={formatCurrency(debtorsReport.total_due)}
                />
                <MetricCard
                  label="Partial Invoices"
                  value={String(debtorsReport.partial_invoices)}
                  variant="warning"
                />
                <MetricCard
                  label="Avg Due"
                  value={formatCurrency(debtorsReport.average_due)}
                />
              </div>

              <div className="report-grid">
                <div className="report-card">
                  <h3>Unpaid Invoices</h3>
                  {debtorsReport.recent_unpaid.length === 0 ? (
                    <p className="empty-state">
                      No unpaid invoices in this period.
                    </p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Reference</th>
                            <th>Customer</th>
                            <th className="text-right">Total</th>
                            <th className="text-right">Paid</th>
                            <th className="text-right">Due</th>
                            <th>Date</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {debtorsUnpaidTable.rows.map((inv, i) => (
                            <tr key={i}>
                              <td
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: 12,
                                }}
                              >
                                {inv.reference}
                              </td>
                              <td>{inv.customer}</td>
                              <td className="text-right">
                                {formatCurrency(inv.total)}
                              </td>
                              <td className="text-right">
                                {formatCurrency(inv.paid)}
                              </td>
                              <td className="text-right">
                                {formatCurrency(inv.due)}
                              </td>
                              <td>{inv.date}</td>
                              <td>
                                <span
                                  className={`badge ${inv.status === "paid" || inv.status === "fiscalized" ? "badge-success" : inv.status === "posted" ? "badge-info" : inv.status === "cancelled" ? "badge-danger" : "badge-secondary"}`}
                                >
                                  {inv.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={debtorsUnpaidTable.page}
                        pageSize={debtorsUnpaidTable.pageSize}
                        totalItems={debtorsUnpaidTable.totalItems}
                        onPageChange={debtorsUnpaidTable.setPage}
                        onPageSizeChange={debtorsUnpaidTable.setPageSize}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Creditors (Open Purchase Orders) ─── */}
          {!loading && activeReport === "creditors" && creditorsReport && (
            <div className="report-content">
              <div className="metrics-row">
                <MetricCard
                  label="Open Orders"
                  value={String(creditorsReport.open_orders)}
                />
                <MetricCard
                  label="Total Outstanding"
                  value={formatCurrency(creditorsReport.total_amount)}
                />
                <MetricCard
                  label="Total Orders"
                  value={String(creditorsReport.total_orders)}
                />
              </div>

              <div className="report-grid">
                <div className="report-card">
                  <h3>Unpaid Purchase Orders by Supplier</h3>
                  {creditorsReport.by_supplier.length === 0 ? (
                    <p className="empty-state">
                      No unpaid purchase orders in this period.
                    </p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Supplier</th>
                            <th className="text-right">Orders</th>
                            <th className="text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {creditorsBySupplierTable.rows.map((v, i) => (
                            <tr key={i}>
                              <td>{v.name}</td>
                              <td className="text-right">{v.count}</td>
                              <td className="text-right">
                                {formatCurrency(v.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={creditorsBySupplierTable.page}
                        pageSize={creditorsBySupplierTable.pageSize}
                        totalItems={creditorsBySupplierTable.totalItems}
                        onPageChange={creditorsBySupplierTable.setPage}
                        onPageSizeChange={creditorsBySupplierTable.setPageSize}
                      />
                    </>
                  )}
                </div>

                <div className="report-card">
                  <h3>Recent Unpaid Purchase Orders</h3>
                  {creditorsReport.recent_orders.length === 0 ? (
                    <p className="empty-state">
                      No unpaid purchase orders in this period.
                    </p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Reference</th>
                            <th>Supplier</th>
                            <th className="text-right">Amount</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Paid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {creditorsRecentTable.rows.map((o, i) => (
                            <tr key={i}>
                              <td
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: 12,
                                }}
                              >
                                {o.reference}
                              </td>
                              <td>{o.supplier}</td>
                              <td className="text-right">
                                {formatCurrency(o.amount)}
                              </td>
                              <td>{o.date}</td>
                              <td>
                                <span
                                  className={`badge ${o.status === "received" ? "badge-success" : o.status === "confirmed" ? "badge-info" : o.status === "cancelled" ? "badge-danger" : "badge-secondary"}`}
                                  style={{ textTransform: "capitalize" }}
                                >
                                  {o.status}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`badge ${o.paid_state === "paid" ? "badge-success" : o.paid_state === "partial" ? "badge-warning" : "badge-secondary"}`}
                                  style={{ textTransform: "capitalize" }}
                                >
                                  {o.paid_state}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={creditorsRecentTable.page}
                        pageSize={creditorsRecentTable.pageSize}
                        totalItems={creditorsRecentTable.totalItems}
                        onPageChange={creditorsRecentTable.setPage}
                        onPageSizeChange={creditorsRecentTable.setPageSize}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── VAT Return ─── */}
          {!loading && activeReport === "vat" && vatReport && (
            <div className="report-content">
              {/* Header */}
              <div
                style={{
                  textAlign: "center",
                  marginBottom: 24,
                  paddingBottom: 16,
                  borderBottom: "3px double var(--gray-300)",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 22,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                  }}
                >
                  VAT Return
                </h2>
                <div
                  style={{
                    color: "var(--gray-500)",
                    marginTop: 4,
                    fontSize: 13,
                  }}
                >
                  Tax Period: {vatReport.period_from || dateRange.from} to{" "}
                  {vatReport.period_to || dateRange.to}
                </div>
              </div>

              {/* Summary metrics */}
              <div className="metrics-row">
                <MetricCard
                  label="Sales Total"
                  value={formatCurrency(vatReport.sales_total)}
                />
                <MetricCard
                  label="Sales VAT"
                  value={formatCurrency(vatReport.output_tax)}
                  variant="success"
                />
                <MetricCard
                  label="Purchases Total"
                  value={formatCurrency(vatReport.purchases_total)}
                />
                <MetricCard
                  label="Input VAT"
                  value={formatCurrency(vatReport.input_tax)}
                />
                <MetricCard
                  label={`Net VAT ${vatReport.net_tax >= 0 ? "Payable" : "Refundable"}`}
                  value={formatCurrency(Math.abs(vatReport.net_tax))}
                  variant={vatReport.net_tax >= 0 ? "danger" : "success"}
                />
              </div>

              <div className="tabs-nav" style={{ marginBottom: 20 }}>
                <button
                  className={`tab-btn ${activeVatTab === "sales_vat" ? "active" : ""}`}
                  onClick={() => setActiveVatTab("sales_vat")}
                >
                  Sales VAT
                </button>
                <button
                  className={`tab-btn ${activeVatTab === "purchases_vat" ? "active" : ""}`}
                  onClick={() => setActiveVatTab("purchases_vat")}
                >
                  Purchases VAT
                </button>
                {vatReport.credit_notes_count > 0 && (
                  <button
                    className={`tab-btn ${activeVatTab === "credit_notes" ? "active" : ""}`}
                    onClick={() => setActiveVatTab("credit_notes")}
                  >
                    Credit Notes
                  </button>
                )}
                <button
                  className={`tab-btn ${activeVatTab === "net_vat" ? "active" : ""}`}
                  onClick={() => setActiveVatTab("net_vat")}
                >
                  Net VAT
                </button>
                {/* <button
                  className={`tab-btn ${activeVatTab === "profit_summary" ? "active" : ""}`}
                  onClick={() => setActiveVatTab("profit_summary")}
                >
                  Profit Summary
                </button> */}
              </div>

              {activeVatTab === "sales_vat" && (
                <div className="report-card" style={{ marginBottom: 20 }}>
                  <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        background: "var(--emerald-100)",
                        color: "var(--emerald-700)",
                        borderRadius: 6,
                        padding: "2px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      1
                    </span>
                    Sales VAT
                  </h3>
                  {vatReport.sales_by_rate.length === 0 ? (
                    <p className="empty-state">No sales in this period.</p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>VAT Rate</th>
                            <th className="text-right">Taxable Amount</th>
                            <th className="text-right">VAT Amount</th>
                            <th className="text-right">Total Incl. VAT</th>
                            <th className="text-right">Transactions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vatSalesByRateTable.rows.map((b, i) => (
                            <tr key={i}>
                              <td>
                                <span className="badge badge-success">
                                  {b.rate}%
                                </span>
                              </td>
                              <td className="text-right">
                                {formatCurrency(b.taxable_amount)}
                              </td>
                              <td className="text-right">
                                {formatCurrency(b.tax_amount)}
                              </td>
                              <td className="text-right">
                                {formatCurrency(b.total)}
                              </td>
                              <td className="text-right">{b.count}</td>
                            </tr>
                          ))}
                          <tr
                            style={{
                              fontWeight: 700,
                              borderTop: "2px solid var(--gray-300)",
                            }}
                          >
                            <td>Total Output VAT</td>
                            <td className="text-right">
                              {formatCurrency(
                                vatReport.sales_total - vatReport.output_tax,
                              )}
                            </td>
                            <td
                              className="text-right"
                              style={{ color: "var(--emerald-600)" }}
                            >
                              {formatCurrency(vatReport.output_tax)}
                            </td>
                            <td className="text-right">
                              {formatCurrency(vatReport.sales_total)}
                            </td>
                            <td className="text-right">
                              {vatReport.invoices_count}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <TablePagination
                        page={vatSalesByRateTable.page}
                        pageSize={vatSalesByRateTable.pageSize}
                        totalItems={vatSalesByRateTable.totalItems}
                        onPageChange={vatSalesByRateTable.setPage}
                        onPageSizeChange={vatSalesByRateTable.setPageSize}
                      />
                    </>
                  )}
                </div>
              )}

              {activeVatTab === "purchases_vat" && (
                <div className="report-card" style={{ marginBottom: 20 }}>
                  <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        background: "var(--blue-100)",
                        color: "var(--blue-700)",
                        borderRadius: 6,
                        padding: "2px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      2
                    </span>
                    Purchases VAT
                  </h3>
                  {vatReport.purchases_by_rate.length === 0 ? (
                    <p className="empty-state">No purchases in this period.</p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>VAT Rate</th>
                            <th className="text-right">Taxable Amount</th>
                            <th className="text-right">VAT Amount</th>
                            <th className="text-right">Total Incl. VAT</th>
                            <th className="text-right">Transactions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vatPurchasesByRateTable.rows.map((b, i) => (
                            <tr key={i}>
                              <td>
                                <span className="badge badge-info">
                                  {b.rate}%
                                </span>
                              </td>
                              <td className="text-right">
                                {formatCurrency(b.taxable_amount)}
                              </td>
                              <td className="text-right">
                                {formatCurrency(b.tax_amount)}
                              </td>
                              <td className="text-right">
                                {formatCurrency(b.total)}
                              </td>
                              <td className="text-right">{b.count}</td>
                            </tr>
                          ))}
                          <tr
                            style={{
                              fontWeight: 700,
                              borderTop: "2px solid var(--gray-300)",
                            }}
                          >
                            <td>Total Input VAT</td>
                            <td className="text-right">
                              {formatCurrency(
                                vatReport.purchases_total - vatReport.input_tax,
                              )}
                            </td>
                            <td
                              className="text-right"
                              style={{ color: "var(--blue-600)" }}
                            >
                              {formatCurrency(vatReport.input_tax)}
                            </td>
                            <td className="text-right">
                              {formatCurrency(vatReport.purchases_total)}
                            </td>
                            <td className="text-right">
                              {vatReport.purchases_count}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <TablePagination
                        page={vatPurchasesByRateTable.page}
                        pageSize={vatPurchasesByRateTable.pageSize}
                        totalItems={vatPurchasesByRateTable.totalItems}
                        onPageChange={vatPurchasesByRateTable.setPage}
                        onPageSizeChange={vatPurchasesByRateTable.setPageSize}
                      />
                    </>
                  )}
                </div>
              )}

              {activeVatTab === "credit_notes" &&
                vatReport.credit_notes_count > 0 && (
                  <div className="report-card" style={{ marginBottom: 20 }}>
                    <h3
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          background: "var(--amber-100)",
                          color: "var(--amber-700)",
                          borderRadius: 6,
                          padding: "2px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        3
                      </span>
                      Credit Notes
                    </h3>
                    <table className="report-table" style={{}}>
                      <tbody>
                        <tr>
                          <td>Credit Notes Issued</td>
                          <td className="text-right">
                            {vatReport.credit_notes_count}
                          </td>
                        </tr>
                        <tr>
                          <td>Credit Notes VAT</td>
                          <td className="text-right">
                            {formatCurrency(vatReport.credit_notes_tax)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

              {activeVatTab === "net_vat" && (
                <div
                  className="report-card"
                  style={{
                    marginBottom: 20,
                    border: "2px solid var(--gray-300)",
                  }}
                >
                  <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        background: "var(--violet-100)",
                        color: "var(--violet-700)",
                        borderRadius: 6,
                        padding: "2px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {vatReport.credit_notes_count > 0 ? "4" : "3"}
                    </span>
                    Net VAT Calculation
                  </h3>
                  <table className="report-table" style={{}}>
                    <tbody>
                      <tr>
                        <td>Sales VAT</td>
                        <td className="text-right" style={{ fontWeight: 600 }}>
                          {formatCurrency(vatReport.output_tax)}
                        </td>
                      </tr>
                      <tr>
                        <td>Less: Purchases VAT</td>
                        <td
                          className="text-right"
                          style={{ fontWeight: 600, color: "var(--red-600)" }}
                        >
                          ({formatCurrency(vatReport.input_tax)})
                        </td>
                      </tr>
                      {vatReport.credit_notes_tax > 0 && (
                        <tr>
                          <td>Less: Credit Notes VAT</td>
                          <td
                            className="text-right"
                            style={{ fontWeight: 600, color: "var(--red-600)" }}
                          >
                            ({formatCurrency(vatReport.credit_notes_tax)})
                          </td>
                        </tr>
                      )}
                      <tr
                        style={{
                          borderTop: "3px double var(--gray-400)",
                          fontSize: 16,
                          fontWeight: 700,
                        }}
                      >
                        <td>
                          Net VAT{" "}
                          {vatReport.net_tax >= 0 ? "Payable" : "Refundable"}
                        </td>
                        <td
                          className="text-right"
                          style={{
                            color:
                              vatReport.net_tax >= 0
                                ? "var(--red-600)"
                                : "var(--emerald-600)",
                          }}
                        >
                          {formatCurrency(Math.abs(vatReport.net_tax))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div
                    style={{
                      marginTop: 16,
                      padding: "10px 14px",
                      borderRadius: 8,
                      fontSize: 12,
                      background:
                        vatReport.net_tax >= 0
                          ? "var(--red-50, #fef2f2)"
                          : "var(--emerald-50, #ecfdf5)",
                      color:
                        vatReport.net_tax >= 0
                          ? "var(--red-700, #b91c1c)"
                          : "var(--emerald-700, #047857)",
                    }}
                  >
                    {vatReport.net_tax >= 0
                      ? `Amount payable to the tax authority: ${formatCurrency(vatReport.net_tax)}`
                      : `You are entitled to a VAT refund of ${formatCurrency(Math.abs(vatReport.net_tax))} for this period.`}
                  </div>
                </div>
              )}

              {activeVatTab === "profit_summary" && (
                <div className="report-card">
                  <h3>Profit Summary</h3>
                  <table className="report-table" style={{}}>
                    <tbody>
                      <tr>
                        <td>Sales (excl. VAT)</td>
                        <td className="text-right">
                          {formatCurrency(
                            vatReport.sales_total - vatReport.output_tax,
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td>Purchases (excl. VAT)</td>
                        <td className="text-right">
                          {formatCurrency(
                            vatReport.purchases_total - vatReport.input_tax,
                          )}
                        </td>
                      </tr>
                      <tr
                        style={{
                          fontWeight: 700,
                          borderTop: "2px solid var(--gray-300)",
                        }}
                      >
                        <td>Gross Profit</td>
                        <td
                          className="text-right"
                          style={{
                            color:
                              vatReport.profit >= 0
                                ? "var(--emerald-600)"
                                : "var(--red-600)",
                          }}
                        >
                          {formatCurrency(vatReport.profit)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── Purchase Report ─── */}
          {!loading && activeReport === "purchases" && purchaseReport && (
            <div className="report-content">
              <div className="metrics-row">
                <MetricCard
                  label="Total Orders"
                  value={String(purchaseReport.total_orders)}
                />
                <MetricCard
                  label="Total Amount"
                  value={formatCurrency(purchaseReport.total_amount)}
                />
                <MetricCard
                  label="Total Tax"
                  value={formatCurrency(purchaseReport.total_tax)}
                />
                <MetricCard
                  label="Avg Order"
                  value={formatCurrency(purchaseReport.average_order)}
                />
              </div>

              <div className="report-grid">
                {/* By Supplier */}
                <div className="report-card">
                  <h3>Purchases by Supplier</h3>
                  {purchaseReport.by_supplier.length === 0 ? (
                    <p className="empty-state">No purchases in this period.</p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Supplier</th>
                            <th className="text-right">Orders</th>
                            <th className="text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchasesBySupplierTable.rows.map((v, i) => (
                            <tr key={i}>
                              <td>{v.name}</td>
                              <td className="text-right">{v.count}</td>
                              <td className="text-right">
                                {formatCurrency(v.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={purchasesBySupplierTable.page}
                        pageSize={purchasesBySupplierTable.pageSize}
                        totalItems={purchasesBySupplierTable.totalItems}
                        onPageChange={purchasesBySupplierTable.setPage}
                        onPageSizeChange={purchasesBySupplierTable.setPageSize}
                      />
                      {/* Bar chart for suppliers */}
                      <div style={{ marginTop: 16 }}>
                        {purchaseReport.by_supplier.slice(0, 8).map((v, i) => {
                          const maxAmt = Math.max(
                            ...purchaseReport.by_supplier.map((x) => x.amount),
                            1,
                          );
                          const pct = (v.amount / maxAmt) * 100;
                          return (
                            <div key={i} style={{ marginBottom: 8 }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontSize: 12,
                                  marginBottom: 3,
                                }}
                              >
                                <span>{v.name}</span>
                                <span style={{ fontWeight: 600 }}>
                                  {formatCurrency(v.amount)}
                                </span>
                              </div>
                              <div
                                style={{
                                  height: 8,
                                  background: "var(--gray-100)",
                                  borderRadius: 4,
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: "100%",
                                    background: "var(--rose-500)",
                                    borderRadius: 4,
                                    transition: "width 0.5s",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* By Status */}
                <div className="report-card">
                  <h3>By Status</h3>
                  {purchaseReport.by_status.length === 0 ? (
                    <p className="empty-state">No data.</p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Status</th>
                            <th className="text-right">Count</th>
                            <th className="text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchasesByStatusTable.rows.map((s, i) => (
                            <tr key={i}>
                              <td>
                                <span
                                  className={`badge ${s.status === "received" ? "badge-success" : s.status === "draft" ? "badge-secondary" : s.status === "cancelled" ? "badge-danger" : "badge-info"}`}
                                  style={{ textTransform: "capitalize" }}
                                >
                                  {s.status}
                                </span>
                              </td>
                              <td className="text-right">{s.count}</td>
                              <td className="text-right">
                                {formatCurrency(s.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={purchasesByStatusTable.page}
                        pageSize={purchasesByStatusTable.pageSize}
                        totalItems={purchasesByStatusTable.totalItems}
                        onPageChange={purchasesByStatusTable.setPage}
                        onPageSizeChange={purchasesByStatusTable.setPageSize}
                      />
                    </>
                  )}

                  <h3 style={{ marginTop: 24 }}>Monthly Trend</h3>
                  {purchaseReport.by_month.length === 0 ? (
                    <p className="empty-state">No data.</p>
                  ) : (
                    <div className="bar-chart">
                      {(() => {
                        const maxAmt = Math.max(
                          ...purchaseReport.by_month.map((m) => m.amount),
                          1,
                        );
                        return purchaseReport.by_month.map((m, i) => (
                          <div key={i} className="bar-item">
                            <div className="bar-fill-wrap">
                              <div
                                className="bar-fill"
                                style={{
                                  height: `${(m.amount / maxAmt) * 100}%`,
                                  background: "var(--rose-500)",
                                }}
                              />
                            </div>
                            <div className="bar-label">{m.month}</div>
                            <div className="bar-value">
                              {formatCurrency(m.amount)}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Orders */}
              <div className="report-card" style={{ marginTop: 20 }}>
                <h3>Recent Purchase Orders</h3>
                {purchaseReport.recent_orders.length === 0 ? (
                  <p className="empty-state">
                    No purchase orders in this period.
                  </p>
                ) : (
                  <>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Supplier</th>
                          <th className="text-right">Amount</th>
                          <th>Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchasesRecentTable.rows.map((o, i) => (
                          <tr key={i}>
                            <td
                              style={{ fontFamily: "monospace", fontSize: 12 }}
                            >
                              {o.reference}
                            </td>
                            <td>{o.supplier}</td>
                            <td className="text-right">
                              {formatCurrency(o.amount)}
                            </td>
                            <td>{o.date}</td>
                            <td>
                              <span
                                className={`badge ${o.status === "received" ? "badge-success" : o.status === "draft" ? "badge-secondary" : o.status === "cancelled" ? "badge-danger" : "badge-info"}`}
                                style={{ textTransform: "capitalize" }}
                              >
                                {o.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <TablePagination
                      page={purchasesRecentTable.page}
                      pageSize={purchasesRecentTable.pageSize}
                      totalItems={purchasesRecentTable.totalItems}
                      onPageChange={purchasesRecentTable.setPage}
                      onPageSizeChange={purchasesRecentTable.setPageSize}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ─── Point Orders Report ─── */}
          {!loading && activeReport === "pos_orders" && posOrdersReport && (
            <div className="report-content">
              <div className="metrics-row">
                <MetricCard
                  label="Total Orders"
                  value={String(posOrdersReport.total_orders)}
                />
                <MetricCard
                  label="Fiscalized"
                  value={String(posOrdersReport.fiscalized_orders)}
                />
                <MetricCard
                  label="Refunded"
                  value={String(posOrdersReport.refunded_orders)}
                />
                <MetricCard
                  label="Currencies"
                  value={String(posOrdersReport.by_currency.length)}
                />
              </div>

              <div className="report-grid">
                <div className="report-card">
                  <h3>Sales by Currency</h3>
                  {posOrdersReport.by_currency.length === 0 ? (
                    <p className="empty-state">No POS orders in this period.</p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Currency</th>
                            <th className="text-right">Orders</th>
                            <th className="text-right">Total Sales</th>
                            <th className="text-right">Cash</th>
                            <th className="text-right">Card</th>
                            <th className="text-right">Mobile</th>
                          </tr>
                        </thead>
                        <tbody>
                          {posOrdersByCurrencyTable.rows.map((entry) => (
                            <tr key={entry.currency}>
                              <td>{entry.currency}</td>
                              <td className="text-right">{entry.count}</td>
                              <td className="text-right">
                                {entry.currency} {entry.total.toFixed(2)}
                              </td>
                              <td className="text-right">
                                {entry.currency} {entry.cash.toFixed(2)}
                              </td>
                              <td className="text-right">
                                {entry.currency} {entry.card.toFixed(2)}
                              </td>
                              <td className="text-right">
                                {entry.currency} {entry.mobile.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={posOrdersByCurrencyTable.page}
                        pageSize={posOrdersByCurrencyTable.pageSize}
                        totalItems={posOrdersByCurrencyTable.totalItems}
                        onPageChange={posOrdersByCurrencyTable.setPage}
                        onPageSizeChange={posOrdersByCurrencyTable.setPageSize}
                      />
                    </>
                  )}
                </div>

                <div className="report-card">
                  <h3>Orders by Status</h3>
                  {posOrdersReport.by_status.length === 0 ? (
                    <p className="empty-state">No status data.</p>
                  ) : (
                    <>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Status</th>
                            <th className="text-right">Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {posOrdersByStatusTable.rows.map((entry) => (
                            <tr key={entry.status}>
                              <td>
                                <span
                                  className={`badge ${entry.status === "fiscalized" ? "badge-success" : entry.status === "refunded" ? "badge-danger" : entry.status === "paid" ? "badge-info" : "badge-secondary"}`}
                                  style={{ textTransform: "capitalize" }}
                                >
                                  {entry.status}
                                </span>
                              </td>
                              <td className="text-right">{entry.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <TablePagination
                        page={posOrdersByStatusTable.page}
                        pageSize={posOrdersByStatusTable.pageSize}
                        totalItems={posOrdersByStatusTable.totalItems}
                        onPageChange={posOrdersByStatusTable.setPage}
                        onPageSizeChange={posOrdersByStatusTable.setPageSize}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="report-card" style={{ marginTop: 20 }}>
                <h3>Recent POS Orders</h3>
                {posOrdersReport.recent_orders.length === 0 ? (
                  <p className="empty-state">No POS orders in this period.</p>
                ) : (
                  <>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Date</th>
                          <th>Cashier</th>
                          <th>Till</th>
                          <th>Status</th>
                          <th>Currency</th>
                          <th className="text-right">Total</th>
                          <th className="text-right">Cash</th>
                          <th className="text-right">Card</th>
                          <th className="text-right">Mobile</th>
                          <th>Fiscalized</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posOrdersRecentTable.rows.map((order) => (
                          <tr key={order.reference + order.date}>
                            <td
                              style={{ fontFamily: "monospace", fontSize: 12 }}
                            >
                              {order.reference}
                            </td>
                            <td>{order.date}</td>
                            <td>{order.cashier}</td>
                            <td>{order.till}</td>
                            <td>
                              <span
                                className={`badge ${order.status === "fiscalized" ? "badge-success" : order.status === "refunded" ? "badge-danger" : order.status === "paid" ? "badge-info" : "badge-secondary"}`}
                                style={{ textTransform: "capitalize" }}
                              >
                                {order.status}
                              </span>
                            </td>
                            <td>{order.currency}</td>
                            <td
                              className={`text-right ${order.total < 0 ? "report-negative-value" : ""}`}
                            >
                              {order.currency} {order.total.toFixed(2)}
                            </td>
                            <td
                              className={`text-right ${order.cash < 0 ? "report-negative-value" : ""}`}
                            >
                              {order.currency} {order.cash.toFixed(2)}
                            </td>
                            <td
                              className={`text-right ${order.card < 0 ? "report-negative-value" : ""}`}
                            >
                              {order.currency} {order.card.toFixed(2)}
                            </td>
                            <td
                              className={`text-right ${order.mobile < 0 ? "report-negative-value" : ""}`}
                            >
                              {order.currency} {order.mobile.toFixed(2)}
                            </td>
                            <td>{order.fiscalized ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <TablePagination
                      page={posOrdersRecentTable.page}
                      pageSize={posOrdersRecentTable.pageSize}
                      totalItems={posOrdersRecentTable.totalItems}
                      onPageChange={posOrdersRecentTable.setPage}
                      onPageSizeChange={posOrdersRecentTable.setPageSize}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Empty state when no data */}
          {!loading &&
            !error &&
            ((activeReport === "sales" && !salesReport) ||
              (activeReport === "income_statement" && !incomeStatementReport) ||
              (activeReport === "profit_loss_journal" &&
                !profitLossJournalReport) ||
              (activeReport === "qpd" && !qpdReport) ||
              (activeReport === "stock" && !stockReport) ||
              (activeReport === "debtors" && !debtorsReport) ||
              (activeReport === "creditors" && !creditorsReport) ||
              (activeReport === "vat" && !vatReport) ||
              (activeReport === "purchases" && !purchaseReport) ||
              (activeReport === "pos_orders" && !posOrdersReport)) && (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  color: "var(--gray-500)",
                }}
              >
                <p>
                  Select a date range and click <strong>Refresh</strong> to load
                  report data.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────── */

function MetricCard({
  label,
  value,
  variant,
  onArrowClick,
  arrowLabel,
}: {
  label: string;
  value: string;
  variant?: string;
  onArrowClick?: () => void;
  arrowLabel?: string;
}) {
  return (
    <div className={`metric-card ${variant || ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-label-row">
        <div className="metric-value">{value}</div>
        {onArrowClick && (
          <button
            type="button"
            className="metric-card-arrow"
            aria-label={arrowLabel || `Open ${label}`}
            onClick={onArrowClick}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────── */

function SalesIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function StockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function PaymentIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function VatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 2v20" />
      <path d="M5 6h10a4 4 0 1 1 0 8H9a4 4 0 0 0 0 8h10" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
