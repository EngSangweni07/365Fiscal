import { useEffect, useMemo, useState } from "react";
import html2pdf from "html2pdf.js";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import { Sidebar } from "../components/Sidebar";
import type { AlertModalVariant } from "../components/AlertModal";
import type { SidebarSection } from "../types/sidebar";
import { useAlert } from "../context/AlertContext";
import { useMe } from "../hooks/useMe";
import { useCompanies, Company } from "../hooks/useCompanies";
import ValidationAlert from "../components/ValidationAlert";
import ValidatedField from "../components/ValidatedField";
import BackButton from "../components/BackButton";
import {
  getDocumentLinesError,
  getMissingRequiredFields,
  getRequiredFieldError,
} from "../utils/formValidation";
import {
  CheckCircle2,
  FileText,
  Pencil,
  Send,
  ShoppingCart,
  XCircle,
  type LucideIcon,
} from "lucide-react";

type Contact = {
  id: number;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  email?: string | null;
  phone?: string;
  vat?: string;
  tin?: string;
};

type Product = {
  id: number;
  name: string;
  sale_price: number;
  tax_rate: number;
  uom?: string;
  hs_code?: string;
};

type Warehouse = { id: number; name: string };

type Location = { id: number; name: string; warehouse_id: number };

type CompanySettings = {
  logo_data: string;
  document_layout: string;
  invoice_notes?: string;
  payment_terms_default?: string;
  document_header?: string;
  document_footer?: string;
  document_watermark?: string;
  document_watermark_opacity?: string;
  currency_code?: string | null;
  currency_symbol?: string | null;
};

type QuotationLine = {
  id?: number;
  product_id: number | null;
  description: string;
  hs_code?: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  vat_rate: number;
};

type Quotation = {
  id: number;
  customer_id: number;
  reference: string;
  status: string;
  payment_terms: string;
  expires_at: string | null;
  currency: string;
  lines: QuotationLine[];
};

const emptyLine = (): QuotationLine => ({
  product_id: null,
  description: "",
  quantity: 1,
  uom: "Units",
  unit_price: 0,
  vat_rate: 0,
});

type QuotationStatusFilter = {
  key: "" | "draft" | "sent" | "accepted" | "rejected" | "converted";
  label: string;
  icon: LucideIcon;
  color: string;
  background: string;
};

const QUOTATION_STATUS_FILTERS: QuotationStatusFilter[] = [
  {
    key: "",
    label: "ALL QUOTATIONS",
    icon: FileText,
    color: "var(--indigo-500)",
    background: "rgba(79, 70, 229, 0.12)",
  },
  {
    key: "draft",
    label: "DRAFT",
    icon: Pencil,
    color: "var(--amber-500)",
    background: "rgba(245, 158, 11, 0.15)",
  },
  {
    key: "sent",
    label: "SENT",
    icon: Send,
    color: "var(--blue-500)",
    background: "rgba(59, 130, 246, 0.15)",
  },
  {
    key: "accepted",
    label: "ACCEPTED",
    icon: CheckCircle2,
    color: "var(--emerald-500)",
    background: "rgba(16, 185, 129, 0.15)",
  },
  {
    key: "rejected",
    label: "REJECTED",
    icon: XCircle,
    color: "var(--red-500)",
    background: "rgba(239, 68, 68, 0.12)",
  },
  {
    key: "converted",
    label: "SALE ORDER",
    icon: ShoppingCart,
    color: "var(--violet-500)",
    background: "rgba(139, 92, 246, 0.15)",
  },
];

const normalizeUom = (value: string) => (value === "PCS" ? "Units" : value);

const normalizeCurrency = (value: string | null | undefined) => {
  const code = (value || "").trim().toUpperCase();
  if (!code) return "";
  return code === "ZWL" ? "ZWG" : code;
};

type QuotationsPageMode = "list" | "new" | "detail";

