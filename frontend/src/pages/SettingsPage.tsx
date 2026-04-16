import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Monitor,
  PencilLine,
  Plus,
  Search,
  Store,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { apiFetch } from "../api";
import { useCompanies, Company } from "../hooks/useCompanies";
import { useMe } from "../hooks/useMe";
import { useAlert } from "../context/AlertContext";
import type { CurrencyItem, CurrencyRateRead } from "../types/currency";
import { InlineTabs } from "../components/InlineTabs";

type DeviceBasic = {
  id: number;
  device_id: string;
  serial_number: string;
  model: string;
  company_id: number;
};

/* ── Accounting Config Types ── */
type AccAccount = { id: number; company_id: number; code: string; name: string; account_type: string; parent_id: number | null; is_reconcilable: boolean; is_active: boolean; currency_code: string; notes: string };
type AccJournal = { id: number; company_id: number; name: string; code: string; journal_type: string; default_account_id: number | null; currency_code: string; is_active: boolean };
type AccPaymentTerm = { id: number; company_id: number; name: string; description: string; due_days: number; discount_percentage: number; discount_days: number; is_active: boolean };
type AccBudget = { id: number; company_id: number; name: string; date_from: string; date_to: string; status: string; notes: string; lines: { id: number; account_id: number | null; planned_amount: number; practical_amount: number }[] };

const ACC_ACCOUNT_TYPES = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];
const ACC_JOURNAL_TYPES = [
  { value: "sale", label: "Sales" },
  { value: "purchase", label: "Purchases" },
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
  { value: "general", label: "Miscellaneous" },
];

const TAX_TYPES = [
  { value: "sales", label: "Sales" },
  { value: "purchases", label: "Purchases" },
  { value: "none", label: "None" },
];

const TAX_SCOPES = [
  { value: "sales", label: "Sales" },
  { value: "purchases", label: "Purchases" },
  { value: "all", label: "All" },
];

const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "ZWG", symbol: "ZWG", name: "Zimbabwe Dollar" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
];

type User = {
  id: number;
  email: string;
  is_active: boolean;
  is_admin: boolean;
};

type TaxSetting = {
  id: number;
  company_id: number;
  name: string;
  description: string;
  tax_type: string;
  tax_scope: string;
  label_on_invoice: string;
  rate: number;
  zimra_code: string;
  is_active: boolean;
  zimra_tax_id: number | null;
  zimra_tax_code: string;
  zimra_valid_from: string | null;
  zimra_valid_till: string | null;
  is_zimra_tax: boolean;
};

type CompanySettings = {
  id: number;
  company_id: number;
  currency_code: string;
  currency_symbol: string;
  currency_position: string;
  decimal_places: number;
  invoice_prefix: string;
  quotation_prefix: string;
  invoice_notes: string;
  payment_terms_default: string;
  inventory_valuation: string;
  auto_reserve_stock: boolean;
  allow_negative_stock: boolean;
  fiscal_enabled: boolean;
  fiscal_device_id: number | null;
  zimra_bp_no: string;
  zimra_tin: string;
  fiscal_auto_submit: boolean;
  default_sales_tax_id: number | null;
  default_purchase_tax_id: number | null;
  tax_included_in_price: boolean;
  logo_data: string;
  document_layout: string;
  document_header: string;
  document_footer: string;
  document_watermark: string;
  document_watermark_opacity: string;
  sequence_size?: number;
  sequence_step?: number;
  sequence_next?: number;
};

type POSEmployeeItem = {
  id: number;
  company_id: number;
  user_id: number | null;
  name: string;
  email: string;
  pin: string;
  role: string;
  is_active: boolean;
  sort_order: number;
};

type POSPaymentMethodItem = {
  id: number;
  company_id: number;
  name: string;
  code: string;
  is_active: boolean;
  account_info: string;
  is_default: boolean;
  sort_order: number;
};

type POSTillEmployee = {
  id: number;
  name: string;
  role: string;
  is_active: boolean;
};

type Warehouse = {
  id: number;
  name: string;
};

type POSTillItem = {
  id: number;
  company_id: number;
  name: string;
  is_active: boolean;
  sort_order: number;
  employees: POSTillEmployee[];
  created_at: string;
  updated_at: string;
  warehouse_id: number | null;
  warehouse: Warehouse | null;
  fiscal_device_id: number | null;
  fiscal_device: DeviceBasic | null;
};

type PortalManagedUser = {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  is_portal_super_user: boolean;
  portal_apps: string[];
};

type PortalAuditLog = {
  id: number;
  user_id: number | null;
  user_name: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_reference: string;
  changes_summary: string;
  status: string;
  action_at: string;
};

const PORTAL_APP_OPTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "invoices", label: "Invoices" },
  { key: "purchases", label: "Purchases" },
  { key: "contacts", label: "Contacts" },
  { key: "quotations", label: "Quotations" },
  { key: "inventory", label: "Inventory" },
  { key: "pos", label: "Point of Sale" },
  { key: "devices", label: "Devices" },
  { key: "reports", label: "Financial Reports" },
  { key: "expenses", label: "Expenses" },
  { key: "settings", label: "Settings" },
] as const;

