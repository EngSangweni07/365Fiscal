import { useEffect, useMemo, useState } from "react";
import html2pdf from "html2pdf.js";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import JournalEntryPreviewDrawer from "../components/JournalEntryPreviewDrawer";
import { Sidebar } from "../components/Sidebar";
import type { SidebarSection } from "../types/sidebar";
import { useMe } from "../hooks/useMe";
import { useCompanies, Company } from "../hooks/useCompanies";
import ValidationAlert from "../components/ValidationAlert";
import ValidatedField from "../components/ValidatedField";
import {
  getDocumentLinesError,
  getMissingRequiredFields,
  getRequiredFieldError,
} from "../utils/formValidation";
import {
  CheckCircle2,
  Inbox,
  Package,
  Pencil,
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
  purchase_cost: number;
  tax_rate: number;
  uom?: string;
  product_type?: string;
  can_be_purchased?: boolean;
  is_active?: boolean;
};

type Warehouse = { id: number; name: string };

type Location = { id: number; name: string; warehouse_id: number };

type CompanySettings = {
  currency_code?: string;
  currency_symbol?: string;
  logo_data?: string;
  document_header?: string;
  document_footer?: string;
};

type PurchaseOrderLine = {
  id?: number;
  product_id: number | null;
  description: string;
  quantity: number;
  received_quantity: number;
  uom: string;
  unit_price: number;
  discount: number;
  vat_rate: number;
  subtotal?: number;
  total_price?: number;
};

type PurchaseOrder = {
  id: number;
  supplier_id: number | null;
  reference: string;
  status: string;
  paid_state: string;
  order_date: string | null;
  expected_date: string | null;
  received_at: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  notes: string;
  warehouse_id: number | null;
  location_id: number | null;
  lines: PurchaseOrderLine[];
};

type PurchasesPageMode = "list" | "new" | "detail";

const emptyLine = (): PurchaseOrderLine => ({
  product_id: null,
  description: "",
  quantity: 1,
  received_quantity: 0,
  uom: "Units",
  unit_price: 0,
  discount: 0,
  vat_rate: 0,
});

const toDateInputValue = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

const toIsoDate = (value: string) =>
  value ? new Date(value).toISOString() : null;

const formatMoney = (value: number, symbol: string) => {
  const safe = Number.isFinite(value) ? value : 0;
  return `${symbol}${safe.toFixed(2)}`;
};

const lineTotals = (line: PurchaseOrderLine) => {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const discount = Number(line.discount) || 0;
  const vat = Number(line.vat_rate) || 0;
  const subtotal = qty * price * (1 - discount / 100);
  const tax = subtotal * (vat / 100);
  return { subtotal, tax, total: subtotal + tax };
};

type PurchaseStatusFilter = {
  key: "" | "draft" | "confirmed" | "received" | "cancelled";
  label: string;
  icon: LucideIcon;
  color: string;
  background: string;
};

const PURCHASE_STATUS_FILTERS: PurchaseStatusFilter[] = [
  {
    key: "",
    label: "ALL PURCHASES",
    icon: Package,
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
    key: "confirmed",
    label: "CONFIRMED",
    icon: CheckCircle2,
    color: "var(--blue-500)",
    background: "rgba(59, 130, 246, 0.12)",
  },
  {
    key: "received",
    label: "RECEIVED",
    icon: Inbox,
    color: "var(--emerald-500)",
    background: "rgba(16, 185, 129, 0.15)",
  },
  {
    key: "cancelled",
    label: "CANCELLED",
    icon: XCircle,
    color: "var(--red-500)",
    background: "rgba(239, 68, 68, 0.12)",
  },
];

