import { useEffect, useMemo, useRef, useState } from "react";
import html2pdf from "html2pdf.js";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  FileMinus,
  FilePlus,
  FileText,
  FunnelPlus,
  PenLine,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiFetch } from "../api";
import JournalEntryPreviewDrawer from "../components/JournalEntryPreviewDrawer";
import { useMe } from "../hooks/useMe";
import { useCompanies, Company } from "../hooks/useCompanies";
import { useAlert } from "../context/AlertContext";
import ValidationAlert from "../components/ValidationAlert";
import ValidatedField from "../components/ValidatedField";
import { Sidebar } from "../components/Sidebar";
import type { SidebarSection } from "../types/sidebar";
import type { CurrencyItem, CurrencyRateRead } from "../types/currency";
import "./InvoicesPage.css";
import {
  getDocumentLinesError,
  getMissingRequiredFields,
  getRequiredFieldError,
} from "../utils/formValidation";

type InvoiceLine = {
  id: number;
  invoice_id: number;
  product_id: number | null;
  description: string;
  hs_code?: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  discount: number;
  vat_rate: number;
  subtotal: number;
  tax_amount: number;
  total_price: number;
};

type Invoice = {
  id: number;
  company_id: number;
  quotation_id: number | null;
  customer_id: number | null;
  reference: string;
  invoice_type: string;
  reversed_invoice_id: number | null;
  status: string;
  invoice_date: string | null;
  due_date: string | null;
  fiscalized_at: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  payment_terms: string;
  payment_reference: string;
  notes: string;
  device_id?: number | null;
  zimra_status?: string;
  zimra_receipt_id?: string;
  zimra_receipt_counter?: number;
  zimra_receipt_global_no?: number;
  zimra_verification_code?: string;
  zimra_verification_url?: string;
  zimra_payload?: string;
  zimra_errors?: string;
  lines: InvoiceLine[];
};

type QuotationLine = {
  id: number;
  product_id: number | null;
  description: string;
  quantity: number;
  uom: string;
  unit_price: number;
  vat_rate: number;
  total_price: number;
};

type Quotation = {
  id: number;
  customer_id: number;
  reference: string;
  status: string;
  lines: QuotationLine[];
};

type Contact = {
  id: number;
  name: string;
  address: string;
  city?: string;
  country?: string;
  vat: string;
  tin: string;
  phone: string;
  email?: string | null;
};

type Product = {
  id: number;
  name: string;
  sale_price: number;
  tax_rate: number;
  tax_id: number | null;
  reference?: string;
  hs_code?: string;
  uom?: string;
  quantity_on_hand?: number;
  quantity_available?: number;
  quantity_reserved?: number;
  stock_value?: number;
};

type Device = {
  id: number;
  device_id: string;
  serial_number?: string;
  model?: string;
  fiscal_day_status?: string;
};

type Warehouse = {
  id: number;
  name: string;
};

type Location = {
  id: number;
  name: string;
  warehouse_id: number;
};

type CompanySettings = {
  logo_data: string;
  document_layout: string;
  currency_code?: string | null;
  currency_symbol?: string | null;
  invoice_notes?: string;
  payment_terms_default?: string;
  document_header?: string;
  document_footer?: string;
  document_watermark?: string;
  document_watermark_opacity?: string;
};

type PaymentTermItem = {
  id: number;
  name: string;
  is_active: boolean;
};

type JournalItem = {
  id: number;
  company_id: number;
  name: string;
  code: string;
  journal_type: string;
  default_account_id: number | null;
  currency_code: string;
  is_active: boolean;
};

const currencyOptions = ["USD", "ZWG", "ZAR", "EUR", "GBP"];

const normalizeCurrency = (value: string | null | undefined) => {
  const code = (value || "").trim().toUpperCase();
  if (!code) return "";
  return code === "ZWL" ? "ZWG" : code;
};

const formatCurrency = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(2)}`;
  }
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};

const normalizeUom = (value: string) => (value === "PCS" ? "Units" : value);

const toDateInputValue = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

const fromDateInputValue = (value: string) =>
  value ? new Date(value).toISOString() : null;

const getPaymentStatus = (amountPaid: number, amountDue: number) => {
  if (amountDue <= 0) return "Paid";
  if (amountPaid > 0) return "Partial";
  return "Unpaid";
};

type FilterDefinition = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
};

const isPOSReceiptInvoice = (invoice: Invoice) =>
  invoice.reference.startsWith("POS-") ||
  invoice.reference.startsWith("CN-POS-");

const STATUS_FILTERS: FilterDefinition[] = [
  {
    key: "",
    label: "ALL INVOICES",
    icon: FileText,
    color: "var(--indigo-500)",
  },
  { key: "draft", label: "DRAFT", icon: PenLine, color: "var(--amber-500)" },
  {
    key: "posted",
    label: "POSTED",
    icon: ArrowUpRight,
    color: "var(--blue-500)",
  },
  {
    key: "paid",
    label: "PAID",
    icon: CheckCircle2,
    color: "var(--emerald-500)",
  },
  {
    key: "fiscalized",
    label: "FISCALIZED",
    icon: ShieldCheck,
    color: "var(--violet-500)",
  },
];

const TYPE_FILTERS: FilterDefinition[] = [
  { key: "", label: "ALL TYPES", icon: FileText, color: "var(--muted)" },
  {
    key: "invoice",
    label: "INVOICE",
    icon: FilePlus,
    color: "var(--blue-500)",
  },
  {
    key: "credit_note",
    label: "CREDIT NOTES",
    icon: FileMinus,
    color: "var(--violet-500)",
  },
  {
    key: "pos_receipt",
    label: "POS RECEIPTS",
    icon: ReceiptText,
    color: "var(--emerald-500)",
  },
];

const STATUS_ICON_STYLES: Record<
  string,
  { color: string; background: string }
> = {
  "": {
    color: "var(--indigo-500)",
    background: "rgba(99, 102, 241, 0.15)",
  },
  draft: {
    color: "var(--amber-500)",
    background: "rgba(251, 191, 36, 0.15)",
  },
  posted: {
    color: "var(--blue-500)",
    background: "rgba(59, 130, 246, 0.12)",
  },
  paid: {
    color: "var(--emerald-500)",
    background: "rgba(16, 185, 129, 0.15)",
  },
  fiscalized: {
    color: "var(--violet-500)",
    background: "rgba(139, 92, 246, 0.15)",
  },
};

const TYPE_ICON_STYLES: Record<string, { color: string; background: string }> =
  {
    "": {
      color: "var(--muted)",
      background: "rgba(148, 163, 184, 0.12)",
    },
    invoice: {
      color: "var(--blue-500)",
      background: "rgba(59, 130, 246, 0.12)",
    },
    credit_note: {
      color: "var(--violet-500)",
      background: "rgba(139, 92, 246, 0.15)",
    },
    pos_receipt: {
      color: "var(--emerald-500)",
      background: "rgba(16, 185, 129, 0.15)",
    },
  };

type Rgb = { r: number; g: number; b: number };

type InvoiceTheme = {
  primary: string;
  ink: string;
  muted: string;
  line: string;
  panel: string;
  tableHead: string;
};

const DEFAULT_THEME_PRIMARY = "#1f2937";

const clampColor = (value: number) => Math.max(0, Math.min(255, value));

const rgbToHex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b]
    .map((value) => clampColor(Math.round(value)).toString(16).padStart(2, "0"))
    .join("")}`;

const hexToRgb = (hex: string): Rgb | null => {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
};

const mixColors = (base: Rgb, target: Rgb, ratio: number): Rgb => {
  const weight = Math.max(0, Math.min(1, ratio));
  return {
    r: base.r * (1 - weight) + target.r * weight,
    g: base.g * (1 - weight) + target.g * weight,
    b: base.b * (1 - weight) + target.b * weight,
  };
};

const rgbToHsl = ({ r, g, b }: Rgb) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
  }

  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    saturation,
    lightness,
    hue: ((hue * 60 + 360) % 360) / 360,
  };
};

const buildInvoiceTheme = (primaryHex: string): InvoiceTheme => {
  const primaryRgb = hexToRgb(primaryHex) ?? hexToRgb(DEFAULT_THEME_PRIMARY)!;
  return {
    primary: rgbToHex(mixColors(primaryRgb, { r: 0, g: 0, b: 0 }, 0.12)),
    ink: "#111827",
    muted: "#6b7280",
    line: rgbToHex(mixColors(primaryRgb, { r: 255, g: 255, b: 255 }, 0.82)),
    panel: rgbToHex(mixColors(primaryRgb, { r: 255, g: 255, b: 255 }, 0.9)),
    tableHead: rgbToHex(
      mixColors(primaryRgb, { r: 255, g: 255, b: 255 }, 0.78),
    ),
  };
};

const extractPrimaryColorFromLogo = (logoSrc: string): Promise<string> =>
  new Promise((resolve) => {
    if (!logoSrc) {
      resolve(DEFAULT_THEME_PRIMARY);
      return;
    }

    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const sampleSize = 64;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(DEFAULT_THEME_PRIMARY);
          return;
        }

        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
        let weightedR = 0;
        let weightedG = 0;
        let weightedB = 0;
        let weightedCount = 0;

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3];
          if (alpha < 140) continue;

          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const { saturation, lightness } = rgbToHsl({ r, g, b });

          if (lightness > 0.96 || lightness < 0.07) continue;

          const weight = Math.max(0.2, saturation * 1.8 + 0.2);
          weightedR += r * weight;
          weightedG += g * weight;
          weightedB += b * weight;
          weightedCount += weight;
        }

        if (weightedCount === 0) {
          resolve(DEFAULT_THEME_PRIMARY);
          return;
        }

        resolve(
          rgbToHex({
            r: weightedR / weightedCount,
            g: weightedG / weightedCount,
            b: weightedB / weightedCount,
          }),
        );
      } catch {
        resolve(DEFAULT_THEME_PRIMARY);
      }
    };

    img.onerror = () => resolve(DEFAULT_THEME_PRIMARY);
    img.src = logoSrc;
  });

type InvoicesPageMode = "list" | "new" | "detail";