export default function QuotationsPage({
  mode = "list",
}: {
  mode?: QuotationsPageMode;
}) {
  const navigate = useNavigate();
  const { quotationId } = useParams();
  const routeQuotationId = quotationId ? Number(quotationId) : null;
  const { me } = useMe();
  const { companies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");

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

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [companySettings, setCompanySettings] =
    useState<CompanySettings | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [productWarehouseId, setProductWarehouseId] = useState<number | null>(
    null,
  );
  const [productLocationId, setProductLocationId] = useState<number | null>(
    null,
  );
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productTaxRate, setProductTaxRate] = useState("");
  const [productReference, setProductReference] = useState("");
  const [productHsCode, setProductHsCode] = useState("");
  const [productUom, setProductUom] = useState("Units");
  const [productInitialStock, setProductInitialStock] = useState("");
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(
    null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listStatus, setListStatus] = useState("");
  const [listCurrency, setListCurrency] = useState("");
  const [listFrom, setListFrom] = useState("");
  const [listTo, setListTo] = useState("");
  const [form, setForm] = useState({
    customer_id: null as number | null,
    payment_terms: "Cash",
    expires_at: "",
    currency: "USD",
  });
  const { showAlert } = useAlert();
  const showAlertMessage = (message: string, variant: AlertModalVariant = "danger") => {
    showAlert({ message, variant });
  };
  const [lines, setLines] = useState<QuotationLine[]>([emptyLine()]);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Portal users auto-select their first company
  useEffect(() => {
    if (!isAdmin && companies.length && companyId === null) {
      setCompanyId(companies[0].id);
    }
  }, [isAdmin, companies, companyId]);

  const loadData = async (cid: number) => {
    const currencyParam = listCurrency
      ? `&currency=${encodeURIComponent(listCurrency)}`
      : "";
    const [c, p, q, w, settingsData] = await Promise.all([
      apiFetch<Contact[]>(`/contacts?company_id=${cid}`),
      apiFetch<Product[]>(`/products/with-stock?company_id=${cid}`),
      apiFetch<Quotation[]>(`/quotations?company_id=${cid}${currencyParam}`),
      apiFetch<Warehouse[]>(`/warehouses?company_id=${cid}`),
      apiFetch<CompanySettings>(`/company-settings?company_id=${cid}`),
    ]);
    setContacts(c);
    setProducts(p);
    setQuotations(q);
    setWarehouses(w);
    setCompanySettings(settingsData ?? null);
    if (!productWarehouseId && w.length) {
      setProductWarehouseId(w[0].id);
    }
  };

  useEffect(() => {
    if (companyId) {
      loadData(companyId);
    }
  }, [companyId, listCurrency]);

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
    if (mode === "list") {
      setSelectedQuotationId(null);
      setIsEditing(false);
      return;
    }
    if (mode === "detail") {
      setSelectedQuotationId(routeQuotationId ?? null);
      setIsEditing(false);
    }
  }, [mode, routeQuotationId]);

  useEffect(() => {
    if (mode === "new" && !isEditing) {
      startNew();
    }
  }, [mode, isEditing, contacts]);

  useEffect(() => {
    if (mode !== "new") return;
    if (form.customer_id !== null) return;
    if (!contacts.length) return;
    setForm((prev) => ({ ...prev, customer_id: contacts[0].id }));
  }, [mode, form.customer_id, contacts]);

  const selectedQuotation = useMemo(() => {
    return quotations.find((q) => q.id === selectedQuotationId) ?? null;
  }, [quotations, selectedQuotationId]);

  const selectedCompany = useMemo(
    () => companies.find((c: Company) => c.id === companyId) ?? null,
    [companies, companyId],
  );

  const filteredQuotations = useMemo(() => {
    const term = listSearch.trim().toLowerCase();
    const fromDate = listFrom ? new Date(listFrom) : null;
    const toDate = listTo ? new Date(listTo) : null;
    return quotations.filter((q) => {
      if (listStatus && q.status !== listStatus) return false;
      if (fromDate || toDate) {
        if (!q.expires_at) return false;
        const expDate = new Date(q.expires_at);
        if (fromDate && expDate < fromDate) return false;
        if (toDate && expDate > toDate) return false;
      }
      if (!term) return true;
      const customerName =
        contacts.find((c) => c.id === q.customer_id)?.name?.toLowerCase() ?? "";
      return (
        q.reference.toLowerCase().includes(term) || customerName.includes(term)
      );
    });
  }, [quotations, contacts, listSearch, listStatus, listFrom, listTo]);

  const quotationSidebarSections = useMemo<SidebarSection[]>(() => {
    const items = QUOTATION_STATUS_FILTERS.map((filter) => {
      const Icon = filter.icon;
      const count =
        filter.key === ""
          ? quotations.length
          : quotations.filter((quotation) => quotation.status === filter.key)
              .length;
      return {
        id: `quotation-status-${filter.key || "all"}`,
        label: filter.label,
        icon: (
          <Icon
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            color={filter.color}
          />
        ),
        badge: count,
        isActive: listStatus === filter.key,
        onClick: () => setListStatus(filter.key),
        iconColor: filter.color,
        iconBackground: filter.background,
      };
    });

    return [
      {
        id: "quotation-status",
        title: "STATUS",
        items,
      },
    ];
  }, [listStatus, quotations]);

  useEffect(() => {
    if (!selectedQuotation) return;
    setForm({
      customer_id: selectedQuotation.customer_id,
      payment_terms: selectedQuotation.payment_terms || "Cash",
      expires_at: selectedQuotation.expires_at
        ? selectedQuotation.expires_at.split("T")[0]
        : "",
      currency: normalizeCurrency(selectedQuotation.currency) || "USD",
    });
    setLines(
      selectedQuotation.lines?.length
        ? selectedQuotation.lines.map((line) => {
            const product = products.find((p) => p.id === line.product_id);
            return {
              ...line,
              uom: line.uom || product?.uom || "",
            };
          })
        : [emptyLine()],
    );
    setIsEditing(false);
  }, [selectedQuotation, products]);

  const startNew = () => {
    setSelectedQuotationId(null);
    setForm({
      customer_id: contacts[0]?.id ?? null,
      payment_terms: "Cash",
      expires_at: "",
      currency: normalizeCurrency(companySettings?.currency_code) || "USD",
    });
    setLines([emptyLine()]);
    setIsEditing(true);
  };

  const clearInvalidField = (key: string, value: unknown) => {
    if (!invalidFields.includes(key)) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    setInvalidFields((prev) => prev.filter((field) => field !== key));
  };

  const validateQuotationRequiredFields = (): boolean => {
    const requiredFields = [
      { key: "customer", label: "Customer", value: form.customer_id },
      { key: "currency", label: "Currency", value: form.currency },
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

  const saveQuotation = async () => {
    if (!companyId) {
      showAlertMessage("Please select a company first.");
      return;
    }
    if (!validateQuotationRequiredFields()) {
      return;
    }
    const linesError = getDocumentLinesError(lines);
    if (linesError) {
      showAlertMessage(linesError);
      return;
    }
    setSaving(true);
    const payload = {
      customer_id: form.customer_id,
      payment_terms: form.payment_terms,
      expires_at: form.expires_at
        ? new Date(form.expires_at).toISOString()
        : null,
      currency: normalizeCurrency(form.currency) || "USD",
      lines,
    };
    if (selectedQuotationId) {
      await apiFetch<Quotation>(`/quotations/${selectedQuotationId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      const created = await apiFetch<Quotation>("/quotations", {
        method: "POST",
        body: JSON.stringify({ ...payload, company_id: companyId }),
      });
      setSelectedQuotationId(created.id);
      navigate(`/quotations/${created.id}`);
    }
    await loadData(companyId);
    setIsEditing(false);
    setSaving(false);
  };

  const setStatus = async (status: string) => {
    if (!companyId || !selectedQuotationId) return;
    await apiFetch<Quotation>(`/quotations/${selectedQuotationId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    loadData(companyId);
  };

  const sendQuotation = async () => {
    if (!companyId || !selectedQuotationId) return;
    try {
      await apiFetch(`/quotations/${selectedQuotationId}/send`, {
        method: "POST",
      });
      loadData(companyId);
    } catch (err: any) {
      showAlertMessage(err.message || "Failed to send quotation");
    }
  };

  const acceptQuotation = async () => {
    if (!companyId || !selectedQuotationId) return;
    try {
      await apiFetch(`/quotations/${selectedQuotationId}/accept`, {
        method: "POST",
      });
      loadData(companyId);
    } catch (err: any) {
      showAlertMessage(err.message || "Failed to accept quotation");
    }
  };

  const rejectQuotation = async () => {
    if (!companyId || !selectedQuotationId) return;
    try {
      await apiFetch(`/quotations/${selectedQuotationId}/reject`, {
        method: "POST",
      });
      loadData(companyId);
    } catch (err: any) {
      showAlertMessage(err.message || "Failed to reject quotation");
    }
  };

  const convertToInvoice = async () => {
    if (!companyId || !selectedQuotationId) return;
    try {
      const result = await apiFetch<{ invoice_id: number }>(
        `/quotations/${selectedQuotationId}/convert`,
        { method: "POST" },
      );
      showAlertMessage(`Invoice created successfully! Invoice ID: ${result.invoice_id}`, "success");
      loadData(companyId);
    } catch (err: any) {
      showAlertMessage(err.message || "Failed to convert quotation to invoice");
    }
  };

  const updateLine = (index: number, patch: Partial<QuotationLine>) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)),
    );
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (index: number) =>
    setLines((prev) => prev.filter((_, idx) => idx !== index));

  const statusLabel = selectedQuotation?.status ?? "draft";
  const canEdit = isEditing && statusLabel === "draft";
  const lineTotal = (line: QuotationLine) =>
    line.quantity * line.unit_price * (1 + line.vat_rate / 100);
  const totalAmount = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  const printQuotation = () => {
    if (!selectedQuotation) return;
    const company = selectedCompany;
    const customer = contacts.find(
      (c) => c.id === selectedQuotation.customer_id,
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
    const layoutKey = (
      companySettings?.document_layout || "external_layout_standard"
    ).replace("external_layout_", "layout-");
    const logoMarkup = companySettings?.logo_data
      ? `<img class="logo" src="${companySettings.logo_data}" alt="Logo" />`
      : "";
    const rows = (selectedQuotation.lines || [])
      .map((line) => {
        const total = lineTotal(line);
        const qtyLabel =
          `${(line.quantity || 0).toFixed(2)} ${line.uom || ""}`.trim();
        return `
          <tr>
            <td>${line.description || ""}</td>
            <td style="text-align:right;">${qtyLabel}</td>
            <td style="text-align:right;">${(line.unit_price || 0).toFixed(2)}</td>
            <td style="text-align:right;">${(line.vat_rate || 0).toFixed(2)}</td>
            <td style="text-align:right;">${total.toFixed(2)}</td>
          </tr>
        `;
      })
      .join("");
    const expires = selectedQuotation.expires_at
      ? new Date(selectedQuotation.expires_at).toLocaleDateString()
      : "—";
    const dateLabel = new Date().toLocaleDateString();
    const html = `
      <html>
        <head>
          <title>${selectedQuotation.reference}</title>
          <style>
            :root { --ink: var(--slate-900); --muted: var(--gray-500); --line: var(--gray-200); --soft: var(--slate-50); --accent: var(--blue-800); }
            * { box-sizing: border-box; }
            body { font-family: "Segoe UI", Inter, Arial, sans-serif; padding: 0; margin: 0; color: var(--ink); background: var(--white-500); }
            .doc { padding: 26px 30px 34px; position: relative; }
            .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 64px; font-weight: 700; color: var(--slate-400); opacity: ${companySettings?.document_watermark_opacity || "0.08"}; pointer-events: none; transform: rotate(-25deg); }
            .layout-boxed { border: 1px solid var(--line); }
            .layout-bubble { border: 1px solid var(--line); box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08); }
            .header-row { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .logo { width: 86px; height: 86px; object-fit: contain; border-radius: 0; border: none; background: transparent; padding: 0; }
            .brand-details { font-size: 12px; line-height: 1.5; color: var(--muted); }
            .brand-details strong { color: var(--ink); }
            .company-details { text-align: right; font-size: 12px; line-height: 1.5; color: var(--muted); }
            .company-details strong { color: var(--ink); }
            .invoice-title { text-align: left; }
            .invoice-title h1 { margin: 0 0 8px; font-size: 26px; letter-spacing: 0.6px; }
            .invoice-meta { display: grid; gap: 6px; font-size: 12px; color: var(--muted); }
            .divider { border-top: 1px solid var(--line); margin: 16px 0; }
            .addresses { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; font-size: 12px; }
            .addresses h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase; color: var(--accent); }
            .addresses .block { line-height: 1.5; }
            .ship-grid { margin-top: 12px; display: grid; grid-template-columns: 1.1fr 1fr; gap: 22px; font-size: 12px; color: var(--muted); }
            .ship-grid h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase; color: var(--accent); }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
            thead th { background: var(--accent); color: var(--white-500); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 10px; text-align: left; }
            tbody td { padding: 8px 10px; border-bottom: 1px solid var(--line); }
            tbody tr:nth-child(even) td { background: var(--gray-50); }
            .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
            .totals-card { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
            .totals-row { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: 12px; }
            .totals-row:last-child { border-bottom: none; font-weight: 700; background: var(--slate-50); }
            .doc-footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); text-align: center; }
          </style>
        </head>
        <body>
          <div class="doc ${layoutKey}">
            ${companySettings?.document_watermark ? `<div class="watermark">${companySettings.document_watermark}</div>` : ""}
            <div class="header-row">
              <div class="brand">
                ${logoMarkup || `<div class="logo"></div>`}
              </div>
              <div class="company-details">
                <strong>${company?.name || "Your Company"}</strong><br />
                ${companyAddress.line1 ? `${companyAddress.line1}<br />` : ""}
                ${companyAddress.line2 ? `${companyAddress.line2}<br />` : ""}
                ${companyAddress.line3 ? `${companyAddress.line3}<br />` : ""}
                ${company?.email || ""}<br />
                ${company?.phone || ""}<br />
                TIN: ${company?.tin || "-"} | VAT: ${company?.vat || "-"}
              </div>
            </div>

            <div class="divider"></div>

            <div class="addresses">
              <div class="block">
                <h4>Bill To</h4>
                <strong>${customer?.name || "-"}</strong><br />
                ${customerAddress.line1 ? `${customerAddress.line1}<br />` : ""}
                ${customerAddress.line2 ? `${customerAddress.line2}<br />` : ""}
                ${customerAddress.line3 ? `${customerAddress.line3}<br />` : ""}
                ${customer?.phone || ""}<br />
                ${customer?.email || ""}
              </div>
              <div class="block invoice-title">
                <h1>QUOTATION</h1>
                <div class="invoice-meta">
                  <div><strong>Issue Date:</strong> ${dateLabel}</div>
                  <div><strong>Expiry Date:</strong> ${expires}</div>
                  <div><strong>Quotation #:</strong> ${selectedQuotation.reference}</div>
                  <div><strong>Status:</strong> ${selectedQuotation.status === "converted" ? "Sale Order" : selectedQuotation.status || "-"}</div>
                </div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th style="text-align:right;">Quantity</th>
                  <th style="text-align:right;">Price</th>
                  <th style="text-align:right;">VAT %</th>
                  <th style="text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>

            <div class="totals">
              <div class="totals-card">
                <div class="totals-row"><span>Total</span><span>${totalAmount.toFixed(2)}</span></div>
              </div>
            </div>
            ${footerHtml ? `<div class="doc-footer">${footerHtml}</div>` : ""}
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
        filename: `${selectedQuotation.reference}.pdf`,
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

  const resetProductForm = () => {
    setProductName("");
    setProductPrice("");
    setProductTaxRate("");
    setProductReference("");
    setProductHsCode("");
    setProductUom("Units");
    setProductInitialStock("");
  };

  const createProduct = async () => {
    if (!companyId) return;
    if (!productName.trim()) {
      showAlertMessage("Product name is required.");
      return;
    }
    if (Number(productPrice || 0) < 0) {
      showAlertMessage("Product price cannot be negative.");
      return;
    }
    if (Number(productTaxRate || 0) < 0) {
      showAlertMessage("Product VAT rate cannot be negative.");
      return;
    }
    const payload = {
      company_id: companyId,
      name: productName.trim(),
      sale_price: Number(productPrice || 0),
      tax_rate: Number(productTaxRate || 0),
      reference: productReference.trim() || null,
      hs_code: productHsCode.trim() || null,
      uom: productUom.trim() || "Units",
      initial_stock: Number(productInitialStock || 0),
      warehouse_id: productWarehouseId,
      location_id: productLocationId,
    };
    try {
      await apiFetch<Product>("/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      resetProductForm();
      setCreateProductOpen(false);
      if (companyId) {
        await loadData(companyId);
      }
    } catch (err: any) {
      showAlertMessage(err.message || "Failed to create product");
    }
  };

  const showForm = mode !== "list";

  const goBackToCompanies = () => {
    setCompanyId(null);
    setQuotations([]);
    setContacts([]);
    setProducts([]);
    setWarehouses([]);
    navigate("/quotations");
  };

  if (companiesLoading && companyId === null) {
    return <div className="loading-indicator">Loading companies...</div>;
  }
  if (!isAdmin && companyId === null && companies.length) {
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
          Select a company to view its quotations.
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

  return (
    <div className="container-fluid py-3">
      {!showForm && (
        <>
          {/* Company breadcrumb for admin */}
          {isAdmin && companyId && (
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
                  Quotations
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
                  {selectedCompany?.name || "Company"}
                </span>
              </div>
            </div>
          )}
          <div className="two-panel two-panel-left">
            <Sidebar sections={quotationSidebarSections} />

            <div>
              <div className="content-top-bar">
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
                    placeholder="Search quotations…"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                  />
                </div>
                <select
                  className="form-select"
                  style={{ maxWidth: 160 }}
                  value={listCurrency}
                  onChange={(e) => setListCurrency(e.target.value)}
                  aria-label="Filter by currency"
                >
                  <option value="">All currencies</option>
                  <option value="USD">USD</option>
                  <option value="ZWG">ZWG</option>
                </select>
                <button
                  className="o-btn o-btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={() => {
                    const headers = [
                      "Reference",
                      "Customer",
                      "Status",
                      "Payment Terms",
                      "Expiry Date",
                      "Total",
                    ];
                    const rows = filteredQuotations.map((q) => {
                      const customer = contacts.find(
                        (c) => c.id === q.customer_id,
                      );
                      const total =
                        q.lines?.reduce(
                          (sum, line) => sum + lineTotal(line),
                          0,
                        ) || 0;
                      return [
                        q.reference,
                        customer?.name || "",
                        q.status === "converted" ? "Sale Order" : q.status,
                        q.payment_terms || "",
                        q.expires_at
                          ? new Date(q.expires_at).toLocaleDateString()
                          : "",
                        total.toFixed(2),
                      ];
                    });
                    const csvContent = [headers, ...rows]
                      .map((row) =>
                        row
                          .map(
                            (cell) => `"${String(cell).replace(/"/g, '""')}"`,
                          )
                          .join(","),
                      )
                      .join("\n");
                    const blob = new Blob([csvContent], {
                      type: "text/csv;charset=utf-8;",
                    });
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.download = `quotations_${new Date().toISOString().split("T")[0]}.csv`;
                    link.click();
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
                <button
                  className="btn-create"
                  onClick={() => {
                    startNew();
                    navigate("/quotations/new");
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  New Quotation
                </button>
              </div>
              <div className="card shadow-sm">
                <div className="card-body p-0">
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Reference</th>
                          <th>Customer</th>
                          <th>Status</th>
                          <th className="text-end">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQuotations.map((q) => (
                          <tr
                            key={q.id}
                            role="button"
                            onClick={() => navigate(`/quotations/${q.id}`)}
                          >
                            <td>
                              <div className="fw-semibold">{q.reference}</div>
                            </td>
                            <td>
                              {contacts.find((c) => c.id === q.customer_id)
                                ?.name ?? ""}
                            </td>
                            <td>
                              <span
                                className={`badge ${q.status === "accepted" ? "bg-success" : q.status === "sent" ? "bg-info" : q.status === "rejected" ? "bg-danger" : q.status === "converted" ? "bg-primary" : "bg-secondary"}`}
                              >
                                {q.status === "converted"
                                  ? "sale order"
                                  : q.status}
                              </span>
                            </td>
                            <td className="text-end fw-semibold">
                              {q.lines
                                ?.reduce(
                                  (sum, line) => sum + lineTotal(line),
                                  0,
                                )
                                .toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr
                          style={{
                            background: "var(--slate-50)",
                            fontWeight: 600,
                          }}
                        >
                          <td colSpan={3} className="text-end">
                            Grand Total:
                          </td>
                          <td className="text-end">
                            {filteredQuotations
                              .reduce(
                                (sum, q) =>
                                  sum +
                                  (q.lines?.reduce(
                                    (s, line) => s + lineTotal(line),
                                    0,
                                  ) || 0),
                                0,
                              )
                              .toFixed(2)}
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

      {showForm && (
        <div>
          <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
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
                    Quotations
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
                    {selectedCompany?.name || "Company"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="d-flex align-items-center gap-2">
                <BackButton
                  className="btn btn-sm btn-light border"
                  fallbackTo="/quotations"
                  title="Back"
                  ariaLabel="Back"
                >
                  Back
                </BackButton>
                <h4 className="fw-bold mb-0">
                  {mode === "new"
                    ? "New Quotation"
                    : selectedQuotation?.reference || "Quotation"}
                </h4>
                <span
                  className={`badge ms-2 ${statusLabel === "accepted" ? "bg-success" : statusLabel === "sent" ? "bg-info" : statusLabel === "rejected" ? "bg-danger" : statusLabel === "converted" ? "bg-primary" : "bg-secondary"}`}
                >
                  {statusLabel === "converted" ? "Sale Order" : statusLabel}
                </span>
              </div>
            )}
            <div className="d-flex flex-wrap gap-1">
              <button
                className="btn btn-sm btn-light border"
                onClick={() => {
                  startNew();
                  navigate("/quotations/new");
                }}
              >
                New
              </button>
              {isEditing ? (
                <>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={saveQuotation}
                    disabled={saving}
                  >
                    Save
                  </button>
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={() => setIsEditing(false)}
                  >
                    Discard
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-sm btn-light border"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </button>
              )}
              {selectedQuotationId ? (
                <>
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={sendQuotation}
                    disabled={statusLabel !== "draft"}
                  >
                    Send
                  </button>
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={acceptQuotation}
                    disabled={statusLabel !== "sent"}
                  >
                    Accept
                  </button>
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={rejectQuotation}
                    disabled={statusLabel !== "draft" && statusLabel !== "sent"}
                  >
                    Reject
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={convertToInvoice}
                    disabled={statusLabel !== "accepted"}
                  >
                    Create Sale Order
                  </button>
                  <button
                    className="btn btn-sm btn-light border"
                    onClick={printQuotation}
                  >
                    Print
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="card shadow-sm">
            <div className="card-body invoice-form">
              <ValidationAlert message={error} onClose={() => setError(null)} />
              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <label className="form-label fw-semibold">Company</label>
                  <select
                    className="form-select input-underline"
                    value={companyId ?? ""}
                    onChange={(e) => setCompanyId(Number(e.target.value))}
                    disabled={!canEdit}
                  >
                    {companies.map((c: Company) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <ValidatedField
                    label="Customer"
                    labelClassName="form-label fw-semibold"
                    isInvalid={invalidFields.includes("customer")}
                  >
                    <select
                      className="form-select input-underline"
                      value={form.customer_id ?? ""}
                      onChange={(e) => {
                        const customerId = e.target.value
                          ? Number(e.target.value)
                          : null;
                        setForm((prev) => ({
                          ...prev,
                          customer_id: customerId,
                        }));
                        clearInvalidField("customer", customerId);
                      }}
                      disabled={!canEdit}
                    >
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </ValidatedField>
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold">
                    Payment Terms
                  </label>
                  <input
                    className="form-control input-underline"
                    value={form.payment_terms}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        payment_terms: e.target.value,
                      }))
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div className="col-md-6">
                  <ValidatedField
                    label="Currency"
                    labelClassName="form-label fw-semibold"
                    isInvalid={invalidFields.includes("currency")}
                  >
                    <select
                      className="form-select input-underline"
                      value={form.currency}
                      onChange={(e) => {
                        const { value } = e.target;
                        setForm((prev) => ({
                          ...prev,
                          currency: value,
                        }));
                        clearInvalidField("currency", value);
                      }}
                      disabled={!canEdit}
                    >
                      <option value="USD">USD</option>
                      <option value="ZWG">ZWG</option>
                    </select>
                  </ValidatedField>
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold">Expiration</label>
                  <input
                    className="form-control input-underline"
                    type="date"
                    value={form.expires_at}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        expires_at: e.target.value,
                      }))
                    }
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="d-flex justify-content-between align-items-center mb-2">
                <div className="fw-semibold">Quotation Lines</div>
                {canEdit && (
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-sm btn-light border"
                      onClick={addLine}
                    >
                      + Add Line
                    </button>
                    <button
                      className="btn btn-sm btn-light border"
                      onClick={() => setCreateProductOpen(true)}
                    >
                      + New Product
                    </button>
                  </div>
                )}
              </div>
              <div className="table-responsive">
                <table className="table table-bordered align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Product</th>
                      <th>Description</th>
                      <th className="text-end">Qty</th>
                      <th>UoM</th>
                      <th className="text-end">Unit Price</th>
                      <th className="text-end">VAT %</th>
                      <th className="text-end">Total</th>
                      {canEdit && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const product = products.find(
                        (p) => p.id === line.product_id,
                      );
                      const displayUom = normalizeUom(
                        product?.uom || line.uom || "Units",
                      );
                      return (
                        <tr key={`${index}-${line.product_id ?? "new"}`}>
                          <td>
                            <select
                              className="form-select form-select-sm"
                              value={line.product_id ?? ""}
                              onChange={(e) => {
                                const selected = products.find(
                                  (p) => p.id === Number(e.target.value),
                                );
                                updateLine(index, {
                                  product_id: Number(e.target.value),
                                  description: selected?.name ?? "",
                                  unit_price: selected?.sale_price ?? 0,
                                  vat_rate: selected?.tax_rate ?? 0,
                                  uom: selected?.uom || "Units",
                                });
                              }}
                              disabled={!canEdit}
                            >
                              <option value="">Select</option>
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
                              value={line.description}
                              onChange={(e) =>
                                updateLine(index, {
                                  description: e.target.value,
                                })
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="text-end">
                            <input
                              className="form-control form-control-sm text-end"
                              type="number"
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(index, {
                                  quantity: Number(e.target.value),
                                })
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td>
                            <input
                              className="form-control form-control-sm bg-light"
                              value={displayUom}
                              readOnly
                            />
                          </td>
                          <td className="text-end">
                            <input
                              className="form-control form-control-sm text-end"
                              type="number"
                              value={line.unit_price}
                              onChange={(e) =>
                                updateLine(index, {
                                  unit_price: Number(e.target.value),
                                })
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="text-end">
                            <input
                              className="form-control form-control-sm text-end input-ghost"
                              type="number"
                              value={line.vat_rate}
                              onChange={(e) =>
                                updateLine(index, {
                                  vat_rate: Number(e.target.value),
                                })
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="text-end fw-semibold">
                            {lineTotal(line).toFixed(2)}
                          </td>
                          {canEdit && (
                            <td className="text-center">
                              <button
                                className="btn btn-sm btn-light border"
                                onClick={() => removeLine(index)}
                                disabled={lines.length === 1}
                              >
                                ✕
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="d-flex justify-content-between align-items-center mt-2">
                <div />
                <div className="fw-semibold">
                  Total: {totalAmount.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
          {createProductOpen && (
            <>
              <div
                className="modal-backdrop fade show"
                style={{ zIndex: 1040 }}
              />
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
                      <h5 className="modal-title fw-semibold">
                        Create Product
                      </h5>
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
                        <div className="col-md-3">
                          <label className="form-label">Sale Price</label>
                          <input
                            className="form-control"
                            type="number"
                            value={productPrice}
                            onChange={(e) => setProductPrice(e.target.value)}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Tax Rate %</label>
                          <input
                            className="form-control"
                            type="number"
                            value={productTaxRate}
                            onChange={(e) => setProductTaxRate(e.target.value)}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Reference / SKU</label>
                          <input
                            className="form-control"
                            value={productReference}
                            onChange={(e) =>
                              setProductReference(e.target.value)
                            }
                            placeholder="e.g., PROD-001"
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">HS Code</label>
                          <input
                            className="form-control"
                            value={productHsCode}
                            onChange={(e) => setProductHsCode(e.target.value)}
                            placeholder="Harmonized code"
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">UoM</label>
                          <input
                            className="form-control"
                            value={productUom}
                            onChange={(e) => setProductUom(e.target.value)}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Initial Stock</label>
                          <input
                            className="form-control"
                            type="number"
                            value={productInitialStock}
                            onChange={(e) =>
                              setProductInitialStock(e.target.value)
                            }
                          />
                        </div>
                        <div className="col-md-3">
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
                        <div className="col-md-3">
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
                      <button
                        className="btn btn-primary"
                        onClick={createProduct}
                      >
                        Create Product
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
