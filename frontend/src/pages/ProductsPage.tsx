import { useEffect, useState, useRef } from "react";
import { apiFetch, apiFetchWithTotal } from "../api";
import { TablePagination } from "../components/TablePagination";
import { useCompanies, Company } from "../hooks/useCompanies";
import ValidationAlert from "../components/ValidationAlert";
import ValidatedField from "../components/ValidatedField";
import {
  getMissingRequiredFields,
  getRequiredFieldError,
} from "../utils/formValidation";
import { useAlert } from "../context/AlertContext";
import type { AlertModalVariant } from "../components/AlertModal";

type Product = {
  id: number;
  company_id: number;
  name: string;
  description: string;
  image_url: string;
  sale_price: number;
  tax_rate: number;
  sales_cost: number;
  purchase_cost: number;
  hs_code: string;
  reference: string;
  barcode: string;
  product_type: string;
  uom: string;
  track_inventory: boolean;
  min_stock_quantity: number;
  max_stock_quantity: number;
  reorder_point: number;
  weight: number;
  weight_uom: string;
  is_active: boolean;
  can_be_sold: boolean;
  can_be_purchased: boolean;
  show_in_pos: boolean;
  category_id: number | null;
};

type Category = {
  id: number;
  company_id: number;
  name: string;
};

const PRODUCT_TYPES = [
  { value: "storable", label: "Storable Product" },
  { value: "consumable", label: "Consumable" },
  { value: "service", label: "Service" },
];

