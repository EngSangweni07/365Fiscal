import { useEffect, useMemo, useState } from "react";
import { Factory, Hammer, Plus, Play, CheckCircle2, XCircle } from "lucide-react";

import { apiFetch } from "../api";
import { useCompanies } from "../hooks/useCompanies";
import { useMe } from "../hooks/useMe";
import { useAlert } from "../context/AlertContext";

type Product = {
  id: number;
  name: string;
  reference: string;
  uom: string;
  purchase_cost: number;
  product_type: string;
  quantity_on_hand?: number;
  quantity_available?: number;
  quantity_reserved?: number;
  stock_value?: number;
};

type Warehouse = {
  id: number;
  name: string;
  code: string;
};

type Location = {
  id: number;
  warehouse_id: number;
  name: string;
  code: string;
  is_primary: boolean;
  is_finished_goods?: boolean;
};

type WorkCenter = {
  id: number;
  company_id: number;
  name: string;
  code: string;
  capacity_per_cycle: number;
  hourly_cost: number;
  efficiency_percent: number;
  time_uom: string;
  is_active: boolean;
  notes: string;
};

type BOMLine = {
  id: number;
  component_product_id: number;
  sequence: number;
  quantity: number;
  uom: string;
  scrap_rate_percent: number;
  notes: string;
};

type RoutingStep = {
  id: number;
  work_center_id: number | null;
  sequence: number;
  name: string;
  duration_minutes: number;
  instructions: string;
};

type BOM = {
  id: number;
  company_id: number;
  product_id: number;
  warehouse_id: number | null;
  output_location_id: number | null;
  code: string;
  name: string;
  version: string;
  quantity: number;
  is_active: boolean;
  notes: string;
  lines: BOMLine[];
  steps: RoutingStep[];
};

type OrderMaterial = {
  id: number;
  component_product_id: number;
  source_location_id: number | null;
  lot_number: string;
  serial_number: string;
  sequence: number;
  planned_quantity: number;
  consumed_quantity: number;
  uom: string;
  notes: string;
};

type StockQuant = {
  id: number;
  company_id: number;
  product_id: number;
  warehouse_id: number | null;
  location_id: number | null;
  lot_number: string;
  serial_number: string;
  quantity: number;
  available_quantity: number;
  reserved_quantity: number;
  unit_cost: number;
  total_value: number;
};

type OrderOperation = {
  id: number;
  work_center_id: number | null;
  sequence: number;
  name: string;
  status: string;
  planned_duration_minutes: number;
  actual_duration_minutes: number;
  instructions: string;
};

type Order = {
  id: number;
  company_id: number;
  bom_id: number;
  product_id: number;
  warehouse_id: number | null;
  source_location_id: number | null;
  output_location_id: number | null;
  reference: string;
  state: string;
  priority: string;
  planned_quantity: number;
  produced_quantity: number;
  scrapped_quantity: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string;
  materials: OrderMaterial[];
  operations: OrderOperation[];
};

type Dashboard = {
  summary: { label: string; value: number }[];
  recent_orders: Order[];
  shortages: {
    order_id: number;
    order_reference: string;
    component_product_id: number;
    required_quantity: number;
    available_quantity: number;
    shortage_quantity: number;
  }[];
};

type EditableBOMLine = {
  component_product_id: number;
  sequence: number;
  quantity: number;
  uom: string;
  scrap_rate_percent: number;
  notes: string;
};

type EditableRoutingStep = {
  work_center_id: number | null;
  sequence: number;
  name: string;
  duration_minutes: number;
  instructions: string;
};

const panelStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 20,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
};

const buttonBase: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid #d1d5db",
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  background: "#fff",
};

