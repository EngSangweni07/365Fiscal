import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CarFront,
  CircleHelp,
  Clapperboard,
  Download,
  FileText,
  Filter,
  LayoutGrid,
  PenLine,
  PieChart,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { apiFetch, apiRequest } from "../api";
import { Sidebar } from "../components/Sidebar";
import type { SidebarSection } from "../types/sidebar";
import { useMe } from "../hooks/useMe";
import { useCompanies, Company } from "../hooks/useCompanies";
import { useAlert } from "../context/AlertContext";
import ValidationAlert from "../components/ValidationAlert";
import ValidatedField from "../components/ValidatedField";
import "./ExpensesPage.css";

import {
  getMissingRequiredFields,
  getRequiredFieldError,
} from "../utils/formValidation";

type Contact = {
  id: number;
  name: string;
};

type ExpenseCategory = {
  id: number;
  company_id: number;
  name: string;
};

type Expense = {
  id: number;
  company_id: number;
  supplier_id: number | null;
  reference: string;
  expense_date: string;
  description: string;
  category: string;
  subtotal: number;
  vat_rate: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type MainView = "expenses" | "suppliers" | "categories";
type DateFilter = "this_month" | "last_month" | "this_year" | "all_time";

type CategoryVisual = {
  icon: LucideIcon;
  key: string;
  color: string;
};

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  food: { icon: UtensilsCrossed, key: "food", color: "#4B82F0" },
  transport: { icon: CarFront, key: "transport", color: "#F35B32" },
  shopping: { icon: ShoppingBag, key: "shopping", color: "#7C56D8" },
  bills: { icon: ReceiptText, key: "bills", color: "#2AAE59" },
  entertainment: { icon: Clapperboard, key: "entertainment", color: "#F3A11C" },
  other: { icon: CircleHelp, key: "other", color: "#A5ACC8" },
};

const QUICK_ADD_CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Other",
] as const;

const normalizeCategoryKey = (name: string): keyof typeof CATEGORY_VISUALS => {
  const value = (name || "").trim().toLowerCase();
  if (!value) return "other";
  if (value.includes("food")) return "food";
  if (
    value.includes("transport") ||
    value.includes("uber") ||
    value.includes("taxi")
  ) {
    return "transport";
  }
  if (value.includes("shop")) return "shopping";
  if (value.includes("bill") || value.includes("utility")) return "bills";
  if (
    value.includes("entertainment") ||
    value.includes("movie") ||
    value.includes("music")
  ) {
    return "entertainment";
  }
  return "other";
};

const toDateInputValue = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

const fromDateInputValue = (value: string) =>
  value ? new Date(value).toISOString() : null;