export default function ProductsPage() {
  const { companies, loading: companiesLoading } = useCompanies();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [productsPage, setProductsPage] = useState(1);
  const [productsPageSize, setProductsPageSize] = useState(10);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "inventory" | "sales">(
    "general",
  );
  const [form, setForm] = useState({
    name: "",
    category_id: null as number | null,
    description: "",
    sale_price: 0,
    tax_rate: 0,
    sales_cost: 0,
    purchase_cost: 0,
    hs_code: "",
    reference: "",
    barcode: "",
    product_type: "storable",
    uom: "Units",
    track_inventory: true,
    min_stock_quantity: 0,
    max_stock_quantity: 0,
    reorder_point: 0,
    weight: 0,
    weight_uom: "kg",
    is_active: true,
    can_be_sold: true,
    can_be_purchased: true,
    show_in_pos: true,
  });
  const [productImageUrl, setProductImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { showAlert } = useAlert();
  const showAlertMessage = (message: string, variant: AlertModalVariant = "danger") => {
    showAlert({ message, variant });
  };

  useEffect(() => {
    if (companies.length && companyId === null) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  const loadProducts = async (cid: number) => {
    const params = new URLSearchParams({
      company_id: String(cid),
      limit: String(productsPageSize),
      offset: String((productsPage - 1) * productsPageSize),
    });
    const { data, total } = await apiFetchWithTotal<Product[]>(
      `/products?${params.toString()}`,
    );
    setProducts(data);
    setTotalProducts(total);
    const selectedVisible = data.some((product) => product.id === selectedProductId);
    if (data.length && (selectedProductId === null || !selectedVisible)) {
      const first = data[0];
      setSelectedProductId(first.id);
      setProductImageUrl(first.image_url || "");
      setForm({
        name: first.name,
        category_id: first.category_id ?? null,
        description: first.description || "",
        sale_price: first.sale_price,
        tax_rate: first.tax_rate,
        sales_cost: first.sales_cost || 0,
        purchase_cost: first.purchase_cost || 0,
        hs_code: first.hs_code || "",
        reference: first.reference || "",
        barcode: first.barcode || "",
        product_type: first.product_type || "storable",
        uom: first.uom || "Units",
        track_inventory: first.track_inventory ?? true,
        min_stock_quantity: first.min_stock_quantity || 0,
        max_stock_quantity: first.max_stock_quantity || 0,
        reorder_point: first.reorder_point || 0,
        weight: first.weight || 0,
        weight_uom: first.weight_uom || "kg",
        is_active: first.is_active ?? true,
        can_be_sold: first.can_be_sold ?? true,
        can_be_purchased: first.can_be_purchased ?? true,
        show_in_pos: first.show_in_pos ?? true,
      });
    }
  };

  const loadCategories = async (cid: number) => {
    const data = await apiFetch<Category[]>(`/categories?company_id=${cid}`);
    setCategories(data);
  };

  useEffect(() => {
    if (companyId) {
      loadProducts(companyId);
      loadCategories(companyId);
    }
  }, [companyId, productsPage, productsPageSize]);

  useEffect(() => {
    setProductsPage(1);
  }, [companyId]);

  const clearInvalidField = (key: string, value: unknown) => {
    if (!invalidFields.includes(key)) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    setInvalidFields((prev) => prev.filter((field) => field !== key));
  };

  const validateProductRequiredFields = (): boolean => {
    const requiredFields = [
      { key: "name", label: "Product name", value: form.name },
      { key: "uom", label: "Unit of measure", value: form.uom },
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

  const emptyForm = () => ({
    name: "",
    category_id: null as number | null,
    description: "",
    sale_price: 0,
    tax_rate: 0,
    sales_cost: 0,
    purchase_cost: 0,
    hs_code: "",
    reference: "",
    barcode: "",
    product_type: "storable",
    uom: "Units",
    track_inventory: true,
    min_stock_quantity: 0,
    max_stock_quantity: 0,
    reorder_point: 0,
    weight: 0,
    weight_uom: "kg",
    is_active: true,
    can_be_sold: true,
    can_be_purchased: true,
    show_in_pos: true,
  });

  const createProduct = async () => {
    if (!companyId) return;
    if (!validateProductRequiredFields()) return;
    if (Number(form.sale_price) < 0) {
      showAlertMessage("Sale price cannot be negative.");
      return;
    }
    if (Number(form.tax_rate) < 0) {
      showAlertMessage("Tax rate cannot be negative.");
      return;
    }
    await apiFetch<Product>("/products", {
      method: "POST",
      body: JSON.stringify({ ...form, company_id: companyId }),
    });
    setForm(emptyForm());
    loadProducts(companyId);
  };

  const updateProduct = async () => {
    if (!selectedProductId) return;
    if (!validateProductRequiredFields()) return;
    if (Number(form.sale_price) < 0) {
      showAlertMessage("Sale price cannot be negative.");
      return;
    }
    if (Number(form.tax_rate) < 0) {
      showAlertMessage("Tax rate cannot be negative.");
      return;
    }
    await apiFetch<Product>(`/products/${selectedProductId}`, {
      method: "PATCH",
      body: JSON.stringify(form),
    });
    loadProducts(companyId!);
    setIsEditing(false);
  };

  const startNew = () => {
    setSelectedProductId(null);
    setProductImageUrl("");
    setForm(emptyForm());
    setIsEditing(true);
    setInvalidFields([]);
  };

  const selectProduct = (product: Product) => {
    setSelectedProductId(product.id);
    setProductImageUrl(product.image_url || "");
    setForm({
      name: product.name,
      category_id: product.category_id ?? null,
      description: product.description || "",
      sale_price: product.sale_price,
      tax_rate: product.tax_rate,
      sales_cost: product.sales_cost || 0,
      purchase_cost: product.purchase_cost || 0,
      hs_code: product.hs_code || "",
      reference: product.reference || "",
      barcode: product.barcode || "",
      product_type: product.product_type || "storable",
      uom: product.uom || "Units",
      track_inventory: product.track_inventory ?? true,
      min_stock_quantity: product.min_stock_quantity || 0,
      max_stock_quantity: product.max_stock_quantity || 0,
      reorder_point: product.reorder_point || 0,
      weight: product.weight || 0,
      weight_uom: product.weight_uom || "kg",
      is_active: product.is_active ?? true,
      can_be_sold: product.can_be_sold ?? true,
      can_be_purchased: product.can_be_purchased ?? true,
      show_in_pos: product.show_in_pos ?? true,
    });
    setInvalidFields([]);
    setIsEditing(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedProductId || !e.target.files?.length) return;
    const file = e.target.files[0];
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const updated = await apiFetch<Product>(`/products/${selectedProductId}/image`, {
        method: "POST",
        body: formData,
      });
      setProductImageUrl(updated.image_url || "");
      loadProducts(companyId!);
    } catch {
      showAlertMessage("Failed to upload image");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleImageDelete = async () => {
    if (!selectedProductId) return;
    setUploadingImage(true);
    try {
      const updated = await apiFetch<Product>(`/products/${selectedProductId}/image`, { method: "DELETE" });
      setProductImageUrl(updated.image_url || "");
      loadProducts(companyId!);
    } catch {
      showAlertMessage("Failed to remove image");
    } finally {
      setUploadingImage(false);
    }
  };

  if (companiesLoading && companyId === null) {
    return <div className="loading-indicator">Loading companies...</div>;
  }
  if (companyId === null && companies.length) {
    return <div className="loading-indicator">Loading companies...</div>;
  }

  return (
    <div className="page-container">
      <div className="two-panel-left">
        <div className="sidebar-panel">
          <h4>Products List</h4>
          <div style={{ maxHeight: "600px", overflowY: "auto" }}>
            {products.length === 0 ? (
              <div className="empty-state-pro"></div>
            ) : (
              products.map((p) => (
                <div
                  key={p.id}
                  className={`list-item ${selectedProductId === p.id ? "active" : ""}`}
                  onClick={() => selectProduct(p)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                    {p.image_url ? (
                      <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--bg-secondary, #f0f0f0)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      </div>
                    )}
                    <div>
                      <div className="list-item-title">{p.name}</div>
                      <div className="list-item-sub">
                        ${p.sale_price.toFixed(2)} • {p.tax_rate}%
                      </div>
                    </div>
                  </div>
                  <span
                    className={`badge ${p.is_active ? "badge-success" : "badge-secondary"}`}
                  >
                    {p.is_active ? "Active" : "Off"}
                  </span>
                </div>
              ))
            )}
          </div>
          <TablePagination
            page={productsPage}
            pageSize={productsPageSize}
            totalItems={totalProducts}
            onPageChange={setProductsPage}
            onPageSizeChange={setProductsPageSize}
          />
        </div>

        <div className="form-shell-pro">
          <div className="section-header">
            <div className="section-title">
              <h3>
                {selectedProductId ? form.name || "Product" : "New Product"}
              </h3>
              <p>
                {selectedProductId
                  ? `ID: ${selectedProductId}`
                  : "Create a new product"}
              </p>
            </div>
            <div className="toolbar-right">
              <div className="statusbar">
                <span
                  className={`badge ${form.is_active ? "badge-success" : "badge-secondary"}`}
                >
                  {form.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <button className="btn btn-secondary" onClick={startNew}>
                + New
              </button>
              {isEditing ? (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={selectedProductId ? updateProduct : createProduct}
                  >
                    Save
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setIsEditing(false)}
                  >
                    Discard
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          <ValidationAlert message={error} onClose={() => setError(null)} />

          <div className="tabs-nav">
            <button
              className={`tab-btn ${activeTab === "general" ? "active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              General Info
            </button>
            <button
              className={`tab-btn ${activeTab === "inventory" ? "active" : ""}`}
              onClick={() => setActiveTab("inventory")}
            >
              Inventory
            </button>
            <button
              className={`tab-btn ${activeTab === "sales" ? "active" : ""}`}
              onClick={() => setActiveTab("sales")}
            >
              Sales & Purchases
            </button>
          </div>

          {activeTab === "general" && (
            <div className="form-grid-pro">
              {/* Product Image Upload */}
              <div className="input-group" style={{ gridColumn: "span 2" }}>
                <label className="input-label">Product Image</label>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: 12,
                      border: "2px dashed var(--border-color, #ddd)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      background: productImageUrl ? "transparent" : "var(--bg-secondary, #f8f9fa)",
                      cursor: isEditing && selectedProductId ? "pointer" : "default",
                      flexShrink: 0,
                    }}
                    onClick={() => isEditing && selectedProductId && imageInputRef.current?.click()}
                  >
                    {productImageUrl ? (
                      <img
                        src={productImageUrl}
                        alt="Product"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    )}
                  </div>
                  {isEditing && selectedProductId && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleImageUpload}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={uploadingImage}
                        style={{ fontSize: "0.85rem" }}
                      >
                        {uploadingImage ? "Uploading…" : productImageUrl ? "Change Image" : "Upload Image"}
                      </button>
                      {productImageUrl && (
                        <button
                          className="btn btn-secondary"
                          onClick={handleImageDelete}
                          disabled={uploadingImage}
                          style={{ fontSize: "0.85rem", color: "#e53e3e" }}
                        >
                          Remove
                        </button>
                      )}
                      <span style={{ fontSize: "0.75rem", color: "#888" }}>JPEG, PNG, WebP. Max 5MB</span>
                    </div>
                  )}
                  {!isEditing && !productImageUrl && (
                    <span style={{ fontSize: "0.85rem", color: "#aaa" }}>No image uploaded</span>
                  )}
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Company</label>
                <select
                  className="input-field dropdown-select"
                  value={companyId ?? ""}
                  onChange={(e) => setCompanyId(Number(e.target.value))}
                  disabled={!isEditing}
                >
                  {companies.map((c: Company) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <ValidatedField
                  label="Product Name"
                  className="input"
                  isInvalid={invalidFields.includes("name")}
                >
                  <input
                    className="input-field"
                    type="text"
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      clearInvalidField("name", e.target.value);
                    }}
                    disabled={!isEditing}
                    placeholder="Enter product name"
                  />
                </ValidatedField>
              </div>
              <div className="input-group">
                <label className="input-label">Category</label>
                <select
                  className="input-field dropdown-select"
                  value={form.category_id ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      category_id:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Product Type</label>
                <select
                  className="input-field dropdown-select"
                  value={form.product_type}
                  onChange={(e) =>
                    setForm({ ...form, product_type: e.target.value })
                  }
                  disabled={!isEditing}
                >
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Reference / SKU</label>
                <input
                  className="input-field"
                  type="text"
                  value={form.reference}
                  onChange={(e) =>
                    setForm({ ...form, reference: e.target.value })
                  }
                  disabled={!isEditing}
                  placeholder="e.g., SKU-001"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Barcode</label>
                <input
                  className="input-field"
                  type="text"
                  value={form.barcode}
                  onChange={(e) =>
                    setForm({ ...form, barcode: e.target.value })
                  }
                  disabled={!isEditing}
                  placeholder="e.g., 1234567890123"
                />
              </div>
              <div className="input-group">
                <label className="input-label">HS Code</label>
                <input
                  className="input-field"
                  type="text"
                  value={form.hs_code}
                  onChange={(e) =>
                    setForm({ ...form, hs_code: e.target.value })
                  }
                  disabled={!isEditing}
                  placeholder="Harmonized System code"
                />
              </div>
              <div className="input-group" style={{ gridColumn: "span 2" }}>
                <label className="input-label">Description</label>
                <textarea
                  className="input-field"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  disabled={!isEditing}
                  rows={3}
                  placeholder="Product description..."
                />
              </div>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm({ ...form, is_active: e.target.checked })
                  }
                  disabled={!isEditing}
                />
                <label htmlFor="is_active">Product is Active</label>
              </div>
            </div>
          )}

          {activeTab === "inventory" && (
            <div className="form-grid-pro">
              <div className="input-group">
                <ValidatedField
                  label="Unit of Measure"
                  className="input"
                  isInvalid={invalidFields.includes("uom")}
                >
                  <input
                    className="input-field"
                    type="text"
                    value={form.uom}
                    onChange={(e) => {
                      setForm({ ...form, uom: e.target.value });
                      clearInvalidField("uom", e.target.value);
                    }}
                    disabled={!isEditing}
                    placeholder="e.g., Units, KG, L"
                  />
                </ValidatedField>
              </div>
              <div className="input-group">
                <label className="input-label">Weight</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  value={form.weight}
                  onChange={(e) =>
                    setForm({ ...form, weight: Number(e.target.value) })
                  }
                  disabled={!isEditing}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Weight UOM</label>
                <input
                  className="input-field"
                  type="text"
                  value={form.weight_uom}
                  onChange={(e) =>
                    setForm({ ...form, weight_uom: e.target.value })
                  }
                  disabled={!isEditing}
                  placeholder="kg"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Minimum Stock Quantity</label>
                <input
                  className="input-field"
                  type="number"
                  value={form.min_stock_quantity}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      min_stock_quantity: Number(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Maximum Stock Quantity</label>
                <input
                  className="input-field"
                  type="number"
                  value={form.max_stock_quantity}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_stock_quantity: Number(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Reorder Point</label>
                <input
                  className="input-field"
                  type="number"
                  value={form.reorder_point}
                  onChange={(e) =>
                    setForm({ ...form, reorder_point: Number(e.target.value) })
                  }
                  disabled={!isEditing}
                />
              </div>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="track_inventory"
                  checked={form.track_inventory}
                  onChange={(e) =>
                    setForm({ ...form, track_inventory: e.target.checked })
                  }
                  disabled={!isEditing}
                />
                <label htmlFor="track_inventory">Track Inventory Levels</label>
              </div>
            </div>
          )}

          {activeTab === "sales" && (
            <div className="form-grid-pro">
              <div className="input-group">
                <label className="input-label">Sale Price</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  value={form.sale_price}
                  onChange={(e) =>
                    setForm({ ...form, sale_price: Number(e.target.value) })
                  }
                  disabled={!isEditing}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Tax Rate (%)</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  value={form.tax_rate}
                  onChange={(e) =>
                    setForm({ ...form, tax_rate: Number(e.target.value) })
                  }
                  disabled={!isEditing}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Sales Cost</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  value={form.sales_cost}
                  onChange={(e) =>
                    setForm({ ...form, sales_cost: Number(e.target.value) })
                  }
                  disabled={!isEditing}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Purchase Cost</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  value={form.purchase_cost}
                  onChange={(e) =>
                    setForm({ ...form, purchase_cost: Number(e.target.value) })
                  }
                  disabled={!isEditing}
                />
              </div>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="can_be_sold"
                  checked={form.can_be_sold}
                  onChange={(e) =>
                    setForm({ ...form, can_be_sold: e.target.checked })
                  }
                  disabled={!isEditing}
                />
                <label htmlFor="can_be_sold">Can be Sold</label>
              </div>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="can_be_purchased"
                  checked={form.can_be_purchased}
                  onChange={(e) =>
                    setForm({ ...form, can_be_purchased: e.target.checked })
                  }
                  disabled={!isEditing}
                />
                <label htmlFor="can_be_purchased">Can be Purchased</label>
              </div>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="show_in_pos"
                  checked={form.show_in_pos}
                  onChange={(e) =>
                    setForm({ ...form, show_in_pos: e.target.checked })
                  }
                  disabled={!isEditing}
                />
                <label htmlFor="show_in_pos">Show in POS</label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