// Icon components for professional actions
const PlusIcon = () => (
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
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

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
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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

const CheckIcon = () => (
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
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
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
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function SettingsPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { companies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);
  const primaryPortalCompany = me?.companies?.[0] ?? null;
  const isPortalSuperUser = Boolean(primaryPortalCompany?.is_portal_super_user);
  const allowedPortalApps = useMemo(() => {
    const apps =
      me?.companies?.[0]?.user_portal_apps ??
      me?.companies?.[0]?.portal_apps ??
      [];
    const normalized = apps
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    return normalized.length ? normalized : null;
  }, [me?.companies]);
  const { showConfirm } = useAlert();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const [taxes, setTaxes] = useState<TaxSetting[]>([]);
  const [selectedTax, setSelectedTax] = useState<TaxSetting | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [passwordEdits, setPasswordEdits] = useState<Record<number, string>>(
    {},
  );
  const [admins, setAdmins] = useState<User[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ email: string; password: string }>(
    { email: "", password: "" },
  );
  const [activeTopTab, setActiveTopTab] = useState<"general" | "users">(
    "general",
  );
  const [activeSection, setActiveSection] = useState<string>("company");
  const [showConfigureLayout, setShowConfigureLayout] = useState(false);
  const [showEditLayout, setShowEditLayout] = useState(false);
  const [companySettings, setCompanySettings] =
    useState<CompanySettings | null>(null);
  // Devices for ZIMRA tax pull
  const [devices, setDevices] = useState<DeviceBasic[]>([]);
  const [pullDeviceId, setPullDeviceId] = useState<number | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullSuccess, setPullSuccess] = useState<string | null>(null);

  /* ── Accounting Config State ── */
  const [accAccounts, setAccAccounts] = useState<AccAccount[]>([]);
  const [accJournals, setAccJournals] = useState<AccJournal[]>([]);
  const [accPaymentTerms, setAccPaymentTerms] = useState<AccPaymentTerm[]>([]);
  const [accBudgets, setAccBudgets] = useState<AccBudget[]>([]);
  const [accShowForm, setAccShowForm] = useState(false);
  const [accEditingId, setAccEditingId] = useState<number | null>(null);
  const [accFormData, setAccFormData] = useState<Record<string, any>>({});
  const [accSaving, setAccSaving] = useState(false);
  const [accError, setAccError] = useState<string | null>(null);
  const [accImportOpen, setAccImportOpen] = useState(false);
  const [accImportRows, setAccImportRows] = useState<Record<string, any>[]>([]);
  const [accImporting, setAccImporting] = useState(false);
  const accFileRef = useRef<HTMLInputElement>(null);

  const [settingsForm, setSettingsForm] = useState({
    currency_code: "USD",
    currency_symbol: "$",
    currency_position: "before",
    decimal_places: 2,
    invoice_prefix: "INV",
    quotation_prefix: "QUO",
    invoice_notes: "",
    sequence_size: 4,
    sequence_step: 1,
    sequence_next: 1,
    payment_terms_default: "Due on receipt",
    inventory_valuation: "fifo",
    auto_reserve_stock: true,
    allow_negative_stock: false,
    fiscal_enabled: false,
    fiscal_device_id: null as number | null,
    zimra_bp_no: "",
    zimra_tin: "",
    fiscal_auto_submit: false,
    default_sales_tax_id: null as number | null,
    default_purchase_tax_id: null as number | null,
    tax_included_in_price: false,
    logo_data: "",
    document_layout: "external_layout_standard",
    document_header: "",
    document_footer: "",
    document_watermark: "",
    document_watermark_opacity: "0.08",
  });
  const [initialSettings, setInitialSettings] = useState<
    typeof settingsForm | null
  >(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Subscription status state
type SubStatus = {
    activated: boolean;
    plan: string | null;
    status: string | null;
    expires_at: string | null;
    company_name: string | null;
};

function parseApiErrorMessage(err: any, fallback: string) {
  const raw = err?.message || "";
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }
  } catch {
    // ignore JSON parse failures
  }
  return raw || fallback;
}
  const [subStatuses, setSubStatuses] = useState<SubStatus[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  // POS Settings state
  const [posEmployees, setPosEmployees] = useState<POSEmployeeItem[]>([]);
  const [posPaymentMethods, setPosPaymentMethods] = useState<
    POSPaymentMethodItem[]
  >([]);
  const [posEmpForm, setPosEmpForm] = useState<
    Partial<POSEmployeeItem> & { name: string; pin: string; role: string }
  >({ name: "", pin: "", role: "cashier", email: "" });
  const [posEmpEditing, setPosEmpEditing] = useState<number | null>(null);
  const [posPmForm, setPosPmForm] = useState<{ name: string; code: string }>({
    name: "",
    code: "cash",
  });
  const [posPmEditing, setPosPmEditing] = useState<number | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [posConfigTab, setPosConfigTab] = useState<
    "employees" | "payments" | "tills"
  >("employees");
  const [showPinField, setShowPinField] = useState<number | null>(null);
  const [posEmpSaving, setPosEmpSaving] = useState(false);
  const [posPmSaving, setPosPmSaving] = useState(false);
  const [portalManagedUsers, setPortalManagedUsers] = useState<PortalManagedUser[]>([]);
  const [portalUsersLoading, setPortalUsersLoading] = useState(false);
  const [portalUserSaving, setPortalUserSaving] = useState(false);
  const [portalUserError, setPortalUserError] = useState<string | null>(null);
  const [portalUserEditingId, setPortalUserEditingId] = useState<number | null>(null);
  const [portalUsersTab, setPortalUsersTab] = useState<"add" | "manage" | "audit">("add");
  const [portalUserSearch, setPortalUserSearch] = useState("");
  const [portalUserForm, setPortalUserForm] = useState({
    name: "",
    email: "",
    password: "",
    portal_apps: (primaryPortalCompany?.portal_apps ?? [])
      .filter((app) => app !== "settings"),
  });
  const [portalAuditLogs, setPortalAuditLogs] = useState<PortalAuditLog[]>([]);
  const [portalAuditLoading, setPortalAuditLoading] = useState(false);
  const [portalAuditSearch, setPortalAuditSearch] = useState("");
  const [portalAuditAction, setPortalAuditAction] = useState("");
  const [portalAuditStatus, setPortalAuditStatus] = useState("");
  const [portalAuditUserId, setPortalAuditUserId] = useState<number | "">("");
  const [portalAuditActions, setPortalAuditActions] = useState<string[]>([]);
  const [portalAuditPage, setPortalAuditPage] = useState(1);
  const [portalAuditPageSize, setPortalAuditPageSize] = useState(20);
  const filteredPortalManagedUsers = useMemo(() => {
    const query = portalUserSearch.trim().toLowerCase();
    if (!query) return portalManagedUsers;
    return portalManagedUsers.filter((user) =>
      user.email.toLowerCase().includes(query) ||
      user.name.toLowerCase().includes(query),
    );
  }, [portalManagedUsers, portalUserSearch]);
  const portalAuditUsers = useMemo(() => {
    const map = new Map<number, { id: number; label: string }>();
    portalAuditLogs.forEach((log) => {
      if (log.user_id) {
        map.set(log.user_id, {
          id: log.user_id,
          label: log.user_name || log.user_email || `User ${log.user_id}`,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [portalAuditLogs]);
  const pagedPortalAuditLogs = useMemo(() => {
    const start = (portalAuditPage - 1) * portalAuditPageSize;
    return portalAuditLogs.slice(start, start + portalAuditPageSize);
  }, [portalAuditLogs, portalAuditPage, portalAuditPageSize]);
  const portalAuditTotalPages = Math.max(
    1,
    Math.ceil(portalAuditLogs.length / portalAuditPageSize),
  );

  // Till state
  const [posTills, setPosTills] = useState<POSTillItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [tillForm, setTillForm] = useState<{
    name: string;
    employee_ids: number[];
    warehouse_id: number | null;
    fiscal_device_id: number | null;
  }>({
    name: "",
    employee_ids: [],
    warehouse_id: null,
    fiscal_device_id: null,
  });
  const [tillEditing, setTillEditing] = useState<number | null>(null);
  const [tillSaving, setTillSaving] = useState(false);
  const [tillDropdownOpen, setTillDropdownOpen] = useState(false);
  const tillDropdownRef = useRef<HTMLLabelElement>(null);

  const canUsePortalApp = (appKey: string) => {
    if (isAdmin) return true;
    if (appKey === "settings") return true;
    if (!allowedPortalApps) return true;
    return allowedPortalApps.includes(appKey);
  };

  const resetPortalUserForm = () => {
    setPortalUserEditingId(null);
    setPortalUserForm({
      name: "",
      email: "",
      password: "",
      portal_apps: (primaryPortalCompany?.portal_apps ?? []).filter(
        (app) => app !== "settings",
      ),
    });
  };

  const loadPortalManagedUsers = async (cid: number) => {
    setPortalUsersLoading(true);
    try {
      const data = await apiFetch<PortalManagedUser[]>(
        `/company-users/portal-users/manage?company_id=${cid}`,
      );
      setPortalManagedUsers(data);
    } catch {
      setPortalManagedUsers([]);
    } finally {
      setPortalUsersLoading(false);
    }
  };

  const savePortalManagedUser = async () => {
    const cid = companyId ?? primaryPortalCompany?.id ?? null;
    if (!cid || !portalUserForm.name || !portalUserForm.email || (!portalUserEditingId && !portalUserForm.password)) {
      return;
    }
    setPortalUserError(null);
    setPortalUserSaving(true);
    try {
      if (portalUserEditingId) {
        await apiFetch(`/company-users/portal-users/manage/${portalUserEditingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            company_id: cid,
            name: portalUserForm.name,
            email: portalUserForm.email,
            password: portalUserForm.password || undefined,
            portal_apps: portalUserForm.portal_apps,
            is_active: true,
          }),
        });
        setStatus("Portal user updated");
      } else {
        await apiFetch("/company-users/portal-users/manage", {
          method: "POST",
          body: JSON.stringify({
            company_id: cid,
            name: portalUserForm.name,
            email: portalUserForm.email,
            password: portalUserForm.password,
            portal_apps: portalUserForm.portal_apps,
          }),
        });
        setStatus("Portal user added");
      }
      resetPortalUserForm();
      loadPortalManagedUsers(cid);
    } catch (err: any) {
      setPortalUserError(
        parseApiErrorMessage(err, "Failed to save portal user"),
      );
    } finally {
      setPortalUserSaving(false);
    }
  };

  const loadPortalAuditTrail = async (cid: number) => {
    setPortalAuditLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("company_id", String(cid));
      params.set("limit", "500");
      if (portalAuditSearch.trim()) params.set("search", portalAuditSearch.trim());
      if (portalAuditAction) params.set("action", portalAuditAction);
      if (portalAuditStatus) params.set("status", portalAuditStatus);
      if (portalAuditUserId !== "") params.set("user_id", String(portalAuditUserId));
      const data = await apiFetch<PortalAuditLog[]>(`/audit-logs?${params.toString()}`);
      setPortalAuditLogs(data);
    } catch {
      setPortalAuditLogs([]);
    } finally {
      setPortalAuditLoading(false);
    }
  };

  useEffect(() => {
    setPortalAuditPage(1);
  }, [
    portalAuditSearch,
    portalAuditAction,
    portalAuditStatus,
    portalAuditUserId,
    portalAuditPageSize,
  ]);

  const deletePortalManagedUser = async (userId: number) => {
    const cid = companyId ?? primaryPortalCompany?.id ?? null;
    if (!cid) return;
    setPortalUserError(null);
    const confirmed = await showConfirm({
      title: "Remove portal user",
      message: "Are you sure you want to remove this portal user?",
      variant: "warning",
      confirmLabel: "Remove",
    });
    if (!confirmed) return;
    try {
      await apiFetch(`/company-users/portal-users/manage/${userId}?company_id=${cid}`, {
        method: "DELETE",
      });
      setStatus("Portal user removed");
      loadPortalManagedUsers(cid);
    } catch (err: any) {
      setPortalUserError(
        parseApiErrorMessage(err, "Failed to remove portal user"),
      );
    }
  };

  const showDocumentSettings =
    canUsePortalApp("invoices") || canUsePortalApp("quotations");
  const showInvoiceSettings = canUsePortalApp("invoices");
  const showTaxSettings =
    canUsePortalApp("invoices") || canUsePortalApp("purchases");
  const showPOSSettings = canUsePortalApp("pos");

  // Close till dropdown on outside click
  useEffect(() => {
    if (!tillDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        tillDropdownRef.current &&
        !tillDropdownRef.current.contains(e.target as Node)
      ) {
        setTillDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tillDropdownOpen]);

  // Currency management state
  const [currencyList, setCurrencyList] = useState<CurrencyItem[]>([]);
const [currencyRates, setCurrencyRates] = useState<CurrencyRateRead[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyItem | null>(
    null,
  );
  const [currencyForm, setCurrencyForm] = useState({
    code: "",
    name: "",
    symbol: "",
    position: "before",
    decimal_places: 2,
    is_default: false,
  });
  const [currencyEditing, setCurrencyEditing] = useState<number | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState({
    rate: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [rateEditing, setRateEditing] = useState<number | null>(null);
  const [showCurrencyForm, setShowCurrencyForm] = useState(false);

  // Default to General tab for all users; admins will also see Users tab
  useEffect(() => {
    setActiveTopTab("general");
  }, []);

  useEffect(() => {
    if (activeTopTab === "general") {
      setActiveSection("company");
      return;
    }
    setActiveSection(me?.is_admin ? "admins" : "users-companies");
  }, [activeTopTab, me?.is_admin]);

  useEffect(() => {
    if (isAdmin) return;
    const allowedSections = [
      "company",
      "currencies",
      "users-companies",
      "subscription",
      "acc-accounts",
      "acc-journals",
      "acc-payment-terms",
      "acc-budgets",
      ...(showDocumentSettings ? ["document-layout"] : []),
      ...(showInvoiceSettings ? ["sequences"] : []),
      ...(showTaxSettings ? ["zimra-tax"] : []),
      ...(showPOSSettings ? ["pos-settings"] : []),
    ];
    if (!allowedSections.includes(activeSection)) {
      setActiveTopTab("general");
      setActiveSection(allowedSections[0] || "company");
    }
  }, [
    activeSection,
    isAdmin,
    showDocumentSettings,
    showInvoiceSettings,
    showPOSSettings,
    showTaxSettings,
  ]);

  /* ── Accounting Config: Fetch on section change ── */
  useEffect(() => {
    if (!companyId) return;
    const accSections: Record<string, () => void> = {
      "acc-accounts": () => apiFetch<AccAccount[]>(`/accounting/accounts?company_id=${companyId}`).then(setAccAccounts).catch(() => setAccAccounts([])),
      "acc-journals": () => apiFetch<AccJournal[]>(`/accounting/journals?company_id=${companyId}`).then(setAccJournals).catch(() => setAccJournals([])),
      "acc-payment-terms": () => apiFetch<AccPaymentTerm[]>(`/accounting/payment-terms?company_id=${companyId}`).then(setAccPaymentTerms).catch(() => setAccPaymentTerms([])),
      "acc-budgets": () => apiFetch<AccBudget[]>(`/accounting/budgets?company_id=${companyId}`).then(setAccBudgets).catch(() => setAccBudgets([])),
    };
    if (accSections[activeSection]) accSections[activeSection]();
  }, [activeSection, companyId]);

  const accResetForm = () => { setAccShowForm(false); setAccEditingId(null); setAccFormData({}); setAccError(null); };

  const accParseCSV = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
    return lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
      return row;
    });
  };

  const accHandleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = accParseCSV(reader.result as string);
      setAccImportRows(rows);
      setAccImportOpen(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const accHandleImport = async () => {
    if (!companyId || accImportRows.length === 0) return;
    setAccImporting(true); setAccError(null);
    let created = 0;
    const validTypes = ACC_ACCOUNT_TYPES.map(t => t.value);
    for (const row of accImportRows) {
      const acctType = (row.account_type || row.type || "").toLowerCase();
      const payload = {
        company_id: companyId,
        code: row.code || "",
        name: row.name || "",
        account_type: validTypes.includes(acctType) ? acctType : "asset",
        currency_code: row.currency_code || row.currency || "",
        is_reconcilable: ["true", "yes", "1"].includes((row.is_reconcilable || row.reconcilable || "").toLowerCase()),
        notes: row.notes || "",
      };
      if (!payload.code || !payload.name) continue;
      try {
        await apiFetch("/accounting/accounts", { method: "POST", body: JSON.stringify(payload) });
        created++;
      } catch { /* skip duplicates / errors */ }
    }
    setAccImporting(false);
    setAccImportOpen(false);
    setAccImportRows([]);
    if (created > 0) {
      setActiveSection(prev => { const tmp = prev; setActiveSection(""); setTimeout(() => setActiveSection(tmp), 20); return prev; });
    }
    if (created < accImportRows.length) {
      setAccError(`Imported ${created} of ${accImportRows.length} accounts (${accImportRows.length - created} skipped — missing code/name or duplicate).`);
    }
  };

  const accDownloadTemplate = () => {
    const header = "code,name,account_type,currency_code,is_reconcilable,notes";
    const sample = "1000,Cash,asset,USD,true,Main cash account";
    const blob = new Blob([header + "\n" + sample + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "chart_of_accounts_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const accHandleSave = async (endpoint: string) => {
    if (!companyId) return;
    setAccSaving(true); setAccError(null);
    try {
      if (accEditingId) {
        await apiFetch(`${endpoint}/${accEditingId}`, { method: "PATCH", body: JSON.stringify(accFormData) });
      } else {
        await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ ...accFormData, company_id: companyId }) });
      }
      accResetForm();
      // Trigger refetch
      setActiveSection(prev => { const tmp = prev; setActiveSection(""); setTimeout(() => setActiveSection(tmp), 20); return prev; });
    } catch (err: any) { setAccError(err?.detail || err?.message || "Failed to save"); }
    finally { setAccSaving(false); }
  };

  const accHandleDelete = async (endpoint: string, id: number) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try { await apiFetch(`${endpoint}/${id}`, { method: "DELETE" }); }
    catch { /* ignore */ }
    setActiveSection(prev => { const tmp = prev; setActiveSection(""); setTimeout(() => setActiveSection(tmp), 20); return prev; });
  };

  const accHandleEdit = (item: any) => {
    setAccEditingId(item.id);
    const { id, company_id, ...rest } = item;
    setAccFormData(rest);
    setAccShowForm(true);
  };

  // Track changes
  useEffect(() => {
    if (initialSettings && activeTopTab === "general") {
      const changed =
        JSON.stringify(settingsForm) !== JSON.stringify(initialSettings);
      setHasUnsavedChanges(changed);
    }
  }, [settingsForm, initialSettings, activeTopTab]);

  // Load subscription status when section is opened
  useEffect(() => {
    if (activeSection === "subscription") {
      setSubLoading(true);
      apiFetch<SubStatus[]>("/subscriptions/my-status")
        .then((data) => setSubStatuses(data))
        .catch(() => setSubStatuses([]))
        .finally(() => setSubLoading(false));
    }
  }, [activeSection]);

  useEffect(() => {
    if (!isAdmin && me?.company_ids?.length && companyId === null) {
      setCompanyId(me.company_ids[0]);
    }
  }, [isAdmin, me?.company_ids, companyId]);

  useEffect(() => {
    if (!isAdmin && isPortalSuperUser && activeSection === "users-companies") {
      const cid = companyId ?? primaryPortalCompany?.id ?? null;
      if (cid) {
        loadPortalManagedUsers(cid);
      }
    }
  }, [activeSection, companyId, isAdmin, isPortalSuperUser, primaryPortalCompany?.id]);

  useEffect(() => {
    if (!isAdmin && isPortalSuperUser && activeSection === "users-companies" && portalUsersTab === "audit") {
      const cid = companyId ?? primaryPortalCompany?.id ?? null;
      if (cid) {
        loadPortalAuditTrail(cid);
      }
    }
  }, [
    activeSection,
    companyId,
    isAdmin,
    isPortalSuperUser,
    portalUsersTab,
    primaryPortalCompany?.id,
    portalAuditSearch,
    portalAuditAction,
    portalAuditStatus,
    portalAuditUserId,
  ]);

  useEffect(() => {
    if (!isAdmin && isPortalSuperUser && activeSection === "users-companies" && !portalAuditActions.length) {
      apiFetch<string[]>("/audit-logs/actions")
        .then(setPortalAuditActions)
        .catch(() => setPortalAuditActions([]));
    }
  }, [activeSection, isAdmin, isPortalSuperUser, portalAuditActions.length]);

  const loadTaxes = async (cid: number) => {
    const data = await apiFetch<TaxSetting[]>(
      `/tax-settings?company_id=${cid}`,
    );
    setTaxes(data);
    if (data.length && !selectedTax) {
      setSelectedTax(data[0]);
    }
  };

  const loadAdmins = async () => {
    try {
      setAdminError(null);
      const data = await apiFetch<User[]>("/users");
      setAdmins(data.filter((u) => u.is_admin));
    } catch (err: any) {
      setAdminError(err.message || "Failed to load admins");
    }
  };

  const loadDevices = async (cid: number) => {
    try {
      const data = await apiFetch<DeviceBasic[]>(`/devices?company_id=${cid}`);
      setDevices(data);
      if (data.length) setPullDeviceId(data[0].id);
      else setPullDeviceId(null);
    } catch {
      setDevices([]);
      setPullDeviceId(null);
    }
  };

  const pullZimraTaxes = async () => {
    if (!pullDeviceId) return;
    setPulling(true);
    setPullError(null);
    setPullSuccess(null);
    try {
      const result = await apiFetch<TaxSetting[]>(
        `/tax-settings/pull-from-fdms?device_id=${pullDeviceId}`,
        { method: "POST" },
      );
      setPullSuccess(
        `Successfully pulled ${result.length} ZIMRA tax(es) from device`,
      );
      if (companyId) loadTaxes(companyId);
    } catch (err: any) {
      setPullError(err.message || "Failed to pull taxes from FDMS");
    } finally {
      setPulling(false);
    }
  };

  // POS data loaders
  const loadPosEmployees = async (cid: number) => {
    try {
      const data = await apiFetch<POSEmployeeItem[]>(
        `/pos/employees?company_id=${cid}&include_inactive=true`,
      );
      setPosEmployees(data);
    } catch {
      setPosEmployees([]);
    }
  };

  const loadPosPaymentMethods = async (cid: number) => {
    try {
      const data = await apiFetch<POSPaymentMethodItem[]>(
        `/payments/methods/list?company_id=${cid}&include_inactive=true`,
      );
      setPosPaymentMethods(data);
    } catch {
      setPosPaymentMethods([]);
    }
  };

  const loadPosTills = async (cid: number) => {
    try {
      const data = await apiFetch<POSTillItem[]>(
        `/pos/tills?company_id=${cid}&include_inactive=true`,
      );
      setPosTills(data);
    } catch {
      setPosTills([]);
    }
  };

  useEffect(() => {
    if (!companyId) {
      setWarehouses([]);
      return;
    }
    let cancelled = false;
    apiFetch<Warehouse[]>(`/warehouses?company_id=${companyId}`)
      .then((list) => {
        if (!cancelled) setWarehouses(list || []);
      })
      .catch(() => {
        if (!cancelled) setWarehouses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const savePosTill = async () => {
    if (!companyId || !tillForm.name) return;
    setPosError(null);
    setTillSaving(true);
    try {
      if (tillEditing) {
        await apiFetch(`/pos/tills/${tillEditing}`, {
          method: "PUT",
          body: JSON.stringify(tillForm),
        });
        setStatus("Point Of Sales updated");
      } else {
        await apiFetch("/pos/tills", {
          method: "POST",
          body: JSON.stringify({ ...tillForm, company_id: companyId }),
        });
        setStatus("Point Of Sales added");
      }
      setTillForm({
        name: "",
        employee_ids: [],
        warehouse_id: null,
        fiscal_device_id: null,
      });
      setTillEditing(null);
      setTillDropdownOpen(false);
      loadPosTills(companyId);
    } catch (err: any) {
      setPosError(err.message || "Failed to save Point Of Sales");
    } finally {
      setTillSaving(false);
    }
  };

  const deletePosTill = async (id: number) => {
    if (!companyId) return;
    const confirmed = await showConfirm({
      title: "Remove Point Of Sales",
      message: "Are you sure you want to remove this Point Of Sales?",
      variant: "warning",
      confirmLabel: "Remove",
    });
    if (!confirmed) return;
    try {
      await apiFetch(`/pos/tills/${id}`, { method: "DELETE" });
      setStatus("Point Of Sales deleted");
      loadPosTills(companyId);
    } catch (err: any) {
      setPosError(err.message || "Failed to delete Point Of Sales");
    }
  };

  const savePosEmployee = async () => {
    if (!companyId || !posEmpForm.name) return;
    setPosError(null);
    setPosEmpSaving(true);
    try {
      if (posEmpEditing) {
        await apiFetch(`/pos/employees/${posEmpEditing}`, {
          method: "PUT",
          body: JSON.stringify(posEmpForm),
        });
        setStatus("Employee updated");
      } else {
        await apiFetch("/pos/employees", {
          method: "POST",
          body: JSON.stringify({ ...posEmpForm, company_id: companyId }),
        });
        setStatus("Employee added");
      }
      setPosEmpForm({ name: "", pin: "", role: "cashier", email: "" });
      setPosEmpEditing(null);
      loadPosEmployees(companyId);
    } catch (err: any) {
      setPosError(err.message || "Failed to save employee");
    } finally {
      setPosEmpSaving(false);
    }
  };

  const deletePosEmployee = async (id: number) => {
    if (!companyId) return;
    const confirmed = await showConfirm({
      title: "Remove employee",
      message: "Are you sure you want to remove this employee?",
      variant: "warning",
      confirmLabel: "Remove",
    });
    if (!confirmed) return;
    try {
      await apiFetch(`/pos/employees/${id}`, { method: "DELETE" });
      setStatus("Employee deleted");
      loadPosEmployees(companyId);
    } catch (err: any) {
      setPosError(err.message || "Failed to delete employee");
    }
  };

  const savePosPaymentMethod = async () => {
    if (!companyId || !posPmForm.name) return;
    setPosError(null);
    setPosPmSaving(true);
    try {
      if (posPmEditing) {
        await apiFetch(`/payments/methods/${posPmEditing}`, {
          method: "PUT",
          body: JSON.stringify(posPmForm),
        });
        setStatus("Payment method updated");
      } else {
        await apiFetch("/payments/methods", {
          method: "POST",
          body: JSON.stringify({ ...posPmForm, company_id: companyId }),
        });
        setStatus("Payment method added");
      }
      setPosPmForm({ name: "", code: "cash" });
      setPosPmEditing(null);
      loadPosPaymentMethods(companyId);
    } catch (err: any) {
      setPosError(err.message || "Failed to save payment method");
    } finally {
      setPosPmSaving(false);
    }
  };

  // ─── Currency Management Functions ───
  const loadCurrencies = async (cid: number) => {
    try {
      const data = await apiFetch<CurrencyItem[]>(
        `/currencies?company_id=${cid}&active_only=false`,
      );
      setCurrencyList(data);
    } catch {
      setCurrencyList([]);
    }
  };

  const loadCurrencyRates = async (currId: number) => {
    try {
      const data = await apiFetch<CurrencyRateRead[]>(
        `/currencies/${currId}/rates?limit=60`,
      );
      setCurrencyRates(data);
    } catch {
      setCurrencyRates([]);
    }
  };

  const saveCurrency = async () => {
    if (
      !companyId ||
      !currencyForm.code ||
      !currencyForm.name ||
      !currencyForm.symbol
    )
      return;
    setCurrencyError(null);
    try {
      if (currencyEditing) {
        await apiFetch(`/currencies/${currencyEditing}`, {
          method: "PATCH",
          body: JSON.stringify(currencyForm),
        });
        setStatus("Currency updated");
      } else {
        await apiFetch("/currencies", {
          method: "POST",
          body: JSON.stringify({ ...currencyForm, company_id: companyId }),
        });
        setStatus("Currency added");
      }
      setCurrencyForm({
        code: "",
        name: "",
        symbol: "",
        position: "before",
        decimal_places: 2,
        is_default: false,
      });
      setCurrencyEditing(null);
      setShowCurrencyForm(false);
      loadCurrencies(companyId);
      setTimeout(() => setStatus(null), 3000);
    } catch (err: any) {
      setCurrencyError(err.message || "Failed to save currency");
    }
  };

  const deleteCurrency = async (id: number) => {
    if (!companyId) return;
    const confirmed = await showConfirm({
      title: "Delete currency",
      message: "Are you sure you want to delete this currency and all its rates?",
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    try {
      await apiFetch(`/currencies/${id}`, { method: "DELETE" });
      setStatus("Currency deleted");
      if (selectedCurrency?.id === id) {
        setSelectedCurrency(null);
        setCurrencyRates([]);
      }
      loadCurrencies(companyId);
      setTimeout(() => setStatus(null), 3000);
    } catch (err: any) {
      setCurrencyError(err.message || "Failed to delete currency");
    }
  };

  const setDefaultCurrency = async (id: number) => {
    try {
      await apiFetch(`/currencies/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_default: true }),
      });
      setStatus("Default currency updated");
      if (companyId) loadCurrencies(companyId);
      setTimeout(() => setStatus(null), 3000);
    } catch (err: any) {
      setCurrencyError(err.message || "Failed to set default currency");
    }
  };

  const saveCurrencyRate = async () => {
    if (!selectedCurrency || !rateForm.rate || !rateForm.date) return;
    setCurrencyError(null);
    try {
      if (rateEditing) {
        await apiFetch(`/currencies/rates/${rateEditing}`, {
          method: "PATCH",
          body: JSON.stringify({
            rate: parseFloat(rateForm.rate),
            rate_date: rateForm.date,
          }),
        });
        setStatus("Rate updated");
      } else {
        await apiFetch(`/currencies/${selectedCurrency.id}/rates`, {
          method: "POST",
          body: JSON.stringify({
            currency_id: selectedCurrency.id,
            company_id: selectedCurrency.company_id,
            rate: parseFloat(rateForm.rate),
            rate_date: rateForm.date,
          }),
        });
        setStatus("Rate saved");
      }
      setRateForm({ rate: "", date: new Date().toISOString().slice(0, 10) });
      setRateEditing(null);
      loadCurrencyRates(selectedCurrency.id);
      setTimeout(() => setStatus(null), 3000);
    } catch (err: any) {
      setCurrencyError(err.message || "Failed to save rate");
    }
  };

  const deleteCurrencyRate = async (rateId: number) => {
    if (!selectedCurrency) return;
    const confirmed = await showConfirm({
      title: "Delete rate",
      message: "Delete this rate?",
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    try {
      await apiFetch(`/currencies/rates/${rateId}`, { method: "DELETE" });
      setStatus("Rate deleted");
      loadCurrencyRates(selectedCurrency.id);
      setTimeout(() => setStatus(null), 3000);
    } catch (err: any) {
      setCurrencyError(err.message || "Failed to delete rate");
    }
  };

  // Load currencies when section is active
  useEffect(() => {
    if (activeSection === "currencies" && companyId) {
      loadCurrencies(companyId);
    }
  }, [activeSection, companyId]);

  // Load rates when a currency is selected
  useEffect(() => {
    if (selectedCurrency) {
      loadCurrencyRates(selectedCurrency.id);
    }
  }, [selectedCurrency?.id]);

  const loadCompanySettings = async (cid: number) => {
    try {
      const data = await apiFetch<CompanySettings>(
        `/company-settings?company_id=${cid}`,
      );
      setCompanySettings(data);
      const formData = {
        currency_code: data.currency_code || "USD",
        currency_symbol: data.currency_symbol || "$",
        currency_position: data.currency_position || "before",
        decimal_places: data.decimal_places ?? 2,
        invoice_prefix: data.invoice_prefix || "INV",
        quotation_prefix: data.quotation_prefix || "QUO",
        invoice_notes: data.invoice_notes || "",
        payment_terms_default: data.payment_terms_default || "Due on receipt",
        inventory_valuation: data.inventory_valuation || "fifo",
        auto_reserve_stock: data.auto_reserve_stock ?? true,
        allow_negative_stock: data.allow_negative_stock ?? false,
        fiscal_enabled: data.fiscal_enabled ?? false,
        fiscal_device_id: data.fiscal_device_id ?? null,
        zimra_bp_no: data.zimra_bp_no || "",
        zimra_tin: data.zimra_tin || "",
        fiscal_auto_submit: data.fiscal_auto_submit ?? false,
        default_sales_tax_id: data.default_sales_tax_id ?? null,
        default_purchase_tax_id: data.default_purchase_tax_id ?? null,
        tax_included_in_price: data.tax_included_in_price ?? false,
        logo_data: data.logo_data || "",
        document_layout: data.document_layout || "external_layout_standard",
        document_header: data.document_header || "",
        document_footer: data.document_footer || "",
        document_watermark: data.document_watermark || "",
        document_watermark_opacity: data.document_watermark_opacity || "0.08",
        sequence_size: data.sequence_size ?? 4,
        sequence_step: data.sequence_step ?? 1,
        sequence_next: data.sequence_next ?? 1,
      };
      setSettingsForm(formData);
      setInitialSettings(formData);
      setHasUnsavedChanges(false);
    } catch (err) {
      // Settings don't exist yet, use defaults
      setCompanySettings(null);
      const defaults = {
        currency_code: "USD",
        currency_symbol: "$",
        currency_position: "before",
        decimal_places: 2,
        invoice_prefix: "INV",
        quotation_prefix: "QUO",
        invoice_notes: "",
        payment_terms_default: "Due on receipt",
        inventory_valuation: "fifo",
        auto_reserve_stock: true,
        allow_negative_stock: false,
        fiscal_enabled: false,
        fiscal_device_id: null as number | null,
        zimra_bp_no: "",
        zimra_tin: "",
        fiscal_auto_submit: false,
        default_sales_tax_id: null as number | null,
        default_purchase_tax_id: null as number | null,
        tax_included_in_price: false,
        logo_data: "",
        document_layout: "external_layout_standard",
        document_header: "",
        document_footer: "",
        document_watermark: "",
        document_watermark_opacity: "0.08",
        sequence_size: 4,
        sequence_step: 1,
        sequence_next: 1,
      };
      setSettingsForm(defaults);
      setInitialSettings(defaults);
      setHasUnsavedChanges(false);
    }
  };

  const saveCompanySettings = async () => {
    if (!companyId) return;
    const method = companySettings ? "PATCH" : "POST";
    const url = companySettings
      ? `/company-settings/${companySettings.id}`
      : "/company-settings";
    const payload = companySettings
      ? settingsForm
      : { ...settingsForm, company_id: companyId };

    await apiFetch(url, {
      method,
      body: JSON.stringify(payload),
    });
    setStatus("Settings saved successfully");
    setInitialSettings(settingsForm);
    setHasUnsavedChanges(false);
    setTimeout(() => setStatus(null), 3000);
    loadCompanySettings(companyId);
  };

  const discardChanges = () => {
    if (initialSettings) {
      setSettingsForm(initialSettings);
      setHasUnsavedChanges(false);
    }
  };

  const resetPosEmployeeForm = () => {
    setPosEmpForm({ name: "", pin: "", role: "cashier", email: "" });
    setPosEmpEditing(null);
  };

  const resetPosPaymentMethodForm = () => {
    setPosPmForm({ name: "", code: "cash" });
    setPosPmEditing(null);
  };

  const resetPosTillForm = () => {
    setTillForm({
      name: "",
      employee_ids: [],
      warehouse_id: null,
      fiscal_device_id: null,
    });
    setTillEditing(null);
    setTillDropdownOpen(false);
  };

  const isPosEmployeeDirty = Boolean(
    posEmpEditing ||
      posEmpForm.name ||
      posEmpForm.pin ||
      posEmpForm.email ||
      posEmpForm.role !== "cashier",
  );

  const isPosPaymentMethodDirty = Boolean(
    posPmEditing || posPmForm.name || posPmForm.code !== "cash",
  );

  const isPosTillDirty = Boolean(
    tillEditing ||
      tillForm.name.trim() ||
      tillForm.employee_ids.length ||
      tillForm.warehouse_id !== null ||
      tillForm.fiscal_device_id !== null,
  );

  const saveCurrentSection = () => {
    if (activeTopTab !== "general") return;
    if (activeSection === "pos-settings") {
      if (posConfigTab === "employees") {
        void savePosEmployee();
        return;
      }
      if (posConfigTab === "payments") {
        void savePosPaymentMethod();
        return;
      }
      if (posConfigTab === "tills") {
        void savePosTill();
        return;
      }
    }
    void saveCompanySettings();
  };

  const discardCurrentSection = () => {
    if (activeTopTab !== "general") return;
    if (activeSection === "pos-settings") {
      if (posConfigTab === "employees") {
        resetPosEmployeeForm();
        return;
      }
      if (posConfigTab === "payments") {
        resetPosPaymentMethodForm();
        return;
      }
      if (posConfigTab === "tills") {
        resetPosTillForm();
        return;
      }
    }
    discardChanges();
  };

  const isCurrentSectionSaveDisabled = () => {
    if (activeTopTab !== "general") return true;
    if (activeSection === "pos-settings") {
      if (posConfigTab === "employees") {
        return posEmpSaving || !posEmpForm.name;
      }
      if (posConfigTab === "payments") {
        return posPmSaving || !posPmForm.name;
      }
      if (posConfigTab === "tills") {
        return tillSaving || !tillForm.name;
      }
    }
    return !hasUnsavedChanges;
  };

  const isCurrentSectionDiscardDisabled = () => {
    if (activeTopTab !== "general") return true;
    if (activeSection === "pos-settings") {
      if (posConfigTab === "employees") return !isPosEmployeeDirty;
      if (posConfigTab === "payments") return !isPosPaymentMethodDirty;
      if (posConfigTab === "tills") return !isPosTillDirty;
    }
    return !hasUnsavedChanges;
  };

  const handleLogoChange = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setSettingsForm((prev) => ({ ...prev, logo_data: result }));
    };
    reader.readAsDataURL(file);
  };

  const previewDocument = () => {
    const layoutKey = (
      settingsForm.document_layout || "external_layout_standard"
    ).replace("external_layout_", "layout-");
    const logoMarkup = settingsForm.logo_data
      ? `<img class="logo" src="${settingsForm.logo_data}" alt="Logo" />`
      : "";
    const company = selectedCompany;
    const win = window.open("", "_blank");
    if (!win) return;
    const html = `
      <html>
        <head>
          <title>Document Preview</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; padding: 32px; color: var(--slate-900); background: var(--slate-50); }
            h1 { font-size: 22px; margin-bottom: 6px; }
            h2 { font-size: 16px; margin: 0; }
            .muted { color: var(--slate-500); font-size: 12px; }
            .section { margin-top: 20px; }
            .doc { padding: 24px; border-radius: 16px; background: var(--white-500); margin-bottom: 24px; }
            .layout-boxed { border: 1px solid var(--slate-200); }
            .layout-bold h1 { font-size: 26px; font-weight: 800; }
            .layout-bubble { border: 1px solid var(--slate-200); box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08); }
            .layout-standard { }
            .header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
            .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 64px; font-weight: 700; color: var(--slate-400); opacity: ${settingsForm.document_watermark_opacity || "0.08"}; pointer-events: none; }
            .doc { position: relative; }
            .logo { height: 48px; max-width: 180px; object-fit: contain; }
            .company-block { text-align: right; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border-bottom: 1px solid var(--slate-200); padding: 8px; font-size: 12px; }
            th { text-align: left; background: var(--slate-50); }
            .totals { margin-top: 16px; width: 260px; float: right; }
            .totals div { display: flex; justify-content: space-between; margin-bottom: 6px; }
            .info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
            .info-card { border: 1px solid var(--slate-200); border-radius: 12px; padding: 12px; }
          </style>
        </head>
        <body>
          <div class="doc ${layoutKey}">
            ${settingsForm.document_watermark ? `<div class="watermark">${settingsForm.document_watermark}</div>` : ""}
            <div class="header">
              <div>
                ${logoMarkup}
                <h1>${company?.name || "Company"}</h1>
                <div class="muted">${company?.address || ""}</div>
              </div>
              <div class="company-block">
                <div class="muted">Email: ${company?.email || "-"}</div>
                <div class="muted">Phone: ${company?.phone || "-"}</div>
                <div class="muted">VAT: ${company?.vat || "-"}</div>
                <div class="muted">TIN: ${company?.tin || "-"}</div>
              </div>
            </div>
            <div class="section">
              <strong>Invoice</strong>
              ${settingsForm.document_header ? `<div class="muted">${settingsForm.document_header}</div>` : ""}
              <div class="muted">Reference: INV-0001</div>
              <div class="muted">Date: ${new Date().toLocaleDateString()}</div>
              <div class="muted">Due: ${new Date().toLocaleDateString()}</div>
              <div class="muted">Currency: ${settingsForm.currency_code}</div>
            </div>
            <div class="info-grid">
              <div class="info-card">
                <strong>Customer</strong>
                <div class="muted">Acme Corp</div>
                <div class="muted">123 Sample Street</div>
                <div class="muted">Email: info@acme.test</div>
                <div class="muted">Phone: 000-000-000</div>
                <div class="muted">VAT: 0000</div>
                <div class="muted">TIN: 0000</div>
              </div>
              <div class="info-card">
                <strong>Payment</strong>
                <div class="muted">Terms: ${settingsForm.payment_terms_default || "-"}</div>
                <div class="muted">Reference: PAY-0001</div>
                <div class="muted">Status: Draft</div>
                <div class="muted">Notes: ${settingsForm.invoice_notes || "-"}</div>
              </div>
            </div>
            <div class="section">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style="text-align:right;">Qty</th>
                    <th style="text-align:right;">Price</th>
                    <th style="text-align:right;">Tax</th>
                    <th style="text-align:right;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Sample Item</td>
                    <td style="text-align:right;">2</td>
                    <td style="text-align:right;">100.00</td>
                    <td style="text-align:right;">15%</td>
                    <td style="text-align:right;">230.00</td>
                  </tr>
                </tbody>
              </table>
              <div class="totals">
                <div><span>Subtotal</span><span>200.00</span></div>
                <div><span>Tax</span><span>30.00</span></div>
                <div><strong>Total</strong><strong>230.00</strong></div>
              </div>
            </div>
            ${settingsForm.document_footer ? `<div class="section muted">${settingsForm.document_footer}</div>` : ""}
          </div>

          <div class="doc ${layoutKey}">
            ${settingsForm.document_watermark ? `<div class="watermark">${settingsForm.document_watermark}</div>` : ""}
            <div class="header">
              <div>
                ${logoMarkup}
                <h1>${company?.name || "Company"}</h1>
                <div class="muted">${company?.address || ""}</div>
              </div>
              <div class="company-block">
                <div class="muted">Email: ${company?.email || "-"}</div>
                <div class="muted">Phone: ${company?.phone || "-"}</div>
                <div class="muted">VAT: ${company?.vat || "-"}</div>
                <div class="muted">TIN: ${company?.tin || "-"}</div>
              </div>
            </div>
            <div class="section">
              <strong>Quotation</strong>
              ${settingsForm.document_header ? `<div class="muted">${settingsForm.document_header}</div>` : ""}
              <div class="muted">Reference: QUO-0001</div>
              <div class="muted">Date: ${new Date().toLocaleDateString()}</div>
              <div class="muted">Expires: ${new Date().toLocaleDateString()}</div>
              <div class="muted">Status: Draft</div>
            </div>
            <div class="info-grid">
              <div class="info-card">
                <strong>Customer</strong>
                <div class="muted">Acme Corp</div>
                <div class="muted">123 Sample Street</div>
                <div class="muted">Email: info@acme.test</div>
                <div class="muted">Phone: 000-000-000</div>
                <div class="muted">VAT: 0000</div>
                <div class="muted">TIN: 0000</div>
              </div>
              <div class="info-card">
                <strong>Payment</strong>
                <div class="muted">Terms: ${settingsForm.payment_terms_default || "-"}</div>
                <div class="muted">Notes: -</div>
              </div>
            </div>
            <div class="section">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style="text-align:right;">Qty</th>
                    <th style="text-align:right;">Price</th>
                    <th style="text-align:right;">Tax</th>
                    <th style="text-align:right;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Sample Item</td>
                    <td style="text-align:right;">1</td>
                    <td style="text-align:right;">100.00</td>
                    <td style="text-align:right;">15%</td>
                    <td style="text-align:right;">115.00</td>
                  </tr>
                </tbody>
              </table>
              <div class="totals">
                <div><strong>Total</strong><strong>115.00</strong></div>
              </div>
            </div>
            ${settingsForm.document_footer ? `<div class="section muted">${settingsForm.document_footer}</div>` : ""}
          </div>
        </body>
      </html>
    `;
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  const previewCard = () => (
    <div className="card shadow-sm" style={{ background: "var(--slate-50)" }}>
      <div className="card-body">
        <div
          style={{ fontSize: 12, color: "var(--slate-500)", marginBottom: 8 }}
        >
          Live Preview
        </div>
        {(() => {
          const layout =
            settingsForm.document_layout || "external_layout_standard";
          const layoutKey = layout.replace("external_layout_", "");
          const baseStyle: React.CSSProperties = {
            background: "var(--white-500)",
            borderRadius: 12,
            padding: 12,
            border:
              layoutKey === "boxed" || layoutKey === "bubble"
                ? "1px solid var(--slate-200)"
                : "1px solid var(--slate-200)",
            boxShadow:
              layoutKey === "bubble"
                ? "0 10px 24px rgba(15, 23, 42, 0.08)"
                : "none",
          };
          return (
            <div
              style={{ ...baseStyle, position: "relative", overflow: "hidden" }}
            >
              {settingsForm.document_watermark && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 42,
                    fontWeight: 700,
                    color: "var(--slate-400)",
                    opacity: Number(
                      settingsForm.document_watermark_opacity || "0.08",
                    ),
                    transform: "rotate(-25deg)",
                    pointerEvents: "none",
                  }}
                >
                  {settingsForm.document_watermark}
                </div>
              )}

              {activeSection === "sequences" && (
                <section id="sequences" className="settings-section">
                  <div className="settings-section-header">
                    <h4>Invoice Settings</h4>
                    <div style={{ display: "flex", gap: 8 }}>
                      {renderGeneralSaveActions()}
                    </div>
                  </div>
                  <p className="settings-section-desc">
                    Control how invoice references are formatted and
                    incremented. The preview shows what the next invoice number
                    will look like.
                  </p>
                  <div
                    style={{
                      marginBottom: 16,
                      padding: 16,
                      borderRadius: 12,
                      border: "1px solid var(--slate-200)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Next invoice reference
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 700 }}>
                        {invoiceSequencePreview}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        textAlign: "right",
                        color: "var(--slate-500)",
                      }}
                    >
                      Sequence Size controls the padding of the numeric portion.
                      Step and Next Number determine how the counter advances.
                    </div>
                  </div>
                  <div className="settings-company">
                    <div className="settings-company-info">
                      <div className="settings-company-name">
                        {selectedCompany?.name ?? "—"}
                      </div>
                      <div className="settings-company-line">
                        Company: {selectedCompany?.name || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="settings-company">
                    <div
                      className="settings-company-logo"
                      style={{ minWidth: 260 }}
                    >
                      <div style={{ padding: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>
                          Customer Invoice Numbering
                        </div>
                        <div style={{ color: "#666", marginBottom: 8 }}>
                          Implementation: Standard sequence (prefix + step-based
                          counter)
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <label
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            Active
                            <input type="checkbox" checked={true} readOnly />
                          </label>
                        </div>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="settings-doc-col">
                        <div className="settings-doc-group-title">Sequence</div>
                        <div className="settings-doc-fields">
                          <label className="input">
                            Prefix
                            <input
                              type="text"
                              value={settingsForm.invoice_prefix}
                              onChange={(e) =>
                                setSettingsForm({
                                  ...settingsForm,
                                  invoice_prefix: e.target.value,
                                })
                              }
                              placeholder="e.g., INV"
                            />
                          </label>
                          <label className="input">
                            Suffix
                            <input
                              type="text"
                              value={settingsForm.quotation_prefix}
                              onChange={(e) =>
                                setSettingsForm({
                                  ...settingsForm,
                                  quotation_prefix: e.target.value,
                                })
                              }
                              placeholder="e.g., /%{year}s/"
                            />
                          </label>
                          <div style={{ display: "flex", gap: 12 }}>
                            <label className="input" style={{ flex: 1 }}>
                              Sequence Size
                              <input
                                type="number"
                                min={1}
                                value={settingsForm.sequence_size}
                                onChange={(e) =>
                                  setSettingsForm({
                                    ...settingsForm,
                                    sequence_size: Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                            <label className="input" style={{ flex: 1 }}>
                              Step
                              <input
                                type="number"
                                min={1}
                                value={settingsForm.sequence_step}
                                onChange={(e) =>
                                  setSettingsForm({
                                    ...settingsForm,
                                    sequence_step: Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                          </div>
                          <div style={{ display: "flex", gap: 12 }}>
                            <label className="input" style={{ flex: 1 }}>
                              Next Number
                              <input
                                type="number"
                                min={1}
                                value={settingsForm.sequence_next}
                                onChange={(e) =>
                                  setSettingsForm({
                                    ...settingsForm,
                                    sequence_next: Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                          </div>
                          <div
                            style={{
                              marginTop: 12,
                              fontSize: 12,
                              color: "var(--muted)",
                              lineHeight: 1.4,
                            }}
                          >
                            <div>
                              Sequence Size determines how many digits appear
                              after the prefix.
                            </div>
                            <div>
                              Step controls how much the counter increases each
                              time an invoice is created.
                            </div>
                            <div>
                              Next Number is the raw numeric value that will be
                              used for the next invoice.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  {settingsForm.logo_data && (
                    <img
                      src={settingsForm.logo_data}
                      alt="Logo"
                      style={{
                        height: 32,
                        maxWidth: 120,
                        objectFit: "contain",
                      }}
                    />
                  )}
                  <div
                    style={{
                      fontWeight: layoutKey === "bold" ? 800 : 700,
                      fontSize: layoutKey === "bold" ? 16 : 14,
                    }}
                  >
                    {selectedCompany?.name || "Company"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--slate-400)" }}>
                    {selectedCompany?.address || ""}
                  </div>
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontSize: 11,
                    color: "var(--slate-400)",
                  }}
                >
                  <div>{selectedCompany?.email || "-"}</div>
                  <div>{selectedCompany?.phone || "-"}</div>
                  <div>VAT: {selectedCompany?.vat || "-"}</div>
                </div>
              </div>
              {settingsForm.document_header && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "var(--slate-500)",
                  }}
                >
                  {settingsForm.document_header}
                </div>
              )}
              <div
                style={{ marginTop: 8, display: "flex", gap: 8, fontSize: 11 }}
              >
                <div
                  style={{
                    flex: 1,
                    border: "1px solid var(--slate-200)",
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Customer</div>
                  <div style={{ color: "var(--slate-400)" }}>Acme Corp</div>
                </div>
                <div
                  style={{
                    flex: 1,
                    border: "1px solid var(--slate-200)",
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Payment</div>
                  <div style={{ color: "var(--slate-400)" }}>
                    Terms: {settingsForm.payment_terms_default || "-"}
                  </div>
                </div>
              </div>
              {settingsForm.document_footer && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "var(--slate-500)",
                  }}
                >
                  {settingsForm.document_footer}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );

  useEffect(() => {
    if (companyId) {
      loadTaxes(companyId);
      loadCompanySettings(companyId);
      loadDevices(companyId);
      loadPosEmployees(companyId);
      loadPosPaymentMethods(companyId);
      loadPosTills(companyId);
    }
  }, [companyId]);

  useEffect(() => {
    if (me?.is_admin) {
      loadAdmins();
    }
  }, [me?.is_admin]);

  const createTax = async () => {
    if (!companyId) return;
    const payload = {
      company_id: companyId,
      name: "New Tax",
      description: "",
      tax_type: "sales",
      tax_scope: "sales",
      label_on_invoice: "",
      rate: 0,
      zimra_code: "",
      is_active: true,
    };
    const created = await apiFetch<TaxSetting>("/tax-settings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSelectedTax(created);
    setShowForm(true);
    loadTaxes(companyId);
  };

  const saveTax = async () => {
    if (!selectedTax) return;
    await apiFetch(`/tax-settings/${selectedTax.id}`, {
      method: "PATCH",
      body: JSON.stringify(selectedTax),
    });
    setStatus("Tax saved");
    if (companyId) {
      loadTaxes(companyId);
    }
  };

  const deleteTax = async (taxId: number) => {
    await apiFetch(`/tax-settings/${taxId}`, { method: "DELETE" });
    setStatus("Tax deleted");
    if (companyId) {
      loadTaxes(companyId);
    }
    setSelectedTax(null);
    setShowForm(false);
  };

  const createAdmin = async () => {
    await apiFetch<User>("/users", {
      method: "POST",
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        is_admin: true,
      }),
    });
    setAdminEmail("");
    setAdminPassword("");
    setShowAdminForm(false);
    setStatus("Admin created");
    loadAdmins();
  };

  const updateAdmin = async (
    userId: number,
    payload: Partial<User> & { password?: string },
  ) => {
    await apiFetch(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setStatus("Admin updated");
    setPasswordEdits((prev) => ({ ...prev, [userId]: "" }));
    setEditingId(null);
    loadAdmins();
  };

  const deleteAdmin = async (userId: number) => {
    await apiFetch(`/users/${userId}`, { method: "DELETE" });
    setStatus("Admin deleted");
    loadAdmins();
  };

  const filteredCompanies = useMemo(() => {
    if (!companyQuery.trim()) return companies;
    const q = companyQuery.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tin && c.tin.toLowerCase().includes(q)) ||
        (c.vat && c.vat.toLowerCase().includes(q)),
    );
  }, [companies, companyQuery]);

  const formattedTaxes = useMemo(() => taxes, [taxes]);
  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) || null,
    [companies, companyId],
  );
  const invoiceSequencePreview = useMemo(() => {
    const prefix = (settingsForm.invoice_prefix || "INV").trim() || "INV";
    const next = Math.max(1, settingsForm.sequence_next ?? 1);
    const size = Math.max(1, settingsForm.sequence_size ?? 4);
    const padded = String(next).padStart(size, "0");
    return `${prefix}-${padded}`;
  }, [
    settingsForm.invoice_prefix,
    settingsForm.sequence_next,
    settingsForm.sequence_size,
  ]);

  if (companiesLoading && companyId === null) {
    return <div className="loading-indicator">Loading companies...</div>;
  }
  if (!isAdmin && companyId === null && companies.length) {
    return <div className="loading-indicator">Loading companies...</div>;
  }

  if (!me) {
    return <div className="content">Loading...</div>;
  }

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

        <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>
          Select a company to view its purchase orders.
        </p>

        <div className="device-company-grid">
          {filteredCompanies.map((c) => (
            <button
              key={c.id}
              className="device-company-card"
              onClick={() => setCompanyId(c.id)}
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

  const renderGeneralSaveActions = () => (
    <>
      <button
        className="primary"
        onClick={saveCurrentSection}
        disabled={isCurrentSectionSaveDisabled()}
      >
        Save
      </button>
      <button
        className="outline"
        onClick={discardCurrentSection}
        disabled={isCurrentSectionDiscardDisabled()}
      >
        Discard
      </button>
    </>
  );

  return (
    <div className="settings-page">
      {hasUnsavedChanges && activeTopTab === "general" && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <strong>Unsaved changes</strong> — Don't forget to save your changes.
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              className="primary"
              style={{ fontSize: 12, padding: "6px 12px" }}
              onClick={saveCompanySettings}
            >
              Save
            </button>
            <button
              className="outline"
              style={{ fontSize: 12, padding: "6px 12px" }}
              onClick={discardChanges}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* <div className="settings-topbar">
        <div className="settings-top-left">
          <div className="settings-title">Settings</div>
        </div>
        <div className="settings-top-actions">
          <div className="settings-company-select">
            <label className="input">
              <select
                value={companyId ?? ""}
                onChange={(e) => setCompanyId(Number(e.target.value))}
              >
                {companies.map((c: Company) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div> */}

      <div className="two-panel-left" style={{ margin: "1rem" }}>
        <aside className="settings-sidebar">
          <div className="settings-search">
            <input type="text" placeholder="Search..." />
          </div>
          <div className="settings-sidebar-title">General Settings</div>
          <button
            className={`settings-sidebar-item ${activeSection === "company" ? "active" : ""}`}
            onClick={() => {
              setActiveTopTab("general");
              setActiveSection("company");
            }}
          >
            Company
          </button>
          {showDocumentSettings && (
            <button
              className={`settings-sidebar-item ${activeSection === "document-layout" ? "active" : ""}`}
              onClick={() => {
                setActiveTopTab("general");
                setActiveSection("document-layout");
              }}
            >
              Document Layout
            </button>
          )}
          {showInvoiceSettings && (
            <button
              className={`settings-sidebar-item ${activeSection === "sequences" ? "active" : ""}`}
              onClick={() => {
                setActiveTopTab("general");
                setActiveSection("sequences");
              }}
            >
              Invoice Settings
            </button>
          )}
          {showTaxSettings && (
            <button
              className={`settings-sidebar-item ${activeSection === "zimra-tax" ? "active" : ""}`}
              onClick={() => {
                setActiveTopTab("general");
                setActiveSection("zimra-tax");
              }}
            >
              ZIMRA Taxes
            </button>
          )}
          <button
            className={`settings-sidebar-item ${activeSection === "currencies" ? "active" : ""}`}
            onClick={() => {
              setActiveTopTab("general");
              setActiveSection("currencies");
            }}
          >
            Currencies
          </button>
          {showPOSSettings && (
            <>
              <div className="settings-sidebar-title">Point of Sale</div>
              <button
                className={`settings-sidebar-item ${activeSection === "pos-settings" ? "active" : ""}`}
                onClick={() => {
                  setActiveTopTab("general");
                  setActiveSection("pos-settings");
                }}
              >
                POS Configuration
              </button>
            </>
          )}
          <div className="settings-sidebar-title">Users &amp; Companies</div>
          <button
            className={`settings-sidebar-item ${activeSection === (me.is_admin ? "admins" : "users-companies") ? "active" : ""}`}
            onClick={() => {
              setActiveTopTab("users");
              setActiveSection(me.is_admin ? "admins" : "users-companies");
            }}
          >
            {me.is_admin ? "Administrators" : "Users & Companies"}
          </button>
          <div className="settings-sidebar-title">Subscription</div>
          <button
            className={`settings-sidebar-item ${activeSection === "subscription" ? "active" : ""}`}
            onClick={() => {
              setActiveTopTab("general");
              setActiveSection("subscription");
            }}
          >
            My Subscription
          </button>
          <div className="settings-sidebar-title">Accounting</div>
          <button
            className={`settings-sidebar-item ${activeSection === "acc-accounts" ? "active" : ""}`}
            onClick={() => { setActiveTopTab("general"); setActiveSection("acc-accounts"); accResetForm(); }}
          >
            Chart of Accounts
          </button>
          <button
            className={`settings-sidebar-item ${activeSection === "acc-journals" ? "active" : ""}`}
            onClick={() => { setActiveTopTab("general"); setActiveSection("acc-journals"); accResetForm(); }}
          >
            Journals
          </button>
          <button
            className={`settings-sidebar-item ${activeSection === "acc-payment-terms" ? "active" : ""}`}
            onClick={() => { setActiveTopTab("general"); setActiveSection("acc-payment-terms"); accResetForm(); }}
          >
            Payment Terms
          </button>

          <button
            className={`settings-sidebar-item ${activeSection === "acc-budgets" ? "active" : ""}`}
            onClick={() => { setActiveTopTab("general"); setActiveSection("acc-budgets"); accResetForm(); }}
          >
            Financial Budgets
          </button>
        </aside>
        <main className="settings-main">
          {status && (
            <div className="alert alert-success" style={{ marginBottom: 16 }}>
              {status}
              <button
                onClick={() => setStatus(null)}
                style={{
                  float: "right",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          )}

          {activeTopTab === "general" && (
            <>
              {activeSection === "company" && (
                <section id="company" className="settings-section">
                  <div className="settings-section-header">
                    <h4>Companies</h4>
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <button
                        className="settings-btn-sm"
                        onClick={() => navigate("/companies")}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        Manage Companies
                      </button>
                      {renderGeneralSaveActions()}
                    </div>
                  </div>
                  <div className="settings-company">
                    <div className="settings-company-logo">
                      {settingsForm.logo_data ? (
                        <img src={settingsForm.logo_data} alt="Company Logo" />
                      ) : (
                        <div className="settings-logo-placeholder">Logo</div>
                      )}
                      <label className="settings-logo-upload">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) =>
                            handleLogoChange(e.target.files?.[0] ?? null)
                          }
                        />
                        Update Logo
                      </label>
                    </div>
                    <div className="settings-company-info">
                      <div className="settings-company-name">
                        {selectedCompany?.name ?? "—"}
                      </div>
                      <div className="settings-company-line">
                        {selectedCompany?.address || ""}
                      </div>
                      <div className="settings-company-line">
                        {selectedCompany?.email || ""}
                      </div>
                      <div className="settings-company-line">
                        {selectedCompany?.phone || ""}
                      </div>
                      <div className="settings-company-line">
                        VAT: {selectedCompany?.vat || "—"}
                      </div>
                      <button
                        className="settings-link"
                        onClick={() => navigate("/companies")}
                      >
                        Update Info
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {activeSection === "document-layout" && (
                <section id="document-layout" className="settings-section">
                  <div className="settings-section-header">
                    <h4>Document Layout</h4>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="settings-btn-sm"
                        onClick={() => setShowConfigureLayout(true)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        Configure
                      </button>
                      <button
                        className="settings-btn-sm"
                        onClick={() => setShowEditLayout(true)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit Layout
                      </button>
                      <button
                        className="settings-btn-sm"
                        onClick={previewDocument}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        Preview
                      </button>
                      {renderGeneralSaveActions()}
                    </div>
                  </div>
                  <p className="settings-section-desc">
                    Choose the layout and content of your printed documents
                  </p>
                  <div className="settings-doc-layout">
                    <div className="settings-doc-col">
                      <div className="settings-doc-group-title">Layout</div>
                      <div className="settings-doc-fields">
                        <label className="input">
                          Layout Style
                          <select
                            value={settingsForm.document_layout}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                document_layout: e.target.value,
                              })
                            }
                          >
                            <option value="external_layout_standard">
                              Standard
                            </option>
                            <option value="external_layout_boxed">Boxed</option>
                            <option value="external_layout_bold">Bold</option>
                            <option value="external_layout_bubble">
                              Bubble
                            </option>
                          </select>
                        </label>
                        <label className="input">
                          Default Payment Terms
                          <input
                            value={settingsForm.payment_terms_default}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                payment_terms_default: e.target.value,
                              })
                            }
                            placeholder="e.g., Due on receipt"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="settings-doc-col">
                      <div className="settings-doc-group-title">
                        Header &amp; Footer
                      </div>
                      <div className="settings-doc-fields">
                        <label className="input">
                          Header
                          <textarea
                            rows={2}
                            value={settingsForm.document_header}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                document_header: e.target.value,
                              })
                            }
                            placeholder="Header text for invoices/quotations"
                          />
                        </label>
                        <label className="input">
                          Footer
                          <textarea
                            rows={2}
                            value={settingsForm.document_footer}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                document_footer: e.target.value,
                              })
                            }
                            placeholder="Footer text for invoices/quotations"
                          />
                        </label>
                        {/* Invoice Prefix moved to Invoice Sequencing section */}
                        <label className="input">
                          Invoice Notes
                          <textarea
                            rows={2}
                            value={settingsForm.invoice_notes}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                invoice_notes: e.target.value,
                              })
                            }
                            placeholder="Notes shown at the bottom of invoices/quotations"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="settings-doc-col">
                      <div className="settings-doc-group-title">Watermark</div>
                      <div className="settings-doc-fields">
                        <label className="input">
                          Text
                          <input
                            value={settingsForm.document_watermark}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                document_watermark: e.target.value,
                              })
                            }
                            placeholder="e.g., PAID, DRAFT"
                          />
                        </label>
                        <label className="input">
                          Opacity
                          <input
                            type="number"
                            min="0.02"
                            max="0.3"
                            step="0.01"
                            value={settingsForm.document_watermark_opacity}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                document_watermark_opacity: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                    <div className="settings-doc-preview">{previewCard()}</div>
                  </div>
                </section>
              )}

              {/* Invoice Sequencing */}
              {activeSection === "sequences" && (
                <section id="sequences" className="settings-section">
                  <div className="settings-section-header">
                    <h4>Invoice Sequencing</h4>
                    <div style={{ display: "flex", gap: 8 }}>
                      {renderGeneralSaveActions()}
                    </div>
                  </div>
                  <p className="settings-section-desc">
                    Configure per-company invoice numbering and sequence
                    options.
                  </p>

                  <div className="settings-doc-layout">
                    <div className="settings-doc-col">
                      <div className="settings-doc-group-title">
                        Customer Invoice Numbering
                      </div>
                      <div className="settings-doc-fields">
                        <div style={{ fontWeight: 600 }}>
                          {selectedCompany?.name ?? "—"}
                        </div>
                        <div style={{ color: "#666", marginBottom: 8 }}>
                          Company: {selectedCompany?.name || "—"}
                        </div>
                        <label className="input">
                          Implementation
                          <input value="Standard" readOnly />
                        </label>
                        <label className="input">
                          Active
                          <input type="checkbox" checked={true} readOnly />
                        </label>
                      </div>
                    </div>

                    <div className="settings-doc-col">
                      <div className="settings-doc-group-title">Sequence</div>
                      <div className="settings-doc-fields">
                        <label className="input">
                          Prefix
                          <input
                            type="text"
                            value={settingsForm.invoice_prefix}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                invoice_prefix: e.target.value,
                              })
                            }
                            placeholder="e.g., INV"
                          />
                        </label>

                        <label className="input">
                          Suffix
                          <input
                            type="text"
                            value={settingsForm.quotation_prefix}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                quotation_prefix: e.target.value,
                              })
                            }
                            placeholder="e.g., /%{year}s/"
                          />
                        </label>

                        <div style={{ display: "flex", gap: 12 }}>
                          <label className="input" style={{ flex: 1 }}>
                            Sequence Size
                            <input
                              type="number"
                              min={1}
                              value={settingsForm.sequence_size}
                              onChange={(e) =>
                                setSettingsForm({
                                  ...settingsForm,
                                  sequence_size: Number(e.target.value),
                                })
                              }
                            />
                          </label>

                          <label className="input" style={{ flex: 1 }}>
                            Step
                            <input
                              type="number"
                              min={1}
                              value={settingsForm.sequence_step}
                              onChange={(e) =>
                                setSettingsForm({
                                  ...settingsForm,
                                  sequence_step: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        </div>

                        <label className="input">
                          Next Number
                          <input
                            type="number"
                            min={1}
                            value={settingsForm.sequence_next}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                sequence_next: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* ZIMRA Tax Configuration */}
              {activeSection === "zimra-tax" && (
                <section id="zimra-tax" className="settings-section">
                  <div className="settings-section-header">
                    <h4>ZIMRA Tax Configuration</h4>
                    <div style={{ display: "flex", gap: 8 }}>
                      {renderGeneralSaveActions()}
                    </div>
                  </div>
                  <p className="settings-section-desc">
                    Pull applicable taxes from a registered FDMS device. These
                    taxes will be available for selection on products in
                    Inventory.
                  </p>

                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-end",
                      marginBottom: 16,
                    }}
                  >
                    <label className="input" style={{ flex: 1, maxWidth: 320 }}>
                      Device
                      <select
                        value={pullDeviceId ?? ""}
                        onChange={(e) =>
                          setPullDeviceId(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      >
                        <option value="">— Select a device —</option>
                        {devices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.model || "Device"} — {d.device_id} (
                            {d.serial_number})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary"
                      onClick={pullZimraTaxes}
                      disabled={pulling || !pullDeviceId}
                      style={{ height: 38 }}
                    >
                      {pulling ? "Pulling…" : "Pull ZIMRA Taxes"}
                    </button>
                  </div>
                  {pullError && (
                    <div
                      className="alert alert-danger"
                      style={{ marginBottom: 12 }}
                    >
                      {pullError}
                      <button
                        onClick={() => setPullError(null)}
                        style={{
                          float: "right",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {pullSuccess && (
                    <div
                      className="alert alert-success"
                      style={{ marginBottom: 12 }}
                    >
                      {pullSuccess}
                      <button
                        onClick={() => setPullSuccess(null)}
                        style={{
                          float: "right",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {taxes.length > 0 ? (
                    <table className="table" style={{ marginTop: 0 }}>
                      <thead>
                        <tr>
                          <th>Tax Name</th>
                          <th>Rate (%)</th>
                          <th>ZIMRA Tax ID</th>
                          <th>Tax Code</th>
                          <th>Valid From</th>
                          <th>Valid Till</th>
                          <th>ZIMRA</th>
                          <th>Active</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxes.map((tax) => (
                          <tr key={tax.id}>
                            <td>{tax.name}</td>
                            <td>{tax.rate}%</td>
                            <td>{tax.zimra_tax_id ?? "—"}</td>
                            <td>
                              {tax.zimra_tax_code || tax.zimra_code || "—"}
                            </td>
                            <td>{tax.zimra_valid_from || "—"}</td>
                            <td>{tax.zimra_valid_till || "—"}</td>
                            <td>
                              {tax.is_zimra_tax ? (
                                <span
                                  style={{
                                    color: "var(--green-600)",
                                    fontWeight: 600,
                                  }}
                                >
                                  ✓
                                </span>
                              ) : (
                                <span style={{ color: "var(--slate-400)" }}>
                                  —
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                style={{
                                  color: tax.is_active
                                    ? "var(--green-600)"
                                    : "var(--red-500)",
                                }}
                              >
                                {tax.is_active ? "Yes" : "No"}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  className="icon-btn"
                                  title="Edit"
                                  onClick={() => {
                                    setSelectedTax(tax);
                                    setShowForm(true);
                                  }}
                                ></button>
                                <button
                                  className="icon-btn"
                                  title="Delete"
                                  onClick={() => deleteTax(tax.id)}
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div
                      style={{
                        color: "var(--slate-400)",
                        fontSize: 13,
                        padding: "12px 0",
                      }}
                    >
                      No taxes configured yet. Use "Pull ZIMRA Taxes" to fetch
                      from a registered device, or add one manually.
                    </div>
                  )}

                  <button
                    className="outline"
                    onClick={createTax}
                    style={{ marginTop: 8 }}
                  >
                    <PlusIcon /> Add Tax Manually
                  </button>
                </section>
              )}

              {/* POS Configuration */}
              {activeSection === "currencies" && (
                <section id="currencies" className="settings-section">
                  <div className="settings-section-header">
                    <h4>Currency Configuration</h4>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="settings-btn-sm"
                        onClick={() => {
                          setShowCurrencyForm(true);
                          setCurrencyEditing(null);
                          setCurrencyForm({
                            code: "",
                            name: "",
                            symbol: "",
                            position: "before",
                            decimal_places: 2,
                            is_default: false,
                          });
                        }}
                      >
                        <PlusIcon /> Add Currency
                      </button>
                      {renderGeneralSaveActions()}
                    </div>
                  </div>
                  <p className="settings-section-desc">Manage Currencies</p>

                  {currencyError && (
                    <div
                      className="alert"
                      style={{
                        marginBottom: 12,
                        background: "var(--error-bg, #fff0f0)",
                        color: "var(--error, #c00)",
                        padding: "8px 12px",
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    >
                      {currencyError}
                      <button
                        onClick={() => setCurrencyError(null)}
                        style={{
                          float: "right",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {/* Add/Edit Currency Form */}
                  {showCurrencyForm && (
                    <div
                      style={{
                        background: "var(--card-bg, #f9fafb)",
                        border: "1px solid var(--border, #e5e7eb)",
                        borderRadius: 8,
                        padding: 16,
                        marginBottom: 16,
                      }}
                    >
                      <h5 style={{ margin: "0 0 12px" }}>
                        {currencyEditing ? "Edit Currency" : "Add Currency"}
                      </h5>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 12,
                        }}
                      >
                        <label className="input">
                          Code
                          <input
                            value={currencyForm.code}
                            onChange={(e) =>
                              setCurrencyForm({
                                ...currencyForm,
                                code: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder="e.g. USD"
                            maxLength={10}
                          />
                        </label>
                        <label className="input">
                          Name
                          <input
                            value={currencyForm.name}
                            onChange={(e) =>
                              setCurrencyForm({
                                ...currencyForm,
                                name: e.target.value,
                              })
                            }
                            placeholder="e.g. US Dollar"
                          />
                        </label>
                        <label className="input">
                          Symbol
                          <input
                            value={currencyForm.symbol}
                            onChange={(e) =>
                              setCurrencyForm({
                                ...currencyForm,
                                symbol: e.target.value,
                              })
                            }
                            placeholder="e.g. $"
                            maxLength={10}
                          />
                        </label>
                        <label className="input">
                          Position
                          <select
                            value={currencyForm.position}
                            onChange={(e) =>
                              setCurrencyForm({
                                ...currencyForm,
                                position: e.target.value,
                              })
                            }
                          >
                            <option value="before">Before amount ($100)</option>
                            <option value="after">After amount (100$)</option>
                          </select>
                        </label>
                        <label className="input">
                          Decimal Places
                          <input
                            type="number"
                            min={0}
                            max={6}
                            value={currencyForm.decimal_places}
                            onChange={(e) =>
                              setCurrencyForm({
                                ...currencyForm,
                                decimal_places: parseInt(e.target.value) || 2,
                              })
                            }
                          />
                        </label>
                        <label
                          className="input"
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            paddingTop: 24,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={currencyForm.is_default}
                            onChange={(e) =>
                              setCurrencyForm({
                                ...currencyForm,
                                is_default: e.target.checked,
                              })
                            }
                            style={{ width: "auto" }}
                          />
                          Set as Default
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="primary" onClick={saveCurrency}>
                          {currencyEditing ? "Update" : "Add"} Currency
                        </button>
                        <button
                          className="outline"
                          onClick={() => {
                            setShowCurrencyForm(false);
                            setCurrencyEditing(null);
                            setCurrencyForm({
                              code: "",
                              name: "",
                              symbol: "",
                              position: "before",
                              decimal_places: 2,
                              is_default: false,
                            });
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      {/* Quick-fill from common currencies */}
                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--muted)",
                            marginRight: 4,
                            lineHeight: "28px",
                          }}
                        >
                          Quick fill:
                        </span>
                        {CURRENCIES.map((c) => (
                          <button
                            key={c.code}
                            className="outline"
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              height: 28,
                            }}
                            onClick={() =>
                              setCurrencyForm({
                                ...currencyForm,
                                code: c.code,
                                name: c.name,
                                symbol: c.symbol,
                              })
                            }
                          >
                            {c.code}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Currency List */}
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      flexDirection: "column",
                    }}
                  >
                    {/* Left: Currency list */}
                    <div style={{ flex: "0 0 100%" }}>
                      <table className="table" style={{ fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Name</th>
                            <th>Symbol</th>
                            <th>Default</th>
                            <th style={{ width: 100 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currencyList.map((cur) => (
                            <tr
                              key={cur.id}
                              style={{
                                cursor: "pointer",
                                background:
                                  selectedCurrency?.id === cur.id
                                    ? "var(--primary-bg, #eef2ff)"
                                    : undefined,
                                opacity: cur.is_active ? 1 : 0.5,
                              }}
                              onClick={() => setSelectedCurrency(cur)}
                            >
                              <td style={{ fontWeight: 600 }}>{cur.code}</td>
                              <td>{cur.name}</td>
                              <td>{cur.symbol}</td>
                              <td>
                                {cur.is_default ? (
                                  <span
                                    style={{
                                      color: "var(--success, #16a34a)",
                                      fontWeight: 600,
                                    }}
                                  >
                                    ✓
                                  </span>
                                ) : (
                                  <button
                                    className="outline"
                                    style={{ fontSize: 11, padding: "1px 6px" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDefaultCurrency(cur.id);
                                    }}
                                  >
                                    Set
                                  </button>
                                )}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button
                                    className="outline"
                                    style={{ fontSize: 11, padding: "1px 6px" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCurrencyEditing(cur.id);
                                      setCurrencyForm({
                                        code: cur.code,
                                        name: cur.name,
                                        symbol: cur.symbol,
                                        position: cur.position,
                                        decimal_places: cur.decimal_places,
                                        is_default: cur.is_default,
                                      });
                                      setShowCurrencyForm(true);
                                    }}
                                  >
                                    <EditIcon />
                                  </button>
                                  {!cur.is_default && (
                                    <button
                                      className="outline"
                                      style={{
                                        fontSize: 11,
                                        padding: "1px 6px",
                                        color: "var(--error, #dc2626)",
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteCurrency(cur.id);
                                      }}
                                    >
                                      <TrashIcon />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                          {!currencyList.length && (
                            <tr>
                              <td
                                colSpan={5}
                                style={{
                                  textAlign: "center",
                                  color: "var(--muted)",
                                  padding: 24,
                                }}
                              >
                                No currencies configured. Add one to get
                                started.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Right: Exchange rates for selected currency */}
                    <div style={{ flex: 1 }}>
                      {selectedCurrency ? (
                        <div>
                          <h5 style={{ margin: "0 0 8px" }}>
                            Rate {selectedCurrency.code} (
                            {selectedCurrency.name})
                          </h5>
                          <p
                            style={{
                              fontSize: 12,
                              color: "var(--muted)",
                              margin: "0 0 12px",
                            }}
                          >
                            rate 1{" "}
                            {currencyList.find((c) => c.is_default)?.code ||
                              "BASE"}{" "}
                            = ? {selectedCurrency.code}
                          </p>

                          {/* Add/Edit Rate Form */}
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "flex-end",
                              marginBottom: 12,
                            }}
                          >
                            <label
                              className="input"
                              style={{ flex: "0 0 140px" }}
                            >
                              Date
                              <input
                                type="date"
                                value={rateForm.date}
                                onChange={(e) =>
                                  setRateForm({
                                    ...rateForm,
                                    date: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label
                              className="input"
                              style={{ flex: "0 0 140px" }}
                            >
                              Rate
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={rateForm.rate}
                                onChange={(e) =>
                                  setRateForm({
                                    ...rateForm,
                                    rate: e.target.value,
                                  })
                                }
                                placeholder="e.g. 1.0"
                              />
                            </label>
                            <button
                              className="primary"
                              style={{ height: 38 }}
                              onClick={saveCurrencyRate}
                              disabled={!rateForm.rate || !rateForm.date}
                            >
                              {rateEditing ? "Update" : "Set"} Rate
                            </button>
                            {rateEditing && (
                              <button
                                className="outline"
                                style={{ height: 38 }}
                                onClick={() => {
                                  setRateEditing(null);
                                  setRateForm({
                                    rate: "",
                                    date: new Date().toISOString().slice(0, 10),
                                  });
                                }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>

                          {/* Rates table */}
                          <div style={{ maxHeight: 400, overflowY: "auto" }}>
                            <table className="table" style={{ fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Rate</th>
                                  <th style={{ width: 100 }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currencyRates.map((r) => (
                                  <tr key={r.id}>
                                    <td>{r.rate_date}</td>
                                    <td>{r.rate}</td>
                                    <td>
                                      <div style={{ display: "flex", gap: 4 }}>
                                        <button
                                          className="outline"
                                          style={{
                                            fontSize: 11,
                                            padding: "1px 6px",
                                          }}
                                          onClick={() => {
                                            setRateEditing(r.id);
                                            setRateForm({
                                              rate: String(r.rate),
                                              date: r.rate_date,
                                            });
                                          }}
                                        >
                                          <EditIcon />
                                        </button>
                                        <button
                                          className="outline"
                                          style={{
                                            fontSize: 11,
                                            padding: "1px 6px",
                                            color: "var(--error, #dc2626)",
                                          }}
                                          onClick={() =>
                                            deleteCurrencyRate(r.id)
                                          }
                                        >
                                          <TrashIcon />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {!currencyRates.length && (
                                  <tr>
                                    <td
                                      colSpan={3}
                                      style={{
                                        textAlign: "center",
                                        color: "var(--muted)",
                                        padding: 24,
                                      }}
                                    >
                                      No rates set. Add a rate above.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: 200,
                            color: "var(--muted)",
                            fontSize: 13,
                          }}
                        >
                          Select a Currency!
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* POS Configuration */}
              {activeSection === "pos-settings" && (
                <section
                  id="pos-settings"
                  className="settings-section"
                  style={{ gap: 0 }}
                >
                  {/* Header */}
                  <div style={{ marginBottom: 24 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--violet-600)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <path d="M8 21h8" />
                          <path d="M12 17v4" />
                          <path d="M7 8h2" />
                          <path d="M7 12h2" />
                          <path d="M15 8h2" />
                          <path d="M15 12h2" />
                        </svg>
                        <h4
                          style={{
                            margin: 0,
                            fontSize: 18,
                            fontWeight: 700,
                            color: "var(--slate-800)",
                          }}
                        >
                          Point of Sale Configuration
                        </h4>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {renderGeneralSaveActions()}
                      </div>
                    </div>
                    {/* <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className={
                          posConfigTab === "employees" ? "tab active" : "tab"
                        }
                        onClick={() => setPosConfigTab("employees")}
                      >
                        Employees &amp; Login
                      </button>
                      <button
                        className={
                          posConfigTab === "payments" ? "tab active" : "tab"
                        }
                        onClick={() => setPosConfigTab("payments")}
                      >
                        Payment Methods
                      </button>
                      <button
                        className={
                          posConfigTab === "tills" ? "tab active" : "tab"
                        }
                        onClick={() => setPosConfigTab("tills")}
                      >
                        Point Of Sales
                      </button>
                    </div>
                  </div> */}
                  </div>

                  <InlineTabs
                    value={posConfigTab}
                    onChange={(value) => setPosConfigTab(value)}
                    items={[
                      {
                        value: "employees" as const,
                        label: "Employees & Login",
                      },
                      {
                        value: "payments" as const,
                        label: "Payment Methods",
                      },
                      {
                        value: "tills" as const,
                        label: "Point Of Sales",
                      },
                    ]}
                  />

                  {posError && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 16px",
                        marginBottom: 20,
                        borderRadius: 8,
                        background: "var(--red-50, #fef2f2)",
                        border: "1px solid var(--red-200, #fecaca)",
                        color: "var(--red-700, #b91c1c)",
                        fontSize: 13,
                      }}
                    >
                      <span>{posError}</span>
                      <button
                        onClick={() => setPosError(null)}
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--red-400)",
                          fontSize: 18,
                          lineHeight: 1,
                          padding: "0 4px",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {posConfigTab === "employees" && (
                    <div
                      style={{
                        border: "1px solid var(--gray-200, #e5e7eb)",
                        borderRadius: 10,
                        background: "var(--white-500, #fff)",
                        marginBottom: 24,
                        overflow: "hidden",
                      }}
                    >
                      {/* Card header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "16px 20px",
                          borderBottom: "1px solid var(--gray-100, #f3f4f6)",
                          background: "var(--gray-50, #f9fafb)",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--slate-600)"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            <h5
                              style={{
                                margin: 0,
                                fontSize: 15,
                                fontWeight: 700,
                                color: "var(--slate-700)",
                              }}
                            >
                              Employees &amp; Login PINs
                            </h5>
                          </div>
                        </div>
                        <span
                          style={{
                            padding: "3px 12px",
                            borderRadius: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--violet-700, #6d28d9)",
                            background: "var(--violet-50, #f5f3ff)",
                          }}
                        >
                          {posEmployees.length}{" "}
                          {posEmployees.length === 1 ? "employee" : "employees"}
                        </span>
                      </div>

                      {/* Add / Edit form */}
                      <div
                        style={{
                          padding: "16px 20px",
                          borderBottom: "1px solid var(--gray-100, #f3f4f6)",
                          background: posEmpEditing
                            ? "var(--violet-50, #f5f3ff)"
                            : "transparent",
                        }}
                      >
                        {posEmpEditing && (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--violet-600)",
                              marginBottom: 8,
                            }}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              style={{ marginRight: 4 }}
                            >
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Editing:{" "}
                            {
                              posEmployees.find((e) => e.id === posEmpEditing)
                                ?.name
                            }
                          </div>
                        )}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 2fr 1fr 1fr auto",
                            gap: 10,
                            alignItems: "end",
                          }}
                        >
                          <label className="input" style={{ margin: 0 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "var(--slate-500)",
                              }}
                            >
                              Name
                            </span>
                            <input
                              value={posEmpForm.name}
                              onChange={(e) =>
                                setPosEmpForm({
                                  ...posEmpForm,
                                  name: e.target.value,
                                })
                              }
                              placeholder="Employee name"
                              style={{ fontSize: 13 }}
                            />
                          </label>
                          <label className="input" style={{ margin: 0 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "var(--slate-500)",
                              }}
                            >
                              Email
                            </span>
                            <input
                              type="email"
                              value={posEmpForm.email || ""}
                              onChange={(e) =>
                                setPosEmpForm({
                                  ...posEmpForm,
                                  email: e.target.value,
                                })
                              }
                              placeholder="support@geenet.co.zw"
                              style={{ fontSize: 13 }}
                            />
                          </label>
                          <label className="input" style={{ margin: 0 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "var(--slate-500)",
                              }}
                            >
                              PIN
                            </span>
                            <input
                              type="password"
                              value={posEmpForm.pin}
                              onChange={(e) => {
                                const val = e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 6);
                                setPosEmpForm({ ...posEmpForm, pin: val });
                              }}
                              placeholder="4-6 digits"
                              maxLength={6}
                              style={{ fontSize: 13, letterSpacing: "2px" }}
                            />
                          </label>
                          <label className="input" style={{ margin: 0 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "var(--slate-500)",
                              }}
                            >
                              Role
                            </span>
                            <select
                              value={posEmpForm.role}
                              onChange={(e) =>
                                setPosEmpForm({
                                  ...posEmpForm,
                                  role: e.target.value,
                                })
                              }
                              style={{ fontSize: 13 }}
                            >
                              <option value="cashier">Cashier</option>
                              <option value="manager">Supervisor</option>
                            </select>
                          </label>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="primary"
                              onClick={savePosEmployee}
                              disabled={
                                !posEmpForm.name ||
                                !posEmpForm.pin ||
                                posEmpForm.pin.length < 4 ||
                                posEmpSaving
                              }
                              style={{
                                height: 36,
                                minWidth: 80,
                                fontSize: 13,
                                borderRadius: 8,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                              }}
                            >
                              {posEmpSaving ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: 14,
                                    height: 14,
                                    border: "2px solid rgba(255,255,255,0.3)",
                                    borderTopColor: "#fff",
                                    borderRadius: "50%",
                                    animation: "spin 0.6s linear infinite",
                                  }}
                                />
                              ) : posEmpEditing ? (
                                <>
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                  >
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                  Save
                                </>
                              ) : (
                                <>
                                  <PlusIcon /> Add
                                </>
                              )}
                            </button>
                            {posEmpEditing && (
                              <button
                                className="outline"
                                onClick={() => {
                                  setPosEmpEditing(null);
                                  setPosEmpForm({
                                    name: "",
                                    pin: "",
                                    role: "cashier",
                                    email: "",
                                  });
                                }}
                                style={{
                                  height: 36,
                                  fontSize: 13,
                                  borderRadius: 8,
                                }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Employee list */}
                      {posEmployees.length > 0 ? (
                        <div style={{ overflowX: "auto" }}>
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              fontSize: 13,
                            }}
                          >
                            <thead>
                              <tr
                                style={{
                                  background: "var(--gray-50, #f9fafb)",
                                }}
                              >
                                <th
                                  style={{
                                    padding: "10px 20px",
                                    textAlign: "left",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Employee
                                </th>
                                <th
                                  style={{
                                    padding: "10px 16px",
                                    textAlign: "left",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  PIN
                                </th>
                                <th
                                  style={{
                                    padding: "10px 16px",
                                    textAlign: "left",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Role
                                </th>
                                <th
                                  style={{
                                    padding: "10px 16px",
                                    textAlign: "center",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Status
                                </th>
                                <th
                                  style={{
                                    padding: "10px 20px",
                                    textAlign: "right",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {posEmployees.map((emp, idx) => (
                                <tr
                                  key={emp.id}
                                  style={{
                                    background:
                                      posEmpEditing === emp.id
                                        ? "var(--violet-50, #f5f3ff)"
                                        : idx % 2 === 0
                                          ? "transparent"
                                          : "var(--gray-50, #f9fafb)",
                                    transition: "background 150ms",
                                  }}
                                >
                                  <td
                                    style={{
                                      padding: "12px 20px",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: 34,
                                          height: 34,
                                          borderRadius: "50%",
                                          flexShrink: 0,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontSize: 13,
                                          fontWeight: 700,
                                          color: "#fff",
                                          background:
                                            emp.role === "admin"
                                              ? "var(--red-500, #ef4444)"
                                              : emp.role === "manager"
                                                ? "var(--amber-500, #f59e0b)"
                                                : "var(--blue-500, #3b82f6)",
                                        }}
                                      >
                                        {emp.name.charAt(0).toUpperCase()}
                                      </div>
                                      <div>
                                        <div
                                          style={{
                                            fontWeight: 600,
                                            color: "var(--slate-800)",
                                          }}
                                        >
                                          {emp.name}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color: "var(--slate-400)",
                                          }}
                                        >
                                          {emp.email || "No email"}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "12px 16px",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                      }}
                                    >
                                      <code
                                        style={{
                                          background:
                                            "var(--slate-100, #f1f5f9)",
                                          padding: "3px 10px",
                                          borderRadius: 6,
                                          fontSize: 13,
                                          fontFamily: "monospace",
                                          letterSpacing: "2px",
                                          color: "var(--slate-600)",
                                        }}
                                      >
                                        {showPinField === emp.id
                                          ? emp.pin
                                          : "•".repeat(emp.pin.length || 4)}
                                      </code>
                                      <button
                                        onClick={() =>
                                          setShowPinField(
                                            showPinField === emp.id
                                              ? null
                                              : emp.id,
                                          )
                                        }
                                        style={{
                                          border: "none",
                                          background: "transparent",
                                          cursor: "pointer",
                                          padding: 2,
                                          color: "var(--slate-400)",
                                          display: "flex",
                                        }}
                                        title={
                                          showPinField === emp.id
                                            ? "Hide PIN"
                                            : "Show PIN"
                                        }
                                      >
                                        {showPinField === emp.id ? (
                                          <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                          >
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                            <line
                                              x1="1"
                                              y1="1"
                                              x2="23"
                                              y2="23"
                                            />
                                          </svg>
                                        ) : (
                                          <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                          >
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                            <circle cx="12" cy="12" r="3" />
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "12px 16px",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                        padding: "3px 12px",
                                        borderRadius: 20,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        textTransform: "capitalize",
                                        color:
                                          emp.role === "admin"
                                            ? "var(--red-600, #dc2626)"
                                            : emp.role === "manager"
                                              ? "var(--amber-700, #b45309)"
                                              : "var(--blue-600, #2563eb)",
                                        background:
                                          emp.role === "admin"
                                            ? "var(--red-50, #fef2f2)"
                                            : emp.role === "manager"
                                              ? "var(--amber-50, #fffbeb)"
                                              : "var(--blue-50, #eff6ff)",
                                      }}
                                    >
                                      {emp.role === "admin" && (
                                        <svg
                                          width="10"
                                          height="10"
                                          viewBox="0 0 24 24"
                                          fill="currentColor"
                                        >
                                          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                                        </svg>
                                      )}
                                      {emp.role === "manager" && (
                                        <svg
                                          width="10"
                                          height="10"
                                          viewBox="0 0 24 24"
                                          fill="currentColor"
                                        >
                                          <path d="M12 1l3.22 6.636 7.28 1.06-5.25 5.146 1.24 7.248L12 17.77l-6.49 3.42 1.24-7.248L1.5 8.696l7.28-1.06L12 1z" />
                                        </svg>
                                      )}
                                      {emp.role}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      padding: "12px 16px",
                                      textAlign: "center",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    <label
                                      className="switch"
                                      style={{ margin: "0 auto" }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={emp.is_active}
                                        onChange={async (e) => {
                                          await apiFetch(
                                            `/pos/employees/${emp.id}`,
                                            {
                                              method: "PUT",
                                              body: JSON.stringify({
                                                is_active: e.target.checked,
                                              }),
                                            },
                                          );
                                          if (companyId)
                                            loadPosEmployees(companyId);
                                        }}
                                      />
                                      <span className="slider" />
                                    </label>
                                  </td>
                                  <td
                                    style={{
                                      padding: "12px 20px",
                                      textAlign: "right",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 4,
                                        justifyContent: "flex-end",
                                      }}
                                    >
                                      <button
                                        className="icon-btn"
                                        title="Edit employee"
                                        onClick={() => {
                                          setPosEmpEditing(emp.id);
                                          setPosEmpForm({
                                            name: emp.name,
                                            email: emp.email,
                                            pin: emp.pin,
                                            role: emp.role,
                                          });
                                        }}
                                        style={{
                                          width: 30,
                                          height: 30,
                                          borderRadius: 6,
                                        }}
                                      ></button>
                                      <button
                                        className="icon-btn"
                                        title="Delete employee"
                                        onClick={() =>
                                          deletePosEmployee(emp.id)
                                        }
                                        style={{
                                          width: 30,
                                          height: 30,
                                          borderRadius: 6,
                                          color: "var(--red-400)",
                                        }}
                                      >
                                        <TrashIcon />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div
                          style={{ padding: "32px 20px", textAlign: "center" }}
                        >
                          <svg
                            width="40"
                            height="40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--slate-300)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            style={{ marginBottom: 8 }}
                          >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                          <div
                            style={{
                              color: "var(--slate-400)",
                              fontSize: 13,
                              marginBottom: 4,
                            }}
                          >
                            No POS employees configured yet
                          </div>
                          <div
                            style={{ color: "var(--slate-300)", fontSize: 12 }}
                          >
                            Add your first cashier using the form above
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {posConfigTab === "payments" && (
                    <div
                      style={{
                        border: "1px solid var(--gray-200, #e5e7eb)",
                        borderRadius: 10,
                        background: "var(--white-500, #fff)",
                        overflow: "hidden",
                      }}
                    >
                      {/* Card header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "16px 20px",
                          borderBottom: "1px solid var(--gray-100, #f3f4f6)",
                          background: "var(--gray-50, #f9fafb)",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--slate-600)"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="1" y="4" width="22" height="16" rx="2" />
                              <path d="M1 10h22" />
                            </svg>
                            <h5
                              style={{
                                margin: 0,
                                fontSize: 15,
                                fontWeight: 700,
                                color: "var(--slate-700)",
                              }}
                            >
                              Payment Methods
                            </h5>
                          </div>
                        </div>
                        <span
                          style={{
                            padding: "3px 12px",
                            borderRadius: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--green-700, #15803d)",
                            background: "var(--green-50, #f0fdf4)",
                          }}
                        >
                          {posPaymentMethods.length}{" "}
                          {posPaymentMethods.length === 1
                            ? "method"
                            : "methods"}
                        </span>
                      </div>

                      {/* Add / Edit form */}
                      <div
                        style={{
                          padding: "16px 20px",
                          borderBottom: "1px solid var(--gray-100, #f3f4f6)",
                          background: posPmEditing
                            ? "var(--violet-50, #f5f3ff)"
                            : "transparent",
                        }}
                      >
                        {posPmEditing && (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--violet-600)",
                              marginBottom: 8,
                            }}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              style={{ marginRight: 4 }}
                            >
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Editing:{" "}
                            {
                              posPaymentMethods.find(
                                (p) => p.id === posPmEditing,
                              )?.name
                            }
                          </div>
                        )}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 1fr auto",
                            gap: 10,
                            alignItems: "end",
                          }}
                        >
                          <label className="input" style={{ margin: 0 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "var(--slate-500)",
                              }}
                            >
                              Name
                            </span>
                            <input
                              value={posPmForm.name}
                              onChange={(e) =>
                                setPosPmForm({
                                  ...posPmForm,
                                  name: e.target.value,
                                })
                              }
                              placeholder="e.g., Cash, Visa, EcoCash"
                              style={{ fontSize: 13 }}
                            />
                          </label>
                          <label className="input" style={{ margin: 0 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "var(--slate-500)",
                              }}
                            >
                              Type
                            </span>
                            <select
                              value={posPmForm.code}
                              onChange={(e) =>
                                setPosPmForm({
                                  ...posPmForm,
                                  code: e.target.value,
                                })
                              }
                              style={{ fontSize: 13 }}
                            >
                              <option value="cash">Cash</option>
                              <option value="card">Card</option>
                              <option value="mobile_money">
                                Mobile Wallet
                              </option>
                              <option value="bank_transfer">
                                Bank Transfer
                              </option>
                            </select>
                          </label>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="primary"
                              onClick={savePosPaymentMethod}
                              disabled={!posPmForm.name || posPmSaving}
                              style={{
                                height: 36,
                                minWidth: 80,
                                fontSize: 13,
                                borderRadius: 8,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                              }}
                            >
                              {posPmSaving ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: 14,
                                    height: 14,
                                    border: "2px solid rgba(255,255,255,0.3)",
                                    borderTopColor: "#fff",
                                    borderRadius: "50%",
                                    animation: "spin 0.6s linear infinite",
                                  }}
                                />
                              ) : posPmEditing ? (
                                <>
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                  >
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                  Save
                                </>
                              ) : (
                                <>
                                  <PlusIcon /> Add
                                </>
                              )}
                            </button>
                            {posPmEditing && (
                              <button
                                className="outline"
                                onClick={() => {
                                  setPosPmEditing(null);
                                  setPosPmForm({ name: "", code: "cash" });
                                }}
                                style={{
                                  height: 36,
                                  fontSize: 13,
                                  borderRadius: 8,
                                }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Payment method list */}
                      {posPaymentMethods.length > 0 ? (
                        <div style={{ overflowX: "auto" }}>
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              fontSize: 13,
                            }}
                          >
                            <thead>
                              <tr
                                style={{
                                  background: "var(--gray-50, #f9fafb)",
                                }}
                              >
                                <th
                                  style={{
                                    padding: "10px 20px",
                                    textAlign: "left",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Method
                                </th>
                                <th
                                  style={{
                                    padding: "10px 16px",
                                    textAlign: "left",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Type
                                </th>
                                <th
                                  style={{
                                    padding: "10px 16px",
                                    textAlign: "center",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Default
                                </th>
                                <th
                                  style={{
                                    padding: "10px 16px",
                                    textAlign: "center",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Status
                                </th>
                                <th
                                  style={{
                                    padding: "10px 20px",
                                    textAlign: "right",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {posPaymentMethods.map((pm, idx) => {
                                const pmIconColors: Record<string, string> = {
                                  cash: "var(--green-600, #16a34a)",
                                  card: "var(--blue-600, #2563eb)",
                                  mobile_money: "var(--violet-600, #7c3aed)",
                                  bank_transfer: "var(--slate-600, #475569)",
                                  cheque: "var(--amber-600, #d97706)",
                                  other: "var(--slate-500, #64748b)",
                                };
                                const pmIcons: Record<string, React.ReactNode> =
                                  {
                                    cash: (
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                      >
                                        <rect
                                          x="1"
                                          y="4"
                                          width="22"
                                          height="16"
                                          rx="2"
                                        />
                                        <circle cx="12" cy="12" r="3" />
                                        <path d="M2 8h2" />
                                        <path d="M20 8h2" />
                                      </svg>
                                    ),
                                    card: (
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                      >
                                        <rect
                                          x="1"
                                          y="4"
                                          width="22"
                                          height="16"
                                          rx="2"
                                        />
                                        <path d="M1 10h22" />
                                      </svg>
                                    ),
                                    mobile_money: (
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                      >
                                        <rect
                                          x="5"
                                          y="2"
                                          width="14"
                                          height="20"
                                          rx="2"
                                        />
                                        <path d="M12 18h.01" />
                                      </svg>
                                    ),
                                    bank_transfer: (
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                      >
                                        <path d="M3 21h18" />
                                        <path d="M3 10h18" />
                                        <path d="M12 3l9 7H3l9-7z" />
                                        <path d="M6 10v8" />
                                        <path d="M10 10v8" />
                                        <path d="M14 10v8" />
                                        <path d="M18 10v8" />
                                      </svg>
                                    ),
                                    cheque: (
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                      >
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <path d="M14 2v6h6" />
                                        <path d="M16 13H8" />
                                        <path d="M16 17H8" />
                                        <path d="M10 9H8" />
                                      </svg>
                                    ),
                                    other: (
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                      >
                                        <circle cx="12" cy="12" r="1" />
                                        <circle cx="19" cy="12" r="1" />
                                        <circle cx="5" cy="12" r="1" />
                                      </svg>
                                    ),
                                  };
                                return (
                                  <tr
                                    key={pm.id}
                                    style={{
                                      background:
                                        posPmEditing === pm.id
                                          ? "var(--violet-50, #f5f3ff)"
                                          : idx % 2 === 0
                                            ? "transparent"
                                            : "var(--gray-50, #f9fafb)",
                                      transition: "background 150ms",
                                    }}
                                  >
                                    <td
                                      style={{
                                        padding: "12px 20px",
                                        borderBottom:
                                          "1px solid var(--gray-100)",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 10,
                                        }}
                                      >
                                        <div
                                          style={{
                                            width: 34,
                                            height: 34,
                                            borderRadius: 8,
                                            flexShrink: 0,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color:
                                              pmIconColors[pm.code] ||
                                              "var(--slate-500)",
                                            background:
                                              "var(--slate-100, #f1f5f9)",
                                          }}
                                        >
                                          {pmIcons[pm.code] || pmIcons.other}
                                        </div>
                                        <span
                                          style={{
                                            fontWeight: 600,
                                            color: "var(--slate-800)",
                                          }}
                                        >
                                          {pm.name}
                                        </span>
                                      </div>
                                    </td>
                                    <td
                                      style={{
                                        padding: "12px 16px",
                                        borderBottom:
                                          "1px solid var(--gray-100)",
                                      }}
                                    >
                                      <span
                                        style={{
                                          display: "inline-block",
                                          padding: "3px 12px",
                                          borderRadius: 20,
                                          fontSize: 11,
                                          fontWeight: 600,
                                          textTransform: "capitalize",
                                          color: "var(--slate-600)",
                                          background:
                                            "var(--slate-100, #f1f5f9)",
                                        }}
                                      >
                                        {pm.code.replace(/_/g, " ")}
                                      </span>
                                    </td>
                                    <td
                                      style={{
                                        padding: "12px 16px",
                                        textAlign: "center",
                                        borderBottom:
                                          "1px solid var(--gray-100)",
                                      }}
                                    >
                                      {pm.is_default ? (
                                        <span
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 4,
                                            padding: "3px 10px",
                                            borderRadius: 20,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: "var(--green-700, #15803d)",
                                            background:
                                              "var(--green-50, #f0fdf4)",
                                          }}
                                        >
                                          <svg
                                            width="12"
                                            height="12"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                          >
                                            <path d="M20 6L9 17l-5-5" />
                                          </svg>
                                          Default
                                        </span>
                                      ) : (
                                        <button
                                          onClick={async () => {
                                            await apiFetch(
                                              `/payments/methods/${pm.id}`,
                                              {
                                                method: "PUT",
                                                body: JSON.stringify({
                                                  is_default: true,
                                                }),
                                              },
                                            );
                                            if (companyId)
                                              loadPosPaymentMethods(companyId);
                                          }}
                                          style={{
                                            border:
                                              "1px dashed var(--slate-300)",
                                            background: "transparent",
                                            padding: "3px 10px",
                                            borderRadius: 20,
                                            fontSize: 11,
                                            fontWeight: 500,
                                            color: "var(--slate-400)",
                                            cursor: "pointer",
                                            transition: "all 150ms",
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor =
                                              "var(--violet-400)";
                                            e.currentTarget.style.color =
                                              "var(--violet-500)";
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor =
                                              "var(--slate-300)";
                                            e.currentTarget.style.color =
                                              "var(--slate-400)";
                                          }}
                                        >
                                          Set default
                                        </button>
                                      )}
                                    </td>
                                    <td
                                      style={{
                                        padding: "12px 16px",
                                        textAlign: "center",
                                        borderBottom:
                                          "1px solid var(--gray-100)",
                                      }}
                                    >
                                      <label
                                        className="switch"
                                        style={{ margin: "0 auto" }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={pm.is_active}
                                          onChange={async (e) => {
                                            await apiFetch(
                                              `/payments/methods/${pm.id}`,
                                              {
                                                method: "PUT",
                                                body: JSON.stringify({
                                                  is_active: e.target.checked,
                                                }),
                                              },
                                            );
                                            if (companyId)
                                              loadPosPaymentMethods(companyId);
                                          }}
                                        />
                                        <span className="slider" />
                                      </label>
                                    </td>
                                    <td
                                      style={{
                                        padding: "12px 20px",
                                        textAlign: "right",
                                        borderBottom:
                                          "1px solid var(--gray-100)",
                                      }}
                                    >
                                      <button
                                        className="icon-btn"
                                        title="Edit payment method"
                                        onClick={() => {
                                          setPosPmEditing(pm.id);
                                          setPosPmForm({
                                            name: pm.name,
                                            code: pm.code,
                                          });
                                        }}
                                        style={{
                                          width: 30,
                                          height: 30,
                                          borderRadius: 6,
                                        }}
                                      >
                                        <PencilLine size={15} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div
                          style={{ padding: "32px 20px", textAlign: "center" }}
                        >
                          <svg
                            width="40"
                            height="40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--slate-300)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            style={{ marginBottom: 8 }}
                          >
                            <rect x="1" y="4" width="22" height="16" rx="2" />
                            <path d="M1 10h22" />
                          </svg>
                          <div
                            style={{
                              color: "var(--slate-400)",
                              fontSize: 13,
                              marginBottom: 4,
                            }}
                          >
                            No payment methods configured yet
                          </div>
                          <div
                            style={{ color: "var(--slate-300)", fontSize: 12 }}
                          >
                            Add Cash, Card, or Mobile Money above to get started
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {posConfigTab === "tills" && (
                    <div
                      style={{
                        border: "1px solid var(--gray-200, #e5e7eb)",
                        borderRadius: 10,
                        background: "var(--white-500, #fff)",
                        marginBottom: 24,
                        overflow: "hidden",
                      }}
                    >
                      {/* Card header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "16px 20px",
                          borderBottom: "1px solid var(--gray-100, #f3f4f6)",
                          background: "var(--gray-50, #f9fafb)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <Monitor size={18} color="var(--slate-600)" />
                          <h5
                            style={{
                              margin: 0,
                              fontSize: 15,
                              fontWeight: 700,
                              color: "var(--slate-700)",
                            }}
                          >
                            Point Of Sales / Registers
                          </h5>
                        </div>
                        <span
                          style={{
                            padding: "3px 12px",
                            borderRadius: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--violet-700, #6d28d9)",
                            background: "var(--violet-50, #f5f3ff)",
                          }}
                        >
                          {posTills.length}{" "}
                          {posTills.length === 1
                            ? "Point Of Sales"
                            : "Points Of Sales"}
                        </span>
                      </div>

                      {/* Add / Edit form */}
                      <div
                        style={{
                          padding: "16px 20px",
                          borderBottom: "1px solid var(--gray-100, #f3f4f6)",
                          background: tillEditing
                            ? "var(--violet-50, #f5f3ff)"
                            : "transparent",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 2fr 2fr auto",
                            gap: 10,
                            alignItems: "end",
                          }}
                        >
                          <label className="input" style={{ margin: 0 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "var(--slate-500)",
                              }}
                            >
                              Point Of Sales Name
                            </span>
                            <input
                              value={tillForm.name}
                              onChange={(e) =>
                                setTillForm({
                                  ...tillForm,
                                  name: e.target.value,
                                })
                              }
                              placeholder="e.g. Point Of Sales 1, Register A"
                            />
                          </label>
                          <label
                            ref={tillDropdownRef}
                            className="input"
                            style={{ margin: 0, position: "relative" }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "var(--slate-500)",
                              }}
                            >
                              Employees
                            </span>
                            {/* Selected tags + trigger */}
                            <div
                              onClick={() =>
                                setTillDropdownOpen(!tillDropdownOpen)
                              }
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                                padding: "6px 32px 6px 8px",
                                border: "1px solid var(--gray-200, #e5e7eb)",
                                borderRadius: 6,
                                background: "#fff",
                                minHeight: 38,
                                alignItems: "center",
                                cursor: "pointer",
                                position: "relative",
                              }}
                            >
                              {tillForm.employee_ids.length === 0 && (
                                <span
                                  style={{
                                    fontSize: 13,
                                    color: "var(--slate-400)",
                                  }}
                                >
                                  Select employees…
                                </span>
                              )}
                              {tillForm.employee_ids.map((eid) => {
                                const emp = posEmployees.find(
                                  (e) => e.id === eid,
                                );
                                if (!emp) return null;
                                return (
                                  <span
                                    key={eid}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      padding: "2px 6px 2px 8px",
                                      borderRadius: 12,
                                      fontSize: 12,
                                      fontWeight: 500,
                                      background: "var(--violet-100, #ede9fe)",
                                      color: "var(--violet-700)",
                                      border:
                                        "1px solid var(--violet-200, #ddd6fe)",
                                    }}
                                  >
                                    {emp.name}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTillForm({
                                          ...tillForm,
                                          employee_ids:
                                            tillForm.employee_ids.filter(
                                              (id) => id !== eid,
                                            ),
                                        });
                                      }}
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                        padding: 0,
                                        lineHeight: 1,
                                        fontSize: 14,
                                        color: "var(--violet-400)",
                                        fontWeight: 700,
                                      }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                );
                              })}
                              {/* Chevron */}
                              <ChevronDown
                                size={14}
                                color="var(--slate-400)"
                                style={{
                                  position: "absolute",
                                  right: 10,
                                  top: "50%",
                                  transform: `translateY(-50%) rotate(${tillDropdownOpen ? 180 : 0}deg)`,
                                  transition: "transform 150ms",
                                  pointerEvents: "none",
                                }}
                              />
                            </div>
                            {/* Dropdown list */}
                            {tillDropdownOpen && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "100%",
                                  left: 0,
                                  right: 0,
                                  zIndex: 50,
                                  marginTop: 4,
                                  background: "#fff",
                                  border: "1px solid var(--gray-200, #e5e7eb)",
                                  borderRadius: 8,
                                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                                  maxHeight: 200,
                                  overflowY: "auto",
                                }}
                              >
                                {posEmployees.filter((emp) => emp.is_active)
                                  .length === 0 ? (
                                  <div
                                    style={{
                                      padding: "12px 16px",
                                      fontSize: 13,
                                      color: "var(--slate-400)",
                                    }}
                                  >
                                    No employees — add employees first in the
                                    "Employees &amp; Login" tab
                                  </div>
                                ) : (
                                  posEmployees
                                    .filter((emp) => emp.is_active)
                                    .map((emp) => {
                                      const checked =
                                        tillForm.employee_ids.includes(emp.id);
                                      return (
                                        <div
                                          key={emp.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (checked) {
                                              setTillForm({
                                                ...tillForm,
                                                employee_ids:
                                                  tillForm.employee_ids.filter(
                                                    (id) => id !== emp.id,
                                                  ),
                                              });
                                            } else {
                                              setTillForm({
                                                ...tillForm,
                                                employee_ids: [
                                                  ...tillForm.employee_ids,
                                                  emp.id,
                                                ],
                                              });
                                            }
                                          }}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            padding: "8px 16px",
                                            cursor: "pointer",
                                            transition: "background 100ms",
                                            background: checked
                                              ? "var(--violet-50, #f5f3ff)"
                                              : "transparent",
                                            borderBottom:
                                              "1px solid var(--gray-50, #f9fafb)",
                                          }}
                                          onMouseEnter={(e) => {
                                            if (!checked)
                                              e.currentTarget.style.background =
                                                "var(--gray-50)";
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.background =
                                              checked
                                                ? "var(--violet-50, #f5f3ff)"
                                                : "transparent";
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            readOnly
                                            style={{
                                              accentColor: "var(--violet-600)",
                                              width: 16,
                                              height: 16,
                                              cursor: "pointer",
                                            }}
                                          />
                                          <div style={{ flex: 1 }}>
                                            <div
                                              style={{
                                                fontSize: 13,
                                                fontWeight: 500,
                                                color: "var(--slate-700)",
                                              }}
                                            >
                                              {emp.name}
                                            </div>
                                            <div
                                              style={{
                                                fontSize: 11,
                                                color: "var(--slate-400)",
                                              }}
                                            >
                                              {emp.role}
                                              {emp.email
                                                ? ` · ${emp.email}`
                                                : ""}
                                            </div>
                                          </div>
                                          {checked && (
                                            <svg
                                              width="14"
                                              height="14"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="var(--violet-500)"
                                              strokeWidth="3"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            >
                                              <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                          )}
                                        </div>
                                      );
                                    })
                                )}
                              </div>
                            )}
                          </label>
                          <label className="input" style={{ margin: 0 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "var(--slate-500)",
                              }}
                            >
                              Warehouse
                            </span>
                            <select
                              value={tillForm.warehouse_id ?? ""}
                              onChange={(e) =>
                                setTillForm({
                                  ...tillForm,
                                  warehouse_id:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                fontSize: 13,
                                borderRadius: 6,
                                border: "1px solid var(--gray-200, #e5e7eb)",
                                background: "#fff",
                              }}
                            >
                              <option value="">Unassigned</option>
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="input" style={{ margin: 0 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "var(--slate-500)",
                              }}
                            >
                              Fiscal Device
                            </span>
                            <select
                              value={tillForm.fiscal_device_id ?? ""}
                              onChange={(e) =>
                                setTillForm({
                                  ...tillForm,
                                  fiscal_device_id:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                fontSize: 13,
                                borderRadius: 6,
                                border: "1px solid var(--gray-200, #e5e7eb)",
                                background: "#fff",
                              }}
                            >
                              <option value="">No fiscal device</option>
                              {devices.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.model || "Device"} -{" "}
                                  {d.device_id || d.serial_number}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="primary"
                              onClick={savePosTill}
                              disabled={tillSaving || !tillForm.name}
                              style={{
                                height: 38,
                                padding: "0 16px",
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: 13,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {tillSaving ? (
                                "Saving…"
                              ) : tillEditing ? (
                                "Update"
                              ) : (
                                <>
                                  <PlusIcon /> Add
                                </>
                              )}
                            </button>
                            {tillEditing && (
                              <button
                                className="outline"
                                onClick={() => {
                                  setTillEditing(null);
                                  setTillForm({
                                    name: "",
                                    employee_ids: [],
                                    warehouse_id: null,
                                    fiscal_device_id: null,
                                  });
                                  setTillDropdownOpen(false);
                                }}
                                style={{
                                  height: 38,
                                  padding: "0 12px",
                                  borderRadius: 8,
                                  fontSize: 13,
                                }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Tills list */}
                      {posTills.length > 0 ? (
                        <div style={{ overflow: "auto", maxHeight: 420 }}>
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                            }}
                          >
                            <thead>
                              <tr>
                                <th
                                  style={{
                                    padding: "10px 20px",
                                    textAlign: "left",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Point Of Sales Name
                                </th>
                                <th
                                  style={{
                                    padding: "10px 16px",
                                    textAlign: "left",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Warehouse
                                </th>
                                <th
                                  style={{
                                    padding: "10px 16px",
                                    textAlign: "left",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Fiscal Device
                                </th>
                                <th
                                  style={{
                                    padding: "10px 16px",
                                    textAlign: "left",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Assigned Employees
                                </th>
                                <th
                                  style={{
                                    padding: "10px 16px",
                                    textAlign: "center",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Status
                                </th>
                                <th
                                  style={{
                                    padding: "10px 20px",
                                    textAlign: "right",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    color: "var(--slate-400)",
                                    borderBottom: "1px solid var(--gray-200)",
                                  }}
                                >
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {posTills.map((till) => (
                                <tr
                                  key={till.id}
                                  style={{ transition: "background 150ms" }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background =
                                      "var(--gray-50)")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.background = "")
                                  }
                                >
                                  <td
                                    style={{
                                      padding: "12px 20px",
                                      fontWeight: 600,
                                      fontSize: 14,
                                      color: "var(--slate-700)",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: 32,
                                          height: 32,
                                          borderRadius: 8,
                                          background:
                                            "var(--violet-100, #ede9fe)",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        <Store
                                          size={16}
                                          color="var(--violet-600)"
                                        />
                                      </div>
                                      {till.name}
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "12px 16px",
                                      fontSize: 13,
                                      color: "var(--slate-600)",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    {till.warehouse?.name || (
                                      <span
                                        style={{ color: "var(--slate-400)" }}
                                      >
                                        Unassigned
                                      </span>
                                    )}
                                  </td>
                                  <td
                                    style={{
                                      padding: "12px 16px",
                                      fontSize: 13,
                                      color: "var(--slate-600)",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    {till.fiscal_device ? (
                                      <div
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 2,
                                        }}
                                      >
                                        <span>
                                          {till.fiscal_device.model || "Device"}
                                        </span>
                                        <span
                                          style={{
                                            fontSize: 11,
                                            color: "var(--slate-400)",
                                          }}
                                        >
                                          {till.fiscal_device.device_id ||
                                            till.fiscal_device.serial_number}
                                        </span>
                                      </div>
                                    ) : (
                                      <span
                                        style={{ color: "var(--slate-400)" }}
                                      >
                                        No fiscal device
                                      </span>
                                    )}
                                  </td>
                                  <td
                                    style={{
                                      padding: "12px 16px",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: 4,
                                      }}
                                    >
                                      {till.employees.length > 0 ? (
                                        till.employees.map((emp) => (
                                          <span
                                            key={emp.id}
                                            style={{
                                              padding: "2px 8px",
                                              borderRadius: 12,
                                              fontSize: 11,
                                              fontWeight: 500,
                                              background: emp.is_active
                                                ? "var(--green-50, #f0fdf4)"
                                                : "var(--gray-100)",
                                              color: emp.is_active
                                                ? "var(--green-700, #15803d)"
                                                : "var(--slate-400)",
                                              border: `1px solid ${emp.is_active ? "var(--green-200, #bbf7d0)" : "var(--gray-200)"}`,
                                            }}
                                          >
                                            {emp.name} ({emp.role})
                                          </span>
                                        ))
                                      ) : (
                                        <span
                                          style={{
                                            fontSize: 12,
                                            color: "var(--slate-400)",
                                            fontStyle: "italic",
                                          }}
                                        >
                                          No employees assigned
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "12px 16px",
                                      textAlign: "center",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    <label
                                      className="switch"
                                      style={{ margin: "0 auto" }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={till.is_active}
                                        onChange={async (e) => {
                                          await apiFetch(
                                            `/pos/tills/${till.id}`,
                                            {
                                              method: "PUT",
                                              body: JSON.stringify({
                                                is_active: e.target.checked,
                                              }),
                                            },
                                          );
                                          if (companyId)
                                            loadPosTills(companyId);
                                        }}
                                      />
                                      <span className="slider" />
                                    </label>
                                  </td>
                                  <td
                                    style={{
                                      padding: "12px 20px",
                                      textAlign: "right",
                                      borderBottom: "1px solid var(--gray-100)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 6,
                                        justifyContent: "flex-end",
                                      }}
                                    >
                                      <button
                                        className="icon-btn"
                                        title="Edit Point Of Sales"
                                        onClick={() => {
                                          setTillEditing(till.id);
                                          setTillForm({
                                            name: till.name,
                                            employee_ids: till.employees.map(
                                              (e) => e.id,
                                            ),
                                            warehouse_id:
                                              till.warehouse_id ?? null,
                                            fiscal_device_id:
                                              till.fiscal_device_id ?? null,
                                          });
                                        }}
                                        style={{
                                          width: 30,
                                          height: 30,
                                          borderRadius: 6,
                                        }}
                                      >
                                        <EditIcon />
                                      </button>
                                      <button
                                        className="icon-btn danger"
                                        title="Delete Point Of Sales"
                                        onClick={() => deletePosTill(till.id)}
                                        style={{
                                          width: 30,
                                          height: 30,
                                          borderRadius: 6,
                                        }}
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div
                          style={{ padding: "32px 20px", textAlign: "center" }}
                        >
                          <Monitor
                            size={40}
                            strokeWidth={1.5}
                            color="var(--slate-300)"
                            style={{ marginBottom: 8 }}
                          />
                          <div
                            style={{
                              color: "var(--slate-400)",
                              fontSize: 13,
                            }}
                          >
                            No Point Of Sales configured yet
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* ── Chart of Accounts ── */}
              {activeSection === "acc-accounts" && (
                <section className="settings-section">
                  <div className="settings-section-header">
                    <h4>Chart of Accounts</h4>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="file" accept=".csv" ref={accFileRef} style={{ display: "none" }} onChange={accHandleFileSelect} />
                      <button className="settings-btn-sm" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", border: "1px solid var(--color-border-soft)", borderRadius: 8, fontWeight: 600, fontSize: 13 }} onClick={() => accFileRef.current?.click()}>
                        <Upload size={14} /> Import CSV
                      </button>
                      <button className="primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => { accResetForm(); setAccShowForm(true); }}>
                        <Plus size={14} /> New Account
                      </button>
                    </div>
                  </div>
                  {/* Import preview modal */}
                  {accImportOpen && (
                    <div className="settings-card" style={{ marginBottom: 16, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <h5 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}><FileSpreadsheet size={16} /> Import Preview — {accImportRows.length} rows</h5>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="settings-btn-sm" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }} onClick={accDownloadTemplate}>
                            <Download size={12} /> Template
                          </button>
                          <button className="settings-btn-sm" onClick={() => { setAccImportOpen(false); setAccImportRows([]); }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      {accImportRows.length === 0 ? (
                        <p style={{ color: "var(--muted)", fontSize: 13 }}>No valid rows found. Expected CSV headers: <code>code, name, account_type, currency_code, is_reconcilable, notes</code></p>
                      ) : (
                        <>
                          <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 12 }}>
                            <table className="settings-table" style={{ width: "100%" }}>
                              <thead><tr><th>#</th><th>Code</th><th>Name</th><th>Type</th><th>Currency</th><th>Reconcilable</th></tr></thead>
                              <tbody>
                                {accImportRows.slice(0, 50).map((r, i) => (
                                  <tr key={i}>
                                    <td style={{ color: "var(--muted)" }}>{i + 1}</td>
                                    <td style={{ fontWeight: 600 }}>{r.code || <span style={{ color: "var(--danger)" }}>—</span>}</td>
                                    <td>{r.name || <span style={{ color: "var(--danger)" }}>—</span>}</td>
                                    <td>{r.account_type || r.type || "asset"}</td>
                                    <td>{r.currency_code || r.currency || "—"}</td>
                                    <td>{r.is_reconcilable || r.reconcilable || "false"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {accImportRows.length > 50 && <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Showing first 50 of {accImportRows.length} rows</p>}
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="primary" style={{ display: "flex", alignItems: "center", gap: 6 }} disabled={accImporting} onClick={accHandleImport}>
                              {accImporting ? "Importing..." : <><Upload size={14} /> Import {accImportRows.length} Accounts</>}
                            </button>
                            <button className="settings-btn-sm" onClick={() => { setAccImportOpen(false); setAccImportRows([]); }}>Cancel</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {accError && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{accError}</div>}
                  {accShowForm && (
                    <div className="settings-card" style={{ marginBottom: 16, padding: 16 }}>
                      <h5 style={{ margin: "0 0 12px" }}>{accEditingId ? "Edit" : "New"} Account</h5>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><label className="settings-label">Code</label><input className="settings-input" value={accFormData.code ?? ""} onChange={e => setAccFormData({ ...accFormData, code: e.target.value })} /></div>
                        <div><label className="settings-label">Name</label><input className="settings-input" value={accFormData.name ?? ""} onChange={e => setAccFormData({ ...accFormData, name: e.target.value })} /></div>
                        <div><label className="settings-label">Type</label><select className="settings-input" value={accFormData.account_type ?? ""} onChange={e => setAccFormData({ ...accFormData, account_type: e.target.value })}><option value="">Select...</option>{ACC_ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                        <div><label className="settings-label">Currency</label><input className="settings-input" value={accFormData.currency_code ?? ""} onChange={e => setAccFormData({ ...accFormData, currency_code: e.target.value })} /></div>
                        <div><label className="settings-label">Reconcilable</label><br/><input type="checkbox" checked={!!accFormData.is_reconcilable} onChange={e => setAccFormData({ ...accFormData, is_reconcilable: e.target.checked })} /></div>
                        <div style={{ gridColumn: "1 / -1" }}><label className="settings-label">Notes</label><input className="settings-input" value={accFormData.notes ?? ""} onChange={e => setAccFormData({ ...accFormData, notes: e.target.value })} /></div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="primary" onClick={() => accHandleSave("/accounting/accounts")} disabled={accSaving}>{accSaving ? "Saving..." : "Save"}</button>
                        <button className="settings-btn-sm" onClick={accResetForm}>Cancel</button>
                      </div>
                    </div>
                  )}
                  <table className="settings-table" style={{ width: "100%" }}>
                    <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Currency</th><th>Reconcilable</th><th>Actions</th></tr></thead>
                    <tbody>
                      {accAccounts.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)" }}>No accounts yet</td></tr>}
                      {accAccounts.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 600 }}>{a.code}</td>
                          <td>{a.name}</td>
                          <td><span className={`badge badge-${a.account_type === "asset" ? "info" : a.account_type === "income" ? "success" : a.account_type === "expense" ? "danger" : "secondary"}`}>{a.account_type}</span></td>
                          <td>{a.currency_code}</td>
                          <td>{a.is_reconcilable ? "Yes" : "No"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button className="settings-btn-sm" onClick={() => accHandleEdit(a)}><PencilLine size={12} /> Edit</button>
                              <button className="settings-btn-sm" style={{ color: "var(--danger)" }} onClick={() => accHandleDelete("/accounting/accounts", a.id)}><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {/* ── Journals ── */}
              {activeSection === "acc-journals" && (
                <section className="settings-section">
                  <div className="settings-section-header">
                    <h4>Journals</h4>
                    <button className="primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => { accResetForm(); setAccShowForm(true); }}>
                      <Plus size={14} /> New Journal
                    </button>
                  </div>
                  {accError && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{accError}</div>}
                  {accShowForm && (
                    <div className="settings-card" style={{ marginBottom: 16, padding: 16 }}>
                      <h5 style={{ margin: "0 0 12px" }}>{accEditingId ? "Edit" : "New"} Journal</h5>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><label className="settings-label">Name</label><input className="settings-input" value={accFormData.name ?? ""} onChange={e => setAccFormData({ ...accFormData, name: e.target.value })} /></div>
                        <div><label className="settings-label">Short Code</label><input className="settings-input" value={accFormData.code ?? ""} onChange={e => setAccFormData({ ...accFormData, code: e.target.value })} /></div>
                        <div><label className="settings-label">Type</label><select className="settings-input" value={accFormData.journal_type ?? ""} onChange={e => setAccFormData({ ...accFormData, journal_type: e.target.value })}><option value="">Select...</option>{ACC_JOURNAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                        <div><label className="settings-label">Currency</label><input className="settings-input" value={accFormData.currency_code ?? ""} onChange={e => setAccFormData({ ...accFormData, currency_code: e.target.value })} /></div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="primary" onClick={() => accHandleSave("/accounting/journals")} disabled={accSaving}>{accSaving ? "Saving..." : "Save"}</button>
                        <button className="settings-btn-sm" onClick={accResetForm}>Cancel</button>
                      </div>
                    </div>
                  )}
                  <table className="settings-table" style={{ width: "100%" }}>
                    <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Currency</th><th>Active</th><th>Actions</th></tr></thead>
                    <tbody>
                      {accJournals.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)" }}>No journals yet</td></tr>}
                      {accJournals.map(j => (
                        <tr key={j.id}>
                          <td style={{ fontWeight: 600 }}>{j.code}</td>
                          <td>{j.name}</td>
                          <td><span className={`badge badge-${j.journal_type === "sale" ? "success" : j.journal_type === "purchase" ? "danger" : j.journal_type === "bank" ? "info" : "secondary"}`}>{ACC_JOURNAL_TYPES.find(t => t.value === j.journal_type)?.label || j.journal_type}</span></td>
                          <td>{j.currency_code}</td>
                          <td>{j.is_active ? "✓" : "—"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button className="settings-btn-sm" onClick={() => accHandleEdit(j)}><PencilLine size={12} /> Edit</button>
                              <button className="settings-btn-sm" style={{ color: "var(--danger)" }} onClick={() => accHandleDelete("/accounting/journals", j.id)}><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {/* ── Payment Terms ── */}
              {activeSection === "acc-payment-terms" && (
                <section className="settings-section">
                  <div className="settings-section-header">
                    <h4>Payment Terms</h4>
                    <button className="primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => { accResetForm(); setAccShowForm(true); }}>
                      <Plus size={14} /> New Payment Term
                    </button>
                  </div>
                  {accError && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{accError}</div>}
                  {accShowForm && (
                    <div className="settings-card" style={{ marginBottom: 16, padding: 16 }}>
                      <h5 style={{ margin: "0 0 12px" }}>{accEditingId ? "Edit" : "New"} Payment Term</h5>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={{ gridColumn: "1 / -1" }}><label className="settings-label">Name</label><input className="settings-input" value={accFormData.name ?? ""} onChange={e => setAccFormData({ ...accFormData, name: e.target.value })} /></div>
                        <div style={{ gridColumn: "1 / -1" }}><label className="settings-label">Description</label><input className="settings-input" value={accFormData.description ?? ""} onChange={e => setAccFormData({ ...accFormData, description: e.target.value })} /></div>
                        <div><label className="settings-label">Due Days</label><input type="number" className="settings-input" value={accFormData.due_days ?? ""} onChange={e => setAccFormData({ ...accFormData, due_days: parseInt(e.target.value) || 0 })} /></div>
                        <div><label className="settings-label">Discount %</label><input type="number" className="settings-input" value={accFormData.discount_percentage ?? ""} onChange={e => setAccFormData({ ...accFormData, discount_percentage: parseFloat(e.target.value) || 0 })} /></div>
                        <div><label className="settings-label">Discount Days</label><input type="number" className="settings-input" value={accFormData.discount_days ?? ""} onChange={e => setAccFormData({ ...accFormData, discount_days: parseInt(e.target.value) || 0 })} /></div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="primary" onClick={() => accHandleSave("/accounting/payment-terms")} disabled={accSaving}>{accSaving ? "Saving..." : "Save"}</button>
                        <button className="settings-btn-sm" onClick={accResetForm}>Cancel</button>
                      </div>
                    </div>
                  )}
                  <table className="settings-table" style={{ width: "100%" }}>
                    <thead><tr><th>Name</th><th>Description</th><th>Due Days</th><th>Discount %</th><th>Discount Days</th><th>Actions</th></tr></thead>
                    <tbody>
                      {accPaymentTerms.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)" }}>No payment terms yet</td></tr>}
                      {accPaymentTerms.map(pt => (
                        <tr key={pt.id}>
                          <td style={{ fontWeight: 600 }}>{pt.name}</td>
                          <td>{pt.description || "—"}</td>
                          <td>{pt.due_days}</td>
                          <td>{pt.discount_percentage}%</td>
                          <td>{pt.discount_days}</td>
                          <td>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button className="settings-btn-sm" onClick={() => accHandleEdit(pt)}><PencilLine size={12} /> Edit</button>
                              <button className="settings-btn-sm" style={{ color: "var(--danger)" }} onClick={() => accHandleDelete("/accounting/payment-terms", pt.id)}><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}


              {/* ── Financial Budgets ── */}
              {activeSection === "acc-budgets" && (
                <section className="settings-section">
                  <div className="settings-section-header">
                    <h4>Financial Budgets</h4>
                    <button className="primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => { accResetForm(); setAccShowForm(true); }}>
                      <Plus size={14} /> New Budget
                    </button>
                  </div>
                  {accError && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{accError}</div>}
                  {accShowForm && (
                    <div className="settings-card" style={{ marginBottom: 16, padding: 16 }}>
                      <h5 style={{ margin: "0 0 12px" }}>{accEditingId ? "Edit" : "New"} Budget</h5>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={{ gridColumn: "1 / -1" }}><label className="settings-label">Name</label><input className="settings-input" value={accFormData.name ?? ""} onChange={e => setAccFormData({ ...accFormData, name: e.target.value })} /></div>
                        <div><label className="settings-label">From</label><input type="date" className="settings-input" value={accFormData.date_from ?? ""} onChange={e => setAccFormData({ ...accFormData, date_from: e.target.value })} /></div>
                        <div><label className="settings-label">To</label><input type="date" className="settings-input" value={accFormData.date_to ?? ""} onChange={e => setAccFormData({ ...accFormData, date_to: e.target.value })} /></div>
                        <div style={{ gridColumn: "1 / -1" }}><label className="settings-label">Notes</label><input className="settings-input" value={accFormData.notes ?? ""} onChange={e => setAccFormData({ ...accFormData, notes: e.target.value })} /></div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="primary" onClick={() => accHandleSave("/accounting/budgets")} disabled={accSaving}>{accSaving ? "Saving..." : "Save"}</button>
                        <button className="settings-btn-sm" onClick={accResetForm}>Cancel</button>
                      </div>
                    </div>
                  )}
                  <table className="settings-table" style={{ width: "100%" }}>
                    <thead><tr><th>Name</th><th>Period</th><th>Status</th><th>Lines</th><th>Actions</th></tr></thead>
                    <tbody>
                      {accBudgets.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)" }}>No budgets yet</td></tr>}
                      {accBudgets.map(b => (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 600 }}>{b.name}</td>
                          <td>{new Date(b.date_from).toLocaleDateString()} — {new Date(b.date_to).toLocaleDateString()}</td>
                          <td><span className={`badge badge-${b.status === "confirmed" ? "success" : b.status === "done" ? "info" : "warning"}`}>{b.status}</span></td>
                          <td>{b.lines?.length || 0}</td>
                          <td>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button className="settings-btn-sm" onClick={() => accHandleEdit(b)}><PencilLine size={12} /> Edit</button>
                              <button className="settings-btn-sm" style={{ color: "var(--danger)" }} onClick={() => accHandleDelete("/accounting/budgets", b.id)}><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </>
          )}

          {activeTopTab === "users" &&
            me.is_admin &&
            activeSection === "admins" && (
              <section id="admins" className="settings-section">
                <div className="settings-section-header">
                  <h4>Administrators</h4>
                  <button
                    className="primary"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                    onClick={() => {
                      if (showAdminForm) {
                        setShowAdminForm(false);
                        setAdminEmail("");
                        setAdminPassword("");
                        return;
                      }
                      setShowAdminForm(true);
                    }}
                  >
                    {showAdminForm ? <XIcon /> : <PlusIcon />}
                    {showAdminForm ? " Cancel" : " Add Admin"}
                  </button>
                </div>
                {adminError && (
                  <div
                    className="alert alert-danger"
                    style={{ marginBottom: 16 }}
                  >
                    {adminError}
                  </div>
                )}
                {showAdminForm && (
                  <div style={{ marginBottom: 16 }}>
                    <div
                      className="settings-user-grid"
                      style={{ marginBottom: 12 }}
                    >
                      <label className="input">
                        Email
                        <input
                          type="email"
                          value={adminEmail}
                          onChange={(e) => setAdminEmail(e.target.value)}
                          placeholder="admin@example.com"
                        />
                      </label>
                      <label className="input">
                        Password
                        <input
                          type="password"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          placeholder="••••••••"
                        />
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="primary"
                        onClick={createAdmin}
                        disabled={!adminEmail || !adminPassword}
                      >
                        <PlusIcon /> Create Admin
                      </button>
                      <button
                        className="outline"
                        onClick={() => {
                          setShowAdminForm(false);
                          setAdminEmail("");
                          setAdminPassword("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <table className="table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin) => (
                      <tr key={admin.id}>
                        <td>
                          {editingId === admin.id ? (
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  email: e.target.value,
                                })
                              }
                            />
                          ) : (
                            admin.email
                          )}
                        </td>
                        <td>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={admin.is_active}
                              onChange={(e) =>
                                updateAdmin(admin.id, {
                                  is_active: e.target.checked,
                                })
                              }
                            />
                            <span className="slider" />
                          </label>
                        </td>
                        <td>
                          {editingId === admin.id ? (
                            <>
                              <button
                                className="icon-btn"
                                onClick={() =>
                                  updateAdmin(admin.id, {
                                    email: editForm.email,
                                    password: editForm.password || undefined,
                                  })
                                }
                              >
                                <CheckIcon />
                              </button>
                              <button
                                className="icon-btn"
                                onClick={() => setEditingId(null)}
                              >
                                <XIcon />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="icon-btn"
                                onClick={() => {
                                  setEditingId(admin.id);
                                  setEditForm({
                                    email: admin.email,
                                    password: "",
                                  });
                                }}
                              >
                                <EditIcon />
                              </button>
                              <button
                                className="icon-btn"
                                onClick={() => deleteAdmin(admin.id)}
                              >
                                <TrashIcon />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!admins.length && (
                      <tr>
                        <td colSpan={3}>No administrators found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            )}

          {activeTopTab === "users" &&
            !me.is_admin &&
            activeSection === "users-companies" && (
              <section id="users-companies" className="settings-section">
                <div className="settings-section-header">
                  <h4>{isPortalSuperUser ? "Portal Users" : "Your Account"}</h4>
                </div>
                {isPortalSuperUser ? (
                    <div className="settings-card">
                    {portalUserError && (
                      <div
                        className="alert alert-danger"
                        style={{ marginBottom: 16 }}
                      >
                        {portalUserError}
                      </div>
                    )}
                    <InlineTabs
                      value={portalUsersTab}
                      onChange={(value) => setPortalUsersTab(value)}
                      items={[
                        {
                          value: "add" as const,
                          icon: <UserPlus size={16} />,
                          label: portalUserEditingId ? "Edit User" : "Add User",
                        },
                        {
                          value: "manage" as const,
                          icon: <Users size={16} />,
                          label: "Manage Users",
                        },
                        {
                          value: "audit" as const,
                          icon: <Monitor size={16} />,
                          label: "Audit Trail",
                        },
                      ]}
                    />
                    {portalUsersTab === "add" ? (
                      <>
                        <div className="form-grid">
                          <label className="input">
                            Name
                            <input
                              type="text"
                              value={portalUserForm.name}
                              onChange={(e) =>
                                setPortalUserForm((prev) => ({
                                  ...prev,
                                  name: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="input">
                            Email
                            <input
                              type="email"
                              value={portalUserForm.email}
                              onChange={(e) =>
                                setPortalUserForm((prev) => ({
                                  ...prev,
                                  email: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="input">
                            {portalUserEditingId ? "New Password" : "Password"}
                            <input
                              type="password"
                              value={portalUserForm.password}
                              onChange={(e) =>
                                setPortalUserForm((prev) => ({
                                  ...prev,
                                  password: e.target.value,
                                }))
                              }
                            />
                          </label>
                        </div>
                        <div className="portal-app-access" style={{ marginTop: 16 }}>
                          <div className="portal-app-access-head">
                            <h5>App Access</h5>
                          </div>
                          <div className="portal-app-grid">
                            {PORTAL_APP_OPTIONS.filter((app) => app.key !== "settings").map((app) => {
                              const selected = portalUserForm.portal_apps.includes(app.key);
                              return (
                                <label
                                  key={app.key}
                                  className={`portal-app-option ${selected ? "selected" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() =>
                                      setPortalUserForm((prev) => ({
                                        ...prev,
                                        portal_apps: selected
                                          ? prev.portal_apps.filter((item) => item !== app.key)
                                          : [...prev.portal_apps, app.key],
                                      }))
                                    }
                                  />
                                  <span>{app.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                          <button
                            className="primary"
                            onClick={savePortalManagedUser}
                            disabled={
                              portalUserSaving ||
                              !portalUserForm.name ||
                              !portalUserForm.email ||
                              (!portalUserEditingId && !portalUserForm.password)
                            }
                          >
                            {portalUserSaving
                              ? "Saving..."
                              : portalUserEditingId
                                ? "Update User"
                                : "Add User"}
                          </button>
                          {portalUserEditingId && (
                            <button
                              className="outline"
                              onClick={() => {
                                resetPortalUserForm();
                                setPortalUsersTab("add");
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </>
                    ) : portalUsersTab === "manage" ? (
                      <>
                        <div className="settings-search-input" style={{ marginBottom: 16 }}>
                          <Search size={16} />
                          <input
                            type="text"
                            placeholder="Search users by name or email..."
                            value={portalUserSearch}
                            onChange={(e) => setPortalUserSearch(e.target.value)}
                          />
                        </div>
                        {portalUsersLoading ? (
                          <div className="page-sub">Loading portal users...</div>
                        ) : filteredPortalManagedUsers.length ? (
                          <div
                            className="table-wrap"
                            style={{ maxHeight: 420, overflowY: "auto" }}
                          >
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>User</th>
                                  <th>Role</th>
                                  <th>Apps</th>
                                  <th>Status</th>
                                  <th style={{ textAlign: "right" }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredPortalManagedUsers.map((user) => (
                                  <tr key={user.id}>
                                    <td>
                                      <div style={{ fontWeight: 700 }}>{user.name || "-"}</div>
                                      <div className="page-sub" style={{ marginTop: 2 }}>{user.email}</div>
                                    </td>
                                    <td>
                                      {user.is_portal_super_user ? "Portal Super User" : "Portal User"}
                                    </td>
                                    <td>
                                      <div className="portal-app-badges" style={{ marginTop: 0 }}>
                                        {user.portal_apps.map((appKey) => {
                                          const option = PORTAL_APP_OPTIONS.find((item) => item.key === appKey);
                                          return (
                                            <span key={appKey} className="portal-app-badge">
                                              {option?.label || appKey}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </td>
                                    <td>{user.is_active ? "Active" : "Inactive"}</td>
                                    <td>
                                      {!user.is_portal_super_user && (
                                        <div className="action-icons" style={{ justifyContent: "flex-end" }}>
                                          <button
                                            className="icon-btn"
                                            onClick={() => {
                                              setPortalUserEditingId(user.id);
                                              setPortalUserForm({
                                                name: user.name,
                                                email: user.email,
                                                password: "",
                                                portal_apps: user.portal_apps.filter((app) => app !== "settings"),
                                              });
                                              setPortalUsersTab("add");
                                            }}
                                            title="Edit user"
                                          >
                                            <EditIcon />
                                          </button>
                                          <button
                                            className="icon-btn danger"
                                            onClick={() => deletePortalManagedUser(user.id)}
                                            title="Delete user"
                                          >
                                            <TrashIcon />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="page-sub">No portal users found.</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="settings-search-input" style={{ marginBottom: 16 }}>
                          <Search size={16} />
                          <input
                            type="text"
                            placeholder="Search audit trail..."
                            value={portalAuditSearch}
                            onChange={(e) => setPortalAuditSearch(e.target.value)}
                          />
                        </div>
                        {portalAuditLoading ? (
                          <div className="page-sub">Loading audit trail...</div>
                        ) : portalAuditLogs.length ? (
                          <>
                          <div className="table-wrap settings-audit-table-wrap">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>User</th>
                                  <th>Action</th>
                                  <th>Resource</th>
                                  <th>Summary</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pagedPortalAuditLogs.map((log) => (
                                  <tr key={log.id}>
                                    <td>{new Date(log.action_at).toLocaleString()}</td>
                                    <td>
                                      <div style={{ fontWeight: 700 }}>{log.user_name || "-"}</div>
                                      <div className="page-sub" style={{ marginTop: 2 }}>{log.user_email || "-"}</div>
                                    </td>
                                    <td>{log.action.replace(/_/g, " ")}</td>
                                    <td>{log.resource_reference || log.resource_type}</td>
                                    <td>{log.changes_summary || "-"}</td>
                                    <td>
                                      <span className={`status-badge status-${log.status === "error" ? "cancelled" : "done"}`}>
                                        {log.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="settings-audit-footer">
                            <label className="settings-audit-rows">
                              <span>Rows:</span>
                              <select
                                value={portalAuditPageSize}
                                onChange={(e) => setPortalAuditPageSize(Number(e.target.value))}
                              >
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                              </select>
                            </label>
                            <div className="page-sub">
                              Showing {(portalAuditPage - 1) * portalAuditPageSize + 1}-
                              {Math.min(portalAuditPage * portalAuditPageSize, portalAuditLogs.length)} of {portalAuditLogs.length}
                            </div>
                            <div className="settings-audit-pager">
                              <button
                                className="outline"
                                onClick={() => setPortalAuditPage((prev) => Math.max(1, prev - 1))}
                                disabled={portalAuditPage === 1}
                              >
                                Prev
                              </button>
                              <span className="page-sub">
                                Page {portalAuditPage} / {portalAuditTotalPages}
                              </span>
                              <button
                                className="outline"
                                onClick={() =>
                                  setPortalAuditPage((prev) => Math.min(portalAuditTotalPages, prev + 1))
                                }
                                disabled={portalAuditPage >= portalAuditTotalPages}
                              >
                                Next
                              </button>
                            </div>
                          </div>
                          </>
                        ) : (
                          <div className="page-sub">No audit entries found.</div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="settings-card-grid">
                    <div className="settings-card">
                      <div className="settings-card-title">Your Account</div>
                      <div className="settings-card-sub">Portal user settings</div>
                      <div className="input">
                        <span>Email</span>
                        <input type="email" value={me.email} readOnly />
                      </div>
                      <p className="page-sub">
                        This portal user cannot manage settings.
                      </p>
                    </div>
                    <div className="settings-card">
                      <div className="settings-card-title">Companies</div>
                      <div className="settings-card-sub">You have access to these companies</div>
                      <ul style={{ paddingLeft: 16, margin: 0 }}>
                        {companies.map((c) => (
                          <li key={c.id} style={{ marginBottom: 6 }}>
                            <strong>{c.name}</strong> - {c.email || ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </section>
            )}

          {/* Subscription section */}
          {activeSection === "subscription" && (
            <section id="subscription" className="settings-section">
              <div className="settings-section-header">
                <h4>Subscription</h4>
                <p className="page-sub">
                  View your subscription status and validity.
                </p>
              </div>
              {subLoading ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: 40,
                    color: "var(--muted)",
                  }}
                >
                  Loading subscription info...
                </div>
              ) : subStatuses.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: 40,
                    color: "var(--muted)",
                  }}
                >
                  <p>No subscription information available.</p>
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 16 }}
                >
                  {subStatuses.map((s, idx) => {
                    const statusColor =
                      s.status === "active"
                        ? "var(--emerald-500)"
                        : s.status === "expired"
                          ? "var(--red-500)"
                          : "var(--amber-500)";
                    const daysRemaining = s.expires_at
                      ? Math.ceil(
                          (new Date(s.expires_at).getTime() - Date.now()) /
                            86400000,
                        )
                      : null;
                    const daysColor =
                      daysRemaining !== null && daysRemaining <= 30
                        ? "var(--red-500)"
                        : daysRemaining !== null && daysRemaining <= 90
                          ? "var(--amber-500)"
                          : "var(--emerald-500)";
                    return (
                      <div
                        key={idx}
                        className="settings-card"
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          padding: 24,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 16,
                          }}
                        >
                          <div>
                            <div
                              className="settings-card-title"
                              style={{ fontSize: 16 }}
                            >
                              {s.company_name}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                marginTop: 6,
                              }}
                            >
                              <span
                                style={{
                                  textTransform: "capitalize",
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color:
                                    s.plan === "enterprise"
                                      ? "var(--amber-500)"
                                      : s.plan === "professional"
                                        ? "var(--violet-500)"
                                        : "var(--blue-500)",
                                }}
                              >
                                {s.plan || "—"}
                              </span>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 10px",
                                  borderRadius: 20,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  color: "white",
                                  background: statusColor,
                                }}
                              >
                                {s.status || (s.activated ? "active" : "none")}
                              </span>
                            </div>
                          </div>
                          {s.activated && daysRemaining !== null && (
                            <div style={{ textAlign: "right" }}>
                              <div
                                style={{
                                  fontSize: 28,
                                  fontWeight: 800,
                                  color: daysColor,
                                }}
                              >
                                {Math.max(daysRemaining, 0)}
                              </div>
                              <div
                                style={{ fontSize: 11, color: "var(--muted)" }}
                              >
                                days remaining
                              </div>
                            </div>
                          )}
                        </div>
                        {s.activated && (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 12,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--muted)",
                                  textTransform: "uppercase",
                                  letterSpacing: 0.5,
                                }}
                              >
                                Expires
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>
                                {s.expires_at
                                  ? new Date(s.expires_at).toLocaleDateString(
                                      "en-US",
                                      {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                      },
                                    )
                                  : "—"}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--muted)",
                                  textTransform: "uppercase",
                                  letterSpacing: 0.5,
                                }}
                              >
                                Status
                              </div>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  textTransform: "capitalize",
                                }}
                              >
                                {s.status}
                              </div>
                            </div>
                          </div>
                        )}
                        {!s.activated && (
                          <div style={{ color: "var(--muted)", fontSize: 13 }}>
                            No active subscription. Contact your administrator
                            for an activation code.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Configure Document Layout Modal */}
      {showConfigureLayout && (
        <div
          className="settings-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfigureLayout(false);
          }}
        >
          <div className="settings-modal">
            <div className="settings-modal-header">
              <h3>Configure Document Layout</h3>
              <button
                className="settings-modal-close"
                onClick={() => setShowConfigureLayout(false)}
              >
                ×
              </button>
            </div>
            <div className="settings-modal-body">
              <div className="settings-modal-grid">
                <label className="input">
                  Layout Style
                  <select
                    value={settingsForm.document_layout}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        document_layout: e.target.value,
                      })
                    }
                  >
                    <option value="external_layout_standard">Standard</option>
                    <option value="external_layout_boxed">Boxed</option>
                    <option value="external_layout_bold">Bold</option>
                    <option value="external_layout_bubble">Bubble</option>
                  </select>
                </label>
                <label className="input">
                  Watermark Text
                  <input
                    value={settingsForm.document_watermark}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        document_watermark: e.target.value,
                      })
                    }
                    placeholder="e.g., PAID, DRAFT"
                  />
                </label>
                <label className="input">
                  Watermark Opacity
                  <input
                    type="number"
                    min="0.02"
                    max="0.3"
                    step="0.01"
                    value={settingsForm.document_watermark_opacity}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        document_watermark_opacity: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div style={{ marginTop: 20 }}>{previewCard()}</div>
            </div>
            <div className="settings-modal-footer">
              <button
                className="outline"
                onClick={() => setShowConfigureLayout(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Layout Modal */}
      {showEditLayout && (
        <div
          className="settings-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEditLayout(false);
          }}
        >
          <div className="settings-modal">
            <div className="settings-modal-header">
              <h3>Edit Document Layout</h3>
              <button
                className="settings-modal-close"
                onClick={() => setShowEditLayout(false)}
              >
                ×
              </button>
            </div>
            <div className="settings-modal-body">
              <div className="settings-modal-stack">
                <label className="input">
                  Document Header
                  <textarea
                    rows={2}
                    value={settingsForm.document_header}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        document_header: e.target.value,
                      })
                    }
                    placeholder="Header text for invoices/quotations"
                  />
                </label>
                <label className="input">
                  Document Footer
                  <textarea
                    rows={3}
                    value={settingsForm.document_footer}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        document_footer: e.target.value,
                      })
                    }
                    placeholder="Footer text for invoices/quotations"
                  />
                </label>
                <label className="input">
                  Default Payment Terms
                  <input
                    value={settingsForm.payment_terms_default}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        payment_terms_default: e.target.value,
                      })
                    }
                    placeholder="e.g., Due on receipt"
                  />
                </label>
                <label className="input">
                  Invoice Notes
                  <textarea
                    rows={3}
                    value={settingsForm.invoice_notes}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        invoice_notes: e.target.value,
                      })
                    }
                    placeholder="Notes shown at the bottom of invoices/quotations"
                  />
                </label>
              </div>
              <div style={{ marginTop: 20 }}>{previewCard()}</div>
            </div>
            <div className="settings-modal-footer">
              <button
                className="outline"
                onClick={() => setShowEditLayout(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && selectedTax ? (
        <div
          className="settings-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowForm(false);
              setSelectedTax(null);
            }
          }}
        >
          <div className="settings-modal">
            <div className="settings-modal-header">
              <h3>{selectedTax.is_zimra_tax ? "ZIMRA Tax" : "Tax"}</h3>
              <button
                className="settings-modal-close"
                onClick={() => {
                  setShowForm(false);
                  setSelectedTax(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="settings-modal-body">
              <div className="settings-modal-grid">
                <label className="input">
                  Tax Name
                  <input
                    value={selectedTax.name}
                    onChange={(e) =>
                      setSelectedTax({ ...selectedTax, name: e.target.value })
                    }
                  />
                </label>
                <label className="input">
                  Description
                  <input
                    value={selectedTax.description}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        description: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="input">
                  Tax Type
                  <select
                    value={selectedTax.tax_type}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        tax_type: e.target.value,
                      })
                    }
                  >
                    {TAX_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="input">
                  Tax Scope
                  <select
                    value={selectedTax.tax_scope}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        tax_scope: e.target.value,
                      })
                    }
                  >
                    {TAX_SCOPES.map((scope) => (
                      <option key={scope.value} value={scope.value}>
                        {scope.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="input">
                  Label on Invoices
                  <input
                    value={selectedTax.label_on_invoice}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        label_on_invoice: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="input">
                  Rate (%)
                  <input
                    type="number"
                    value={selectedTax.rate}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        rate: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="input">
                  ZIMRA Tax ID
                  <input
                    type="number"
                    value={selectedTax.zimra_tax_id ?? ""}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        zimra_tax_id: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    placeholder="From FDMS GetConfig"
                  />
                </label>
                <label className="input">
                  ZIMRA Tax Code
                  <input
                    value={selectedTax.zimra_tax_code || ""}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        zimra_tax_code: e.target.value,
                      })
                    }
                    placeholder="e.g., A, B, C"
                  />
                </label>
                <label className="input">
                  ZIMRA Code
                  <input
                    value={selectedTax.zimra_code}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        zimra_code: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="input">
                  Valid From
                  <input
                    type="date"
                    value={selectedTax.zimra_valid_from || ""}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        zimra_valid_from: e.target.value || null,
                      })
                    }
                  />
                </label>
                <label className="input">
                  Valid Till
                  <input
                    type="date"
                    value={selectedTax.zimra_valid_till || ""}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        zimra_valid_till: e.target.value || null,
                      })
                    }
                  />
                </label>
                <label className="input">
                  Active
                  <select
                    value={selectedTax.is_active ? "yes" : "no"}
                    onChange={(e) =>
                      setSelectedTax({
                        ...selectedTax,
                        is_active: e.target.value === "yes",
                      })
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="settings-modal-footer">
              <button className="primary" onClick={saveTax}>
                Save
              </button>
              <button
                className="outline"
                onClick={() => deleteTax(selectedTax.id)}
              >
                Delete
              </button>
              <button
                className="outline"
                onClick={() => {
                  setShowForm(false);
                  setSelectedTax(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