const formatCurrency = (value: number, currency: string = "USD") => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(2)}`;
  }
};

type ExpensesMenuItem = {
  key: MainView;
  label: string;
  icon: LucideIcon;
  color: string;
  background: string;
};

const EXPENSES_MENU_ITEMS: ExpensesMenuItem[] = [
  {
    key: "expenses",
    label: "EXPENSES",
    icon: ReceiptText,
    color: "var(--blue-600)",
    background: "rgba(37, 99, 235, 0.12)",
  },
  {
    key: "suppliers",
    label: "SUPPLIERS",
    icon: Users,
    color: "var(--green-600)",
    background: "rgba(5, 150, 105, 0.15)",
  },
  {
    key: "categories",
    label: "CATEGORIES",
    icon: LayoutGrid,
    color: "var(--teal-600)",
    background: "rgba(6, 182, 212, 0.15)",
  },
];

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ SVG Icon helpers (matching Inventory) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
const EditIcon = () => (
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
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);
const TrashIcon = () => (
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
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export default function ExpensesPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { companies: allCompanies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);
  const { showConfirm } = useAlert();

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Company selection (admin) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    null,
  );
  const [companyQuery, setCompanyQuery] = useState("");
  const companyId = selectedCompanyId;

  useEffect(() => {
    if (!isAdmin && me?.company_ids?.length && !selectedCompanyId) {
      setSelectedCompanyId(me.company_ids[0]);
    }
  }, [isAdmin, me?.company_ids, selectedCompanyId]);

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

  const company: Company | null =
    allCompanies.find((c) => c.id === selectedCompanyId) ?? null;

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Data state ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ View state (like Inventory mainView) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const [mainView, setMainView] = useState<MainView>("expenses");
  const [subView, setSubView] = useState<"list" | "form">("list");

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ List filters ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("this_month");
  const [searchQuery, setSearchQuery] = useState("");
  const [expenseFilterMenuOpen, setExpenseFilterMenuOpen] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickCategory, setQuickCategory] = useState<string>("Food");
  const [quickAmount, setQuickAmount] = useState<string>("");
  const [quickDate, setQuickDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [quickNotes, setQuickNotes] = useState<string>("");

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Expense form ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(
    null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Category modal ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(
    null,
  );
  const [categoryFormName, setCategoryFormName] = useState("");
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsPageSize, setTransactionsPageSize] = useState(8);
  const expenseFilterMenuRef = useRef<HTMLDivElement | null>(null);

  const quickCategoryOptions = useMemo(() => {
    const dynamicCategories = categories
      .map((category) => category.name.trim())
      .filter(Boolean);
    return Array.from(new Set([...dynamicCategories, ...QUICK_ADD_CATEGORIES]));
  }, [categories]);

  const emptyForm = useMemo(
    () => ({
      reference: "",
      expense_date: "",
      supplier_id: "" as number | "",
      category: "",
      description: "",
      subtotal: 0,
      vat_rate: 0,
      currency: "USD",
      status: "posted",
      notes: "",
    }),
    [],
  );

  const [form, setForm] = useState(emptyForm);

  const calc = useMemo(() => {
    const subtotal = Number(form.subtotal) || 0;
    const rate = Number(form.vat_rate) || 0;
    const tax = subtotal * (rate / 100);
    return { tax, total: subtotal + tax };
  }, [form.subtotal, form.vat_rate]);

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Data loading ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const loadData = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [contactsData, expensesData, categoriesData] = await Promise.all([
        apiFetch<Contact[]>(`/contacts?company_id=${companyId}`).catch(
          () => [] as Contact[],
        ),
        apiFetch<Expense[]>(`/expenses?company_id=${companyId}`).catch(
          () => [] as Expense[],
        ),
        apiFetch<ExpenseCategory[]>(
          `/expense-categories?company_id=${companyId}`,
        ).catch(() => [] as ExpenseCategory[]),
      ]);
      setContacts(contactsData);
      setExpenses(expensesData);
      setCategories(categoriesData);
    } catch (err: any) {
      setError(err.message || "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Filtering ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (supplierFilter !== "" && e.supplier_id !== supplierFilter)
        return false;
      if (statusFilter && (e.status || "") !== statusFilter) return false;
      if (categoryFilter && (e.category || "") !== categoryFilter) return false;
      if (!term) return true;
      const supplier =
        contacts.find((c) => c.id === e.supplier_id)?.name?.toLowerCase() || "";
      return (
        (e.reference || "").toLowerCase().includes(term) ||
        (e.description || "").toLowerCase().includes(term) ||
        (e.category || "").toLowerCase().includes(term) ||
        supplier.includes(term)
      );
    });
  }, [
    expenses,
    search,
    supplierFilter,
    statusFilter,
    categoryFilter,
    contacts,
  ]);

  const dateFilteredExpenses = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const previousYear = previousMonthDate.getFullYear();
    const previousMonth = previousMonthDate.getMonth();

    return filteredExpenses.filter((expense) => {
      if (!expense.expense_date) return false;
      const date = new Date(expense.expense_date);
      if (Number.isNaN(date.getTime())) return false;

      if (dateFilter === "all_time") return true;
      if (dateFilter === "this_year") return date.getFullYear() === currentYear;
      if (dateFilter === "last_month") {
        return (
          date.getFullYear() === previousYear &&
          date.getMonth() === previousMonth
        );
      }
      return (
        date.getFullYear() === currentYear && date.getMonth() === currentMonth
      );
    });
  }, [filteredExpenses, dateFilter]);

  const totalExpense = useMemo(
    () =>
      dateFilteredExpenses.reduce(
        (sum, expense) => sum + (expense.total_amount || 0),
        0,
      ),
    [dateFilteredExpenses],
  );

  const currentMonthTotal = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return filteredExpenses.reduce((sum, expense) => {
      if (!expense.expense_date) return sum;
      const date = new Date(expense.expense_date);
      if (Number.isNaN(date.getTime())) return sum;
      if (date.getFullYear() !== year || date.getMonth() !== month) return sum;
      return sum + (expense.total_amount || 0);
    }, 0);
  }, [filteredExpenses]);

  const previousMonthTotal = useMemo(() => {
    const now = new Date();
    const previousMonthDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );
    const year = previousMonthDate.getFullYear();
    const month = previousMonthDate.getMonth();
    return filteredExpenses.reduce((sum, expense) => {
      if (!expense.expense_date) return sum;
      const date = new Date(expense.expense_date);
      if (Number.isNaN(date.getTime())) return sum;
      if (date.getFullYear() !== year || date.getMonth() !== month) return sum;
      return sum + (expense.total_amount || 0);
    }, 0);
  }, [filteredExpenses]);

  const monthlyBudget = useMemo(() => {
    const baseline = Math.max(
      currentMonthTotal,
      previousMonthTotal,
      totalExpense,
      1,
    );
    return Math.max(500, Math.ceil((baseline * 1.6) / 250) * 250);
  }, [currentMonthTotal, previousMonthTotal, totalExpense]);

  const budgetUsedPercent =
    monthlyBudget > 0
      ? Math.min((currentMonthTotal / monthlyBudget) * 100, 100)
      : 0;
  const remainingBalance = Math.max(monthlyBudget - currentMonthTotal, 0);
  const isOnTrack = currentMonthTotal <= monthlyBudget;
  const monthChangePercent =
    previousMonthTotal > 0
      ? ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100
      : currentMonthTotal > 0
        ? 100
        : 0;

  const categoryBreakdown = useMemo(() => {
    const total = dateFilteredExpenses.reduce(
      (sum, expense) => sum + (expense.total_amount || 0),
      0,
    );
    const grouped = new Map<string, number>();
    dateFilteredExpenses.forEach((expense) => {
      const category = (expense.category || "Other").trim() || "Other";
      grouped.set(
        category,
        (grouped.get(category) || 0) + (expense.total_amount || 0),
      );
    });

    const rows = Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => {
        const visual = CATEGORY_VISUALS[normalizeCategoryKey(name)];
        const percent = total > 0 ? Math.round((amount / total) * 100) : 0;
        return {
          name,
          amount,
          percent,
          color: visual.color,
          icon: visual.icon,
        };
      });

    if (rows.length === 0) {
      const fallbackVisual = CATEGORY_VISUALS.food;
      return [
        {
          name: "No Data",
          amount: 0,
          percent: 0,
          color: fallbackVisual.color,
          icon: fallbackVisual.icon,
        },
      ];
    }
    return rows;
  }, [dateFilteredExpenses]);

  const donutGradient = useMemo(() => {
    if (categoryBreakdown.length === 1 && categoryBreakdown[0].amount === 0) {
      return "#E1E5F4";
    }
    let cursor = 0;
    const steps = categoryBreakdown
      .map((item) => {
        const start = cursor;
        cursor += item.percent;
        return `${item.color} ${start}% ${cursor}%`;
      })
      .join(", ");
    return `conic-gradient(${steps})`;
  }, [categoryBreakdown]);

  const weeklyTrend = useMemo(() => {
    const totals = [0, 0, 0, 0];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    dateFilteredExpenses.forEach((expense) => {
      if (!expense.expense_date) return;
      const date = new Date(expense.expense_date);
      if (Number.isNaN(date.getTime())) return;
      if (dateFilter === "this_month") {
        if (date.getMonth() !== thisMonth || date.getFullYear() !== thisYear)
          return;
      }
      const weekIndex = Math.min(
        3,
        Math.max(0, Math.floor((date.getDate() - 1) / 7)),
      );
      totals[weekIndex] += expense.total_amount || 0;
    });

    return totals.map((amount, index) => ({
      label: `Week ${index + 1}`,
      amount,
    }));
  }, [dateFilteredExpenses, dateFilter]);

  const maxWeeklyAmount = Math.max(...weeklyTrend.map((row) => row.amount), 1);

  const recentTransactions = useMemo(
    () =>
      [...dateFilteredExpenses]
        .sort((a, b) => {
          const left = a.expense_date ? new Date(a.expense_date).getTime() : 0;
          const right = b.expense_date ? new Date(b.expense_date).getTime() : 0;
          return right - left;
        })
        .slice(0, 6),
    [dateFilteredExpenses],
  );

  const sortedTransactions = useMemo(
    () =>
      [...dateFilteredExpenses].sort((a, b) => {
        const left = a.expense_date ? new Date(a.expense_date).getTime() : 0;
        const right = b.expense_date ? new Date(b.expense_date).getTime() : 0;
        return right - left;
      }),
    [dateFilteredExpenses],
  );

  const resetMainView = (view: MainView) => {
    setMainView(view);
    setSubView("list");
    setSearchQuery("");
    setSearch("");
    setSupplierFilter("");
    setCategoryFilter("");
    setStatusFilter("");
    setSelectedExpenseId(null);
    setIsNew(false);
    setIsEditing(false);
  };

  const expensesSidebarSections = useMemo<SidebarSection[]>(() => {
    const items = EXPENSES_MENU_ITEMS.map((item) => {
      const Icon = item.icon;
      return {
        id: `menu-${item.key}`,
        label: item.label,
        icon: (
          <Icon
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            color={item.color}
          />
        ),
        isActive: mainView === item.key,
        onClick: () => resetMainView(item.key),
        iconColor: item.color,
        iconBackground: item.background,
      };
    });

    return [
      {
        id: "expenses-menu",
        title: "MENU",
        items,
      },
    ];
  }, [mainView]);

  const transactionTotalPages = Math.max(
    1,
    Math.ceil(sortedTransactions.length / transactionsPageSize),
  );

  const pagedTransactions = useMemo(() => {
    const start = (transactionsPage - 1) * transactionsPageSize;
    return sortedTransactions.slice(start, start + transactionsPageSize);
  }, [sortedTransactions, transactionsPage, transactionsPageSize]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    supplierFilter !== "" ||
    statusFilter !== "" ||
    categoryFilter !== "" ||
    dateFilter !== "this_month";

  useEffect(() => {
    setTransactionsPage(1);
  }, [
    search,
    supplierFilter,
    statusFilter,
    categoryFilter,
    dateFilter,
    companyId,
    transactionsPageSize,
  ]);

  useEffect(() => {
    setTransactionsPage((prev) => Math.min(prev, transactionTotalPages));
  }, [transactionTotalPages]);

  useEffect(() => {
    if (mainView !== "expenses" || subView !== "list") return;
    setStatusFilter("");
    setSupplierFilter("");
    setSearch("");
  }, [mainView, subView]);

  useEffect(() => {
    if (!expenseFilterMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        expenseFilterMenuRef.current &&
        !expenseFilterMenuRef.current.contains(event.target as Node)
      ) {
        setExpenseFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [expenseFilterMenuOpen]);

  useEffect(() => {
    if (!(mainView === "expenses" && subView === "list")) {
      setExpenseFilterMenuOpen(false);
    }
  }, [mainView, subView]);

  const handleTransactionsPageSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const numeric = Number(event.target.value);
    if (!Number.isFinite(numeric)) return;
    const next = Math.max(1, Math.floor(numeric));
    if (next === transactionsPageSize) return;
    setTransactionsPageSize(next);
  };

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = contacts.map((contact) => {
      const supplierExpenses = expenses.filter(
        (e) => e.supplier_id === contact.id,
      );
      return {
        id: contact.id,
        name: contact.name,
        expenseCount: supplierExpenses.length,
        subtotal: supplierExpenses.reduce(
          (sum, e) => sum + (e.subtotal || 0),
          0,
        ),
        tax: supplierExpenses.reduce((sum, e) => sum + (e.tax_amount || 0), 0),
        total: supplierExpenses.reduce(
          (sum, e) => sum + (e.total_amount || 0),
          0,
        ),
      };
    });
    if (!q) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(q));
  }, [contacts, expenses, searchQuery]);

  const categoryExpenseCount = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => {
      const cat = e.category || "";
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    return map;
  }, [expenses]);

  const dashboardCategoryBreakdown = useMemo(() => {
    const totals = new Map<
      string,
      { amount: number; count: number; color: string; icon: LucideIcon }
    >();

    filteredExpenses.forEach((expense) => {
      const categoryName = expense.category || "Other";
      const visual = CATEGORY_VISUALS[normalizeCategoryKey(categoryName)];
      const existing = totals.get(categoryName);
      if (existing) {
        existing.amount += expense.total_amount || 0;
        existing.count += 1;
        return;
      }
      totals.set(categoryName, {
        amount: expense.total_amount || 0,
        count: 1,
        color: visual.color,
        icon: visual.icon,
      });
    });

    const totalAmount = Array.from(totals.values()).reduce(
      (sum, entry) => sum + entry.amount,
      0,
    );

    return Array.from(totals.entries())
      .map(([name, value]) => ({
        name,
        amount: value.amount,
        count: value.count,
        color: value.color,
        icon: value.icon,
        percent: totalAmount > 0 ? (value.amount / totalAmount) * 100 : 0,
      }))
      .sort((left, right) => right.amount - left.amount);
  }, [filteredExpenses]);

  const dashboardDonutGradient = useMemo(() => {
    if (dashboardCategoryBreakdown.length === 0) {
      return "conic-gradient(#dfe4f2 0deg 360deg)";
    }

    let progress = 0;
    const stops = dashboardCategoryBreakdown.map((entry) => {
      const start = progress;
      const end = progress + (entry.percent / 100) * 360;
      progress = end;
      return `${entry.color} ${start}deg ${end}deg`;
    });

    if (progress < 360) {
      stops.push(`#dfe4f2 ${progress}deg 360deg`);
    }

    return `conic-gradient(${stops.join(", ")})`;
  }, [dashboardCategoryBreakdown]);

  const dashboardMonthlyTrend = useMemo(() => {
    const now = new Date();
    const points = Array.from({ length: 4 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (3 - index), 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString(undefined, { month: "short" }),
        amount: 0,
      };
    });

    filteredExpenses.forEach((expense) => {
      if (!expense.expense_date) return;
      const date = new Date(expense.expense_date);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const target = points.find((point) => point.key === key);
      if (target) {
        target.amount += expense.total_amount || 0;
      }
    });

    const maxAmount = Math.max(...points.map((point) => point.amount), 1);
    return points.map((point) => ({
      ...point,
      height: Math.max(12, (point.amount / maxAmount) * 100),
    }));
  }, [filteredExpenses]);

  const dashboardStats = useMemo(() => {
    const total = dateFilteredExpenses.reduce(
      (sum, expense) => sum + (expense.total_amount || 0),
      0,
    );
    const postedCount = dateFilteredExpenses.filter(
      (expense) => expense.status === "posted" || expense.status === "paid",
    ).length;
    const draftCount = dateFilteredExpenses.filter(
      (expense) => expense.status === "draft",
    ).length;
    const topCategory = dashboardCategoryBreakdown[0] ?? null;

    return {
      total,
      postedCount,
      draftCount,
      topCategory,
    };
  }, [dateFilteredExpenses, dashboardCategoryBreakdown]);

  const selectedExpense = useMemo(
    () => expenses.find((e) => e.id === selectedExpenseId) ?? null,
    [expenses, selectedExpenseId],
  );

  useEffect(() => {
    if (
      selectedExpenseId &&
      !expenses.some((e) => e.id === selectedExpenseId)
    ) {
      setSelectedExpenseId(null);
      setIsEditing(false);
      setSubView("list");
    }
  }, [expenses, selectedExpenseId]);

  useEffect(() => {
    if (!selectedExpense) {
      setForm(emptyForm);
      setIsEditing(false);
      return;
    }
    setForm({
      reference: selectedExpense.reference,
      expense_date: toDateInputValue(selectedExpense.expense_date),
      supplier_id: selectedExpense.supplier_id ?? "",
      category: selectedExpense.category || "",
      description: selectedExpense.description || "",
      subtotal: selectedExpense.subtotal || 0,
      vat_rate: selectedExpense.vat_rate || 0,
      currency: selectedExpense.currency || "USD",
      status: selectedExpense.status || "posted",
      notes: selectedExpense.notes || "",
    });
    setIsEditing(false);
  }, [selectedExpense, emptyForm]);

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Expense CRUD ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const startNew = () => {
    setSelectedExpenseId(null);
    setForm({
      ...emptyForm,
      expense_date: new Date().toISOString().split("T")[0],
      currency: "USD",
      status: "posted",
    });
    setIsNew(true);
    setIsEditing(true);
    setSubView("form");
    setInvalidFields([]);
  };

  const openExpense = (id: number) => {
    setSelectedExpenseId(id);
    setIsNew(false);
    setIsEditing(false);
    setSubView("form");
    setInvalidFields([]);
  };

  const goBack = () => {
    setSubView("list");
    setSelectedExpenseId(null);
    setIsNew(false);
    setIsEditing(false);
    setForm(emptyForm);
    setInvalidFields([]);
  };

  const clearInvalidField = (key: string, value: unknown) => {
    if (!invalidFields.includes(key)) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    setInvalidFields((prev) => prev.filter((field) => field !== key));
  };

  const validateExpenseRequiredFields = (): boolean => {
    const requiredFields = [
      { key: "expense_date", label: "Expense date", value: form.expense_date },
      { key: "category", label: "Category", value: form.category },
      { key: "description", label: "Description", value: form.description },
      { key: "currency", label: "Currency", value: form.currency },
      { key: "status", label: "Status", value: form.status },
    ];
    const missingFields = getMissingRequiredFields(requiredFields);
    if (missingFields.length) {
      const message = getRequiredFieldError(requiredFields);
      if (message) {
        setError(message);
      }
      setInvalidFields(missingFields.map((field) => field.key));
      return false;
    }
    setInvalidFields([]);
    setError(null);
    return true;
  };

  const saveExpense = async () => {
    if (!companyId) return;
    if (!validateExpenseRequiredFields()) return;
    if (Number(form.subtotal) <= 0) {
      setError("Subtotal must be greater than 0.");
      return;
    }
    if (Number(form.vat_rate) < 0) {
      setError("VAT rate cannot be negative.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        supplier_id: form.supplier_id === "" ? null : form.supplier_id,
        reference: form.reference.trim() || null,
        expense_date: form.expense_date
          ? fromDateInputValue(form.expense_date)
          : null,
        category: form.category,
        description: form.description,
        subtotal: Number(form.subtotal) || 0,
        vat_rate: Number(form.vat_rate) || 0,
        currency: form.currency,
        status: form.status,
        notes: form.notes,
      };

      if (selectedExpenseId) {
        const { company_id: _, ...updatePayload } = payload;
        const updated = await apiFetch<Expense>(
          `/expenses/${selectedExpenseId}`,
          {
            method: "PATCH",
            body: JSON.stringify(updatePayload),
          },
        );
        await loadData();
        setSelectedExpenseId(updated.id);
        setIsEditing(false);
        setIsNew(false);
      } else {
        const created = await apiFetch<Expense>("/expenses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        await loadData();
        setSelectedExpenseId(created.id);
        setIsEditing(false);
        setIsNew(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (id: number) => {
    const confirmed = await showConfirm({
      title: "Delete expense",
      message: "Delete this expense? This cannot be undone.",
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/expenses/${id}`, { method: "DELETE" });
      await loadData();
      goBack();
    } catch (err: any) {
      setError(err.message || "Failed to delete expense");
    }
  };

  const openQuickAddModal = () => {
    setQuickCategory(quickCategoryOptions[0] || "Other");
    setQuickAmount("");
    setQuickDate(new Date().toISOString().split("T")[0]);
    setQuickNotes("");
    setShowQuickAddModal(true);
  };

  const closeQuickAddModal = () => {
    setShowQuickAddModal(false);
  };

  const saveQuickExpense = async () => {
    if (!companyId) return;
    const amount = Number(quickAmount);
    if (!quickDate) {
      setError("Expense date is required.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch<Expense>("/expenses", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          supplier_id: null,
          reference: null,
          expense_date: fromDateInputValue(quickDate),
          category: quickCategory,
          description: quickNotes.trim() || `${quickCategory} expense`,
          subtotal: amount,
          vat_rate: 0,
          currency: "USD",
          status: "posted",
          notes: quickNotes,
        }),
      });
      await loadData();
      closeQuickAddModal();
    } catch (err: any) {
      setError(err.message || "Failed to add expense");
    } finally {
      setSaving(false);
    }
  };

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Category CRUD ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const openCategoryModal = (cat?: ExpenseCategory) => {
    if (cat) {
      setEditingCategoryId(cat.id);
      setCategoryFormName(cat.name);
    } else {
      setEditingCategoryId(null);
      setCategoryFormName("");
    }
    setShowCategoryModal(true);
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategoryId(null);
    setCategoryFormName("");
  };

  const saveCategory = async () => {
    if (!companyId) {
      setError("Please select a company first.");
      return;
    }
    const nextName = categoryFormName.trim();
    if (!nextName) {
      setError("Category name is required.");
      return;
    }
    const currentCategory = editingCategoryId
      ? (categories.find((category) => category.id === editingCategoryId) ??
        null)
      : null;
    const duplicateCategory = categories.find(
      (category) =>
        category.id !== editingCategoryId &&
        category.name.trim().toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicateCategory) {
      setError("That expense category already exists.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let savedCategory: ExpenseCategory;
      if (editingCategoryId) {
        savedCategory = await apiFetch<ExpenseCategory>(
          `/expense-categories/${editingCategoryId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ name: nextName }),
          },
        );
      } else {
        savedCategory = await apiFetch<ExpenseCategory>("/expense-categories", {
          method: "POST",
          body: JSON.stringify({
            company_id: companyId,
            name: nextName,
          }),
        });
      }
      await loadData();
      if (showQuickAddModal) {
        setQuickCategory(savedCategory.name);
      }
      setForm((prev) => {
        const currentName = (prev.category || "").trim();
        if (!currentName && !editingCategoryId) {
          return { ...prev, category: savedCategory.name };
        }
        if (
          currentCategory &&
          currentName.toLowerCase() ===
            currentCategory.name.trim().toLowerCase()
        ) {
          return { ...prev, category: savedCategory.name };
        }
        return prev;
      });
      if (
        currentCategory &&
        categoryFilter.trim().toLowerCase() ===
          currentCategory.name.trim().toLowerCase()
      ) {
        setCategoryFilter(savedCategory.name);
      }
      closeCategoryModal();
    } catch (err: any) {
      setError(err.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (categoryId: number) => {
    const confirmed = await showConfirm({
      title: "Delete expense category",
      message: "Delete this expense category?",
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await apiFetch(`/expense-categories/${categoryId}`, { method: "DELETE" });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete category");
    } finally {
      setSaving(false);
    }
  };

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Navigation ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const goBackToCompanies = () => {
    setSelectedCompanyId(null);
    setExpenses([]);
    setContacts([]);
    setCategories([]);
    setSelectedExpenseId(null);
    setIsEditing(false);
    setSubView("list");
    setMainView("expenses");
  };

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ CSV Export ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const exportCSV = () => {
    const headers = [
      "Reference",
      "Date",
      "Supplier",
      "Category",
      "Description",
      "Subtotal",
      "VAT",
      "Total",
      "Status",
    ];
    const rows = filteredExpenses.map((e) => {
      const supplier = contacts.find((c) => c.id === e.supplier_id)?.name || "";
      return [
        e.reference,
        toDateInputValue(e.expense_date),
        supplier,
        e.category,
        e.description,
        e.subtotal,
        e.tax_amount,
        e.total_amount,
        e.status,
      ];
    });
    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `expenses_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  /* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â
     RENDER
     ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */

  if (companiesLoading && !companyId) {
    return <div className="loading-indicator">Loading companies...</div>;
  }
  if (!isAdmin && !companyId && allCompanies.length) {
    return <div className="loading-indicator">Loading companies...</div>;
  }

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Admin company picker ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  if (isAdmin && !companyId) {
    return (
      <div className="content">
        <div
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
        <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>
          Select a company to manage its expenses.
        </p>
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

  const useLegacyExpenseDashboard = false;

  if (
    useLegacyExpenseDashboard &&
    mainView === "expenses" &&
    subView === "list"
  ) {
    return (
      <>
        {isAdmin && company && (
          <div className="o-control-panel expense-breadcrumb-panel">
            <div className="o-breadcrumb">
              <span
                className="o-breadcrumb-item"
                style={{ cursor: "pointer" }}
                onClick={goBackToCompanies}
              >
                Expenses
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
              <span className="o-breadcrumb-current">{company.name}</span>
            </div>
          </div>
        )}

        <ValidationAlert message={error} onClose={() => setError(null)} />

        <div className="expense-dashboard-shell">
          <div className="expense-dashboard-topbar">
            <div className="expense-dashboard-actions">
              <label className="expense-dashboard-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search expenses..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                className="expense-dashboard-secondary-btn"
                type="button"
                onClick={exportCSV}
              >
                <Download size={17} />
                <span>Export</span>
              </button>
            </div>
          </div>

          <div className="expense-dashboard-stat-grid">
            <article className="expense-dashboard-stat-card">
              <span
                className="expense-dashboard-stat-icon"
                style={{
                  background: "linear-gradient(135deg, #dff6ff, #c6ebff)",
                }}
              >
                <WalletCards size={22} color="#1b8cca" />
              </span>
              <div className="expense-dashboard-stat-copy">
                <p>Total Expenses</p>
                <strong>{formatCurrency(totalExpense)}</strong>
                <span>
                  {dateFilter === "this_month"
                    ? "This Month"
                    : dateFilter === "last_month"
                      ? "Last Month"
                      : dateFilter === "this_year"
                        ? "This Year"
                        : "All Time"}
                </span>
              </div>
            </article>

            <article className="expense-dashboard-stat-card">
              <span
                className="expense-dashboard-stat-icon"
                style={{
                  background: "linear-gradient(135deg, #dff8ee, #cbf0df)",
                }}
              >
                <BadgeCheck size={22} color="#0ca678" />
              </span>
              <div className="expense-dashboard-stat-copy">
                <p>Posted Expenses</p>
                <strong>{dashboardStats.postedCount}</strong>
                <span>Approved</span>
              </div>
            </article>

            <article className="expense-dashboard-stat-card">
              <span
                className="expense-dashboard-stat-icon"
                style={{
                  background: "linear-gradient(135deg, #fff0dc, #ffe4bf)",
                }}
              >
                <FileText size={22} color="#eb8a15" />
              </span>
              <div className="expense-dashboard-stat-copy">
                <p>Pending Approval</p>
                <strong>{dashboardStats.draftCount}</strong>
                <span>Drafts</span>
              </div>
            </article>

            <article className="expense-dashboard-stat-card">
              <span
                className="expense-dashboard-stat-icon"
                style={{
                  background: "linear-gradient(135deg, #ece6ff, #ddd4ff)",
                }}
              >
                <PieChart size={22} color="#6d54e8" />
              </span>
              <div className="expense-dashboard-stat-copy">
                <p>Top Category</p>
                <strong>{dashboardStats.topCategory?.name || "No Data"}</strong>
                <span>
                  {dashboardStats.topCategory
                    ? formatCurrency(dashboardStats.topCategory.amount)
                    : "No expenses yet"}
                </span>
              </div>
            </article>
          </div>

          <div className="expense-dashboard-layout">
            <aside className="expense-panel-card expense-dashboard-filters">
              <div className="expense-dashboard-panel-head">
                <h3>Filters</h3>
              </div>

              <div className="expense-dashboard-filter-group">
                <h4>Status</h4>
                <div className="expense-dashboard-pill-grid">
                  {[
                    { label: "All", value: "" },
                    { label: "Posted", value: "posted" },
                    { label: "Draft", value: "draft" },
                    { label: "Paid", value: "paid" },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className={`expense-dashboard-pill ${statusFilter === option.value ? "active" : ""}`}
                      onClick={() => setStatusFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="expense-dashboard-filter-group">
                <div className="expense-dashboard-section-row">
                  <h4>Category</h4>
                  <button
                    type="button"
                    className="expense-dashboard-link-btn"
                    onClick={() => openCategoryModal()}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="expense-dashboard-category-list">
                  <button
                    type="button"
                    className={`expense-dashboard-category-item ${categoryFilter === "" ? "active" : ""}`}
                    onClick={() => setCategoryFilter("")}
                  >
                    <span>All Expenses</span>
                    <strong>{filteredExpenses.length}</strong>
                  </button>
                  {categories
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((category) => {
                      const visual =
                        CATEGORY_VISUALS[normalizeCategoryKey(category.name)];
                      const Icon = visual.icon;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          className={`expense-dashboard-category-item ${categoryFilter === category.name ? "active" : ""}`}
                          onClick={() => setCategoryFilter(category.name)}
                        >
                          <span className="expense-dashboard-category-name">
                            <span
                              className="expense-dashboard-category-badge"
                              style={{ background: visual.color }}
                            >
                              <Icon size={13} />
                            </span>
                            {category.name}
                          </span>
                          <strong>
                            {categoryExpenseCount.get(category.name) || 0}
                          </strong>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="expense-dashboard-filter-group">
                <h4>Supplier</h4>
                <label className="expense-dashboard-select">
                  <select
                    value={supplierFilter}
                    onChange={(e) =>
                      setSupplierFilter(
                        e.target.value ? Number(e.target.value) : "",
                      )
                    }
                  >
                    <option value="">All Suppliers</option>
                    {contacts
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="expense-dashboard-filter-group">
                <h4>Period</h4>
                <label className="expense-dashboard-select">
                  <select
                    value={dateFilter}
                    onChange={(e) =>
                      setDateFilter(e.target.value as DateFilter)
                    }
                  >
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="this_year">This Year</option>
                    <option value="all_time">All Time</option>
                  </select>
                </label>
              </div>

              {hasActiveFilters && (
                <button
                  className="expense-dashboard-clear-btn"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSupplierFilter("");
                    setStatusFilter("");
                    setCategoryFilter("");
                    setDateFilter("this_month");
                  }}
                >
                  Reset Filters
                </button>
              )}
            </aside>

            <div className="expense-dashboard-center">
              <section className="expense-panel-card expense-dashboard-main-card">
                <div className="expense-dashboard-panel-head expense-dashboard-panel-head-wide">
                  <h3>Expenses</h3>
                  <div className="expense-dashboard-card-actions">
                    <button
                      className="o-btn o-btn-primary"
                      type="button"
                      onClick={startNew}
                    >
                      <Plus size={18} />
                      New Expense
                    </button>
                  </div>
                </div>

                <section className="expense-transactions expense-dashboard-transactions">
                  <div className="expense-transactions-head">
                    <h3>Recent Expenses</h3>
                    <span className="expense-transactions-meta">
                      {sortedTransactions.length} matching expense
                      {sortedTransactions.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="expense-transactions-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Supplier</th>
                          <th>Category</th>
                          <th>Date</th>
                          <th>Status</th>
                          <th className="amount">Subtotal</th>
                          <th className="amount">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading && (
                          <tr>
                            <td colSpan={7} className="expense-empty-row">
                              Loading expenses...
                            </td>
                          </tr>
                        )}
                        {!loading && pagedTransactions.length === 0 && (
                          <tr>
                            <td colSpan={7} className="expense-empty-row">
                              No expenses for this filter.
                            </td>
                          </tr>
                        )}
                        {!loading &&
                          pagedTransactions.map((expense) => {
                            const categoryName = expense.category || "Other";
                            const supplierName =
                              contacts.find(
                                (contact) => contact.id === expense.supplier_id,
                              )?.name || "-";
                            const visual =
                              CATEGORY_VISUALS[
                                normalizeCategoryKey(categoryName)
                              ];
                            const Icon = visual.icon;
                            return (
                              <tr
                                key={expense.id}
                                onClick={() => openExpense(expense.id)}
                                className="expense-clickable-row"
                              >
                                <td className="expense-cell-strong">
                                  {expense.reference || `EXP-${expense.id}`}
                                </td>
                                <td>{supplierName}</td>
                                <td>
                                  <div className="expense-category-cell">
                                    <span
                                      className="expense-category-icon"
                                      style={{ background: visual.color }}
                                    >
                                      <Icon size={13} />
                                    </span>
                                    {categoryName}
                                  </div>
                                </td>
                                <td>
                                  {expense.expense_date
                                    ? new Date(
                                        expense.expense_date,
                                      ).toLocaleDateString()
                                    : "-"}
                                </td>
                                <td>
                                  <span
                                    className={`expense-dashboard-status-chip status-${expense.status || "draft"}`}
                                  >
                                    {(expense.status || "draft").toUpperCase()}
                                  </span>
                                </td>
                                <td className="amount">
                                  {formatCurrency(
                                    expense.subtotal,
                                    expense.currency,
                                  )}
                                </td>
                                <td className="amount expense-cell-strong">
                                  {formatCurrency(
                                    expense.total_amount,
                                    expense.currency,
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                      {pagedTransactions.length > 0 && (
                        <tfoot>
                          <tr className="expense-dashboard-total-row">
                            <td colSpan={5}>Grand Total</td>
                            <td className="amount">
                              {formatCurrency(
                                dateFilteredExpenses.reduce(
                                  (sum, expense) =>
                                    sum + (expense.subtotal || 0),
                                  0,
                                ),
                              )}
                            </td>
                            <td className="amount">
                              {formatCurrency(
                                dateFilteredExpenses.reduce(
                                  (sum, expense) =>
                                    sum + (expense.total_amount || 0),
                                  0,
                                ),
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  <div className="expense-pagination">
                    <label className="expense-pagination-size">
                      <span>Rows</span>
                      <input
                        type="number"
                        min={1}
                        value={transactionsPageSize}
                        onChange={handleTransactionsPageSizeChange}
                        style={{ width: 72 }}
                        aria-label="Rows per page"
                      />
                    </label>
                    <span>
                      Page{" "}
                      {sortedTransactions.length === 0 ? 0 : transactionsPage}{" "}
                      of{" "}
                      {sortedTransactions.length === 0
                        ? 0
                        : transactionTotalPages}
                    </span>
                    <div>
                      <button
                        type="button"
                        disabled={transactionsPage <= 1}
                        onClick={() =>
                          setTransactionsPage((prev) => Math.max(prev - 1, 1))
                        }
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        disabled={
                          transactionsPage >= transactionTotalPages ||
                          sortedTransactions.length === 0
                        }
                        onClick={() =>
                          setTransactionsPage((prev) =>
                            Math.min(prev + 1, transactionTotalPages),
                          )
                        }
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </section>
              </section>
            </div>
          </div>
        </div>

        {showQuickAddModal && (
          <div className="expense-modal-overlay" onClick={closeQuickAddModal}>
            <div
              className="expense-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="expense-modal-head">
                <h2>Add Expense</h2>
                <button
                  type="button"
                  className="expense-modal-close"
                  onClick={closeQuickAddModal}
                >
                  <X size={26} />
                </button>
              </div>

              <div className="expense-modal-body">
                <div className="expense-modal-label-row">
                  <label className="expense-modal-label">Category</label>
                  <button
                    type="button"
                    className="expense-modal-inline-btn"
                    onClick={() => openCategoryModal()}
                  >
                    <Plus size={16} />
                    <span>Add Category</span>
                  </button>
                </div>
                <div className="expense-category-choices">
                  {quickCategoryOptions.map((category) => {
                    const visual =
                      CATEGORY_VISUALS[normalizeCategoryKey(category)];
                    const Icon = visual.icon;
                    return (
                      <button
                        key={category}
                        type="button"
                        className={`expense-category-choice ${quickCategory === category ? "selected" : ""}`}
                        onClick={() => setQuickCategory(category)}
                        style={{
                          color:
                            quickCategory === category
                              ? visual.color
                              : undefined,
                        }}
                      >
                        <span
                          className="choice-icon"
                          style={{ background: visual.color }}
                        >
                          <Icon size={16} />
                        </span>
                        <span>{category}</span>
                      </button>
                    );
                  })}
                </div>

                <label className="expense-modal-label">Amount</label>
                <div className="expense-input expense-input-money">
                  <span>
                    <WalletCards size={20} />
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quickAmount}
                    onChange={(e) => setQuickAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <label className="expense-modal-label">Date</label>
                <div className="expense-input">
                  <span>
                    <CalendarDays size={20} />
                  </span>
                  <input
                    type="date"
                    value={quickDate}
                    onChange={(e) => setQuickDate(e.target.value)}
                  />
                </div>

                <label className="expense-modal-label">Notes</label>
                <textarea
                  rows={3}
                  value={quickNotes}
                  onChange={(e) => setQuickNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="expense-modal-footer">
                <button
                  type="button"
                  className="expense-modal-cancel"
                  onClick={closeQuickAddModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="expense-modal-submit"
                  onClick={saveQuickExpense}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Add Expense"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showCategoryModal && (
          <div
            className="expense-category-modal-overlay"
            onClick={closeCategoryModal}
          >
            <div
              className="expense-category-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="expense-category-modal-title">
                {editingCategoryId
                  ? "Edit Expense Category"
                  : "New Expense Category"}
              </h3>
              <div className="o-form-group">
                <label className="o-form-label">Name</label>
                <div className="o-form-field">
                  <input
                    type="text"
                    className="o-form-input"
                    value={categoryFormName}
                    onChange={(e) => setCategoryFormName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveCategory();
                    }}
                  />
                </div>
              </div>
              <div className="expense-category-modal-actions">
                <button
                  className="o-btn o-btn-secondary"
                  onClick={closeCategoryModal}
                >
                  Cancel
                </button>
                <button
                  className="o-btn o-btn-primary"
                  onClick={saveCategory}
                  disabled={saving || !categoryFormName.trim()}
                >
                  {saving ? "Saving..." : editingCategoryId ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Admin breadcrumb */}
      {isAdmin && company && (
        <div
          className="o-control-panel"
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 0,
            padding: "8px 16px",
          }}
        >
          <div className="o-breadcrumb">
            <span
              className="o-breadcrumb-item"
              style={{ cursor: "pointer" }}
              onClick={goBackToCompanies}
            >
              Expenses
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
            <span className="o-breadcrumb-current">{company.name}</span>
          </div>
        </div>
      )}

      <ValidationAlert message={error} onClose={() => setError(null)} />

      <div
        className="container-fluid py-3 page-container"
        style={{ display: "flex", gap: 0, flexWrap: "nowrap" }}
      >
        <div id="main-content" className="two-panel two-panel-left">
          <Sidebar sections={expensesSidebarSections} />

          {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â MAIN CONTENT AREA ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
          <div className="o-main">
            {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Form sub-control panel (like Inventory) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
            {mainView === "expenses" && subView === "form" && (
              <div className="expense-form-toolbar">
                <div className="expense-form-toolbar-main">
                  <button className="expense-form-back-btn" onClick={goBack}>
                    <ArrowLeft size={16} />
                    <span>Back to List</span>
                  </button>
                  <div className="expense-form-toolbar-copy">
                    <h2>
                      {isNew
                        ? "New Expense"
                        : selectedExpense?.reference || "Expense"}
                    </h2>
                    <div className="expense-form-toolbar-meta">
                      <span>{form.expense_date || "No date selected"}</span>
                      <span>Currency: {form.currency || "USD"}</span>
                      {!isNew && selectedExpense && (
                        <span
                          className={`expense-form-status-badge ${selectedExpense.status === "posted" ? "posted" : "draft"}`}
                        >
                          {selectedExpense.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="expense-form-toolbar-actions">
                  {isEditing ? (
                    <>
                      <button
                        className="o-btn o-btn-primary"
                        onClick={saveExpense}
                        disabled={saving}
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        className="o-btn o-btn-secondary"
                        onClick={goBack}
                      >
                        Discard
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="o-btn o-btn-secondary"
                        onClick={() => setIsEditing(true)}
                      >
                        Edit
                      </button>
                      {selectedExpenseId && (
                        <button
                          className="icon-btn danger"
                          title="Delete"
                          onClick={() => deleteExpense(selectedExpenseId)}
                        >
                          <TrashIcon />
                        </button>
                      )}
                      {selectedExpense && selectedExpense.status !== "draft" && (
                        <button
                          className="o-btn o-btn-secondary"
                          onClick={() =>
                            navigate(`/accounting?section=journal_entries&reference=${encodeURIComponent(`EXP/${selectedExpense.reference}`)}`)
                          }
                        >
                          Journal Entry
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Search/Action bar (like Inventory o-control-panel) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
            <div
              className="o-content"
              style={{
                flexWrap: "wrap",
                alignContent: "flex-start",
                rowGap: 12,
              }}
            >
              {false && subView !== "form" && mainView === "expenses" && (
                <div
                  className="content-top-bar"
                  style={{ width: "100%", flex: "1 1 100%" }}
                >
                  <div className="top-search">
                    <span className="search-icon">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search expenses..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  {mainView === "expenses" && (
                    <>
                      <button
                        className="o-btn o-btn-secondary"
                        onClick={exportCSV}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
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
                        Export
                      </button>
                      <button className="btn-create" onClick={startNew}>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        New Expense
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â EXPENSES LIST VIEW ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
              {mainView === "expenses" && subView === "list" && (
                <div className="o-main expense-list-page">
                  <div className="expense-list-toolbar">
                    <div className="expense-list-search-wrap">
                      <div className="expense-list-searchbox">
                        <span className="search-icon">
                          <Search size={16} />
                        </span>
                        <input
                          type="text"
                          placeholder="Search expenses..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        <button
                          type="button"
                          className="expense-filter-toggle"
                          aria-label="Open expense filters"
                          onClick={() =>
                            setExpenseFilterMenuOpen((prev) => !prev)
                          }
                        >
                          <Filter size={16} />
                        </button>
                        {expenseFilterMenuOpen && (
                          <div
                            className="expense-filter-dropdown"
                            ref={expenseFilterMenuRef}
                          >
                            <div className="expense-filter-columns">
                              <div className="expense-filter-column">
                                <div className="expense-filter-title">
                                  Status
                                </div>
                                <div className="expense-filter-items">
                                  {[
                                    {
                                      key: "",
                                      label: "All",
                                      count: expenses.length,
                                    },
                                    {
                                      key: "posted",
                                      label: "Posted",
                                      count: expenses.filter(
                                        (e) => e.status === "posted",
                                      ).length,
                                    },
                                    {
                                      key: "draft",
                                      label: "Draft",
                                      count: expenses.filter(
                                        (e) => e.status === "draft",
                                      ).length,
                                    },
                                  ].map((item) => (
                                    <button
                                      key={item.key || "all"}
                                      type="button"
                                      className={`expense-filter-chip ${
                                        statusFilter === item.key
                                          ? "expense-filter-chip-active"
                                          : ""
                                      }`}
                                      onClick={() => setStatusFilter(item.key)}
                                    >
                                      {item.label} ({item.count})
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="expense-filter-column">
                                <div className="expense-filter-title">
                                  Supplier
                                </div>
                                <div className="expense-filter-items">
                                  <button
                                    type="button"
                                    className={`expense-filter-chip ${
                                      supplierFilter === ""
                                        ? "expense-filter-chip-active"
                                        : ""
                                    }`}
                                    onClick={() => setSupplierFilter("")}
                                  >
                                    All Suppliers
                                  </button>
                                  {contacts
                                    .slice()
                                    .sort((a, b) =>
                                      a.name.localeCompare(b.name),
                                    )
                                    .map((contact) => (
                                      <button
                                        key={contact.id}
                                        type="button"
                                        className={`expense-filter-chip ${
                                          supplierFilter === contact.id
                                            ? "expense-filter-chip-active"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          setSupplierFilter(contact.id)
                                        }
                                      >
                                        {contact.name}
                                      </button>
                                    ))}
                                </div>
                              </div>
                              <div className="expense-filter-column">
                                <div className="expense-filter-title">
                                  Category
                                </div>
                                <div className="expense-filter-items">
                                  <button
                                    type="button"
                                    className={`expense-filter-chip ${
                                      categoryFilter === ""
                                        ? "expense-filter-chip-active"
                                        : ""
                                    }`}
                                    onClick={() => setCategoryFilter("")}
                                  >
                                    All Categories
                                  </button>
                                  {categories
                                    .slice()
                                    .sort((a, b) =>
                                      a.name.localeCompare(b.name),
                                    )
                                    .map((category) => (
                                      <button
                                        key={category.id}
                                        type="button"
                                        className={`expense-filter-chip ${
                                          categoryFilter === category.name
                                            ? "expense-filter-chip-active"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          setCategoryFilter(category.name)
                                        }
                                      >
                                        {category.name} (
                                        {categoryExpenseCount.get(
                                          category.name,
                                        ) || 0}
                                        )
                                      </button>
                                    ))}
                                </div>
                                {hasActiveFilters && (
                                  <div className="expense-filter-note">
                                    <span>Filters applied</span>
                                    <button
                                      type="button"
                                      className="expense-filter-clear-btn"
                                      onClick={() => {
                                        setSearch("");
                                        setSupplierFilter("");
                                        setStatusFilter("");
                                        setCategoryFilter("");
                                        setDateFilter("this_month");
                                        setExpenseFilterMenuOpen(false);
                                      }}
                                    >
                                      Clear all
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="expense-list-toolbar-actions">
                      <button
                        className="o-btn o-btn-secondary"
                        onClick={exportCSV}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Download size={16} />
                        Export
                      </button>
                      <button
                        className="o-btn o-btn-primary"
                        onClick={startNew}
                      >
                        <Plus size={16} />
                        New Expense
                      </button>
                    </div>
                  </div>

                  <div className="expense-list-table-card">
                    <div className="card shadow-sm">
                      <div className="card-body p-0">
                        <div className="table-responsive">
                          <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>Reference</th>
                                <th>Supplier</th>
                                <th>Category</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th className="text-end">Subtotal</th>
                                <th className="text-end">VAT</th>
                                <th className="text-end">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {loading && (
                                <tr>
                                  <td
                                    colSpan={8}
                                    style={{
                                      textAlign: "center",
                                      padding: 40,
                                      color: "var(--muted)",
                                    }}
                                  >
                                    Loading expenses...
                                  </td>
                                </tr>
                              )}
                              {!loading && filteredExpenses.length === 0 && (
                                <tr>
                                  <td
                                    colSpan={8}
                                    style={{ textAlign: "center", padding: 40 }}
                                  >
                                    {expenses.length === 0 ? (
                                      <button
                                        className="o-btn o-btn-primary"
                                        onClick={startNew}
                                      >
                                        + Create Expense
                                      </button>
                                    ) : (
                                      <span style={{ color: "var(--muted)" }}>
                                        No expenses match your filters.
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )}
                              {filteredExpenses.map((e) => {
                                const supplierName =
                                  contacts.find((c) => c.id === e.supplier_id)
                                    ?.name || "\u2014";
                                return (
                                  <tr
                                    key={e.id}
                                    onClick={() => openExpense(e.id)}
                                    style={{ cursor: "pointer" }}
                                  >
                                    <td style={{ fontWeight: 500 }}>
                                      {e.reference || "\u2014"}
                                    </td>
                                    <td>{supplierName}</td>
                                    <td>{e.category || "\u2014"}</td>
                                    <td style={{ color: "var(--muted)" }}>
                                      {e.expense_date
                                        ? new Date(
                                            e.expense_date,
                                          ).toLocaleDateString()
                                        : "\u2014"}
                                    </td>
                                    <td>
                                      <span
                                        className={`badge ${e.status === "posted" ? "bg-info" : "bg-secondary"}`}
                                      >
                                        {e.status}
                                      </span>
                                    </td>
                                    <td className="text-end">
                                      {formatCurrency(e.subtotal, e.currency)}
                                    </td>
                                    <td
                                      className="text-end"
                                      style={{ color: "var(--muted)" }}
                                    >
                                      {formatCurrency(e.tax_amount, e.currency)}
                                    </td>
                                    <td
                                      className="text-end"
                                      style={{ fontWeight: 600 }}
                                    >
                                      {formatCurrency(
                                        e.total_amount,
                                        e.currency,
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            {filteredExpenses.length > 0 && (
                              <tfoot>
                                <tr
                                  style={{
                                    background: "var(--slate-50)",
                                    fontWeight: 600,
                                  }}
                                >
                                  <td colSpan={5} className="text-end">
                                    Grand Total:
                                  </td>
                                  <td className="text-end">
                                    {formatCurrency(
                                      filteredExpenses.reduce(
                                        (s, e) => s + (e.subtotal || 0),
                                        0,
                                      ),
                                      "USD",
                                    )}
                                  </td>
                                  <td className="text-end">
                                    {formatCurrency(
                                      filteredExpenses.reduce(
                                        (s, e) => s + (e.tax_amount || 0),
                                        0,
                                      ),
                                      "USD",
                                    )}
                                  </td>
                                  <td className="text-end">
                                    {formatCurrency(
                                      filteredExpenses.reduce(
                                        (s, e) => s + (e.total_amount || 0),
                                        0,
                                      ),
                                      "USD",
                                    )}
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â SUPPLIERS TABLE VIEW ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
              {mainView === "suppliers" && subView === "list" && (
                <div
                  className="o-main expense-suppliers-page"
                  style={{ width: "100%" }}
                >
                  <div className="expense-suppliers-toolbar">
                    <label className="expense-suppliers-search">
                      <Search size={16} />
                      <input
                        type="text"
                        placeholder="Search suppliers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </label>
                    <button
                      className="o-btn o-btn-primary expense-suppliers-create-btn"
                      onClick={() => navigate("/contacts/new")}
                    >
                      <Plus size={16} />
                      Add Supplier
                    </button>
                  </div>

                  <div className="o-list-view expense-suppliers-list-view">
                    <table className="o-list-table expense-suppliers-table">
                      <thead>
                        <tr>
                          <th>Supplier</th>
                          <th>Expenses</th>
                          <th className="text-end">Subtotal</th>
                          <th className="text-end">VAT</th>
                          <th className="text-end">Total</th>
                          <th style={{ width: 160 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSuppliers.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <div className="expense-supplier-name-cell">
                                <span className="expense-supplier-name-icon">
                                  <WalletCards size={16} />
                                </span>
                                <div className="expense-supplier-name-copy">
                                  <strong>{s.name}</strong>
                                  <span>
                                    {s.expenseCount === 1
                                      ? "1 expense"
                                      : `${s.expenseCount} expenses`}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="expense-supplier-count-badge">
                                {s.expenseCount}
                              </span>
                            </td>
                            <td className="text-end">
                              {formatCurrency(s.subtotal, "USD")}
                            </td>
                            <td className="text-end">
                              {formatCurrency(s.tax, "USD")}
                            </td>
                            <td
                              className={`text-end ${s.total < 0 ? "negative-amount" : ""}`}
                              style={{ fontWeight: 700 }}
                            >
                              {formatCurrency(s.total, "USD")}
                            </td>
                            <td className="expense-suppliers-actions-cell">
                              <button
                                className="expense-suppliers-view-btn"
                                onClick={() => {
                                  setSupplierFilter(s.id);
                                  setMainView("expenses");
                                  setSubView("list");
                                  setSearch("");
                                  setSearchQuery("");
                                }}
                              >
                                <FileText size={15} />
                                View Expenses
                              </button>
                            </td>
                          </tr>
                        ))}
                        {filteredSuppliers.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="expense-suppliers-empty-cell"
                            >
                              {contacts.length === 0 ? (
                                <div className="expense-suppliers-empty-state">
                                  <div className="expense-suppliers-empty-icon">
                                    <WalletCards size={22} />
                                  </div>
                                  <strong>No suppliers found</strong>
                                  <span>
                                    Add a supplier to start tracking expense
                                    history.
                                  </span>
                                </div>
                              ) : (
                                <div className="expense-suppliers-empty-state">
                                  <div className="expense-suppliers-empty-icon">
                                    <Search size={22} />
                                  </div>
                                  <strong>
                                    No suppliers match your search
                                  </strong>
                                  <span>Try a different search term.</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â EXPENSE FORM VIEW ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
              {mainView === "expenses" && subView === "form" && (
                <div className="expense-form-page">
                  <div className="expense-form-card">
                    <div className="expense-form-card-head">
                      <div className="expense-form-total-card">
                        <span>Total</span>
                        <strong>
                          {formatCurrency(calc.total, form.currency)}
                        </strong>
                        <small>
                          Tax {formatCurrency(calc.tax, form.currency)}
                        </small>
                      </div>
                    </div>

                    <div className="expense-form-section">
                      <div className="expense-form-section-head">
                        <h4>General Information</h4>
                        <span>
                          {isEditing ? "Fields are editable" : "Read-only view"}
                        </span>
                      </div>
                      <div className="row g-4">
                        <div className="col-md-6">
                          <ValidatedField
                            label="Date"
                            labelClassName="form-label fw-semibold expense-form-label"
                            isInvalid={invalidFields.includes("expense_date")}
                          >
                            <input
                              className="form-control input-underline expense-form-input"
                              type="date"
                              value={form.expense_date}
                              onChange={(e) => {
                                const { value } = e.target;
                                setForm((p) => ({
                                  ...p,
                                  expense_date: value,
                                }));
                                clearInvalidField("expense_date", value);
                              }}
                              disabled={!isEditing}
                            />
                          </ValidatedField>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-semibold expense-form-label">
                            Reference
                          </label>
                          <input
                            className="form-control input-underline expense-form-input bg-light"
                            value={form.reference}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                reference: e.target.value,
                              }))
                            }
                            placeholder="(auto)"
                            disabled={!isEditing}
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-semibold expense-form-label">
                            Supplier
                          </label>
                          <select
                            className="form-select input-underline expense-form-input"
                            value={form.supplier_id}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                supplier_id: e.target.value
                                  ? Number(e.target.value)
                                  : "",
                              }))
                            }
                            disabled={!isEditing}
                          >
                            <option value="">Select Supplier</option>
                            {contacts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-6">
                          <ValidatedField
                            label="Category"
                            labelClassName="form-label fw-semibold expense-form-label"
                            isInvalid={invalidFields.includes("category")}
                          >
                            <select
                              className="form-select input-underline expense-form-input"
                              value={form.category || ""}
                              onChange={(e) => {
                                const { value } = e.target;
                                setForm((p) => ({ ...p, category: value }));
                                clearInvalidField("category", value);
                              }}
                              disabled={!isEditing}
                            >
                              <option value="">Select Category</option>
                              {categories
                                .slice()
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((c) => (
                                  <option key={c.id} value={c.name}>
                                    {c.name}
                                  </option>
                                ))}
                            </select>
                          </ValidatedField>
                        </div>

                        <div className="col-md-3">
                          <ValidatedField
                            label="Status"
                            labelClassName="form-label fw-semibold expense-form-label"
                            isInvalid={invalidFields.includes("status")}
                          >
                            <select
                              className="form-select input-underline expense-form-input"
                              value={form.status}
                              onChange={(e) => {
                                const { value } = e.target;
                                setForm((p) => ({ ...p, status: value }));
                                clearInvalidField("status", value);
                              }}
                              disabled={!isEditing}
                            >
                              <option value="posted">Posted</option>
                              <option value="draft">Draft</option>
                            </select>
                          </ValidatedField>
                        </div>
                        <div className="col-md-3">
                          <ValidatedField
                            label="Currency"
                            labelClassName="form-label fw-semibold expense-form-label"
                            isInvalid={invalidFields.includes("currency")}
                          >
                            <input
                              className="form-control input-underline expense-form-input"
                              value={form.currency}
                              onChange={(e) => {
                                const { value } = e.target;
                                setForm((p) => ({ ...p, currency: value }));
                                clearInvalidField("currency", value);
                              }}
                              disabled={!isEditing}
                            />
                          </ValidatedField>
                        </div>
                        <div className="col-md-6">
                          <ValidatedField
                            label="Description"
                            labelClassName="form-label fw-semibold expense-form-label"
                            isInvalid={invalidFields.includes("description")}
                          >
                            <input
                              className="form-control input-underline expense-form-input"
                              value={form.description}
                              onChange={(e) => {
                                const { value } = e.target;
                                setForm((p) => ({ ...p, description: value }));
                                clearInvalidField("description", value);
                              }}
                              placeholder="What was the expense for?"
                              disabled={!isEditing}
                            />
                          </ValidatedField>
                        </div>
                      </div>
                    </div>

                    <div className="expense-form-section">
                      <div className="expense-form-section-head">
                        <h4>Amounts</h4>
                        <span>Calculated live from subtotal and VAT</span>
                      </div>
                      <div className="row g-4">
                        <div className="col-md-3">
                          <label className="form-label fw-semibold expense-form-label">
                            Amount (ex VAT)
                          </label>
                          <input
                            className="form-control input-underline expense-form-input"
                            type="number"
                            value={form.subtotal}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                subtotal: Number(e.target.value),
                              }))
                            }
                            disabled={!isEditing}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label fw-semibold expense-form-label">
                            VAT %
                          </label>
                          <input
                            className="form-control input-underline expense-form-input"
                            type="number"
                            value={form.vat_rate}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                vat_rate: Number(e.target.value),
                              }))
                            }
                            disabled={!isEditing}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label fw-semibold expense-form-label">
                            Tax Amount
                          </label>
                          <div className="expense-form-readonly-value">
                            {formatCurrency(calc.tax, form.currency)}
                          </div>
                        </div>
                        <div className="col-md-3">
                          <label className="form-label fw-semibold expense-form-label">
                            Total
                          </label>
                          <div className="expense-form-readonly-value expense-form-readonly-value-primary">
                            {formatCurrency(calc.total, form.currency)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="expense-form-section">
                      <div className="expense-form-section-head">
                        <h4>Notes</h4>
                      </div>
                      <div className="row g-4">
                        <div className="col-12">
                          <label className="form-label fw-semibold expense-form-label">
                            Internal Notes
                          </label>
                          <textarea
                            className="form-control input-underline expense-form-input expense-form-textarea"
                            rows={4}
                            value={form.notes}
                            onChange={(e) =>
                              setForm((p) => ({ ...p, notes: e.target.value }))
                            }
                            disabled={!isEditing}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â EXPENSE CATEGORIES LIST (like Inventory) ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
              {mainView === "categories" && subView === "list" && (
                <div
                  className="o-main expense-categories-page"
                  style={{ width: "100%" }}
                >
                  <div className="expense-categories-toolbar">
                    <label className="expense-categories-search">
                      <Search size={16} />
                      <input
                        type="text"
                        placeholder="Search categories..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </label>
                    <button
                      className="o-btn o-btn-primary expense-categories-create-btn"
                      onClick={() => openCategoryModal()}
                    >
                      <Plus size={16} />
                      New Category
                    </button>
                  </div>

                  <div className="o-list-view expense-category-list-view">
                    <table className="o-list-table expense-category-table">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Expenses</th>
                          <th style={{ width: 160 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCategories.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <div className="expense-category-name-cell">
                                <span className="expense-category-name-icon">
                                  <LayoutGrid size={16} />
                                </span>
                                <span className="expense-category-name-text">
                                  {c.name}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className="expense-category-count-badge">
                                {categoryExpenseCount.get(c.name) ?? 0}
                              </span>
                            </td>
                            <td className="expense-category-actions-cell">
                              <div className="expense-category-actions">
                                <button
                                  type="button"
                                  className="expense-category-action-btn"
                                  aria-label={`Edit ${c.name}`}
                                  onClick={() => openCategoryModal(c)}
                                >
                                  <PenLine size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="expense-category-action-btn expense-category-action-btn-danger"
                                  aria-label={`Delete ${c.name}`}
                                  onClick={() => deleteCategory(c.id)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredCategories.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              style={{ textAlign: "center", padding: 40 }}
                            >
                              {categories.length === 0 ? (
                                <button
                                  className="o-btn o-btn-primary"
                                  onClick={() => openCategoryModal()}
                                >
                                  + Create Category
                                </button>
                              ) : (
                                <span style={{ color: "var(--muted)" }}>
                                  No categories match your search.
                                </span>
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â CATEGORY MODAL (like Inventory) ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
      {showCategoryModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--white-500, #fff)",
              borderRadius: 8,
              padding: 24,
              width: 400,
            }}
          >
            <h3 style={{ margin: "0 0 16px 0" }}>
              {editingCategoryId
                ? "Edit Expense Category"
                : "New Expense Category"}
            </h3>
            <div className="o-form-group">
              <label className="o-form-label">Name</label>
              <div className="o-form-field">
                <input
                  type="text"
                  className="o-form-input"
                  value={categoryFormName}
                  onChange={(e) => setCategoryFormName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveCategory();
                  }}
                />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 24,
              }}
            >
              <button
                className="o-btn o-btn-secondary"
                onClick={closeCategoryModal}
              >
                Cancel
              </button>
              <button
                className="o-btn o-btn-primary"
                onClick={saveCategory}
                disabled={saving || !categoryFormName.trim()}
              >
                {saving ? "Saving..." : editingCategoryId ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