function formatProductOption(product: Product) {
  const reference = product.reference ? ` [${product.reference}]` : "";
  const available = Number(product.quantity_available ?? 0).toFixed(2);
  const onHand = Number(product.quantity_on_hand ?? 0).toFixed(2);
  return `${product.name}${reference} | Available ${available} | On hand ${onHand}`;
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ManufacturingPage() {
  const { me } = useMe();
  const { companies } = useCompanies();
  const { showAlert } = useAlert();
  const { showConfirm } = useAlert();
  const isAdmin = Boolean(me?.is_admin);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locationsByWarehouse, setLocationsByWarehouse] = useState<Record<number, Location[]>>({});
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [boms, setBoms] = useState<BOM[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stockQuants, setStockQuants] = useState<StockQuant[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "boms" | "orders" | "workcenters">("overview");
  const [loading, setLoading] = useState(false);
  const [editingBOMId, setEditingBOMId] = useState<number | null>(null);

  const [workCenterForm, setWorkCenterForm] = useState({
    name: "",
    code: "",
    capacity_per_cycle: 1,
    hourly_cost: 0,
    efficiency_percent: 100,
    time_uom: "hours",
    notes: "",
  });

  const [bomForm, setBomForm] = useState({
    product_id: 0,
    warehouse_id: 0,
    output_location_id: 0,
    code: "",
    name: "",
    version: "1.0",
    quantity: 1,
    notes: "",
  });
  const [bomLines, setBomLines] = useState<EditableBOMLine[]>([
    { component_product_id: 0, sequence: 10, quantity: 1, uom: "Units", scrap_rate_percent: 0, notes: "" },
  ]);
  const [routingSteps, setRoutingSteps] = useState<EditableRoutingStep[]>([
    { work_center_id: null, sequence: 10, name: "Assembly", duration_minutes: 60, instructions: "" },
  ]);

  const [orderForm, setOrderForm] = useState({
    bom_id: 0,
    planned_quantity: 1,
    priority: "normal",
    scheduled_start: "",
    scheduled_end: "",
    notes: "",
  });
  const [operationMinutes, setOperationMinutes] = useState<Record<number, number>>({});
  const [productionEntry, setProductionEntry] = useState<Record<number, { produced_quantity: number; scrap_quantity: number; lot_number: string; serial_number: string; notes: string }>>({});
  const [materialTraceability, setMaterialTraceability] = useState<Record<number, { source_location_id: number | null; lot_number: string; serial_number: string; notes: string }>>({});

  useEffect(() => {
    if (!selectedCompanyId && me?.company_ids?.length) {
      setSelectedCompanyId(me.company_ids[0]);
    }
  }, [me?.company_ids, selectedCompanyId]);

  const selectedCompanyProducts = useMemo(
    () => products.filter((product) => product.product_type !== "service"),
    [products],
  );

  const selectedWarehouseLocations = useMemo(
    () => locationsByWarehouse[bomForm.warehouse_id] || [],
    [locationsByWarehouse, bomForm.warehouse_id],
  );

  const bomById = useMemo(
    () => Object.fromEntries(boms.map((bom) => [bom.id, bom])),
    [boms],
  );

  const productById = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product])),
    [products],
  );

  const locationById = useMemo(() => {
    const rows: Record<number, Location> = {};
    Object.values(locationsByWarehouse).flat().forEach((location) => {
      rows[location.id] = location;
    });
    return rows;
  }, [locationsByWarehouse]);

  const warehouseById = useMemo(
    () => Object.fromEntries(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses],
  );

  const loadLocations = async (warehouseList: Warehouse[]) => {
    const entries = await Promise.all(
      warehouseList.map(async (warehouse) => {
        const locations = await apiFetch<Location[]>(`/locations?warehouse_id=${warehouse.id}`);
        return [warehouse.id, locations] as const;
      }),
    );
    setLocationsByWarehouse(Object.fromEntries(entries));
  };

  const loadAll = async (companyId: number) => {
    setLoading(true);
    try {
      const [productsData, warehousesData, workCentersData, bomsData, ordersData, dashboardData, quantsData] =
        await Promise.all([
          apiFetch<Product[]>(`/products/with-stock?company_id=${companyId}`),
          apiFetch<Warehouse[]>(`/warehouses?company_id=${companyId}`),
          apiFetch<WorkCenter[]>(`/manufacturing/work-centers?company_id=${companyId}`),
          apiFetch<BOM[]>(`/manufacturing/boms?company_id=${companyId}`),
          apiFetch<Order[]>(`/manufacturing/orders?company_id=${companyId}`),
          apiFetch<Dashboard>(`/manufacturing/dashboard?company_id=${companyId}`),
          apiFetch<StockQuant[]>(`/stock/quants?company_id=${companyId}`),
        ]);
      setProducts(productsData);
      setWarehouses(warehousesData);
      setWorkCenters(workCentersData);
      setBoms(bomsData);
      setOrders(ordersData);
      setDashboard(dashboardData);
      setStockQuants(quantsData);
      await loadLocations(warehousesData);
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : "Failed to load manufacturing data", variant: "danger" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCompanyId) {
      loadAll(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!bomForm.warehouse_id) return;
    const locations = locationsByWarehouse[bomForm.warehouse_id] || [];
    const finishedGoods = locations.find((location) => location.is_finished_goods) || locations.find((location) => location.is_primary) || locations[0];
    if (finishedGoods && !bomForm.output_location_id) {
      setBomForm((current) => ({ ...current, output_location_id: finishedGoods.id }));
    }
  }, [bomForm.warehouse_id, bomForm.output_location_id, locationsByWarehouse]);

  const resetBOMForm = () => {
    setEditingBOMId(null);
    setBomForm({
      product_id: 0,
      warehouse_id: 0,
      output_location_id: 0,
      code: "",
      name: "",
      version: "1.0",
      quantity: 1,
      notes: "",
    });
    setBomLines([{ component_product_id: 0, sequence: 10, quantity: 1, uom: "Units", scrap_rate_percent: 0, notes: "" }]);
    setRoutingSteps([{ work_center_id: null, sequence: 10, name: "Assembly", duration_minutes: 60, instructions: "" }]);
  };

  const resetOrderForm = () => {
    setOrderForm({
      bom_id: 0,
      planned_quantity: 1,
      priority: "normal",
      scheduled_start: "",
      scheduled_end: "",
      notes: "",
    });
  };

  const createWorkCenter = async () => {
    if (!selectedCompanyId || !workCenterForm.name.trim()) return;
    try {
      await apiFetch("/manufacturing/work-centers", {
        method: "POST",
        body: JSON.stringify({ company_id: selectedCompanyId, ...workCenterForm }),
      });
      setWorkCenterForm({
        name: "",
        code: "",
        capacity_per_cycle: 1,
        hourly_cost: 0,
        efficiency_percent: 100,
        time_uom: "hours",
        notes: "",
      });
      await loadAll(selectedCompanyId);
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : "Failed to create work center", variant: "danger" });
    }
  };

  const createBOM = async () => {
    if (!selectedCompanyId || !bomForm.product_id || bomLines.some((line) => !line.component_product_id)) {
      showAlert({ message: "Select a finished product and valid component lines.", variant: "warning" });
      return;
    }
    try {
      await apiFetch(editingBOMId ? `/manufacturing/boms/${editingBOMId}` : "/manufacturing/boms", {
        method: editingBOMId ? "PATCH" : "POST",
        body: JSON.stringify({
          company_id: selectedCompanyId,
          ...bomForm,
          warehouse_id: bomForm.warehouse_id || null,
          output_location_id: bomForm.output_location_id || null,
          lines: bomLines,
          steps: routingSteps.filter((step) => step.name.trim()),
        }),
      });
      resetBOMForm();
      await loadAll(selectedCompanyId);
      setActiveTab("boms");
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : "Failed to create BOM", variant: "danger" });
    }
  };

  const createOrder = async () => {
    if (!selectedCompanyId || !orderForm.bom_id) {
      showAlert({ message: "Select a BOM before creating an order.", variant: "warning" });
      return;
    }
    try {
      await apiFetch("/manufacturing/orders", {
        method: "POST",
        body: JSON.stringify({
          company_id: selectedCompanyId,
          bom_id: orderForm.bom_id,
          planned_quantity: orderForm.planned_quantity,
          priority: orderForm.priority,
          scheduled_start: orderForm.scheduled_start || null,
          scheduled_end: orderForm.scheduled_end || null,
          notes: orderForm.notes,
        }),
      });
      resetOrderForm();
      await loadAll(selectedCompanyId);
      setActiveTab("orders");
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : "Failed to create order", variant: "danger" });
    }
  };

  const runOrderAction = async (orderId: number, action: "release" | "complete" | "cancel") => {
    if (!selectedCompanyId) return;
    try {
      await apiFetch(`/manufacturing/orders/${orderId}/${action}`, { method: "POST" });
      await loadAll(selectedCompanyId);
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : `Failed to ${action} order`, variant: "danger" });
    }
  };

  const startEditBOM = (bom: BOM) => {
    setEditingBOMId(bom.id);
    setBomForm({
      product_id: bom.product_id,
      warehouse_id: bom.warehouse_id || 0,
      output_location_id: bom.output_location_id || 0,
      code: bom.code,
      name: bom.name,
      version: bom.version,
      quantity: bom.quantity,
      notes: bom.notes,
    });
    setBomLines(
      bom.lines.map((line) => ({
        component_product_id: line.component_product_id,
        sequence: line.sequence,
        quantity: line.quantity,
        uom: line.uom,
        scrap_rate_percent: line.scrap_rate_percent,
        notes: line.notes,
      })),
    );
    setRoutingSteps(
      bom.steps.map((step) => ({
        work_center_id: step.work_center_id,
        sequence: step.sequence,
        name: step.name,
        duration_minutes: step.duration_minutes,
        instructions: step.instructions,
      })),
    );
    setActiveTab("boms");
  };

  const deleteBOM = async (bom: BOM) => {
    if (!selectedCompanyId) return;
    const confirmed = await showConfirm({
      title: "Delete BOM",
      message: `Delete ${bom.name || `BOM ${bom.id}`}? Orders linked to this BOM will block deletion.`,
      confirmLabel: "Delete",
      variant: "warning",
    });
    if (!confirmed) return;
    try {
      await apiFetch(`/manufacturing/boms/${bom.id}`, { method: "DELETE" });
      if (editingBOMId === bom.id) resetBOMForm();
      await loadAll(selectedCompanyId);
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : "Failed to delete BOM", variant: "danger" });
    }
  };

  const updateOperation = async (
    orderId: number,
    operationId: number,
    payload: Record<string, unknown>,
    action?: "start" | "complete",
  ) => {
    if (!selectedCompanyId) return;
    try {
      if (action === "start") {
        await apiFetch(`/manufacturing/orders/${orderId}/operations/${operationId}/start`, { method: "POST" });
      } else if (action === "complete") {
        const params = new URLSearchParams();
        const minutes = operationMinutes[operationId];
        if (Number.isFinite(minutes) && minutes >= 0) {
          params.set("actual_duration_minutes", String(minutes));
        }
        const suffix = params.toString() ? `?${params.toString()}` : "";
        await apiFetch(`/manufacturing/orders/${orderId}/operations/${operationId}/complete${suffix}`, { method: "POST" });
      } else {
        await apiFetch(`/manufacturing/orders/${orderId}/operations/${operationId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      await loadAll(selectedCompanyId);
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : "Failed to update operation", variant: "danger" });
    }
  };

  const recordProduction = async (orderId: number) => {
    if (!selectedCompanyId) return;
    const entry = productionEntry[orderId] || { produced_quantity: 0, scrap_quantity: 0, lot_number: "", serial_number: "", notes: "" };
    try {
      await apiFetch(`/manufacturing/orders/${orderId}/record-production`, {
        method: "POST",
        body: JSON.stringify(entry),
      });
      setProductionEntry((current) => ({
        ...current,
        [orderId]: { produced_quantity: 0, scrap_quantity: 0, lot_number: "", serial_number: "", notes: "" },
      }));
      await loadAll(selectedCompanyId);
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : "Failed to record production", variant: "danger" });
    }
  };

  const saveMaterialTraceability = async (orderId: number, materialId: number) => {
    if (!selectedCompanyId) return;
    const entry = materialTraceability[materialId];
    if (!entry) return;
    try {
      await apiFetch(`/manufacturing/orders/${orderId}/materials/${materialId}`, {
        method: "PATCH",
        body: JSON.stringify(entry),
      });
      await loadAll(selectedCompanyId);
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : "Failed to save material traceability", variant: "danger" });
    }
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={{ ...panelStyle, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Manufacturing</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 28 }}>Bills of materials, production orders, and work centers</h2>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(isAdmin ? companies : companies.filter((company) => me?.company_ids.includes(company.id))).map((company) => (
              <button
                key={company.id}
                style={{
                  ...buttonBase,
                  borderColor: selectedCompanyId === company.id ? "#2563eb" : "#d1d5db",
                  background: selectedCompanyId === company.id ? "rgba(37,99,235,0.08)" : "#fff",
                }}
                onClick={() => setSelectedCompanyId(company.id)}
              >
                {company.name}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            ["overview", "Overview"],
            ["boms", "BOMs"],
            ["orders", "Orders"],
            ["workcenters", "Work Centers"],
          ].map(([key, label]) => (
            <button
              key={key}
              style={{
                ...buttonBase,
                borderColor: activeTab === key ? "#111827" : "#d1d5db",
                background: activeTab === key ? "#111827" : "#fff",
                color: activeTab === key ? "#fff" : "#111827",
              }}
              onClick={() => setActiveTab(key as typeof activeTab)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {loading && <div style={{ color: "#64748b", fontWeight: 600 }}>Loading manufacturing data...</div>}

      {!loading && activeTab === "overview" && dashboard && (
        <div style={{ display: "grid", gap: 20 }}>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            {dashboard.summary.map((card) => (
              <div key={card.label} style={panelStyle}>
                <div style={{ color: "#64748b", fontSize: 13 }}>{card.label}</div>
                <div style={{ fontSize: 30, fontWeight: 700, marginTop: 10 }}>{card.value}</div>
              </div>
            ))}
          </section>
          <section style={{ ...panelStyle, overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Recent production orders</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0 0 12px" }}>Reference</th>
                  <th style={{ padding: "0 0 12px" }}>Product</th>
                  <th style={{ padding: "0 0 12px" }}>State</th>
                  <th style={{ padding: "0 0 12px" }}>Qty</th>
                  <th style={{ padding: "0 0 12px" }}>Warehouse</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recent_orders.map((order) => (
                  <tr key={order.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "12px 0" }}>{order.reference}</td>
                    <td style={{ padding: "12px 0" }}>{productById[order.product_id]?.name || `Product ${order.product_id}`}</td>
                    <td style={{ padding: "12px 0", textTransform: "capitalize" }}>{order.state.replace("_", " ")}</td>
                    <td style={{ padding: "12px 0" }}>{order.planned_quantity}</td>
                    <td style={{ padding: "12px 0" }}>{warehouseById[order.warehouse_id || 0]?.name || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section style={{ ...panelStyle, overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Material shortages</h3>
            {dashboard.shortages.length === 0 ? (
              <div style={{ color: "#64748b" }}>No shortages detected for open manufacturing orders.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "0 0 12px" }}>Order</th>
                    <th style={{ padding: "0 0 12px" }}>Component</th>
                    <th style={{ padding: "0 0 12px" }}>Required</th>
                    <th style={{ padding: "0 0 12px" }}>Available</th>
                    <th style={{ padding: "0 0 12px" }}>Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.shortages.map((shortage, index) => (
                    <tr key={`${shortage.order_id}-${shortage.component_product_id}-${index}`} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "12px 0" }}>{shortage.order_reference}</td>
                      <td style={{ padding: "12px 0" }}>{productById[shortage.component_product_id]?.name || shortage.component_product_id}</td>
                      <td style={{ padding: "12px 0" }}>{shortage.required_quantity}</td>
                      <td style={{ padding: "12px 0" }}>{shortage.available_quantity}</td>
                      <td style={{ padding: "12px 0", color: "#b91c1c", fontWeight: 700 }}>{shortage.shortage_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {!loading && activeTab === "workcenters" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: 20 }}>
          <section style={{ ...panelStyle, display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>New work center</h3>
            <input style={inputStyle} placeholder="Work center name" value={workCenterForm.name} onChange={(e) => setWorkCenterForm((c) => ({ ...c, name: e.target.value }))} />
            <input style={inputStyle} placeholder="Code" value={workCenterForm.code} onChange={(e) => setWorkCenterForm((c) => ({ ...c, code: e.target.value }))} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <input style={inputStyle} type="number" min="0" value={workCenterForm.capacity_per_cycle} onChange={(e) => setWorkCenterForm((c) => ({ ...c, capacity_per_cycle: Number(e.target.value) }))} />
              <input style={inputStyle} type="number" min="0" value={workCenterForm.hourly_cost} onChange={(e) => setWorkCenterForm((c) => ({ ...c, hourly_cost: Number(e.target.value) }))} />
              <input style={inputStyle} type="number" min="0" value={workCenterForm.efficiency_percent} onChange={(e) => setWorkCenterForm((c) => ({ ...c, efficiency_percent: Number(e.target.value) }))} />
            </div>
            <textarea style={{ ...inputStyle, minHeight: 90 }} placeholder="Notes" value={workCenterForm.notes} onChange={(e) => setWorkCenterForm((c) => ({ ...c, notes: e.target.value }))} />
            <button style={{ ...buttonBase, justifyContent: "center", background: "#111827", color: "#fff", borderColor: "#111827" }} onClick={createWorkCenter}>
              <Plus size={16} /> Create work center
            </button>
          </section>
          <section style={{ ...panelStyle, overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Work centers</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748b" }}>
                  <th style={{ paddingBottom: 12 }}>Name</th>
                  <th style={{ paddingBottom: 12 }}>Code</th>
                  <th style={{ paddingBottom: 12 }}>Capacity</th>
                  <th style={{ paddingBottom: 12 }}>Hourly Cost</th>
                  <th style={{ paddingBottom: 12 }}>Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {workCenters.map((workCenter) => (
                  <tr key={workCenter.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "12px 0" }}>{workCenter.name}</td>
                    <td style={{ padding: "12px 0" }}>{workCenter.code || "-"}</td>
                    <td style={{ padding: "12px 0" }}>{workCenter.capacity_per_cycle}</td>
                    <td style={{ padding: "12px 0" }}>{workCenter.hourly_cost}</td>
                    <td style={{ padding: "12px 0" }}>{workCenter.efficiency_percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {!loading && activeTab === "boms" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 500px) minmax(0, 1fr)", gap: 20 }}>
          <section style={{ ...panelStyle, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>{editingBOMId ? "Edit bill of materials" : "New bill of materials"}</h3>
              {editingBOMId && (
                <button style={buttonBase} onClick={resetBOMForm}>
                  Cancel edit
                </button>
              )}
            </div>
            <select style={inputStyle} value={bomForm.product_id} onChange={(e) => setBomForm((c) => ({ ...c, product_id: Number(e.target.value) }))}>
              <option value={0}>Select finished product</option>
              {selectedCompanyProducts.map((product) => (
                <option key={product.id} value={product.id}>{formatProductOption(product)}</option>
              ))}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input style={inputStyle} placeholder="BOM code" value={bomForm.code} onChange={(e) => setBomForm((c) => ({ ...c, code: e.target.value }))} />
              <input style={inputStyle} placeholder="Version" value={bomForm.version} onChange={(e) => setBomForm((c) => ({ ...c, version: e.target.value }))} />
            </div>
            <input style={inputStyle} placeholder="BOM name" value={bomForm.name} onChange={(e) => setBomForm((c) => ({ ...c, name: e.target.value }))} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <input style={inputStyle} type="number" min="0.01" step="0.01" value={bomForm.quantity} onChange={(e) => setBomForm((c) => ({ ...c, quantity: Number(e.target.value) }))} />
              <select style={inputStyle} value={bomForm.warehouse_id} onChange={(e) => setBomForm((c) => ({ ...c, warehouse_id: Number(e.target.value), output_location_id: 0 }))}>
                <option value={0}>Warehouse</option>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
              <select style={inputStyle} value={bomForm.output_location_id} onChange={(e) => setBomForm((c) => ({ ...c, output_location_id: Number(e.target.value) }))}>
                <option value={0}>Output location</option>
                {selectedWarehouseLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Components</div>
              {bomLines.map((line, index) => (
                <div key={index} style={{ display: "grid", gridTemplateColumns: "2fr 90px 90px 90px", gap: 8 }}>
                  <select style={inputStyle} value={line.component_product_id} onChange={(e) => setBomLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, component_product_id: Number(e.target.value) } : item))}>
                    <option value={0}>Component</option>
                    {selectedCompanyProducts.map((product) => <option key={product.id} value={product.id}>{formatProductOption(product)}</option>)}
                  </select>
                  <input style={inputStyle} type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => setBomLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(e.target.value) } : item))} />
                  <input style={inputStyle} type="number" min="0" step="0.01" value={line.scrap_rate_percent} onChange={(e) => setBomLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, scrap_rate_percent: Number(e.target.value) } : item))} />
                  <button style={buttonBase} onClick={() => setBomLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                </div>
              ))}
              <button style={buttonBase} onClick={() => setBomLines((current) => [...current, { component_product_id: 0, sequence: current.length * 10 + 10, quantity: 1, uom: "Units", scrap_rate_percent: 0, notes: "" }])}>
                <Plus size={16} /> Add component
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Routing steps</div>
              {routingSteps.map((step, index) => (
                <div key={index} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 100px auto", gap: 8 }}>
                  <input style={inputStyle} placeholder="Operation" value={step.name} onChange={(e) => setRoutingSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item))} />
                  <select style={inputStyle} value={step.work_center_id || 0} onChange={(e) => setRoutingSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, work_center_id: Number(e.target.value) || null } : item))}>
                    <option value={0}>Work center</option>
                    {workCenters.map((workCenter) => <option key={workCenter.id} value={workCenter.id}>{workCenter.name}</option>)}
                  </select>
                  <input style={inputStyle} type="number" min="0" value={step.duration_minutes} onChange={(e) => setRoutingSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, duration_minutes: Number(e.target.value) } : item))} />
                  <button style={buttonBase} onClick={() => setRoutingSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                </div>
              ))}
              <button style={buttonBase} onClick={() => setRoutingSteps((current) => [...current, { work_center_id: null, sequence: current.length * 10 + 10, name: "", duration_minutes: 30, instructions: "" }])}>
                <Plus size={16} /> Add routing step
              </button>
            </div>

            <textarea style={{ ...inputStyle, minHeight: 90 }} placeholder="Notes" value={bomForm.notes} onChange={(e) => setBomForm((c) => ({ ...c, notes: e.target.value }))} />
            <button style={{ ...buttonBase, justifyContent: "center", background: "#111827", color: "#fff", borderColor: "#111827" }} onClick={createBOM}>
              <Factory size={16} /> {editingBOMId ? "Save BOM" : "Create BOM"}
            </button>
          </section>

          <section style={{ display: "grid", gap: 16 }}>
            {boms.map((bom) => (
              <div key={bom.id} style={panelStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{bom.name || productById[bom.product_id]?.name || `BOM ${bom.id}`}</div>
                    <div style={{ color: "#64748b", fontSize: 13 }}>
                      {bom.code || "No code"} | Version {bom.version} | Base Qty {bom.quantity}
                    </div>
                  </div>
                  <div style={{ color: bom.is_active ? "#15803d" : "#b45309", fontWeight: 700 }}>
                    {bom.is_active ? "Active" : "Inactive"}
                  </div>
                </div>
                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Components</div>
                    <div style={{ color: "#475569", fontSize: 14 }}>
                      {bom.lines.map((line) => `${productById[line.component_product_id]?.name || line.component_product_id} x ${line.quantity}`).join(", ")}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Routing</div>
                    <div style={{ color: "#475569", fontSize: 14 }}>
                      {bom.steps.length ? bom.steps.map((step) => `${step.name} (${step.duration_minutes} min)`).join(", ") : "No routing steps"}
                    </div>
                  </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                    <button style={buttonBase} onClick={() => startEditBOM(bom)}>Edit</button>
                    <button style={{ ...buttonBase, borderColor: "#b91c1c", color: "#b91c1c" }} onClick={() => deleteBOM(bom)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </section>
        </div>
      )}

      {!loading && activeTab === "orders" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: 20 }}>
          <section style={{ ...panelStyle, display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>New production order</h3>
            <select style={inputStyle} value={orderForm.bom_id} onChange={(e) => setOrderForm((c) => ({ ...c, bom_id: Number(e.target.value) }))}>
              <option value={0}>Select BOM</option>
              {boms.map((bom) => <option key={bom.id} value={bom.id}>{bom.name || productById[bom.product_id]?.name}</option>)}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input style={inputStyle} type="number" min="0.01" step="0.01" value={orderForm.planned_quantity} onChange={(e) => setOrderForm((c) => ({ ...c, planned_quantity: Number(e.target.value) }))} />
              <select style={inputStyle} value={orderForm.priority} onChange={(e) => setOrderForm((c) => ({ ...c, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <input style={inputStyle} type="datetime-local" value={orderForm.scheduled_start} onChange={(e) => setOrderForm((c) => ({ ...c, scheduled_start: e.target.value }))} />
            <input style={inputStyle} type="datetime-local" value={orderForm.scheduled_end} onChange={(e) => setOrderForm((c) => ({ ...c, scheduled_end: e.target.value }))} />
            <textarea style={{ ...inputStyle, minHeight: 90 }} placeholder="Notes" value={orderForm.notes} onChange={(e) => setOrderForm((c) => ({ ...c, notes: e.target.value }))} />
            <button style={{ ...buttonBase, justifyContent: "center", background: "#111827", color: "#fff", borderColor: "#111827" }} onClick={createOrder}>
              <Hammer size={16} /> Create order
            </button>
          </section>
          <section style={{ display: "grid", gap: 16 }}>
            {orders.map((order) => {
              const bom = bomById[order.bom_id];
              return (
                <div key={order.id} style={panelStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{order.reference}</div>
                      <div style={{ color: "#475569", fontSize: 14 }}>
                        {productById[order.product_id]?.name || `Product ${order.product_id}`} | {warehouseById[order.warehouse_id || 0]?.name || "-"}
                      </div>
                    </div>
                    <div style={{ textTransform: "capitalize", fontWeight: 700 }}>{order.state.replace("_", " ")}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 14 }}>
                    <div><strong>Planned Qty:</strong> {order.planned_quantity}</div>
                    <div><strong>Produced Qty:</strong> {order.produced_quantity}</div>
                    <div><strong>Scrap Qty:</strong> {order.scrapped_quantity}</div>
                    <div><strong>Priority:</strong> {order.priority}</div>
                    <div><strong>Start:</strong> {toDateTimeLocal(order.scheduled_start) || "-"}</div>
                  </div>
                  <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                    <div style={{ fontWeight: 700 }}>Materials</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {order.materials.map((material) => {
                        const locationName = material.source_location_id ? locationById[material.source_location_id]?.name || material.source_location_id : "-";
                        const quantOptions = stockQuants.filter(
                          (quant) =>
                            quant.product_id === material.component_product_id &&
                            (material.source_location_id ? quant.location_id === material.source_location_id : true) &&
                            quant.available_quantity > 0,
                        );
                        const traceability = materialTraceability[material.id] || {
                          source_location_id: material.source_location_id,
                          lot_number: material.lot_number,
                          serial_number: material.serial_number,
                          notes: material.notes,
                        };
                        return (
                          <div key={material.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "grid", gap: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 700 }}>
                                {productById[material.component_product_id]?.name || material.component_product_id}
                              </div>
                              <div style={{ color: "#475569" }}>
                                {material.consumed_quantity}/{material.planned_quantity} {material.uom}
                              </div>
                            </div>
                            <div style={{ color: "#475569", fontSize: 14 }}>Source location: {locationName}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr minmax(160px, 1fr) auto", gap: 8 }}>
                              <input
                                list={`material-lots-${material.id}`}
                                style={inputStyle}
                                placeholder="Lot number"
                                value={traceability.lot_number}
                                onChange={(e) =>
                                  setMaterialTraceability((current) => ({
                                    ...current,
                                    [material.id]: { ...traceability, lot_number: e.target.value },
                                  }))
                                }
                              />
                              <datalist id={`material-lots-${material.id}`}>
                                {Array.from(new Set(quantOptions.map((quant) => quant.lot_number).filter(Boolean))).map((lotNumber) => (
                                  <option key={lotNumber} value={lotNumber} />
                                ))}
                              </datalist>
                              <input
                                list={`material-serials-${material.id}`}
                                style={inputStyle}
                                placeholder="Serial number"
                                value={traceability.serial_number}
                                onChange={(e) =>
                                  setMaterialTraceability((current) => ({
                                    ...current,
                                    [material.id]: { ...traceability, serial_number: e.target.value },
                                  }))
                                }
                              />
                              <datalist id={`material-serials-${material.id}`}>
                                {Array.from(new Set(quantOptions.map((quant) => quant.serial_number).filter(Boolean))).map((serialNumber) => (
                                  <option key={serialNumber} value={serialNumber} />
                                ))}
                              </datalist>
                              <input
                                style={inputStyle}
                                placeholder="Traceability notes"
                                value={traceability.notes}
                                onChange={(e) =>
                                  setMaterialTraceability((current) => ({
                                    ...current,
                                    [material.id]: { ...traceability, notes: e.target.value },
                                  }))
                                }
                              />
                              <button style={buttonBase} onClick={() => saveMaterialTraceability(order.id, material.id)}>
                                Save
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontWeight: 700 }}>Routing</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {order.operations.length ? (
                        order.operations.map((operation) => (
                          <div
                            key={operation.id}
                            style={{
                              border: "1px solid #e5e7eb",
                              borderRadius: 8,
                              padding: 12,
                              display: "grid",
                              gap: 10,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 700 }}>{operation.name}</div>
                              <div style={{ textTransform: "capitalize", color: "#475569" }}>{operation.status.replace("_", " ")}</div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                              <div>Planned: {operation.planned_duration_minutes} min</div>
                              <div>Actual: {operation.actual_duration_minutes} min</div>
                              <div>Center: {operation.work_center_id ? workCenters.find((item) => item.id === operation.work_center_id)?.name || operation.work_center_id : "-"}</div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <input
                                style={{ ...inputStyle, width: 110 }}
                                type="number"
                                min="0"
                                value={operationMinutes[operation.id] ?? operation.actual_duration_minutes ?? operation.planned_duration_minutes}
                                onChange={(e) =>
                                  setOperationMinutes((current) => ({
                                    ...current,
                                    [operation.id]: Number(e.target.value),
                                  }))
                                }
                              />
                              {operation.status !== "done" && (
                                <button style={buttonBase} onClick={() => updateOperation(order.id, operation.id, {}, "start")}>
                                  <Play size={16} /> Start step
                                </button>
                              )}
                              {operation.status !== "done" && (
                                <button
                                  style={{ ...buttonBase, borderColor: "#15803d", color: "#15803d" }}
                                  onClick={() => updateOperation(order.id, operation.id, {}, "complete")}
                                >
                                  <CheckCircle2 size={16} /> Complete step
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "#475569", fontSize: 14 }}>
                          {bom?.steps.length ? bom.steps.map((step) => step.name).join(", ") : "No routing steps"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    <div style={{ fontWeight: 700 }}>Partial production and scrap</div>
                    <div style={{ display: "grid", gridTemplateColumns: "110px 110px 1fr 1fr minmax(180px, 1fr) auto", gap: 8 }}>
                      <input
                        style={inputStyle}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Good qty"
                        value={productionEntry[order.id]?.produced_quantity ?? 0}
                        onChange={(e) =>
                          setProductionEntry((current) => ({
                            ...current,
                            [order.id]: {
                              produced_quantity: Number(e.target.value),
                              scrap_quantity: current[order.id]?.scrap_quantity ?? 0,
                              lot_number: current[order.id]?.lot_number ?? "",
                              serial_number: current[order.id]?.serial_number ?? "",
                              notes: current[order.id]?.notes ?? "",
                            },
                          }))
                        }
                      />
                      <input
                        style={inputStyle}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Scrap qty"
                        value={productionEntry[order.id]?.scrap_quantity ?? 0}
                        onChange={(e) =>
                          setProductionEntry((current) => ({
                            ...current,
                            [order.id]: {
                              produced_quantity: current[order.id]?.produced_quantity ?? 0,
                              scrap_quantity: Number(e.target.value),
                              lot_number: current[order.id]?.lot_number ?? "",
                              serial_number: current[order.id]?.serial_number ?? "",
                              notes: current[order.id]?.notes ?? "",
                            },
                          }))
                        }
                      />
                      <input
                        style={inputStyle}
                        placeholder="Finished lot"
                        value={productionEntry[order.id]?.lot_number ?? ""}
                        onChange={(e) =>
                          setProductionEntry((current) => ({
                            ...current,
                            [order.id]: {
                              produced_quantity: current[order.id]?.produced_quantity ?? 0,
                              scrap_quantity: current[order.id]?.scrap_quantity ?? 0,
                              lot_number: e.target.value,
                              serial_number: current[order.id]?.serial_number ?? "",
                              notes: current[order.id]?.notes ?? "",
                            },
                          }))
                        }
                      />
                      <input
                        style={inputStyle}
                        placeholder="Finished serial"
                        value={productionEntry[order.id]?.serial_number ?? ""}
                        onChange={(e) =>
                          setProductionEntry((current) => ({
                            ...current,
                            [order.id]: {
                              produced_quantity: current[order.id]?.produced_quantity ?? 0,
                              scrap_quantity: current[order.id]?.scrap_quantity ?? 0,
                              lot_number: current[order.id]?.lot_number ?? "",
                              serial_number: e.target.value,
                              notes: current[order.id]?.notes ?? "",
                            },
                          }))
                        }
                      />
                      <input
                        style={inputStyle}
                        placeholder="Notes"
                        value={productionEntry[order.id]?.notes ?? ""}
                        onChange={(e) =>
                          setProductionEntry((current) => ({
                            ...current,
                            [order.id]: {
                              produced_quantity: current[order.id]?.produced_quantity ?? 0,
                              scrap_quantity: current[order.id]?.scrap_quantity ?? 0,
                              lot_number: current[order.id]?.lot_number ?? "",
                              serial_number: current[order.id]?.serial_number ?? "",
                              notes: e.target.value,
                            },
                          }))
                        }
                      />
                      <button style={buttonBase} onClick={() => recordProduction(order.id)}>
                        Record
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                    {order.state !== "done" && order.state !== "cancelled" && (
                      <button style={buttonBase} onClick={() => runOrderAction(order.id, "release")}>
                        <Play size={16} /> Release
                      </button>
                    )}
                    {order.state !== "done" && order.state !== "cancelled" && (
                      <button style={{ ...buttonBase, borderColor: "#15803d", color: "#15803d" }} onClick={() => runOrderAction(order.id, "complete")}>
                        <CheckCircle2 size={16} /> Complete
                      </button>
                    )}
                    {order.state !== "done" && order.state !== "cancelled" && (
                      <button style={{ ...buttonBase, borderColor: "#b91c1c", color: "#b91c1c" }} onClick={() => runOrderAction(order.id, "cancel")}>
                        <XCircle size={16} /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}