export default function PurchasesPage({
  mode = "list",
}: {
  mode?: PurchasesPageMode;
}) {
  const navigate = useNavigate();
  const { purchaseId } = useParams();
  const routePurchaseId = purchaseId ? Number(purchaseId) : null;
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

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [companySettings, setCompanySettings] =
    useState<CompanySettings | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [journalPreviewOpen, setJournalPreviewOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingPaidState, setUpdatingPaidState] = useState(false);

  const [listSearch, setListSearch] = useState("");
  const [listStatus, setListStatus] = useState("");
  const [listPaidState, setListPaidState] = useState("");
  const [listCurrency, setListCurrency] = useState("");
  const [listFrom, setListFrom] = useState("");
  const [listTo, setListTo] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(
    new Set(),
  );
  const [exportingSelected, setExportingSelected] = useState(false);

  const [form, setForm] = useState({
    supplier_id: null as number | null,
    order_date: "",
    expected_date: "",
    currency: "USD",
    notes: "",
    warehouse_id: null as number | null,
    location_id: null as number | null,
  });
  const [lines, setLines] = useState<PurchaseOrderLine[]>([emptyLine()]);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);

  const currencySymbol = companySettings?.currency_symbol || "$";

  useEffect(() => {
    if (!companyId) return;
    const loadData = async () => {
      setLoadingData(true);
      const currencyParam = listCurrency
        ? `&currency=${encodeURIComponent(listCurrency)}`
        : "";
      const [c, p, o, w, settingsData] = await Promise.all([
        apiFetch<Contact[]>(`/contacts?company_id=${companyId}`),
        apiFetch<Product[]>(`/products/with-stock?company_id=${companyId}`),
        apiFetch<PurchaseOrder[]>(
          `/purchases?company_id=${companyId}${currencyParam}`,
        ),
        apiFetch<Warehouse[]>(`/warehouses?company_id=${companyId}`),
        apiFetch<CompanySettings>(`/company-settings?company_id=${companyId}`),
      ]);
      setContacts(c);
      setProducts(
        p.filter((prod) => prod.is_active && prod.can_be_purchased === true),
      );
      setOrders(o);
      setSelectedOrderIds(new Set());
      setWarehouses(w);
      setCompanySettings(settingsData ?? null);
      if (!form.warehouse_id && w.length) {
        setForm((prev) => ({ ...prev, warehouse_id: w[0].id }));
      }
      setLoadingData(false);
    };
    loadData();
  }, [companyId, listCurrency]);

  useEffect(() => {
    if (!form.warehouse_id) {
      setLocations([]);
      return;
    }
    apiFetch<Location[]>(`/locations?warehouse_id=${form.warehouse_id}`)
      .then((data) => {
        setLocations(data);
        if (!form.location_id && data.length) {
          setForm((prev) => ({ ...prev, location_id: data[0].id }));
        }
      })
      .catch(() => setLocations([]));
  }, [form.warehouse_id]);

  useEffect(() => {
    if (mode === "list") {
      setSelectedOrderId(null);
      setIsEditing(false);
      return;
    }
    if (mode === "detail") {
      setSelectedOrderId(routePurchaseId ?? null);
      setIsEditing(false);
    }
  }, [mode, routePurchaseId]);

  useEffect(() => {
    if (mode === "new" && !isEditing) {
      startNew();
    }
  }, [mode, isEditing, contacts]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  useEffect(() => {
    if (!selectedOrder) return;
    setForm({
      supplier_id: selectedOrder.supplier_id,
      order_date: toDateInputValue(selectedOrder.order_date),
      expected_date: toDateInputValue(selectedOrder.expected_date),
      currency: selectedOrder.currency || "USD",
      notes: selectedOrder.notes || "",
      warehouse_id: selectedOrder.warehouse_id,
      location_id: selectedOrder.location_id,
    });
    setInvalidFields([]);
    setLines(
      selectedOrder.lines?.length
        ? selectedOrder.lines.map((line) => {
            const product = products.find((p) => p.id === line.product_id);
            return {
              ...line,
              received_quantity:
                line.received_quantity && line.received_quantity > 0
                  ? line.received_quantity
                  : line.quantity,
              uom: line.uom || product?.uom || "Units",
            };
          })
        : [emptyLine()],
    );
    setIsEditing(false);
  }, [selectedOrder, products]);

  const startNew = () => {
    setSelectedOrderId(null);
    setForm({
      supplier_id: contacts[0]?.id ?? null,
      order_date: new Date().toISOString().split("T")[0],
      expected_date: "",
      currency: companySettings?.currency_code || "USD",
      notes: "",
      warehouse_id: warehouses[0]?.id ?? null,
      location_id: null,
    });
    setLines([emptyLine()]);
    setIsEditing(true);
    setInvalidFields([]);
  };

  const updateLine = (index: number, updates: Partial<PurchaseOrderLine>) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, ...updates } : line)),
    );
  };

  const selectProduct = (index: number, productId: number | null) => {
    const product = products.find((p) => p.id === productId);
    updateLine(index, {
      product_id: productId,
      description: product?.name || "",
      uom: product?.uom || "Units",
      unit_price: product?.purchase_cost || 0,
      vat_rate: product?.tax_rate || 0,
    });
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const totals = useMemo(() => {
    const sums = lines.reduce(
      (acc, line) => {
        const { subtotal, tax, total } = lineTotals(line);
        acc.subtotal += subtotal;
        acc.tax += tax;
        acc.total += total;
        return acc;
      },
      { subtotal: 0, tax: 0, total: 0 },
    );
    return sums;
  }, [lines]);

  const printOrder = () => {
    if (!selectedOrder) return;
    const supplier = contacts.find((c) => c.id === selectedOrder.supplier_id);
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
    const supplierAddress = formatAddressLines(
      supplier?.address,
      supplier?.city,
      supplier?.country,
    );
    const lineRows = (selectedOrder.lines || []).map((line) => {
      const product = products.find((p) => p.id === line.product_id);
      const totals = lineTotals(line);
      const qtyLabel =
        `${line.quantity} ${line.uom || product?.uom || "Units"}`.trim();
      return {
        name: product?.name || line.description || "-",
        description: line.description || product?.name || "-",
        quantity: qtyLabel,
        unit_price: line.unit_price,
        vat_rate: line.vat_rate,
        subtotal: line.subtotal ?? totals.subtotal,
        total: line.total_price ?? totals.total,
      };
    });

    const logo = companySettings?.logo_data || "";
    const headerText = companySettings?.document_header || "";
    const footerText = companySettings?.document_footer || "";
    const footerHtml = footerText.replace(/\n/g, "<br />");
    const html = `<!DOCTYPE html><html><head><title>Purchase ${selectedOrder.reference}</title><style>
      :root { --ink: var(--slate-900); --muted: var(--gray-500); --line: var(--gray-200); --soft: var(--slate-50); --accent: var(--blue-800); }
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body { font-family: "Segoe UI", Inter, Arial, sans-serif; color: var(--ink); margin: 0; padding: 18px; font-size: 12px; }
      .doc { position: relative; }
      .header-row { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
      .brand { display: flex; align-items: center; gap: 14px; }
      .logo { width: 86px; height: 86px; object-fit: contain; border-radius: 0; border: none; background: transparent; padding: 0; }
      .brand-details { font-size: 12px; line-height: 1.5; color: var(--muted); }
      .brand-details strong { color: var(--ink); }
      .company-details { text-align: right; font-size: 12px; line-height: 1.5; color: var(--muted); }
      .company-details strong { color: var(--ink); }
      .title-block { text-align: left; }
      .title-block h1 { margin: 0 0 8px; font-size: 26px; letter-spacing: 0.6px; }
      .title-meta { display: grid; gap: 6px; font-size: 12px; color: var(--muted); }
      .divider { border-top: 1px solid var(--line); margin: 16px 0; }
      .addresses { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; font-size: 12px; }
      .addresses h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase; color: var(--accent); }
      .addresses .block { line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
      thead th { background: var(--accent); color: var(--white-500); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 10px; text-align: left; }
      tbody td { padding: 8px 10px; border-bottom: 1px solid var(--line); }
      tbody tr:nth-child(even) td { background: var(--gray-50); }
      .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
      .totals-card { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
      .totals-row { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: 12px; }
      .totals-row:last-child { border-bottom: none; font-weight: 700; background: var(--slate-50); }
      .doc-footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); text-align: center; }
    </style></head><body>
      <div class="doc">
        <div class="header-row">
          <div class="brand">
            ${logo ? `<img class="logo" src="${logo}" alt="Company Logo" />` : `<div class="logo"></div>`}
            <div class="brand-details">
              <strong>${headerText || "Purchase Order"}</strong><br />
              ${supplier?.name || "-"}
            </div>
          </div>
          <div class="company-details">
            <strong>${headerText || "Purchase Order"}</strong><br />
            ${supplierAddress.line1 ? `${supplierAddress.line1}<br />` : ""}
            ${supplierAddress.line2 ? `${supplierAddress.line2}<br />` : ""}
            ${supplierAddress.line3 ? `${supplierAddress.line3}<br />` : ""}
            ${supplier?.phone || ""}
          </div>
        </div>

        <div class="divider"></div>

        <div class="addresses">
          <div class="block">
            <h4>Supplier</h4>
            <strong>${supplier?.name || "-"}</strong><br />
            ${supplierAddress.line1 ? `${supplierAddress.line1}<br />` : ""}
            ${supplierAddress.line2 ? `${supplierAddress.line2}<br />` : ""}
            ${supplierAddress.line3 ? `${supplierAddress.line3}<br />` : ""}
            ${supplier?.phone || ""}
          </div>
          <div class="block title-block">
            <h1>PURCHASE ORDER</h1>
            <div class="title-meta">
              <div><strong>Issue Date:</strong> ${toDateInputValue(selectedOrder.order_date)}</div>
              <div><strong>Expected Date:</strong> ${toDateInputValue(selectedOrder.expected_date)}</div>
              <div><strong>PO #:</strong> ${selectedOrder.reference}</div>
              <div><strong>Status:</strong> ${selectedOrder.status}</div>
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
            ${lineRows
              .map(
                (row) => `
              <tr>
                <td>${row.description}</td>
                <td style="text-align:right;">${row.quantity}</td>
                <td style="text-align:right;">${formatMoney(row.unit_price, currencySymbol)}</td>
                <td style="text-align:right;">${row.vat_rate}</td>
                <td style="text-align:right;">${formatMoney(row.total, currencySymbol)}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-card">
            <div class="totals-row"><span>Subtotal</span><span>${formatMoney(selectedOrder.subtotal, currencySymbol)}</span></div>
            <div class="totals-row"><span>VAT</span><span>${formatMoney(selectedOrder.tax_amount, currencySymbol)}</span></div>
            <div class="totals-row"><span>Total</span><span>${formatMoney(selectedOrder.total_amount, currencySymbol)}</span></div>
          </div>
        </div>
        ${footerHtml ? `<div class="doc-footer">${footerHtml}</div>` : ""}
      </div>
    </body></html>`;
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: `${selectedOrder.reference}.pdf`,
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

  const clearInvalidField = (key: string, value: unknown) => {
    if (!invalidFields.includes(key)) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    setInvalidFields((prev) => prev.filter((field) => field !== key));
  };

  const validatePurchaseRequiredFields = (): boolean => {
    const requiredFields = [
      { key: "supplier", label: "Supplier", value: form.supplier_id },
      { key: "order_date", label: "Order date", value: form.order_date },
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
    return true;
  };

  const saveOrder = async () => {
    if (!companyId) {
      setError("Please select a company first.");
      return;
    }
    if (!validatePurchaseRequiredFields()) {
      return;
    }
    const linesError = getDocumentLinesError(lines);
    if (linesError) {
      setError(linesError);
      return;
    }
    setError(null);
    setSaving(true);
    const payload = {
      supplier_id: form.supplier_id,
      order_date: toIsoDate(form.order_date),
      expected_date: toIsoDate(form.expected_date),
      currency: form.currency,
      notes: form.notes,
      warehouse_id: form.warehouse_id,
      location_id: form.location_id,
      lines,
    };

    try {
      if (selectedOrderId) {
        await apiFetch<PurchaseOrder>(`/purchases/${selectedOrderId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        const created = await apiFetch<PurchaseOrder>("/purchases", {
          method: "POST",
          body: JSON.stringify({ ...payload, company_id: companyId }),
        });
        setSelectedOrderId(created.id);
        navigate(`/purchases/${created.id}`);
      }
      const updated = await apiFetch<PurchaseOrder[]>(
        `/purchases?company_id=${companyId}`,
      );
      setOrders(updated);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const updatePaidState = async (nextState: string) => {
    if (!selectedOrderId || !companyId) return;
    setUpdatingPaidState(true);
    setError(null);

    const previousState =
      orders.find((o) => o.id === selectedOrderId)?.paid_state || "unpaid";

    // Optimistic update so the dropdown doesn't snap back on slow networks.
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrderId ? { ...o, paid_state: nextState } : o,
      ),
    );
    try {
      await apiFetch<PurchaseOrder>(`/purchases/${selectedOrderId}`, {
        method: "PATCH",
        body: JSON.stringify({ paid_state: nextState }),
      });
      const updatedOrder = await apiFetch<PurchaseOrder>(
        `/purchases/${selectedOrderId}`,
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrderId ? updatedOrder : o)),
      );
    } catch (err: any) {
      // Revert optimistic update on failure
      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrderId ? { ...o, paid_state: previousState } : o,
        ),
      );
      setError(err?.message || "Failed to update paid state");
    } finally {
      setUpdatingPaidState(false);
    }
  };

  const confirmOrder = async () => {
    if (!selectedOrderId || !companyId) return;
    await apiFetch<PurchaseOrder>(`/purchases/${selectedOrderId}/confirm`, {
      method: "POST",
    });
    const updated = await apiFetch<PurchaseOrder[]>(
      `/purchases?company_id=${companyId}`,
    );
    setOrders(updated);
  };

  const receiveOrder = async () => {
    if (!selectedOrderId || !companyId) return;
    const payload = {
      lines: lines
        .filter((line) => line.id)
        .map((line) => ({
          id: line.id as number,
          received_quantity:
            line.received_quantity > 0 ? line.received_quantity : line.quantity,
        })),
    };
    await apiFetch<PurchaseOrder>(`/purchases/${selectedOrderId}/receive`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const updated = await apiFetch<PurchaseOrder[]>(
      `/purchases?company_id=${companyId}`,
    );
    setOrders(updated);
  };

  const cancelOrder = async () => {
    if (!selectedOrderId || !companyId) return;
    await apiFetch<PurchaseOrder>(`/purchases/${selectedOrderId}/cancel`, {
      method: "POST",
    });
    const updated = await apiFetch<PurchaseOrder[]>(
      `/purchases?company_id=${companyId}`,
    );
    setOrders(updated);
  };

  const filteredOrders = useMemo(() => {
    const term = listSearch.trim().toLowerCase();
    const fromDate = listFrom ? new Date(listFrom) : null;
    const toDate = listTo ? new Date(listTo + "T23:59:59") : null;
    return orders.filter((o) => {
      if (listStatus && o.status !== listStatus) return false;
      if (listPaidState && (o.paid_state || "unpaid") !== listPaidState)
        return false;
      const dateValue = o.order_date ? new Date(o.order_date) : null;
      if (fromDate && dateValue && dateValue < fromDate) return false;
      if (toDate && dateValue && dateValue > toDate) return false;
      if (!term) return true;
      const supplierName =
        contacts.find((c) => c.id === o.supplier_id)?.name?.toLowerCase() || "";
      return (
        o.reference.toLowerCase().includes(term) || supplierName.includes(term)
      );
    });
  }, [
    orders,
    listSearch,
    listStatus,
    listPaidState,
    listFrom,
    listTo,
    contacts,
  ]);
  const allFilteredOrdersSelected =
    filteredOrders.length > 0 &&
    filteredOrders.every((order) => selectedOrderIds.has(order.id));
  const selectedOrders = filteredOrders.filter((order) =>
    selectedOrderIds.has(order.id),
  );

  const toggleSelectOrder = (orderId: number) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAllOrders = () => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (allFilteredOrdersSelected) {
        filteredOrders.forEach((order) => next.delete(order.id));
      } else {
        filteredOrders.forEach((order) => next.add(order.id));
      }
      return next;
    });
  };

  const exportSelectedOrders = () => {
    if (!selectedOrders.length) return;
    setExportingSelected(true);
    try {
      const headers = [
        "Reference",
        "Supplier",
        "Status",
        "Paid",
        "Order Date",
        "Expected Date",
        "Subtotal",
        "Tax",
        "Total",
      ];
      const rows = selectedOrders.map((order) => {
        const supplier = contacts.find((c) => c.id === order.supplier_id);
        return [
          order.reference,
          supplier?.name || "",
          order.status,
          order.paid_state || "unpaid",
          toDateInputValue(order.order_date),
          toDateInputValue(order.expected_date),
          order.subtotal || 0,
          order.tax_amount || 0,
          order.total_amount || 0,
        ];
      });
      const csvContent = [headers, ...rows]
        .map((row) =>
          row
            .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
            .join(","),
        )
        .join("\n");
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `purchases_selected_${
        new Date().toISOString().split("T")[0]
      }.csv`;
      link.click();
    } finally {
      setExportingSelected(false);
    }
  };

  const currentStatus = selectedOrder?.status || "draft";
  const canEdit = isEditing || mode === "new" || currentStatus === "draft";

  const purchaseSidebarSections = useMemo<SidebarSection[]>(() => {
    const items = PURCHASE_STATUS_FILTERS.map((filter) => {
      const Icon = filter.icon;
      const count =
        filter.key === ""
          ? orders.length
          : orders.filter((order) => order.status === filter.key).length;
      return {
        id: `purchase-status-${filter.key || "all"}`,
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
        id: "purchase-status",
        title: "STATUS",
        items,
      },
    ];
  }, [listStatus, orders]);

  const goBackToCompanies = () => {
    setSelectedCompanyId(null);
    setOrders([]);
    setContacts([]);
    setProducts([]);
    setWarehouses([]);
    navigate("/purchases");
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
          Select a company to view its purchase orders.
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
    <div className="container-fluid py-3 purchases-page invoice-form">
      {mode !== "list" && (
        <div className="page-header">
          <div className="header-actions">
            <button
              className="btn btn-sm btn-light border"
              onClick={() => navigate("/purchases")}
            >
              Back
            </button>
          </div>
        </div>
      )}

      <ValidationAlert message={error} onClose={() => setError(null)} />

      {mode === "list" && (
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
                  Purchases
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
          )}
          <div className="two-panel two-panel-left">
            <Sidebar sections={purchaseSidebarSections} />

            <div>
              <div className="content-top-bar purchases-top-bar">
                <div className="purchases-search-slot">
                  <div className="top-search purchases-top-search">
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
                      placeholder="Search purchases…"
                      value={listSearch}
                      onChange={(e) => setListSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="purchase-actions">
                  <select
                    className="form-select purchases-currency-select"
                    value={listCurrency}
                    onChange={(e) => setListCurrency(e.target.value)}
                    aria-label="Filter by currency"
                  >
                    <option value="">All currencies</option>
                    <option value="USD">USD</option>
                    <option value="ZWG">ZWG</option>
                  </select>
                  <button
                    className="o-btn o-btn-secondary purchases-export-btn"
                    onClick={() => {
                      const headers = [
                        "Reference",
                        "Supplier",
                        "Status",
                        "Paid State",
                        "Order Date",
                        "Expected Date",
                        "Subtotal",
                        "Tax",
                        "Total",
                      ];
                      const rows = filteredOrders.map((order) => {
                        const supplier = contacts.find(
                          (c) => c.id === order.supplier_id,
                        );
                        return [
                          order.reference,
                          supplier?.name || "",
                          order.status,
                          order.paid_state || "unpaid",
                          toDateInputValue(order.order_date),
                          toDateInputValue(order.expected_date),
                          order.subtotal || 0,
                          order.tax_amount || 0,
                          order.total_amount || 0,
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
                      link.download = `purchases_${
                        new Date().toISOString().split("T")[0]
                      }.csv`;
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
                    className="btn-create purchases-create-btn"
                    onClick={() => {
                      startNew();
                      navigate("/purchases/new");
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
                    New Purchase
                  </button>
                </div>
              </div>
              <div className="card shadow-sm">
                <div className="card-body">
                  {selectedOrderIds.size > 0 && (
                    <div className="batch-action-bar">
                      <label className="batch-master-toggle">
                        <input
                          type="checkbox"
                          checked={allFilteredOrdersSelected}
                          onChange={toggleSelectAllOrders}
                          className="batch-checkbox"
                        />
                        <span>Select all</span>
                      </label>
                      <span className="batch-count">
                        {selectedOrderIds.size} selected
                      </span>
                      <button
                        className="batch-btn export-btn"
                        onClick={exportSelectedOrders}
                        disabled={exportingSelected}
                      >
                        {exportingSelected ? "Exporting..." : "Export Selected"}
                      </button>
                      <button
                        className="batch-btn clear-btn"
                        onClick={() => setSelectedOrderIds(new Set())}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>
                            <input
                              type="checkbox"
                              checked={allFilteredOrdersSelected}
                              onChange={toggleSelectAllOrders}
                              className="batch-checkbox"
                            />
                          </th>
                          <th>Reference</th>
                          <th>Supplier</th>
                          <th>Status</th>
                          <th>Paid</th>
                          <th>Order Date</th>
                          <th className="text-end">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="text-center text-muted py-4"
                            >
                              {loadingData
                                ? "Loading purchases..."
                                : "No purchase orders found."}
                            </td>
                          </tr>
                        ) : (
                          filteredOrders.map((order) => (
                            <tr
                              key={order.id}
                              className={
                                selectedOrderIds.has(order.id)
                                  ? "row-selected"
                                  : ""
                              }
                              style={{ cursor: "pointer" }}
                              onClick={() => navigate(`/purchases/${order.id}`)}
                            >
                              <td onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedOrderIds.has(order.id)}
                                  onChange={() => toggleSelectOrder(order.id)}
                                  className="batch-checkbox"
                                  aria-label={`Select ${order.reference}`}
                                />
                              </td>
                              <td
                                className="purchase-reference-cell"
                                style={{
                                  fontFamily: "inherit",
                                  fontSize: 12,
                                  fontWeight: 500,
                                }}
                              >
                                {order.reference}
                              </td>
                              <td>
                                {contacts.find(
                                  (c) => c.id === order.supplier_id,
                                )?.name || "-"}
                              </td>
                              <td>
                                <span
                                  className={`badge ${order.status === "received" ? "badge-success" : order.status === "confirmed" ? "badge-info" : order.status === "cancelled" ? "badge-danger" : "badge-secondary"}`}
                                >
                                  {order.status}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`badge ${order.paid_state === "paid" ? "badge-success" : order.paid_state === "partial" ? "badge-warning" : "badge-secondary"}`}
                                >
                                  {order.paid_state || "unpaid"}
                                </span>
                              </td>
                              <td>{toDateInputValue(order.order_date)}</td>
                              <td className="text-end">
                                {formatMoney(
                                  order.total_amount,
                                  currencySymbol,
                                )}
                              </td>
                            </tr>
                          ))
                        )}
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
                            {formatMoney(
                              filteredOrders.reduce(
                                (sum, order) => sum + (order.total_amount || 0),
                                0,
                              ),
                              currencySymbol,
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

      {mode !== "list" && (
        <div className="card shadow-sm">
          <div className="card-body invoice-form">
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
                    Purchases
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
            )}
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-3">
              <div>
                <div style={{ display: "flex", alignItems: "top", gap: 8 }}>
                  <h2 className="mb-1">
                    {selectedOrder?.reference || "New Purchase"}
                  </h2>
                  <div className="form-actions">
                    {selectedOrderId && (
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={printOrder}
                      >
                        Print
                      </button>
                    )}
                    {canEdit && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={saveOrder}
                        disabled={saving}
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    )}
                    {!canEdit && currentStatus === "draft" && (
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setIsEditing(true)}
                      >
                        Edit
                      </button>
                    )}
                    {selectedOrderId && currentStatus === "draft" && (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={confirmOrder}
                      >
                        Confirm
                      </button>
                    )}
                    {selectedOrderId && currentStatus === "confirmed" && (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={receiveOrder}
                      >
                        Receive
                      </button>
                    )}
                    {selectedOrderId && currentStatus !== "received" && (
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={cancelOrder}
                      >
                        Cancel
                      </button>
                    )}
                    {selectedOrder && (
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setJournalPreviewOpen(true)}
                      >
                        Journal Preview
                      </button>
                    )}
                    {selectedOrder && currentStatus !== "draft" && (
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() =>
                          navigate(`/accounting?section=journal_entries&reference=${encodeURIComponent(`PO/${selectedOrder.reference}`)}`)
                        }
                      >

                              <JournalEntryPreviewDrawer
                                open={journalPreviewOpen}
                                onClose={() => setJournalPreviewOpen(false)}
                                sourceType="purchase"
                                sourceId={selectedOrderId}
                              />
                        Journal Entry
                      </button>
                    )}
                  </div>
                </div>
                <div className="statusbar">
                  {["draft", "confirmed", "received"].map((step) => (
                    <span
                      key={step}
                      className={`status-pill ${currentStatus === step ? "active" : currentStatus === "received" && step !== "draft" ? "active" : ""}`}
                    >
                      {step}
                    </span>
                  ))}
                </div>
                {selectedOrderId && selectedOrder && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--gray-600)",
                        fontWeight: 600,
                      }}
                    >
                      Paid State
                    </div>
                    <select
                      className="form-select"
                      style={{ maxWidth: 180, height: 34 }}
                      value={selectedOrder.paid_state || "unpaid"}
                      onChange={(e) => updatePaidState(e.target.value)}
                      disabled={updatingPaidState}
                    >
                      <option value="unpaid">unpaid</option>
                      <option value="partial">partial</option>
                      <option value="paid">paid</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <ValidatedField
                  label="Supplier"
                  isInvalid={invalidFields.includes("supplier")}
                  labelClassName="form-label"
                >
                  <select
                    className="form-select input-underline"
                    value={form.supplier_id ?? ""}
                    onChange={(e) => {
                      const supplierId = Number(e.target.value) || null;
                      setForm((prev) => ({
                        ...prev,
                        supplier_id: supplierId,
                      }));
                      clearInvalidField("supplier", supplierId);
                    }}
                    disabled={!canEdit}
                  >
                    <option value="">Select supplier</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </ValidatedField>
              </div>
              <div className="col-md-6">
                <ValidatedField
                  label="Order Date"
                  isInvalid={invalidFields.includes("order_date")}
                >
                  <input
                    type="date"
                    className="form-control input-underline"
                    value={form.order_date}
                    onChange={(e) => {
                      const { value } = e.target;
                      setForm((prev) => ({ ...prev, order_date: value }));
                      clearInvalidField("order_date", value);
                    }}
                    disabled={!canEdit}
                  />
                </ValidatedField>
              </div>
              <div className="col-md-6">
                <label className="form-label ">Expected Date</label>
                <input
                  type="date"
                  className="form-control input-underline"
                  value={form.expected_date}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      expected_date: e.target.value,
                    }))
                  }
                  disabled={!canEdit}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Warehouse</label>
                <select
                  className="form-select input-underline"
                  value={form.warehouse_id ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      warehouse_id: Number(e.target.value) || null,
                    }))
                  }
                  disabled={!canEdit}
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
                  className="form-select input-underline"
                  value={form.location_id ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      location_id: Number(e.target.value) || null,
                    }))
                  }
                  disabled={!canEdit}
                >
                  <option value="">Select location</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <ValidatedField
                  label="Currency"
                  isInvalid={invalidFields.includes("currency")}
                >
                  <input
                    className="form-control input-underline"
                    value={form.currency}
                    onChange={(e) => {
                      const { value } = e.target;
                      setForm((prev) => ({ ...prev, currency: value }));
                      clearInvalidField("currency", value);
                    }}
                    disabled={!canEdit}
                  />
                </ValidatedField>
              </div>
              <div className="col-12">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control input-underline"
                  rows={2}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="card border-0 bg-light">
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h5 className="mb-0">Order Lines</h5>
                  {canEdit && (
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={addLine}
                    >
                      + Add Line
                    </button>
                  )}
                </div>
                <div className="table-responsive">
                  <table className="table table-sm align-middle">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 180 }}>Product</th>
                        <th>Description</th>
                        <th className="text-end">Qty</th>
                        <th className="text-end">Received Qty</th>
                        <th>UoM</th>
                        <th className="text-end">Unit Price</th>
                        <th className="text-end">Discount %</th>
                        <th className="text-end">VAT %</th>
                        <th className="text-end">Subtotal</th>
                        <th className="text-end">Total</th>
                        {canEdit && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => {
                        const totals = lineTotals(line);
                        return (
                          <tr key={index}>
                            <td>
                              <select
                                className="form-select form-select-sm input-ghost"
                                value={line.product_id ?? ""}
                                onChange={(e) =>
                                  selectProduct(
                                    index,
                                    Number(e.target.value) || null,
                                  )
                                }
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
                                className="form-control form-control-sm input-ghost"
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
                                className="form-control form-control-sm text-end input-ghost"
                                type="number"
                                min="0"
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLine(index, {
                                    quantity: Number(e.target.value) || 0,
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="text-end">
                              <input
                                className="form-control form-control-sm text-end input-ghost"
                                type="number"
                                min="0"
                                value={line.received_quantity}
                                onChange={(e) =>
                                  updateLine(index, {
                                    received_quantity:
                                      Number(e.target.value) || 0,
                                  })
                                }
                                disabled={currentStatus !== "confirmed"}
                              />
                            </td>
                            <td>
                              <input
                                className="form-control form-control-sm input-ghost"
                                value={line.uom}
                                onChange={(e) =>
                                  updateLine(index, { uom: e.target.value })
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="text-end">
                              <input
                                className="form-control form-control-sm text-end input-ghost"
                                type="number"
                                min="0"
                                value={line.unit_price}
                                onChange={(e) =>
                                  updateLine(index, {
                                    unit_price: Number(e.target.value) || 0,
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="text-end">
                              <input
                                className="form-control form-control-sm text-end input-ghost"
                                type="number"
                                min="0"
                                value={line.discount}
                                onChange={(e) =>
                                  updateLine(index, {
                                    discount: Number(e.target.value) || 0,
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="text-end">
                              <input
                                className="form-control form-control-sm text-end input-ghost"
                                type="number"
                                min="0"
                                value={line.vat_rate}
                                onChange={(e) =>
                                  updateLine(index, {
                                    vat_rate: Number(e.target.value) || 0,
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="text-end fw-semibold">
                              {formatMoney(totals.subtotal, currencySymbol)}
                            </td>
                            <td className="text-end fw-semibold">
                              {formatMoney(totals.total, currencySymbol)}
                            </td>
                            {canEdit && (
                              <td className="text-center">
                                <button
                                  className="btn btn-sm btn-light border"
                                  onClick={() => removeLine(index)}
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
                <div className="d-flex justify-content-end">
                  <div style={{ minWidth: 260 }}>
                    <div className="d-flex justify-content-between mb-1">
                      <span>Subtotal</span>
                      <strong>
                        {formatMoney(totals.subtotal, currencySymbol)}
                      </strong>
                    </div>
                    <div className="d-flex justify-content-between mb-1">
                      <span>VAT</span>
                      <strong>{formatMoney(totals.tax, currencySymbol)}</strong>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Total</span>
                      <strong>
                        {formatMoney(totals.total, currencySymbol)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