export default function InvoicesPage({
  mode = "list",
}: {
  mode?: InvoicesPageMode;
}) {
  const navigate = useNavigate();
  const { invoiceId } = useParams();
  const [searchParams] = useSearchParams();
  const routeInvoiceId = invoiceId ? Number(invoiceId) : null;
  const { me } = useMe();
  const { companies: allCompanies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    null,
  );
  const [companyQuery, setCompanyQuery] = useState("");
  const { showAlert } = useAlert();
  const showWarningAlert = (message: string) =>
    showAlert({ message, variant: "warning" });
  const showDangerAlert = (message: string) =>
    showAlert({ message, variant: "danger" });

  // Portal users auto-select their first company
  useEffect(() => {
    if (!isAdmin && me?.company_ids?.length && !selectedCompanyId) {
      setSelectedCompanyId(me.company_ids[0]);
    }
  }, [isAdmin, me?.company_ids, selectedCompanyId]);

  useEffect(() => {
    const rawCompanyId = searchParams.get("company_id");
    if (!rawCompanyId) return;
    const parsedCompanyId = Number(rawCompanyId);
    if (!Number.isFinite(parsedCompanyId) || parsedCompanyId <= 0) return;
    if (
      !isAdmin &&
      me?.company_ids?.length &&
      !me.company_ids.includes(parsedCompanyId)
    ) {
      return;
    }
    setSelectedCompanyId((prev) =>
      prev === parsedCompanyId ? prev : parsedCompanyId,
    );
  }, [isAdmin, me?.company_ids, searchParams]);

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

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [companySettings, setCompanySettings] =
    useState<CompanySettings | null>(null);
  const [currencyList, setCurrencyList] = useState<CurrencyItem[]>([]);
  const [invoiceFxRate, setInvoiceFxRate] = useState(1);
  const [logoPrimaryColor, setLogoPrimaryColor] = useState(
    DEFAULT_THEME_PRIMARY,
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
    null,
  );
  const [newMode, setNewMode] = useState(false);
  const [newQuotationId, setNewQuotationId] = useState<number | null>(null);
  const [newCustomerId, setNewCustomerId] = useState<number | null>(null);
  const [newReference, setNewReference] = useState("");
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newInvoiceDate, setNewInvoiceDate] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPaymentTerms, setNewPaymentTerms] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDeviceId, setNewDeviceId] = useState<number | null>(null);
  const [editQuotationId, setEditQuotationId] = useState<number | null>(null);
  const [editCustomerId, setEditCustomerId] = useState<number | null>(null);
  const [editReference, setEditReference] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editInvoiceDate, setEditInvoiceDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPaymentTerms, setEditPaymentTerms] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDeviceId, setEditDeviceId] = useState<number | null>(null);
  const [editLines, setEditLines] = useState<Partial<InvoiceLine>[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listStatus, setListStatus] = useState("");
  const [listType, setListType] = useState("");
  const [listCurrency, setListCurrency] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(
    new Set(),
  );
  const [journalPreviewOpen, setJournalPreviewOpen] = useState(false);
  const [exportingSelected, setExportingSelected] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const currencyFilters = useMemo(() => {
    const provided = currencyList
      .map((currency) => currency.code?.toUpperCase().trim())
      .filter((code): code is string => Boolean(code));
    if (provided.length) {
      return Array.from(new Set(provided));
    }
    return currencyOptions;
  }, [currencyList]);
  const paymentTermOptions = useMemo(() => {
    const options = paymentTerms
      .filter((term) => term.is_active)
      .map((term) => term.name.trim())
      .filter((name) => Boolean(name));
    return Array.from(new Set(options));
  }, [paymentTerms]);
  const newPaymentTermOptions = useMemo(() => {
    if (
      newPaymentTerms.trim() &&
      !paymentTermOptions.includes(newPaymentTerms.trim())
    ) {
      return [newPaymentTerms.trim(), ...paymentTermOptions];
    }
    return paymentTermOptions;
  }, [newPaymentTerms, paymentTermOptions]);
  const editPaymentTermOptions = useMemo(() => {
    if (
      editPaymentTerms.trim() &&
      !paymentTermOptions.includes(editPaymentTerms.trim())
    ) {
      return [editPaymentTerms.trim(), ...paymentTermOptions];
    }
    return paymentTermOptions;
  }, [editPaymentTerms, paymentTermOptions]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">(
    "cash",
  );
  const [paymentJournalId, setPaymentJournalId] = useState<number | null>(
    null,
  );
  const [paymentJournals, setPaymentJournals] = useState<JournalItem[]>([]);
  const paymentJournalOptions = useMemo(() => {
    return paymentJournals.filter(
      (journal) =>
        journal.is_active &&
        journal.journal_type.trim().toLowerCase() === paymentMethod,
    );
  }, [paymentJournals, paymentMethod]);
  const invoiceSidebarSections = useMemo<SidebarSection[]>(() => {
    const statusItems = STATUS_FILTERS.map((filter) => {
      const IconComponent = filter.icon;
      const count =
        filter.key === ""
          ? invoices.length
          : invoices.filter((inv) => inv.status === filter.key).length;
      const iconStyle = STATUS_ICON_STYLES[filter.key] || {
        color: filter.color,
        background: "transparent",
      };
      return {
        id: `status-${filter.key || "all"}`,
        label: filter.label,
        icon: (
          <IconComponent
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            color={iconStyle.color}
          />
        ),
        badge: count,
        isActive: listStatus === filter.key,
        onClick: () => setListStatus(filter.key),
        iconColor: iconStyle.color,
        iconBackground: iconStyle.background,
      };
    });

    const typeItems = TYPE_FILTERS.map((filter) => {
      const IconComponent = filter.icon;
      const count =
        filter.key === ""
          ? invoices.filter((inv) => !isPOSReceiptInvoice(inv)).length
          : filter.key === "pos_receipt"
            ? invoices.filter((inv) => isPOSReceiptInvoice(inv)).length
            : invoices.filter((inv) => inv.invoice_type === filter.key).length;
      const iconStyle = TYPE_ICON_STYLES[filter.key] || {
        color: filter.color,
        background: "transparent",
      };
      return {
        id: `type-${filter.key || "all"}`,
        label: filter.label,
        icon: (
          <IconComponent
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            color={iconStyle.color}
          />
        ),
        badge: count,
        isActive: listType === filter.key,
        onClick: () => setListType(filter.key),
        iconColor: iconStyle.color,
        iconBackground: iconStyle.background,
      };
    });

    return [
      { id: "invoice-status", title: "STATUS", items: statusItems },
      { id: "invoice-type", title: "TYPE", items: typeItems },
    ];
  }, [invoices, listStatus, listType]);
  const visibleInvoices = useMemo(() => {
    if (listType === "pos_receipt") {
      return invoices.filter((inv) => isPOSReceiptInvoice(inv));
    }
    if (listType) {
      return invoices.filter((inv) => inv.invoice_type === listType);
    }
    return invoices.filter((inv) => !isPOSReceiptInvoice(inv));
  }, [invoices, listType]);
  const [linesPage, setLinesPage] = useState(1);
  const [linesPerPage, setLinesPerPage] = useState(10);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [hideFiscalDetails, setHideFiscalDetails] = useState(false);
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productTaxRate, setProductTaxRate] = useState("");
  const [productReference, setProductReference] = useState("");
  const [productHsCode, setProductHsCode] = useState("");
  const [productUom, setProductUom] = useState("Units");
  const [productInitialStock, setProductInitialStock] = useState("");
  const [productWarehouseId, setProductWarehouseId] = useState<number | null>(
    null,
  );
  const [productLocationId, setProductLocationId] = useState<number | null>(
    null,
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerCreating, setCustomerCreating] = useState(false);
  const [quotationSearch, setQuotationSearch] = useState("");
  const [quotationDropdownOpen, setQuotationDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const quotationDropdownRef = useRef<HTMLDivElement>(null);
  const invoiceTheme = useMemo(
    () => buildInvoiceTheme(logoPrimaryColor),
    [logoPrimaryColor],
  );

  useEffect(() => {
    const rawStatus = (searchParams.get("status") || "").toLowerCase();
    const nextStatus = ["draft", "posted", "paid", "fiscalized"].includes(
      rawStatus,
    )
      ? rawStatus
      : "";
    setListStatus((prev) => (prev === nextStatus ? prev : nextStatus));
  }, [searchParams]);

  useEffect(() => {
    let disposed = false;
    const logoSrc = companySettings?.logo_data;
    if (!logoSrc) {
      setLogoPrimaryColor(DEFAULT_THEME_PRIMARY);
      return;
    }

    extractPrimaryColorFromLogo(logoSrc).then((color) => {
      if (!disposed) setLogoPrimaryColor(color);
    });

    return () => {
      disposed = true;
    };
  }, [companySettings?.logo_data]);

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()),
  );
  const topContacts = contacts.slice(0, 3);
  const displayContacts = customerSearch.trim()
    ? filteredContacts
    : topContacts;
  const filteredQuotations = quotations.filter((q) =>
    q.reference.toLowerCase().includes(quotationSearch.toLowerCase()),
  );
  const topQuotations = quotations.slice(0, 3);
  const displayQuotations = quotationSearch.trim()
    ? filteredQuotations
    : topQuotations;
  const clearInvalidField = (key: string, value: unknown) => {
    if (!invalidFields.includes(key)) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    setInvalidFields((prev) => prev.filter((field) => field !== key));
  };

  const validateNewInvoiceRequiredFields = (): string | null => {
    const requiredFields = [
      { key: "newCustomer", label: "Customer", value: newCustomerId },
      { key: "newCurrency", label: "Currency", value: newCurrency },
    ];
    const missingFields = getMissingRequiredFields(requiredFields);
    if (missingFields.length) {
      const message = getRequiredFieldError(requiredFields);
      if (message) {
        setError(message);
      }
      setInvalidFields(missingFields.map((field) => field.key));
      return message;
    }
    setInvalidFields([]);
    return null;
  };

  const validateEditInvoiceRequiredFields = (): string | null => {
    const requiredFields = [
      { key: "editCustomer", label: "Customer", value: editCustomerId },
      { key: "editCurrency", label: "Currency", value: editCurrency },
    ];
    const missingFields = getMissingRequiredFields(requiredFields);
    if (missingFields.length) {
      const message = getRequiredFieldError(requiredFields);
      if (message) {
        setError(message);
      }
      setInvalidFields(missingFields.map((field) => field.key));
      return message;
    }
    setInvalidFields([]);
    return null;
  };

  const selectCustomer = (id: number, name: string, mode: "new" | "edit") => {
    if (mode === "new") {
      setNewCustomerId(id);
      clearInvalidField("newCustomer", id);
    } else {
      setEditCustomerId(id);
      clearInvalidField("editCustomer", id);
    }
    setCustomerSearch(name);
    setCustomerDropdownOpen(false);
  };

  const createCustomerFromSearch = async (mode: "new" | "edit") => {
    if (!companyId) return;
    const name = customerSearch.trim();
    if (!name) return;
    const exists = contacts.some(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) return;
    setCustomerCreating(true);
    setError(null);
    try {
      const created = await apiFetch<Contact>("/contacts", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          name,
        }),
      });
      setContacts((prev) => [created, ...prev]);
      selectCustomer(created.id, created.name, mode);
    } catch (err: any) {
      setError(err.message || "Failed to create customer");
    } finally {
      setCustomerCreating(false);
    }
  };

  // Close customer dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setCustomerDropdownOpen(false);
      }
      if (
        quotationDropdownRef.current &&
        !quotationDropdownRef.current.contains(e.target as Node)
      ) {
        setQuotationDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!filterMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(e.target as Node)
      ) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterMenuOpen]);

  const loadAll = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        company_id: String(companyId),
        ...(listSearch ? { search: listSearch } : {}),
        ...(listStatus ? { status: listStatus } : {}),
        ...(listType && listType !== "pos_receipt"
          ? { invoice_type: listType }
          : {}),
        ...(listCurrency ? { currency: listCurrency } : {}),
      }).toString();
      const [
        invoiceData,
        quotationData,
        contactData,
        productData,
        paymentTermData,
        warehouseData,
        deviceData,
        settingsData,
        currenciesData,
      ] = await Promise.all([
        apiFetch<Invoice[]>(`/invoices?${query}`),
        apiFetch<Quotation[]>(`/quotations?company_id=${companyId}`),
        apiFetch<Contact[]>(`/contacts?company_id=${companyId}`),
        apiFetch<Product[]>(`/products/with-stock?company_id=${companyId}`),
        apiFetch<PaymentTermItem[]>(
          `/accounting/payment-terms?company_id=${companyId}`,
        ),
        apiFetch<Warehouse[]>(`/warehouses?company_id=${companyId}`),
        apiFetch<Device[]>(`/devices?company_id=${companyId}`),
        apiFetch<CompanySettings>(`/company-settings?company_id=${companyId}`),
        apiFetch<CurrencyItem[]>(
          `/currencies?company_id=${companyId}&active_only=true`,
        ),
      ]);
      setInvoices(invoiceData);
      setQuotations(quotationData);
      setContacts(contactData);
      setProducts(productData);
      setPaymentTerms(paymentTermData);
      setDevices(deviceData);
      setWarehouses(warehouseData);
      setCompanySettings(settingsData ?? null);
      setCurrencyList(currenciesData || []);
      if (!productWarehouseId && warehouseData.length) {
        setProductWarehouseId(warehouseData[0].id);
      }
      if (!newDeviceId && deviceData.length) {
        setNewDeviceId(deviceData[0].id);
      }
      if (
        selectedInvoiceId &&
        !invoiceData.find((inv) => inv.id === selectedInvoiceId)
      ) {
        setSelectedInvoiceId(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [companyId, listSearch, listStatus, listType, listCurrency]);

  useEffect(() => {
    setSelectedInvoiceIds(new Set());
  }, [companyId, listSearch, listStatus, listType, listCurrency]);

  const allInvoicesSelected =
    visibleInvoices.length > 0 &&
    visibleInvoices.every((inv) => selectedInvoiceIds.has(inv.id));
  const selectedInvoices = visibleInvoices.filter((inv) =>
    selectedInvoiceIds.has(inv.id),
  );

  const toggleSelectInvoice = (invoiceId: number) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  };

  const toggleSelectAllInvoices = () => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (allInvoicesSelected) {
        visibleInvoices.forEach((inv) => next.delete(inv.id));
      } else {
        visibleInvoices.forEach((inv) => next.add(inv.id));
      }
      return next;
    });
  };

  const exportSelectedInvoices = () => {
    if (!selectedInvoices.length) return;
    setExportingSelected(true);
    try {
      const headers = [
        "Reference",
        "Type",
        "Customer",
        "Date",
        "Status",
        "Payment",
        "Subtotal",
        "Tax",
        "Total",
        "Paid",
        "Due",
      ];
      const rows = selectedInvoices.map((inv) => {
        const cust = contactById.get(inv.customer_id ?? 0);
        return [
          inv.reference,
          isPOSReceiptInvoice(inv)
            ? "POS Receipt"
            : inv.invoice_type === "credit_note"
              ? "Credit Note"
              : "Invoice",
          cust?.name || "",
          formatDateTime(inv.invoice_date),
          inv.status,
          getPaymentStatus(inv.amount_paid, inv.amount_due),
          inv.subtotal || 0,
          inv.tax_amount || 0,
          inv.total_amount || 0,
          inv.amount_paid || 0,
          inv.amount_due || 0,
        ];
      });
      const csvContent = [headers, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
        )
        .join("\n");
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `invoices_selected_${
        new Date().toISOString().split("T")[0]
      }.csv`;
      link.click();
    } finally {
      setExportingSelected(false);
    }
  };

  useEffect(() => {
    if (mode === "list") {
      setNewMode(false);
      setIsEditing(false);
      setSelectedInvoiceId(null);
      return;
    }
    if (mode === "detail") {
      setNewMode(false);
      setIsEditing(false);
      if (routeInvoiceId && routeInvoiceId !== selectedInvoiceId) {
        setSelectedInvoiceId(routeInvoiceId);
      }
    }
  }, [mode, routeInvoiceId]);

  useEffect(() => {
    if (mode === "new" && !newMode) {
      beginNew();
    }
  }, [mode, newMode, contacts, devices]);

  useEffect(() => {
    if (!productWarehouseId) {
      setLocations([]);
      return;
    }
    apiFetch<Location[]>(`/locations?warehouse_id=${productWarehouseId}`)
      .then((data) => {
        setLocations(data);
        if (!productLocationId && data.length) {
          setProductLocationId(data[0].id);
        }
      })
      .catch(() => setLocations([]));
  }, [productWarehouseId]);

  useEffect(() => {
    if (!newQuotationId) return;
    const quotation = quotations.find((q) => q.id === newQuotationId);
    if (quotation?.customer_id) {
      setNewCustomerId(quotation.customer_id);
    }
  }, [newQuotationId, quotations]);

  const selectedInvoice = useMemo(() => {
    return invoices.find((inv) => inv.id === selectedInvoiceId) ?? null;
  }, [invoices, selectedInvoiceId]);

  useEffect(() => {
    setHideFiscalDetails(false);
  }, [selectedInvoiceId]);

  useEffect(() => {
    if (!selectedInvoice) return;
    setEditQuotationId(selectedInvoice.quotation_id ?? null);
    setEditCustomerId(selectedInvoice.customer_id ?? null);
    const cust = contacts.find((c) => c.id === selectedInvoice.customer_id);
    setCustomerSearch(cust?.name || "");
    setCustomerDropdownOpen(false);
    const q = quotations.find((q) => q.id === selectedInvoice.quotation_id);
    setQuotationSearch(q?.reference || "");
    setQuotationDropdownOpen(false);
    setEditReference(selectedInvoice.reference ?? "");
    setEditCurrency(selectedInvoice.currency || "USD");
    setEditInvoiceDate(toDateInputValue(selectedInvoice.invoice_date));
    setEditDueDate(toDateInputValue(selectedInvoice.due_date));
    setEditPaymentTerms(selectedInvoice.payment_terms || "");
    setEditNotes(selectedInvoice.notes || "");
    setEditDeviceId(selectedInvoice.device_id ?? null);
    setEditLines(
      selectedInvoice.lines?.length
        ? selectedInvoice.lines.map((line) => {
            const product = products.find((p) => p.id === line.product_id);
            return {
              ...line,
              uom: line.uom || product?.uom || "",
            };
          })
        : [],
    );
    setIsEditing(false);
  }, [selectedInvoice, products]);
  const quotationById = useMemo(() => {
    return new Map(quotations.map((q) => [q.id, q]));
  }, [quotations]);

  const contactById = useMemo(() => {
    return new Map(contacts.map((c) => [c.id, c]));
  }, [contacts]);

  const productById = useMemo(() => {
    return new Map(products.map((p) => [p.id, p]));
  }, [products]);

  const linkedQuotation = selectedInvoice?.quotation_id
    ? (quotationById.get(selectedInvoice.quotation_id) ?? null)
    : null;

  const newQuotation = newQuotationId
    ? (quotationById.get(newQuotationId) ?? null)
    : null;

  const customer = selectedInvoice?.customer_id
    ? (contactById.get(selectedInvoice.customer_id) ?? null)
    : linkedQuotation
      ? (contactById.get(linkedQuotation.customer_id) ?? null)
      : null;
  const newInvoiceCustomerId = newCustomerId ?? newQuotation?.customer_id ?? null;
  const newInvoiceCustomer = newInvoiceCustomerId
    ? (contactById.get(newInvoiceCustomerId) ?? null)
    : null;
  const customerHistoryInvoices = useMemo(() => {
    if (!newInvoiceCustomerId) return [];
    return invoices
      .filter((invoice) => invoice.customer_id === newInvoiceCustomerId)
      .sort((left, right) => {
        const leftDate =
          left.invoice_date || left.fiscalized_at || new Date(0).toISOString();
        const rightDate =
          right.invoice_date || right.fiscalized_at || new Date(0).toISOString();
        const byDate =
          new Date(rightDate).getTime() - new Date(leftDate).getTime();
        return byDate || right.id - left.id;
      });
  }, [invoices, newInvoiceCustomerId]);
  const customerHistoryOutstandingTotal = useMemo(() => {
    return customerHistoryInvoices.reduce(
      (sum, invoice) => sum + (invoice.amount_due || 0),
      0,
    );
  }, [customerHistoryInvoices]);
  const recentCustomerHistory = useMemo(() => {
    return customerHistoryInvoices.slice(0, 6);
  }, [customerHistoryInvoices]);

  const selectedInvoiceCustomerHistoryInvoices = useMemo(() => {
    if (!selectedInvoice?.customer_id) return [];
    return invoices
      .filter((invoice) => invoice.customer_id === selectedInvoice.customer_id)
      .sort((left, right) => {
        const leftDate =
          left.invoice_date || left.fiscalized_at || new Date(0).toISOString();
        const rightDate =
          right.invoice_date || right.fiscalized_at || new Date(0).toISOString();
        const byDate =
          new Date(rightDate).getTime() - new Date(leftDate).getTime();
        return byDate || right.id - left.id;
      });
  }, [invoices, selectedInvoice?.customer_id]);

  const selectedInvoiceCustomerHistoryOutstandingTotal = useMemo(() => {
    return selectedInvoiceCustomerHistoryInvoices.reduce(
      (sum, invoice) => sum + (invoice.amount_due || 0),
      0,
    );
  }, [selectedInvoiceCustomerHistoryInvoices]);

  const selectedInvoiceRecentHistory = useMemo(() => {
    return selectedInvoiceCustomerHistoryInvoices.slice(0, 6);
  }, [selectedInvoiceCustomerHistoryInvoices]);

  const invoiceDateLabel = selectedInvoice?.invoice_date
    ? formatDateTime(selectedInvoice.invoice_date)
    : selectedInvoice?.fiscalized_at
      ? formatDateTime(selectedInvoice.fiscalized_at)
      : "—";

  const invoiceCurrency = newMode
    ? newCurrency
    : selectedInvoice?.currency || editCurrency || "USD";
  const isCreditNote = selectedInvoice?.invoice_type === "credit_note";

  const defaultCurrency =
    currencyList.find((c) => c.is_default) || currencyList[0] || null;
  const baseCurrencyCode =
    normalizeCurrency(defaultCurrency?.code) ||
    normalizeCurrency(companySettings?.currency_code) ||
    "USD";
  const normalizedInvoiceCurrency =
    normalizeCurrency(invoiceCurrency) || baseCurrencyCode || "USD";
  const rateDate = (newMode ? newInvoiceDate : editInvoiceDate) || "";

  useEffect(() => {
    if (!companyId) return;

    if (normalizedInvoiceCurrency === baseCurrencyCode) {
      setInvoiceFxRate(1);
      return;
    }

    const cur = currencyList.find(
      (c) => normalizeCurrency(c.code) === normalizedInvoiceCurrency,
    );
    if (!cur) {
      setInvoiceFxRate(1);
      return;
    }

    const qs = rateDate ? `?for_date=${encodeURIComponent(rateDate)}` : "";
    apiFetch<CurrencyRateRead | null>(`/currencies/${cur.id}/rate${qs}`)
      .then((r) => setInvoiceFxRate(r?.rate || 1))
      .catch(() => setInvoiceFxRate(1));
  }, [
    companyId,
    baseCurrencyCode,
    currencyList,
    normalizedInvoiceCurrency,
    rateDate,
  ]);

  const toInvoiceCurrency = (amountBase: number) =>
    Number(((amountBase || 0) * (invoiceFxRate || 1)).toFixed(2));

  const newTotal = newQuotation
    ? newQuotation.lines.reduce((sum, line) => sum + line.total_price, 0)
    : 0;

  const amountLabel = newMode
    ? formatCurrency(newTotal, newCurrency)
    : selectedInvoice
      ? formatCurrency(selectedInvoice.total_amount, invoiceCurrency)
      : "-";

  const statusLabel = selectedInvoice?.status ?? "draft";
  const fiscalStatus = (selectedInvoice?.zimra_status || "not_submitted")
    .toLowerCase()
    .trim();
  const fiscalBadge =
    fiscalStatus === "submitted"
      ? "success"
      : fiscalStatus === "error"
        ? "danger"
        : "secondary";
  const fiscalLabel =
    fiscalStatus === "submitted"
      ? "Submitted"
      : fiscalStatus === "error"
        ? "Failed"
        : "Not Submitted";
  const invoiceHeadingStyle = { color: invoiceTheme.primary };
  const invoicePanelStyle = {
    backgroundColor: invoiceTheme.panel,
    border: `1px solid ${invoiceTheme.line}`,
  };

  const beginNew = () => {
    setNewMode(true);
    setIsEditing(true);
    setLinesPage(1);
    setSelectedInvoiceId(null);
    setNewQuotationId(null);
    setNewCustomerId(contacts[0]?.id ?? null);
    setCustomerSearch(contacts[0]?.name ?? "");
    setCustomerDropdownOpen(false);
    setQuotationSearch("");
    setQuotationDropdownOpen(false);
    setNewReference("");
    setNewCurrency("USD");
    setNewInvoiceDate("");
    setNewDueDate("");
    setNewPaymentTerms("");
    setNewNotes("");
    setNewDeviceId(devices[0]?.id ?? null);
    setEditLines([
      {
        product_id: null,
        description: "",
        quantity: 1,
        uom: "",
        unit_price: 0,
        discount: 0,
        vat_rate: 0,
      },
    ]);
    setInvalidFields([]);
  };

  const createInvoice = async () => {
    if (!companyId) return;
    const requiredError = validateNewInvoiceRequiredFields();
    if (requiredError) {
      return;
    }
    const linesError = getDocumentLinesError(editLines);
    if (linesError) {
      setError(linesError);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const created = await apiFetch<Invoice>("/invoices", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          quotation_id: newQuotationId,
          customer_id: newCustomerId,
          // Let the backend auto-generate the reference
          reference: null,
          currency: newCurrency,
          invoice_date: fromDateInputValue(newInvoiceDate),
          due_date: fromDateInputValue(newDueDate),
          payment_terms: newPaymentTerms,
          notes: newNotes,
          device_id: newDeviceId,
          invoice_type: "invoice",
          lines: editLines.map((line) => ({
            product_id: line.product_id,
            description: line.description || "",
            quantity: line.quantity || 1,
            uom: line.uom || "Units",
            unit_price: line.unit_price || 0,
            discount: line.discount || 0,
            vat_rate: line.vat_rate || 0,
          })),
        }),
      });
      setSelectedInvoiceId(created.id);
      setNewMode(false);
      setIsEditing(false);
      await loadAll();
      navigate(`/invoices/${created.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  const saveInvoice = async () => {
    if (!selectedInvoiceId) return;
    const requiredError = validateEditInvoiceRequiredFields();
    if (requiredError) {
      return;
    }
    const linesError = getDocumentLinesError(editLines);
    if (linesError) {
      setError(linesError);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiFetch<Invoice>(`/invoices/${selectedInvoiceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          quotation_id: editQuotationId,
          customer_id: editCustomerId,
          reference: editReference,
          currency: editCurrency,
          invoice_date: fromDateInputValue(editInvoiceDate),
          due_date: fromDateInputValue(editDueDate),
          payment_terms: editPaymentTerms,
          notes: editNotes,
          device_id: editDeviceId,
          lines: editLines.map((line) => ({
            product_id: line.product_id,
            description: line.description || "",
            quantity: line.quantity || 1,
            uom: line.uom || "",
            unit_price: line.unit_price || 0,
            discount: line.discount || 0,
            vat_rate: line.vat_rate || 0,
          })),
        }),
      });
      setIsEditing(false);
      await loadAll();
    } catch (err: any) {
      setError(err.message || "Failed to save invoice");
    } finally {
      setLoading(false);
    }
  };

  const postInvoice = async () => {
    if (!selectedInvoiceId) return;
    try {
      await apiFetch<Invoice>(`/invoices/${selectedInvoiceId}/post`, {
        method: "POST",
      });
      await loadAll();
    } catch (err: any) {
      setError(err.message || "Failed to post invoice");
    }
  };

  const resetInvoice = async () => {
    if (!selectedInvoiceId) return;
    await apiFetch<Invoice>(`/invoices/${selectedInvoiceId}/reset`, {
      method: "POST",
    });
    await loadAll();
  };

  const fiscalizeInvoice = async () => {
    if (!selectedInvoiceId) return;
    let deviceId = editDeviceId ?? selectedInvoice?.device_id ?? null;

    // Auto-assign first available device if none is set
    if (!deviceId && devices.length > 0) {
      deviceId = devices[0].id;
      setEditDeviceId(deviceId);
    }
    if (!deviceId) {
      const message =
        "No fiscal device available. Create a device on the Devices page first.";
      setError(message);
      showWarningAlert(message);
      return;
    }

    const selectedDevice = devices.find((device) => device.id === deviceId);
    if (
      selectedDevice?.fiscal_day_status &&
      selectedDevice.fiscal_day_status.toLowerCase() !== "open"
    ) {
      const message =
        "No fiscal day is open for the selected fiscal device. Open the fiscal day first.";
      setError(message);
      showWarningAlert(message);
      return;
    }

    try {
      // Ensure invoice has the device_id saved before fiscalizing
      if (selectedInvoice && selectedInvoice.device_id !== deviceId) {
        await apiFetch<Invoice>(`/invoices/${selectedInvoiceId}`, {
          method: "PUT",
          body: JSON.stringify({ device_id: deviceId }),
        });
      }
      await apiFetch<Invoice>(`/invoices/${selectedInvoiceId}/fiscalize`, {
        method: "POST",
      });
      await loadAll();
    } catch (err: any) {
      const message = err.message || "Failed to fiscalize invoice";
      setError(message);
      if (String(message).toLowerCase().includes("fiscal day")) {
        showDangerAlert(message);
      }
      await loadAll(); // Reload to show stored zimra_errors
    }
  };

  const registerPayment = async () => {
    if (!selectedInvoiceId) return;
    const amount = Number(paymentAmount);
    if (!amount || Number.isNaN(amount)) {
      setError("Enter a valid payment amount.");
      return;
    }
    if (!paymentJournalId) {
      setError(`Select a ${paymentMethod} journal.`);
      return;
    }
    await apiFetch<Invoice>(
      `/invoices/${selectedInvoiceId}/pay?amount=${amount}&payment_reference=${encodeURIComponent(paymentReference)}&payment_method=${encodeURIComponent(paymentMethod)}&journal_id=${paymentJournalId}`,
      {
        method: "POST",
      },
    );
    setPaymentOpen(false);
    setPaymentAmount("");
    setPaymentReference("");
    setPaymentMethod("cash");
    setPaymentJournalId(null);
    await loadAll();
  };

  useEffect(() => {
    if (!paymentOpen || !companyId) return;
    let cancelled = false;
    apiFetch<JournalItem[]>(`/accounting/journals?company_id=${companyId}`)
      .then((data) => {
        if (!cancelled) {
          setPaymentJournals(data);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "Failed to load payment journals");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [paymentOpen, companyId]);

  useEffect(() => {
    if (!paymentOpen) return;
    if (selectedInvoice?.amount_due && !paymentAmount) {
      setPaymentAmount(String(selectedInvoice.amount_due));
    }
  }, [paymentOpen, paymentAmount, selectedInvoice?.amount_due]);

  useEffect(() => {
    if (!paymentOpen) return;
    if (
      paymentJournalId &&
      paymentJournalOptions.some((journal) => journal.id === paymentJournalId)
    ) {
      return;
    }
    setPaymentJournalId(paymentJournalOptions[0]?.id ?? null);
  }, [paymentOpen, paymentJournalId, paymentJournalOptions]);

  const createCreditNote = async () => {
    if (!selectedInvoiceId) return;
    try {
      const credit = await apiFetch<Invoice>(
        `/invoices/${selectedInvoiceId}/credit-note`,
        { method: "POST" },
      );
      setSelectedInvoiceId(credit.id);
      await loadAll();
    } catch (err: any) {
      setError(err.message || "Failed to create credit note");
    }
  };

  const updateLine = (index: number, patch: Partial<InvoiceLine>) => {
    setEditLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)),
    );
  };

  const addLine = () => {
    setEditLines((prev) => [
      ...prev,
      {
        product_id: null,
        description: "",
        quantity: 1,
        uom: "",
        unit_price: 0,
        discount: 0,
        vat_rate: 0,
      },
    ]);
  };

  const createProduct = async () => {
    if (!companyId) return;
    if (!productName.trim()) {
      setError("Product name is required.");
      return;
    }
    if (Number(productPrice) < 0) {
      setError("Product price cannot be negative.");
      return;
    }
    if (Number(productTaxRate) < 0) {
      setError("Product VAT rate cannot be negative.");
      return;
    }
    const initialQty = Number(productInitialStock) || 0;
    if (initialQty > 0 && (!productWarehouseId || !productLocationId)) {
      setError("Select warehouse and location for initial stock");
      return;
    }
    const created = await apiFetch<Product>("/products", {
      method: "POST",
      body: JSON.stringify({
        company_id: companyId,
        name: productName.trim(),
        reference: productReference.trim(),
        hs_code: productHsCode.trim(),
        sale_price: Number(productPrice) || 0,
        tax_rate: Number(productTaxRate) || 0,
        uom: productUom,
      }),
    });

    if (initialQty > 0 && productWarehouseId && productLocationId) {
      const move = await apiFetch<{ id: number }>("/stock/moves", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          product_id: created.id,
          warehouse_id: productWarehouseId,
          location_id: productLocationId,
          move_type: "in",
          quantity: initialQty,
          unit_cost: created.sale_price || 0,
          reference: `Init ${created.name}`,
        }),
      });
      await apiFetch(`/stock/moves/${move.id}/confirm`, { method: "POST" });
    }

    setCreateProductOpen(false);
    setProductName("");
    setProductReference("");
    setProductHsCode("");
    setProductPrice("");
    setProductTaxRate("");
    setProductUom("Units");
    setProductInitialStock("");
    await loadAll();
  };

  const removeLine = (index: number) => {
    setEditLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const displayLines = isEditing ? editLines : (selectedInvoice?.lines ?? []);
  const activeLineCount = newMode ? editLines.length : displayLines.length;
  const activeLinesTotalPages = Math.max(
    1,
    Math.ceil(activeLineCount / linesPerPage),
  );
  const editLineStart = (linesPage - 1) * linesPerPage;
  const displayLineStart = (linesPage - 1) * linesPerPage;
  const pagedEditLines = editLines.slice(
    editLineStart,
    editLineStart + linesPerPage,
  );
  const pagedDisplayLines = displayLines.slice(
    displayLineStart,
    displayLineStart + linesPerPage,
  );
  const visibleLineStart = activeLineCount
    ? (linesPage - 1) * linesPerPage + 1
    : 0;
  const visibleLineEnd = Math.min(linesPage * linesPerPage, activeLineCount);

  useEffect(() => {
    setLinesPage((prev) => Math.min(prev, activeLinesTotalPages));
  }, [activeLinesTotalPages]);

  useEffect(() => {
    setLinesPage(1);
  }, [selectedInvoiceId, newMode]);

  const canEdit = isEditing && statusLabel === "draft" && !isCreditNote;

  const newInvoiceTaxBreakdown = useMemo(() => {
    const map = new Map<number, number>();
    editLines.forEach((line) => {
      const quantity = line.quantity || 0;
      const unitPrice = line.unit_price || 0;
      const discount = line.discount || 0;
      const rate = line.vat_rate || 0;
      const taxable = quantity * unitPrice * (1 - discount / 100);
      const taxAmount = taxable * (rate / 100);
      map.set(rate, (map.get(rate) || 0) + taxAmount);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [editLines]);

  const newInvoiceSubtotal = useMemo(() => {
    return editLines.reduce((sum, line) => {
      const quantity = line.quantity || 0;
      const unitPrice = line.unit_price || 0;
      const discount = line.discount || 0;
      return sum + quantity * unitPrice * (1 - discount / 100);
    }, 0);
  }, [editLines]);

  const newInvoiceTaxTotal = useMemo(() => {
    return newInvoiceTaxBreakdown.reduce((sum, [, amount]) => sum + amount, 0);
  }, [newInvoiceTaxBreakdown]);

  const newInvoiceGrandTotal = useMemo(() => {
    return newInvoiceSubtotal + newInvoiceTaxTotal;
  }, [newInvoiceSubtotal, newInvoiceTaxTotal]);

  const taxBreakdown = useMemo(() => {
    const map = new Map<number, number>();
    displayLines.forEach((line) => {
      const rate = line.vat_rate || 0;
      const current = map.get(rate) || 0;
      map.set(rate, current + (line.tax_amount || 0));
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [displayLines]);
  const invoiceTaxLabel =
    taxBreakdown.length === 1 ? `Tax ${taxBreakdown[0][0]}%:` : "Tax:";

  const printInvoice = () => {
    if (!selectedInvoice) return;
    const lines = selectedInvoice.lines || [];
    const currency = selectedInvoice.currency || "USD";
    const title =
      selectedInvoice.invoice_type === "credit_note"
        ? "Credit Note"
        : "Invoice";
    const layoutKey = (
      companySettings?.document_layout || "external_layout_standard"
    ).replace("external_layout_", "layout-");
    const logoMarkup = companySettings?.logo_data
      ? `<img class="logo" src="${companySettings.logo_data}" alt="Logo" />`
      : "";
    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );
    const formatAddressLines = (
      address?: string,
      city?: string,
      country?: string,
    ) => {
      const parts = (address || "")
        .split(/\r?\n|,/)
        .map((part) => part.trim())
        .filter(Boolean);
      const street1 = parts[0] || "";
      const street2 = parts[1] || "";
      return {
        line1: [street1, street2].filter(Boolean).join(", "),
        line2: (city || "").trim(),
        line3: (country || "").trim(),
      };
    };
    const companyAddress = formatAddressLines(
      company?.address,
      company?.city,
      company?.country,
    );
    const customerAddress = formatAddressLines(
      customer?.address,
      customer?.city,
      customer?.country,
    );
    const footerHtml = (companySettings?.document_footer || "").replace(
      /\n/g,
      "<br />",
    );

    const normalizeZimraVerifyUrl = (url?: string) =>
      (url || "").replace(/\/Receipt\/?/i, "/");
    const zimraVerifyUrl = selectedInvoice.zimra_verification_url
      ? normalizeZimraVerifyUrl(selectedInvoice.zimra_verification_url)
      : "";
    const isFiscalizedDocument = Boolean(
      selectedInvoice.status === "fiscalized" ||
      (selectedInvoice.zimra_status || "").toLowerCase().trim() === "submitted",
    );
    const rows = lines
      .map((line) => {
        const subtotal =
          (line.quantity || 0) *
          (line.unit_price || 0) *
          (1 - (line.discount || 0) / 100);
        const tax = subtotal * ((line.vat_rate || 0) / 100);
        const total = subtotal + tax;
        const hsCode = line.product_id
          ? productMap.get(line.product_id)?.hs_code || "-"
          : "-";
        const qtyLabel =
          `${(line.quantity || 0).toFixed(2)} ${line.uom || ""}`.trim();
        return `
          <tr>
            <td>${line.description || ""}</td>
            <td style="text-align:right;">${qtyLabel}</td>
            <td style="text-align:right;">${(line.unit_price || 0).toFixed(2)}</td>
            <td style="text-align:right;">${(line.discount || 0).toFixed(2)}</td>
            <td style="text-align:right;">${(line.vat_rate || 0).toFixed(2)}</td>
            <td style="text-align:right;">${formatCurrency(total, currency)}</td>
          </tr>
        `;
      })
      .join("");

    const titleUpper =
      selectedInvoice.invoice_type === "credit_note"
        ? isFiscalizedDocument
          ? "FISCAL TAX CREDIT NOTE"
          : "CREDIT NOTE"
        : isFiscalizedDocument
          ? "FISCAL TAX INVOICE"
          : "INVOICE";

    const html = `
      <html>
        <head>
          <title>${selectedInvoice.reference}</title>
          <style>
            :root { --ink: ${invoiceTheme.ink}; --muted: ${invoiceTheme.muted}; --line: ${invoiceTheme.line}; --soft: #f9fafb; --accent: ${invoiceTheme.primary}; --panel: ${invoiceTheme.panel}; --thead: ${invoiceTheme.tableHead}; }
            * { box-sizing: border-box; }
            body { font-family: "Segoe UI", Inter, Arial, sans-serif; padding: 0; margin: 0; color: var(--ink); background: #ffffff; }
            .doc { padding: 20px 24px 28px; position: relative; }
            .doc-header { display: flex; justify-content: flex-start; align-items: flex-start; margin-bottom: 10px; min-height: 48px; }
            .doc-header .logo { display: block; max-width: 180px; max-height: 70px; width: auto; height: auto; object-fit: contain; }
            .layout-boxed { border: 1px solid var(--line); }
            .layout-bubble { border: 1px solid var(--line); box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08); }
            .title { text-align: center; text-decoration: underline; font-weight: 700; font-size: 18px; letter-spacing: .6px; margin: 4px 0 10px; color: var(--accent); }
            .party { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--panel); border: 1px solid var(--line); padding: 10px 12px; }
            .party h5 { margin: 0 0 6px; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; }
            .party .block { font-size: 12px; line-height: 1.6; }
            .party .block strong { color: var(--ink); }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; font-size: 12px; margin: 12px 0; }
            .meta .row { display: grid; grid-template-columns: 120px 1fr; gap: 2px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            thead th { background: var(--thead); color: var(--ink); font-weight: 700; text-transform: none; padding: 8px 10px; border: 1px solid var(--line); }
            tbody td { padding: 8px 10px; border: 1px solid var(--line); }
            .totals-card { margin-top: 12px; width: 320px; margin-left: auto; border: 1px solid var(--line); }
            .totals-card .row { display: grid; grid-template-columns: 1fr auto; padding: 8px 10px; border-bottom: 1px solid var(--line); }
            .totals-card .row:last-child { border-bottom: none; font-weight: 700; }
            .qr { text-align: left; margin-top: 10px; }
            .d-flex { display: flex; gap: 6px; }
            .footer { margin-top: 12px; font-size: 11px; color: var(--muted); text-align: center; }
          </style>
        </head>
        <body>
          <div class="doc ${layoutKey}">
            ${logoMarkup ? `<div class="doc-header">${logoMarkup}</div>` : ""}
            <div class="party">
              <div class="block">
                <h5>Seller</h5>
                <strong>${company?.name || "Company"}</strong><br />
                ${companyAddress.line1 ? `${companyAddress.line1}<br />` : ""}
                ${companyAddress.line2 ? `${companyAddress.line2}<br />` : ""}
                ${companyAddress.line3 ? `${companyAddress.line3}<br />` : ""}
                ${company?.email ? `Email: ${company.email}<br />` : ""}
                ${company?.phone ? `Phone: ${company.phone}<br />` : ""}
                ${company?.tin ? `TIN: ${company.tin}<br />` : ""}
                ${company?.vat ? `VAT: ${company.vat}` : ""}
              </div>
              <div class="block">
                <h5>Buyer</h5>
                <strong>${customer?.name || "Customer"}</strong><br />
                ${customerAddress.line1 ? `${customerAddress.line1}<br />` : ""}
                ${customerAddress.line2 ? `${customerAddress.line2}<br />` : ""}
                ${customerAddress.line3 ? `${customerAddress.line3}<br />` : ""}
                ${customer?.email ? `Email: ${customer.email}<br />` : ""}
                ${customer?.phone ? `Phone: ${customer.phone}<br />` : ""}
                ${customer?.tin ? `TIN: ${customer.tin}<br />` : ""}
                ${customer?.vat ? `VAT: ${customer.vat}` : ""}
              </div>
            </div>

            <div class="title">${titleUpper}</div>

            <div class="meta">
              <div class="row"><div>Customer reference No:</div><div>${selectedInvoice.payment_reference || selectedInvoice.notes || "-"}</div></div>
              <div class="row"><div>Invoice No:</div><div>${selectedInvoice.reference}</div></div>
              <div class="row"><div>Order No:</div><div>${linkedQuotation?.reference || "-"}</div></div>
              <div class="row"><div>Date:</div><div>${invoiceDateLabel}</div></div>
              ${
                isFiscalizedDocument
                  ? `
              <div class="row"><div>Receipt No:</div><div>${selectedInvoice.zimra_receipt_id || "-"}</div></div>
              <div class="row"><div>Device Serial No:</div><div>${devices.find((d) => d.id === selectedInvoice.device_id)?.serial_number || "-"}</div></div>
              <div class="row"><div>Device ID:</div><div>${devices.find((d) => d.id === selectedInvoice.device_id)?.device_id || "-"}</div></div>
              <div class="row"><div>Fiscal day No:</div><div>${selectedInvoice.zimra_receipt_counter || "-"}</div></div>
              `
                  : ""
              }
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width:90px">Code</th>
                  <th style="width:100px">HS Code</th>
                  <th>Description</th>
                  <th style="width:70px; text-align:right">Qty</th>
                  <th style="width:90px; text-align:right">Price</th>
                  <th style="width:110px; text-align:right">Total (inc VAT)</th>
                </tr>
              </thead>
              <tbody>
                ${lines
                  .map((line) => {
                    const prod = line.product_id
                      ? productMap.get(line.product_id)
                      : null;
                    const subtotal =
                      (line.quantity || 0) *
                      (line.unit_price || 0) *
                      (1 - (line.discount || 0) / 100);
                    const tax = subtotal * ((line.vat_rate || 0) / 100);
                    const total = subtotal + tax;
                    return `
                      <tr>
                        <td>${prod?.reference || ""}</td>
                        <td>${prod?.hs_code || line.hs_code || ""}</td>
                        <td>${line.description || ""}</td>
                        <td style="text-align:right;">${(line.quantity || 0).toFixed(2)}</td>
                        <td style="text-align:right;">${(line.unit_price || 0).toFixed(2)}</td>
                        <td style="text-align:right;">${formatCurrency(total, currency)}</td>
                      </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>

            <div class="totals-card">
              <div class="row"><div>Total excl. VAT:</div><div>${formatCurrency(selectedInvoice.subtotal || 0, currency)}</div></div>
              <div class="row"><div>VAT Total, ${currency}:</div><div>${formatCurrency(selectedInvoice.tax_amount || 0, currency)}</div></div>
              <div class="row"><div>Invoice Total, ${currency}:</div><div>${formatCurrency(selectedInvoice.total_amount || 0, currency)}</div></div>
            </div>

            ${
              isFiscalizedDocument && selectedInvoice.zimra_verification_url
                ? `
            <div class="qr d-flex">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(zimraVerifyUrl)}" width="100" height="100" alt="QR" />
              <div>              
                <div style="font-size:11px; margin-top:4px;">Verification code: <strong>${selectedInvoice.zimra_verification_code || "-"}</strong></div>
                <div style="font-size:11px; color: var(--muted);">You can verify this receipt manually at</div>
                <div style="font-size:11px; word-break:break-all; color:#1d4ed8;">${zimraVerifyUrl}</div>
              </div>
            </div>
            `
                : ""
            }

            ${footerHtml ? `<div class="footer">${footerHtml}</div>` : ""}
          </div>
        </body>
      </html>
    `;
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: `${selectedInvoice.reference}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(container)
      .save()
      .finally(() => {
        document.body.removeChild(container);
      });
  };

  // Determine which "screen" to show: list, new-form, or detail
  const showForm = mode !== "list";

  const goBackToList = () => {
    navigate("/invoices");
  };

  const goBackToCompanies = () => {
    setSelectedCompanyId(null);
    setInvoices([]);
    setContacts([]);
    setProducts([]);
    setDevices([]);
    setQuotations([]);
    navigate("/invoices");
  };

  if (companiesLoading && !companyId) {
    return <div className="loading-indicator">Loading companies...</div>;
  }
  if (!isAdmin && !companyId && allCompanies.length) {
    return <div className="loading-indicator">Loading companies...</div>;
  }

  // ─── Admin company selection view ───
  if (isAdmin && !companyId && mode === "list") {
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
          Select a company to view its invoices.
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

  return (
    <div className="container-fluid py-3 invoice-page-shell">
      <ValidationAlert message={error} onClose={() => setError(null)} />

      {/* ───────────── LIST VIEW ───────────── */}
      {!showForm && (
        <>
          <div className="invoice-dashboard-layout">
            <Sidebar sections={invoiceSidebarSections} />
            <div className="invoice-dashboard-main">
              <div className="o-main inventory-view-main">
                <div className="card shadow-sm card-bg-shadow invoice-list-card">
                  <div className="inventory-main-search-panel invoice-top-panel">
                    <div className="invoice-top-panel-row">
                      <div className="invoice-top-panel-left">
                        <div className="inventory-search-wrapper">
                          <div className="inventory-search-inner">
                            <div className="inventory-centered-searchbox">
                              <div className="o-searchbox">
                                <span className="o-searchbox-icon">
                                  <Search size={16} />
                                </span>
                                <input
                                  placeholder="Search invoices..."
                                  value={listSearch}
                                  onChange={(e) =>
                                    setListSearch(e.target.value)
                                  }
                                />
                                <button
                                  type="button"
                                  className="inventory-filter-toggle-inside"
                                  aria-label="Toggle filters"
                                  onClick={() =>
                                    setFilterMenuOpen((prev) => !prev)
                                  }
                                >
                                  <FunnelPlus size={16} />
                                </button>
                              </div>
                            </div>
                            {filterMenuOpen && (
                              <div
                                className="inventory-filter-dropdown"
                                ref={filterMenuRef}
                              >
                                <div className="inventory-filter-columns">
                                  <div className="inventory-filter-column">
                                    <div className="inventory-filter-title">
                                      Currency
                                    </div>
                                    <div className="inventory-filter-items">
                                      <button
                                        type="button"
                                        className={`inventory-filter-chip ${
                                          listCurrency === ""
                                            ? "inventory-filter-chip-active"
                                            : ""
                                        }`}
                                        onClick={() => setListCurrency("")}
                                      >
                                        All
                                      </button>
                                      {currencyFilters.map((code) => (
                                        <button
                                          key={code}
                                          type="button"
                                          className={`inventory-filter-chip ${
                                            listCurrency === code
                                              ? "inventory-filter-chip-active"
                                              : ""
                                          }`}
                                          onClick={() => setListCurrency(code)}
                                        >
                                          {code}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="invoice-top-panel-right">
                        <button
                          className="o-btn o-btn-secondary invoice-top-panel-btn"
                          onClick={() => {
                            const headers = [
                              "Reference",
                              "Type",
                              "Customer",
                              "Date",
                              "Status",
                              "Payment",
                              "Subtotal",
                              "Tax",
                              "Total",
                              "Paid",
                              "Due",
                            ];
                            const rows = visibleInvoices.map((inv) => {
                              const cust = contactById.get(
                                inv.customer_id ?? 0,
                              );
                              return [
                                inv.reference,
                                isPOSReceiptInvoice(inv)
                                  ? "POS Receipt"
                                  : inv.invoice_type === "credit_note"
                                    ? "Credit Note"
                                    : "Invoice",
                                cust?.name || "",
                                formatDateTime(inv.invoice_date),
                                inv.status,
                                getPaymentStatus(
                                  inv.amount_paid,
                                  inv.amount_due,
                                ),
                                inv.subtotal || 0,
                                inv.tax_amount || 0,
                                inv.total_amount || 0,
                                inv.amount_paid || 0,
                                inv.amount_due || 0,
                              ];
                            });
                            const csvContent = [headers, ...rows]
                              .map((row) =>
                                row
                                  .map(
                                    (cell) =>
                                      `"${String(cell).replace(/"/g, '""')}"`,
                                  )
                                  .join(","),
                              )
                              .join("\n");
                            const blob = new Blob([csvContent], {
                              type: "text/csv;charset=utf-8;",
                            });
                            const link = document.createElement("a");
                            link.href = URL.createObjectURL(blob);
                            link.download = `invoices_${
                              new Date().toISOString().split("T")[0]
                            }.csv`;
                            link.click();
                          }}
                        >
                          <Download size={16} />
                          <span>Export</span>
                        </button>
                        <button
                          className="o-btn o-btn-primary invoice-top-panel-btn"
                          onClick={() => {
                            beginNew();
                            navigate("/invoices/new");
                          }}
                        >
                          <Plus size={16} />
                          <span>New Invoice</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="o-list-view inventory-table-panel">
                    {selectedInvoiceIds.size > 0 && (
                      <div className="batch-action-bar">
                        <label className="batch-master-toggle">
                          <input
                            type="checkbox"
                            checked={allInvoicesSelected}
                            onChange={toggleSelectAllInvoices}
                            className="batch-checkbox"
                          />
                          <span>Select all</span>
                        </label>
                        <span className="batch-count">
                          {selectedInvoiceIds.size} selected
                        </span>
                        <button
                          className="batch-btn export-btn"
                          onClick={exportSelectedInvoices}
                          disabled={exportingSelected}
                        >
                          {exportingSelected
                            ? "Exporting..."
                            : "Export Selected"}
                        </button>
                        <button
                          className="batch-btn clear-btn"
                          onClick={() => setSelectedInvoiceIds(new Set())}
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    <table className="o-list-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>
                            <input
                              type="checkbox"
                              checked={allInvoicesSelected}
                              onChange={toggleSelectAllInvoices}
                              className="batch-checkbox"
                            />
                          </th>
                          <th>Reference</th>
                          <th>Customer</th>
                          <th>Date</th>
                          <th>Status</th>
                          <th>Payment</th>
                          <th className="text-end">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading && (
                          <tr>
                            <td
                              colSpan={7}
                              className="text-center py-5 text-muted"
                            >
                              Loading invoices…
                            </td>
                          </tr>
                        )}
                        {!loading && visibleInvoices.length === 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              className="text-center py-5 text-muted"
                            >
                              No records found. Click{" "}
                              <strong>+ New Invoice</strong> to create one.
                            </td>
                          </tr>
                        )}
                        {visibleInvoices.map((inv) => {
                          const cust = contactById.get(inv.customer_id ?? 0);
                          return (
                            <tr
                              key={inv.id}
                              role="button"
                              className={
                                selectedInvoiceIds.has(inv.id)
                                  ? "row-selected"
                                  : ""
                              }
                              onClick={() => navigate(`/invoices/${inv.id}`)}
                            >
                              <td onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedInvoiceIds.has(inv.id)}
                                  onChange={() => toggleSelectInvoice(inv.id)}
                                  className="batch-checkbox"
                                  aria-label={`Select ${inv.reference}`}
                                />
                              </td>
                              <td>
                                <div className="fw-semibold">
                                  {inv.reference}
                                </div>
                                <small className="text-muted">
                                  {isPOSReceiptInvoice(inv)
                                    ? "POS Receipt"
                                    : inv.invoice_type === "credit_note"
                                      ? "Credit Note"
                                      : "Invoice"}
                                </small>
                              </td>
                              <td>{cust?.name || "—"}</td>
                              <td className="text-muted">
                                {formatDateTime(inv.invoice_date) || "—"}
                              </td>
                              <td>
                                <span
                                  className={`badge ${
                                    inv.status === "paid"
                                      ? "bg-success"
                                      : inv.status === "posted"
                                        ? "bg-info"
                                        : inv.status === "fiscalized"
                                          ? "bg-primary"
                                          : "bg-secondary"
                                  }`}
                                >
                                  {inv.status}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`badge bg-${
                                    getPaymentStatus(
                                      inv.amount_paid,
                                      inv.amount_due,
                                    ) === "Paid"
                                      ? "success"
                                      : getPaymentStatus(
                                            inv.amount_paid,
                                            inv.amount_due,
                                          ) === "Partial"
                                        ? "warning"
                                        : "secondary"
                                  }`}
                                >
                                  {getPaymentStatus(
                                    inv.amount_paid,
                                    inv.amount_due,
                                  )}
                                </span>
                              </td>
                              <td
                                className={`text-end fw-semibold ${
                                  inv.total_amount < 0
                                    ? "invoice-total-negative"
                                    : ""
                                }`}
                              >
                                {formatCurrency(
                                  inv.total_amount || 0,
                                  inv.currency || "USD",
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr
                          style={{
                            background: "var(--slate-50)",
                            fontWeight: 600,
                          }}
                        >
                          <td colSpan={6} className="text-end">
                            Grand Total:
                          </td>
                          <td className="text-end">
                            {formatCurrency(
                              invoices.reduce(
                                (sum, inv) => sum + (inv.total_amount || 0),
                                0,
                              ),
                              "USD",
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ───────────── FORM VIEW (New / Detail) ───────────── */}
      {showForm && (
        <div>
          {/* Top toolbar */}
          <div className="invoice-detail-toolbar mb-3">
            {isAdmin && companyId ? (
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
                    Invoices
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
            ) : (
              <div className="d-flex align-items-center gap-2">
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={goBackToList}
                  >
                    ← Back
                  </button>
                  <h4 className="fw-bold mb-0" style={invoiceHeadingStyle}>
                    {newMode
                      ? "New Invoice"
                      : selectedInvoice?.reference || "Invoice"}
                  </h4>
              </div>
            )}
            {!newMode && !isEditing && selectedInvoice ? (
              <div className="invoice-status-rail" aria-label="Invoice workflow status">
                <button
                  type="button"
                  className="invoice-status-chip invoice-status-action"
                  onClick={() => setJournalPreviewOpen(true)}
                >
                  View Journal Entry
                </button>
              </div>
            ) : (
              <div></div>
            )}
            <div className="d-flex flex-wrap gap-1 align-items-center justify-content-end">
              {newMode ? (
                <>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={createInvoice}
                    disabled={loading}
                  >
                    {loading ? "Saving…" : "Save Draft"}
                  </button>
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={goBackToList}
                  >
                    Discard
                  </button>
                </>
              ) : isEditing ? (
                <>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={saveInvoice}
                    disabled={loading}
                  >
                    {loading ? "Saving…" : "Save"}
                  </button>
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={() => setIsEditing(false)}
                  >
                    Discard
                  </button>
                </>
              ) : (
                <>
                  {statusLabel === "draft" && (
                    <button
                      className="btn btn-sm btn-light border"
                      onClick={() => setIsEditing(true)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={postInvoice}
                  >
                    Post
                  </button>
                  {(statusLabel === "posted" || statusLabel === "paid") && (
                    <button
                      className="btn btn-sm btn-light border"
                      onClick={fiscalizeInvoice}
                    >
                      Fiscalize
                    </button>
                  )}
                  {(statusLabel === "posted" || statusLabel === "fiscalized") && (
                    <button
                      className="btn btn-sm btn-light border"
                      onClick={resetInvoice}
                    >
                      Reset
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={printInvoice}
                  >
                    Print PDF
                  </button>
                  {statusLabel !== "draft" && (
                    <button
                      className="btn btn-sm btn-light border"
                      onClick={() => setPaymentOpen(true)}
                    >
                      Register Payment
                    </button>
                  )}
                  {statusLabel !== "draft" && !isCreditNote && (
                    <button
                      className="btn btn-sm btn-light border"
                      onClick={createCreditNote}
                    >
                      Credit Note
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={() => setJournalPreviewOpen(true)}
                  >
                    Journal Preview
                  </button>
                  {statusLabel !== "draft" && (
                    <button
                      className="btn btn-sm btn-light border"
                      onClick={() =>
                        selectedInvoice &&
                        navigate(`/accounting?section=journal_entries&reference=${encodeURIComponent(`INV/${selectedInvoice.reference}`)}`)
                      }
                    >
                      Journal Entry
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── New Invoice Form ── */}
          {newMode && (
            <div className="invoice-create-layout">
              <div
                className="card shadow-sm invoice-create-form-card"
                style={{ maxHeight: "82vh", overflowY: "auto" }}
              >
                <div className="card-body invoice-form">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label
                        className={`form-label ${
                          invalidFields.includes("newCustomer")
                            ? "form-label-error"
                            : ""
                        }`}
                      >
                        Customer <span className="text-danger">*</span>
                      </label>
                      <div
                        className="position-relative"
                        ref={customerDropdownRef}
                      >
                        <input
                          className={`form-control input-underline ${
                            invalidFields.includes("newCustomer")
                              ? "input-field-error"
                              : ""
                          }`}
                          placeholder="Search or select customer…"
                          value={customerSearch}
                          onChange={(e) => {
                            setCustomerSearch(e.target.value);
                            setCustomerDropdownOpen(true);
                            if (!e.target.value) setNewCustomerId(null);
                          }}
                          onFocus={() => setCustomerDropdownOpen(true)}
                        />
                        {customerDropdownOpen && (
                          <ul
                            className="list-group position-absolute w-100 shadow-sm"
                            style={{
                              zIndex: 1050,
                              maxHeight: 220,
                              overflowY: "auto",
                            }}
                          >
                            {displayContacts.map((c) => (
                              <li
                                key={c.id}
                                className={`list-group-item list-group-item-action${newCustomerId === c.id ? " active" : ""}`}
                                role="button"
                                onClick={() => selectCustomer(c.id, c.name, "new")}
                              >
                                {c.name}
                              </li>
                            ))}
                            {customerSearch.trim() &&
                              !filteredContacts.some(
                                (c) =>
                                  c.name.toLowerCase() ===
                                  customerSearch.trim().toLowerCase(),
                              ) && (
                                <li
                                  className="list-group-item list-group-item-action text-primary"
                                  role="button"
                                  onClick={() => createCustomerFromSearch("new")}
                                >
                                  {customerCreating
                                    ? "Creating..."
                                    : `Create "${customerSearch.trim()}"`}
                                </li>
                              )}
                            {!displayContacts.length &&
                              !customerSearch.trim() && (
                                <li className="list-group-item text-muted">
                                  No customers
                                </li>
                              )}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Quotation</label>
                      <div
                        className="position-relative"
                        ref={quotationDropdownRef}
                      >
                        <input
                          className="form-control input-underline"
                          placeholder="Search or select quotation…"
                          value={quotationSearch}
                          onChange={(e) => {
                            setQuotationSearch(e.target.value);
                            setQuotationDropdownOpen(true);
                            if (!e.target.value) setNewQuotationId(null);
                          }}
                          onFocus={() => setQuotationDropdownOpen(true)}
                        />
                        {quotationDropdownOpen && (
                          <ul
                            className="list-group position-absolute w-100 shadow-sm"
                            style={{
                              zIndex: 1050,
                              maxHeight: 220,
                              overflowY: "auto",
                            }}
                          >
                            {displayQuotations.map((q) => (
                              <li
                                key={q.id}
                                className={`list-group-item list-group-item-action${newQuotationId === q.id ? " active" : ""}`}
                                role="button"
                                onClick={() => {
                                  setNewQuotationId(q.id);
                                  setQuotationSearch(q.reference);
                                  setQuotationDropdownOpen(false);
                                }}
                              >
                                {q.reference}
                              </li>
                            ))}
                            {!displayQuotations.length &&
                              !quotationSearch.trim() && (
                                <li className="list-group-item text-muted">
                                  No quotations
                                </li>
                              )}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Reference</label>
                      <input
                        className="form-control input-underline bg-light"
                        value="Auto-generated"
                        readOnly
                      />
                    </div>
                    <div className="col-md-6">
                      <label
                        className={`form-label ${
                          invalidFields.includes("newCurrency")
                            ? "form-label-error"
                            : ""
                        }`}
                      >
                        Currency
                      </label>
                      <select
                        className={`form-select input-underline ${
                          invalidFields.includes("newCurrency")
                            ? "input-field-error"
                            : ""
                        }`}
                        value={newCurrency}
                        onChange={(e) => {
                          const { value } = e.target;
                          setNewCurrency(value);
                          clearInvalidField("newCurrency", value);
                        }}
                      >
                        {currencyOptions.map((cur) => (
                          <option key={cur} value={cur}>
                            {cur}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Invoice Date</label>
                      <input
                        className="form-control input-underline"
                        type="date"
                        value={newInvoiceDate}
                        onChange={(e) => setNewInvoiceDate(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Due Date</label>
                      <input
                        className="form-control input-underline"
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Fiscal Device</label>
                      <select
                        className="form-select input-underline"
                        value={newDeviceId ?? ""}
                        onChange={(e) =>
                          setNewDeviceId(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      >
                        <option value="">— None —</option>
                        {devices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.device_id || d.serial_number || `Device ${d.id}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Payment Terms</label>
                      <select
                        className="form-select input-underline"
                        value={newPaymentTerms}
                        onChange={(e) => setNewPaymentTerms(e.target.value)}
                      >
                        <option value="">Select terms</option>
                        {newPaymentTermOptions.map((termName) => (
                          <option key={termName} value={termName}>
                            {termName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-12">
                      <label className="form-label">Notes</label>
                      <textarea
                        className="form-control input-underline"
                        rows={2}
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  <hr className="my-4" />
                  <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
                    <h6 className="fw-semibold mb-0">Invoice Lines</h6>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <small className="text-muted">
                      Showing {visibleLineStart}-{visibleLineEnd} of{" "}
                      {activeLineCount}
                    </small>
                  </div>
                  <div className="table-responsive invoice-lines-table-wrap">
                    <table className="table table-bordered align-middle mb-0 invoice-lines-table">
                      <thead className="table-light">
                        <tr>
                          <th style={{ minWidth: 160 }}>Product</th>
                          <th style={{ minWidth: 120 }}>Description</th>
                          <th className="text-end" style={{ width: 100 }}>
                            Qty
                          </th>
                          <th style={{ width: 100 }}>UoM</th>
                          <th className="text-end" style={{ width: 100 }}>
                            Price
                          </th>
                          <th className="text-end" style={{ width: 110 }}>
                            Amount
                          </th>
                          <th style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedEditLines.map((line, pageIndex) => {
                          const index = editLineStart + pageIndex;
                          const product = line.product_id
                            ? productById.get(line.product_id)
                            : null;
                          const lineTotal =
                            (line.quantity || 0) *
                            (line.unit_price || 0) *
                            (1 - (line.discount || 0) / 100) *
                            (1 + (line.vat_rate || 0) / 100);
                          const displayUom = normalizeUom(
                            product?.uom || line.uom || "Units",
                          );
                          return (
                            <tr key={`new-${index}`}>
                              <td>
                                <select
                                  className="form-select form-select-sm"
                                  value={line.product_id ?? ""}
                                  onChange={(e) => {
                                    const prod = products.find(
                                      (p) => p.id === Number(e.target.value),
                                    );
                                    updateLine(index, {
                                      product_id: e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                      description: prod?.name ?? "",
                                      unit_price: prod
                                        ? toInvoiceCurrency(prod.sale_price)
                                        : 0,
                                      vat_rate: prod?.tax_rate ?? 0,
                                      uom: prod?.uom || "",
                                    });
                                  }}
                                >
                                  <option value="">Select product</option>
                                  {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  className="form-control form-control-sm"
                                  value={line.description || ""}
                                  onChange={(e) =>
                                    updateLine(index, {
                                      description: e.target.value,
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  className="form-control form-control-sm text-end"
                                  type="number"
                                  value={line.quantity || 0}
                                  onChange={(e) =>
                                    updateLine(index, {
                                      quantity: Number(e.target.value),
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  className="form-control form-control-sm bg-light"
                                  value={displayUom}
                                  readOnly
                                />
                              </td>
                              <td>
                                <input
                                  className="form-control form-control-sm text-end"
                                  type="number"
                                  value={line.unit_price || 0}
                                  onChange={(e) =>
                                    updateLine(index, {
                                      unit_price: Number(e.target.value),
                                    })
                                  }
                                />
                              </td>
                              <td className="text-end fw-semibold">
                                {formatCurrency(lineTotal, newCurrency)}
                              </td>
                              <td className="text-center">
                                <button
                                  className="btn btn-sm btn-light border"
                                  onClick={() => removeLine(index)}
                                  disabled={editLines.length === 1}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {!editLines.length && (
                          <tr>
                            <td colSpan={7} className="text-center py-4 text-muted">
                              No invoice lines yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="d-flex gap-3 mt-3">
                    <button
                      className="btn btn-link btn-sm px-0"
                      onClick={addLine}
                    >
                      + Add Line
                    </button>
                    <button
                      className="btn btn-link btn-sm px-0"
                      onClick={() => setCreateProductOpen(true)}
                    >
                      + New Product
                    </button>
                  </div>

                  <div className="d-flex justify-content-end mt-3">
                    <table className="table table-sm w-auto mb-0">
                      <tbody>
                        <tr>
                          <th className="text-end">Untaxed Amount:</th>
                          <td className="text-end">
                            {formatCurrency(newInvoiceSubtotal, newCurrency)}
                          </td>
                        </tr>
                        {newInvoiceTaxBreakdown.map(([rate, amount]) => (
                          <tr key={rate}>
                            <th className="text-end">Tax {rate}%:</th>
                            <td className="text-end">
                              {formatCurrency(amount, newCurrency)}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <th className="text-end fs-5">Total:</th>
                          <td className="text-end fs-5 fw-bold">
                            {formatCurrency(newInvoiceGrandTotal, newCurrency)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <aside className="card shadow-sm invoice-customer-history-card">
                <div className="card-body">
                  <div className="invoice-customer-history-header">
                    <div>
                      <h6 className="fw-semibold mb-1">Customer's Invoices</h6>
                    </div>
                  </div>

                  {newInvoiceCustomer ? (
                    <>
                      <div className="invoice-customer-history-stats">
                        <div className="invoice-customer-history-stat">
                          <span className="invoice-customer-history-stat-label">
                            Total invoices
                          </span>
                          <strong>{customerHistoryInvoices.length}</strong>
                        </div>
                        <div className="invoice-customer-history-stat">
                          <span className="invoice-customer-history-stat-label">
                            Outstanding
                          </span>
                          <strong>
                            {formatCurrency(
                              customerHistoryOutstandingTotal,
                              newCurrency || "USD",
                            )}
                          </strong>
                        </div>
                      </div>

                      {recentCustomerHistory.length ? (
                        <div className="invoice-customer-history-list">
                          {recentCustomerHistory.map((historyInvoice) => {
                            const paymentState = getPaymentStatus(
                              historyInvoice.amount_paid,
                              historyInvoice.amount_due,
                            );
                            const statusClass =
                              historyInvoice.status === "paid"
                                ? "bg-success"
                                : historyInvoice.status === "posted"
                                  ? "bg-info"
                                  : historyInvoice.status === "fiscalized"
                                    ? "bg-primary"
                                    : "bg-secondary";
                            const paymentClass =
                              paymentState === "Paid"
                                ? "bg-success"
                                : paymentState === "Partial"
                                  ? "bg-warning"
                                  : "bg-secondary";
                            return (
                              <button
                                key={historyInvoice.id}
                                type="button"
                                className="invoice-customer-history-item"
                                onClick={() => {
                                  setSelectedInvoiceId(historyInvoice.id);
                                  setNewMode(false);
                                }}
                              >
                                <div className="invoice-customer-history-item-top">
                                  <strong>{historyInvoice.reference}</strong>
                                  <span className={`badge ${statusClass}`}>
                                    {historyInvoice.status}
                                  </span>
                                </div>
                                <div className="invoice-customer-history-item-meta">
                                  <span>
                                    {formatDateTime(historyInvoice.invoice_date) || "—"}
                                  </span>
                                  <span>
                                    {formatCurrency(
                                      historyInvoice.total_amount,
                                      historyInvoice.currency || newCurrency || "USD",
                                    )}
                                  </span>
                                </div>
                                <div className="invoice-customer-history-item-bottom">
                                  <span className={`badge ${paymentClass}`}>
                                    {paymentState}
                                  </span>
                                  <span className="text-muted">
                                    Due {formatCurrency(historyInvoice.amount_due || 0, historyInvoice.currency || newCurrency || "USD")}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="invoice-customer-history-empty">
                          No previous invoices found for this customer.
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </aside>
            </div>
          )}

          {/* ── Existing Invoice Detail ── */}
          {selectedInvoice && !newMode && (
            <div className="invoice-create-layout">
              <div
                className="card shadow-sm invoice-create-form-card"
                style={{ maxHeight: "82vh", overflowY: "auto" }}
              >
              <div className="card-body invoice-form">
                {companySettings?.logo_data && (
                  <div className="mb-3">
                    <img
                      src={companySettings.logo_data}
                      alt="Company logo"
                      style={{
                        maxWidth: 180,
                        maxHeight: 70,
                        width: "auto",
                        height: "auto",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  </div>
                )}

                {/* Fields */}
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <label className="form-label">Customer</label>
                    {canEdit ? (
                      <div
                        className="position-relative"
                        ref={customerDropdownRef}
                      >
                        <input
                          className={`form-control input-underline ${
                            invalidFields.includes("editCustomer")
                              ? "input-field-error"
                              : ""
                          }`}
                          placeholder="Search or select customer…"
                          value={customerSearch}
                          onChange={(e) => {
                            setCustomerSearch(e.target.value);
                            setCustomerDropdownOpen(true);
                            if (!e.target.value) setEditCustomerId(null);
                          }}
                          onFocus={() => setCustomerDropdownOpen(true)}
                        />
                        {customerDropdownOpen && (
                          <ul
                            className="list-group position-absolute w-100 shadow-sm"
                            style={{
                              zIndex: 1050,
                              maxHeight: 220,
                              overflowY: "auto",
                            }}
                          >
                            {displayContacts.map((c) => (
                              <li
                                key={c.id}
                                className={`list-group-item list-group-item-action${editCustomerId === c.id ? " active" : ""}`}
                                role="button"
                                onClick={() =>
                                  selectCustomer(c.id, c.name, "edit")
                                }
                              >
                                {c.name}
                              </li>
                            ))}
                            {customerSearch.trim() &&
                              !filteredContacts.some(
                                (c) =>
                                  c.name.toLowerCase() ===
                                  customerSearch.trim().toLowerCase(),
                              ) && (
                                <li
                                  className="list-group-item list-group-item-action text-primary"
                                  role="button"
                                  onClick={() =>
                                    createCustomerFromSearch("edit")
                                  }
                                >
                                  {customerCreating
                                    ? "Creating..."
                                    : `Create "${customerSearch.trim()}"`}
                                </li>
                              )}
                            {!displayContacts.length &&
                              !customerSearch.trim() && (
                                <li className="list-group-item text-muted">
                                  No customers
                                </li>
                              )}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div className="form-control-plaintext">
                        {customer?.name || "—"}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Invoice Date</label>
                    {canEdit ? (
                      <input
                        className="form-control input-underline"
                        type="date"
                        value={editInvoiceDate}
                        onChange={(e) => setEditInvoiceDate(e.target.value)}
                      />
                    ) : (
                      <div className="form-control-plaintext">
                        {invoiceDateLabel}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Due Date</label>
                    {canEdit ? (
                      <input
                        className="form-control input-underline"
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                      />
                    ) : (
                      <div className="form-control-plaintext">
                        {selectedInvoice?.due_date
                          ? new Date(
                              selectedInvoice.due_date,
                            ).toLocaleDateString()
                          : "—"}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Quotation</label>
                    {canEdit ? (
                      <div
                        className="position-relative"
                        ref={quotationDropdownRef}
                      >
                        <input
                          className="form-control input-underline"
                          placeholder="Search or select quotation…"
                          value={quotationSearch}
                          onChange={(e) => {
                            setQuotationSearch(e.target.value);
                            setQuotationDropdownOpen(true);
                            if (!e.target.value) setEditQuotationId(null);
                          }}
                          onFocus={() => setQuotationDropdownOpen(true)}
                        />
                        {quotationDropdownOpen && (
                          <ul
                            className="list-group position-absolute w-100 shadow-sm"
                            style={{
                              zIndex: 1050,
                              maxHeight: 220,
                              overflowY: "auto",
                            }}
                          >
                            {displayQuotations.map((q) => (
                              <li
                                key={q.id}
                                className={`list-group-item list-group-item-action${editQuotationId === q.id ? " active" : ""}`}
                                role="button"
                                onClick={() => {
                                  setEditQuotationId(q.id);
                                  setQuotationSearch(q.reference);
                                  setQuotationDropdownOpen(false);
                                }}
                              >
                                {q.reference}
                              </li>
                            ))}
                            {!displayQuotations.length &&
                              !quotationSearch.trim() && (
                                <li className="list-group-item text-muted">
                                  No quotations
                                </li>
                              )}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div className="form-control-plaintext">
                        {linkedQuotation?.reference || "—"}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Reference</label>
                    <div className="form-control-plaintext fw-semibold">
                      {selectedInvoice?.reference || "—"}
                    </div>
                  </div>
                  <div className="col-md-4">
                    <label
                      className={`form-label ${
                        invalidFields.includes("editCurrency")
                          ? "form-label-error"
                          : ""
                      }`}
                    >
                      Currency
                    </label>
                    {canEdit ? (
                      <select
                        className={`form-select input-underline ${
                          invalidFields.includes("editCurrency")
                            ? "input-field-error"
                            : ""
                        }`}
                        value={editCurrency}
                        onChange={(e) => {
                          const { value } = e.target;
                          setEditCurrency(value);
                          clearInvalidField("editCurrency", value);
                        }}
                      >
                        {currencyOptions.map((cur) => (
                          <option key={cur} value={cur}>
                            {cur}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="form-control-plaintext">
                        {invoiceCurrency}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Fiscal Device</label>
                    {canEdit ? (
                      <select
                        className="form-select input-underline"
                        value={editDeviceId ?? ""}
                        onChange={(e) =>
                          setEditDeviceId(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      >
                        <option value="">— None —</option>
                        {devices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.device_id || d.serial_number || `Device ${d.id}`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="form-control-plaintext">
                        {devices.find(
                          (d) => d.id === selectedInvoice?.device_id,
                        )?.device_id || "—"}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Payment Terms</label>
                    {canEdit ? (
                      <select
                        className="form-select input-underline"
                        value={editPaymentTerms}
                        onChange={(e) => setEditPaymentTerms(e.target.value)}
                      >
                        <option value="">Select terms</option>
                        {editPaymentTermOptions.map((termName) => (
                          <option key={termName} value={termName}>
                            {termName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="form-control-plaintext">
                        {selectedInvoice?.payment_terms || "—"}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Payment Reference</label>
                    <div className="form-control-plaintext">
                      {selectedInvoice?.payment_reference || "—"}
                    </div>
                  </div>
                  <div className="col-12">
                    <label className="form-label">Notes</label>
                    {canEdit ? (
                      <textarea
                        className="form-control input-underline"
                        rows={2}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                      />
                    ) : (
                      <div className="form-control-plaintext">
                        {selectedInvoice?.notes || "—"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lines table */}
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="fw-semibold">Invoice Lines</div>
                </div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <small className="text-muted">
                    Showing {visibleLineStart}-{visibleLineEnd} of{" "}
                    {activeLineCount}
                  </small>
                </div>
                <div className="table-responsive invoice-lines-table-wrap">
                  <table className="table table-bordered align-middle mb-0 invoice-lines-table">
                    <thead className="table-light">
                      <tr>
                        <th>Product</th>
                        <th>Description</th>
                        <th className="text-end">Qty</th>
                        <th>UoM</th>
                        <th className="text-end">Price</th>
                        <th className="text-end">Amount</th>
                        {canEdit && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedDisplayLines.map((line, pageIndex) => {
                        const index = displayLineStart + pageIndex;
                        const product = line.product_id
                          ? productById.get(line.product_id)
                          : null;
                        const lineTotal =
                          (line.quantity || 0) *
                          (line.unit_price || 0) *
                          (1 - (line.discount || 0) / 100) *
                          (1 + (line.vat_rate || 0) / 100);
                        const displayUom = normalizeUom(
                          product?.uom || line.uom || "",
                        );
                        return (
                          <tr key={line.id || `edit-${index}`}>
                            <td>
                              {canEdit ? (
                                <select
                                  className="form-select form-select-sm"
                                  value={line.product_id ?? ""}
                                  onChange={(e) => {
                                    const prod = products.find(
                                      (p) => p.id === Number(e.target.value),
                                    );
                                    updateLine(index, {
                                      product_id: e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                      description: prod?.name ?? "",
                                      unit_price: prod
                                        ? toInvoiceCurrency(prod.sale_price)
                                        : 0,
                                      vat_rate: prod?.tax_rate ?? 0,
                                      uom: prod?.uom || "Units",
                                    });
                                  }}
                                >
                                  <option value="">Select</option>
                                  {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} (avail:{" "}
                                      {p.quantity_available ?? 0})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                (product?.name ?? "—")
                              )}
                            </td>
                            <td>
                              {canEdit ? (
                                <input
                                  className="form-control form-control-sm"
                                  value={line.description || ""}
                                  onChange={(e) =>
                                    updateLine(index, {
                                      description: e.target.value,
                                    })
                                  }
                                />
                              ) : (
                                line.description || "—"
                              )}
                            </td>
                            <td className="text-end">
                              {canEdit ? (
                                <input
                                  className="form-control form-control-sm text-end"
                                  type="number"
                                  value={line.quantity || 0}
                                  onChange={(e) =>
                                    updateLine(index, {
                                      quantity: Number(e.target.value),
                                    })
                                  }
                                />
                              ) : (
                                line.quantity
                              )}
                            </td>
                            <td>
                              {canEdit ? (
                                <input
                                  className="form-control form-control-sm bg-light"
                                  value={displayUom}
                                  readOnly
                                />
                              ) : (
                                displayUom || "—"
                              )}
                            </td>
                            <td className="text-end">
                              {canEdit ? (
                                <input
                                  className="form-control form-control-sm text-end"
                                  type="number"
                                  value={line.unit_price || 0}
                                  onChange={(e) =>
                                    updateLine(index, {
                                      unit_price: Number(e.target.value),
                                    })
                                  }
                                />
                              ) : (
                                formatCurrency(
                                  line.unit_price || 0,
                                  invoiceCurrency,
                                )
                              )}
                            </td>
                            <td className="text-end fw-semibold">
                              {formatCurrency(lineTotal, invoiceCurrency)}
                            </td>
                            {canEdit && (
                              <td className="text-center">
                                <button
                                  className="btn btn-sm btn-light border"
                                  onClick={() => removeLine(index)}
                                  disabled={displayLines.length === 1}
                                >
                                  ✕
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {!displayLines.length && (
                        <tr>
                          <td
                            colSpan={canEdit ? 7 : 6}
                            className="text-center py-4 text-muted"
                          >
                            No invoice lines
                          </td>
                        </tr>
                      )}
                      {canEdit && (
                        <tr className="invoice-lines-action-row">
                          <td colSpan={7}>
                            <div className="invoice-lines-actions-inline">
                              <button
                                className="invoice-lines-add-btn"
                                onClick={addLine}
                              >
                                + Add Line
                              </button>
                              <button
                                className="invoice-lines-secondary-btn"
                                onClick={() => setCreateProductOpen(true)}
                              >
                                + New Product
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="table-light">
                      <tr>
                        <td colSpan={5} className="text-end fw-semibold">
                          Untaxed Amount:
                        </td>
                        <td className="text-end fw-semibold">
                          {formatCurrency(
                            selectedInvoice.subtotal || 0,
                            invoiceCurrency,
                          )}
                        </td>
                        {canEdit && <td></td>}
                      </tr>
                      <tr>
                        <td colSpan={5} className="text-end fw-semibold">
                          {invoiceTaxLabel}
                        </td>
                        <td className="text-end fw-semibold">
                          {formatCurrency(
                            selectedInvoice.tax_amount || 0,
                            invoiceCurrency,
                          )}
                        </td>
                        {canEdit && <td></td>}
                      </tr>
                      <tr>
                        <td colSpan={5} className="text-end fw-bold fs-5">
                          Total:
                        </td>
                        <td className="text-end fw-bold fs-5">
                          {formatCurrency(
                            selectedInvoice.total_amount || 0,
                            invoiceCurrency,
                          )}
                        </td>
                        {canEdit && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

              <aside className="card shadow-sm invoice-customer-history-card">
                <div className="card-body">
                  <div className="invoice-customer-history-header">
                    <div>
                      <h6 className="fw-semibold mb-1">Customer's Invoices</h6>
                    </div>
                  </div>

                  {customer ? (
                    <>
                      <div className="invoice-customer-history-stats">
                        <div className="invoice-customer-history-stat">
                          <span className="invoice-customer-history-stat-label">
                            Total invoices
                          </span>
                          <strong>{selectedInvoiceCustomerHistoryInvoices.length}</strong>
                        </div>
                        <div className="invoice-customer-history-stat">
                          <span className="invoice-customer-history-stat-label">
                            Outstanding
                          </span>
                          <strong>
                            {formatCurrency(
                              selectedInvoiceCustomerHistoryOutstandingTotal,
                              invoiceCurrency || "USD",
                            )}
                          </strong>
                        </div>
                      </div>

                      {selectedInvoiceRecentHistory.length ? (
                        <div className="invoice-customer-history-list">
                          {selectedInvoiceRecentHistory.map((historyInvoice) => {
                            const paymentState = getPaymentStatus(
                              historyInvoice.amount_paid,
                              historyInvoice.amount_due,
                            );
                            const statusClass =
                              historyInvoice.status === "paid"
                                ? "bg-success"
                                : historyInvoice.status === "posted"
                                  ? "bg-info"
                                  : historyInvoice.status === "fiscalized"
                                    ? "bg-primary"
                                    : "bg-secondary";
                            const paymentClass =
                              paymentState === "Paid"
                                ? "bg-success"
                                : paymentState === "Partial"
                                  ? "bg-warning"
                                  : "bg-secondary";

                            return (
                              <button
                                key={historyInvoice.id}
                                type="button"
                                className="invoice-customer-history-item"
                                onClick={() => {
                                  setSelectedInvoiceId(historyInvoice.id);
                                }}
                              >
                                <div className="invoice-customer-history-item-top">
                                  <strong>{historyInvoice.reference}</strong>
                                  <span className={`badge ${statusClass}`}>
                                    {historyInvoice.status}
                                  </span>
                                </div>
                                <div className="invoice-customer-history-item-meta">
                                  <span>
                                    {formatDateTime(historyInvoice.invoice_date) || "—"}
                                  </span>
                                  <span>
                                    {formatCurrency(
                                      historyInvoice.total_amount,
                                      historyInvoice.currency || invoiceCurrency || "USD",
                                    )}
                                  </span>
                                </div>
                                <div className="invoice-customer-history-item-bottom">
                                  <span className={`badge ${paymentClass}`}>
                                    {paymentState}
                                  </span>
                                  <span className="text-muted">
                                    Due {formatCurrency(historyInvoice.amount_due || 0, historyInvoice.currency || invoiceCurrency || "USD")}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="invoice-customer-history-empty">
                          No previous invoices found for this customer.
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </aside>
            </div>
          )}
        </div>
      )}

      {paymentOpen && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} />
          <div
            className="modal fade show"
            tabIndex={-1}
            role="dialog"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1050,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setPaymentOpen(false);
            }}
          >
            <div
              className="modal-dialog modal-dialog-centered"
              style={{ width: "100%", maxWidth: 420, margin: 0 }}
            >
              <div className="modal-content shadow-lg border-0">
                <div className="modal-header border-bottom">
                  <h5 className="modal-title fw-semibold">Register Payment</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setPaymentOpen(false)}
                  />
                </div>
                <div className="modal-body py-4">
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Payment Type</label>
                    <select
                      className="form-select"
                      value={paymentMethod}
                      onChange={(e) => {
                        setPaymentMethod(e.target.value === "bank" ? "bank" : "cash");
                        setPaymentJournalId(null);
                      }}
                    >
                      <option value="cash">Cash</option>
                      <option value="bank">Bank</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Journal</label>
                    <select
                      className="form-select"
                      value={paymentJournalId ?? ""}
                      onChange={(e) =>
                        setPaymentJournalId(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                    >
                      <option value="">Select journal</option>
                      {paymentJournalOptions.map((journal) => (
                        <option key={journal.id} value={journal.id}>
                          {journal.name} ({journal.code})
                        </option>
                      ))}
                    </select>
                    {!paymentJournalOptions.length && (
                      <div className="form-text text-danger">
                        No active {paymentMethod} journals found for this company.
                      </div>
                    )}
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Amount</label>
                    <input
                      className="form-control"
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">
                      Payment Reference
                    </label>
                    <input
                      className="form-control"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer border-top">
                  <button
                    className="btn btn-light border"
                    onClick={() => setPaymentOpen(false)}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={registerPayment}>
                    Confirm Payment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <JournalEntryPreviewDrawer
        open={journalPreviewOpen}
        onClose={() => setJournalPreviewOpen(false)}
        sourceType="invoice"
        sourceId={selectedInvoiceId}
      />

      {createProductOpen && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} />
          <div
            className="modal"
            tabIndex={-1}
            role="dialog"
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
              zIndex: 1050,
              background: "transparent",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setCreateProductOpen(false);
            }}
          >
            <div
              className="modal-dialog modal-lg modal-dialog-centered"
              style={{ margin: 0, width: "100%", maxWidth: 720 }}
            >
              <div className="modal-content shadow-lg border-0">
                <div className="modal-header border-bottom">
                  <h5 className="modal-title fw-semibold">Create Product</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setCreateProductOpen(false)}
                  />
                </div>
                <div className="modal-body py-4">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Product Name</label>
                      <input
                        className="form-control"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Sale Price</label>
                      <input
                        className="form-control"
                        type="number"
                        value={productPrice}
                        onChange={(e) => setProductPrice(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Tax Rate %</label>
                      <input
                        className="form-control"
                        type="number"
                        value={productTaxRate}
                        onChange={(e) => setProductTaxRate(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Product Code</label>
                      <input
                        className="form-control"
                        value={productReference}
                        onChange={(e) => setProductReference(e.target.value)}
                        placeholder="e.g., PROD-001"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">HS Code</label>
                      <input
                        className="form-control"
                        value={productHsCode}
                        onChange={(e) => setProductHsCode(e.target.value)}
                        placeholder="Harmonized code"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">UoM</label>
                      <input
                        className="form-control"
                        value={productUom}
                        onChange={(e) => setProductUom(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Initial Stock</label>
                      <input
                        className="form-control"
                        type="number"
                        value={productInitialStock}
                        onChange={(e) => setProductInitialStock(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Warehouse</label>
                      <select
                        className="form-select"
                        value={productWarehouseId ?? ""}
                        onChange={(e) =>
                          setProductWarehouseId(Number(e.target.value))
                        }
                      >
                        <option value="">Select warehouse</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Location</label>
                      <select
                        className="form-select"
                        value={productLocationId ?? ""}
                        onChange={(e) =>
                          setProductLocationId(Number(e.target.value))
                        }
                      >
                        <option value="">Select location</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-top">
                  <button
                    className="btn btn-light border"
                    onClick={() => setCreateProductOpen(false)}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={createProduct}>
                    Create Product
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
