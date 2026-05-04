import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Boxes,
  CheckCircle2,
  ClipboardList,
  Factory,
  Hammer,
  Package,
  Play,
  Plus,
  Settings2,
  ShoppingBasket,
  XCircle,
} from "lucide-react";

import { apiFetch } from "../api";
import { Sidebar } from "../components/Sidebar";
import type { SidebarSection } from "../types/sidebar";
import { useCompanies } from "../hooks/useCompanies";
import { useMe } from "../hooks/useMe";
import { useAlert } from "../context/AlertContext";
import "./ManufacturingPage.css";

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

type WorkspaceView = "overview" | "boms" | "orders" | "workcenters";
type SectionScreen = "list" | "form";

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

function formatStateLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatInventoryNumber(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

export default function ManufacturingPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { companies } = useCompanies();
  const { showAlert, showConfirm } = useAlert();
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
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");
  const [loading, setLoading] = useState(false);
  const [editingBOMId, setEditingBOMId] = useState<number | null>(null);
  const [bomScreen, setBomScreen] = useState<SectionScreen>("list");
  const [orderScreen, setOrderScreen] = useState<SectionScreen>("list");
  const [workCenterScreen, setWorkCenterScreen] = useState<SectionScreen>("list");

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

  const availableCompanies = useMemo(
    () => (isAdmin ? companies : companies.filter((company) => me?.company_ids.includes(company.id))),
    [companies, isAdmin, me?.company_ids],
  );

  const selectedCompanyProducts = useMemo(
    () => products.filter((product) => product.product_type !== "service"),
    [products],
  );

  const selectedWarehouseLocations = useMemo(
    () => locationsByWarehouse[bomForm.warehouse_id] || [],
    [locationsByWarehouse, bomForm.warehouse_id],
  );

  const selectedFinishedProduct = useMemo(
    () => products.find((product) => product.id === bomForm.product_id) || null,
    [products, bomForm.product_id],
  );

  const inventorySnapshot = useMemo(() => {
    const quantCount = stockQuants.filter((quant) => quant.available_quantity > 0).length;
    const totalAvailable = products.reduce(
      (sum, product) => sum + Number(product.quantity_available ?? 0),
      0,
    );
    return {
      itemCount: selectedCompanyProducts.length,
      warehouseCount: warehouses.length,
      liveQuantCount: quantCount,
      totalAvailable,
    };
  }, [products, selectedCompanyProducts.length, warehouses.length, stockQuants]);

  const bomById = useMemo(
    () => Object.fromEntries(boms.map((bom) => [bom.id, bom])),
    [boms],
  );

  const productById = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product])),
    [products],
  );

  const warehouseById = useMemo(
    () => Object.fromEntries(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses],
  );

  const locationById = useMemo(() => {
    const rows: Record<number, Location> = {};
    Object.values(locationsByWarehouse).flat().forEach((location) => {
      rows[location.id] = location;
    });
    return rows;
  }, [locationsByWarehouse]);

  const menuSections = useMemo<SidebarSection[]>(
    () => [
      {
        id: "manufacturing",
        title: "Manufacturing",
        items: [
          {
            id: "overview",
            label: "Overview",
            icon: <Factory size={18} />,
            isActive: activeView === "overview",
            onClick: () => setActiveView("overview"),
          },
          {
            id: "boms",
            label: "Bills of Materials",
            icon: <ClipboardList size={18} />,
            isActive: activeView === "boms",
            onClick: () => setActiveView("boms"),
          },
          {
            id: "orders",
            label: "Production Orders",
            icon: <Hammer size={18} />,
            isActive: activeView === "orders",
            onClick: () => setActiveView("orders"),
          },
          {
            id: "workcenters",
            label: "Work Centers",
            icon: <Settings2 size={18} />,
            isActive: activeView === "workcenters",
            onClick: () => setActiveView("workcenters"),
          },
        ],
      },
      {
        id: "inventory-links",
        title: "Inventory",
        items: [
          {
            id: "items",
            label: "Items",
            icon: <Package size={18} />,
            onClick: () => navigate("/inventory"),
          },
          {
            id: "stock",
            label: "Stock On Hand",
            icon: <Boxes size={18} />,
            onClick: () => navigate("/inventory"),
          },
        ],
      },
    ],
    [activeView, navigate],
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
    const finishedGoods =
      locations.find((location) => location.is_finished_goods) ||
      locations.find((location) => location.is_primary) ||
      locations[0];
    if (finishedGoods && !bomForm.output_location_id) {
      setBomForm((current) => ({ ...current, output_location_id: finishedGoods.id }));
    }
  }, [bomForm.warehouse_id, bomForm.output_location_id, locationsByWarehouse]);

  const resetBOMForm = () => {
    setEditingBOMId(null);
    setBomScreen("list");
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
    setOrderScreen("list");
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
      setWorkCenterScreen("list");
      await loadAll(selectedCompanyId);
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : "Failed to create work center", variant: "danger" });
    }
  };

  const createBOM = async () => {
    if (!selectedCompanyId || !bomForm.product_id || bomLines.some((line) => !line.component_product_id)) {
      showAlert({ message: "Select a finished inventory item and valid component lines.", variant: "warning" });
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
      setActiveView("boms");
    } catch (error) {
      showAlert({ message: error instanceof Error ? error.message : "Failed to create BOM", variant: "danger" });
    }
  };

  const createOrder = async () => {
    if (!selectedCompanyId || !orderForm.bom_id) {
      showAlert({ message: "Select a BOM before creating a production order.", variant: "warning" });
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
      setActiveView("orders");
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
    setActiveView("boms");
    setBomScreen("form");
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
    const entry =
      productionEntry[orderId] || {
        produced_quantity: 0,
        scrap_quantity: 0,
        lot_number: "",
        serial_number: "",
        notes: "",
      };
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

  const renderOverview = () => (
    <div className="manufacturing-overview">
      <div className="manufacturing-summary-grid">
        {(dashboard?.summary || []).map((card) => (
          <section className="manufacturing-summary-card" key={card.label}>
            <span className="manufacturing-summary-label">{card.label}</span>
            <strong className="manufacturing-summary-value">{card.value}</strong>
          </section>
        ))}
      </div>

      <section className="manufacturing-panel">
        <div className="manufacturing-panel-header">
          <div>
            <h3>Recent Production Orders</h3>
            <p>Latest manufacturing activity across this company.</p>
          </div>
        </div>
        <div className="manufacturing-table-wrap">
          <table className="manufacturing-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Item</th>
                <th>Status</th>
                <th>Planned</th>
                <th>Produced</th>
                <th>Warehouse</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard?.recent_orders || []).map((order) => (
                <tr key={order.id}>
                  <td>{order.reference}</td>
                  <td>{productById[order.product_id]?.name || `Product ${order.product_id}`}</td>
                  <td><span className={`manufacturing-state manufacturing-state--${order.state}`}>{formatStateLabel(order.state)}</span></td>
                  <td>{order.planned_quantity}</td>
                  <td>{order.produced_quantity}</td>
                  <td>{warehouseById[order.warehouse_id || 0]?.name || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="manufacturing-panel">
        <div className="manufacturing-panel-header">
          <div>
            <h3>Shortages</h3>
            <p>Materials still required before open work orders can proceed.</p>
          </div>
        </div>
        {dashboard?.shortages?.length ? (
          <div className="manufacturing-table-wrap">
            <table className="manufacturing-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Component</th>
                  <th>Required</th>
                  <th>Available</th>
                  <th>Shortage</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.shortages.map((shortage, index) => (
                  <tr key={`${shortage.order_id}-${shortage.component_product_id}-${index}`}>
                    <td>{shortage.order_reference}</td>
                    <td>{productById[shortage.component_product_id]?.name || shortage.component_product_id}</td>
                    <td>{shortage.required_quantity}</td>
                    <td>{shortage.available_quantity}</td>
                    <td className="manufacturing-danger-text">{shortage.shortage_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="manufacturing-empty">No current shortages.</div>
        )}
      </section>
    </div>
  );

  const renderBOMForm = () => (
    <section className="manufacturing-panel manufacturing-form-panel manufacturing-page-panel">
      <div className="manufacturing-panel-header">
        <div>
          <h3>{editingBOMId ? "Edit BOM" : "New BOM"}</h3>
          <p>Pick finished items and components directly from inventory.</p>
        </div>
        <button className="o-btn o-btn-secondary" onClick={resetBOMForm}>
          Back to BOMs
        </button>
      </div>
      <div className="manufacturing-inventory-banner">
        <div className="manufacturing-inventory-banner__copy">
          <strong>Inventory-linked BOM</strong>
          <span>Finished items and components come from the same item and inventory records used elsewhere in the app.</span>
        </div>
        <div className="manufacturing-inventory-banner__metrics">
          <div>
            <span>Items</span>
            <strong>{inventorySnapshot.itemCount}</strong>
          </div>
          <div>
            <span>Warehouses</span>
            <strong>{inventorySnapshot.warehouseCount}</strong>
          </div>
          <div>
            <span>Live stock lines</span>
            <strong>{inventorySnapshot.liveQuantCount}</strong>
          </div>
        </div>
      </div>
      <div className="manufacturing-form-grid">
        <label className="manufacturing-field">
          <span>Finished Item</span>
          <select value={bomForm.product_id} onChange={(e) => setBomForm((c) => ({ ...c, product_id: Number(e.target.value) }))}>
            <option value={0}>Select inventory item</option>
            {selectedCompanyProducts.map((product) => (
              <option key={product.id} value={product.id}>{formatProductOption(product)}</option>
            ))}
          </select>
        </label>
        <label className="manufacturing-field">
          <span>Version</span>
          <input value={bomForm.version} onChange={(e) => setBomForm((c) => ({ ...c, version: e.target.value }))} />
        </label>
        <label className="manufacturing-field">
          <span>BOM Code</span>
          <input value={bomForm.code} onChange={(e) => setBomForm((c) => ({ ...c, code: e.target.value }))} />
        </label>
        <label className="manufacturing-field">
          <span>Name</span>
          <input value={bomForm.name} onChange={(e) => setBomForm((c) => ({ ...c, name: e.target.value }))} />
        </label>
        <label className="manufacturing-field">
          <span>Base Quantity</span>
          <input type="number" min="0.01" step="0.01" value={bomForm.quantity} onChange={(e) => setBomForm((c) => ({ ...c, quantity: Number(e.target.value) }))} />
        </label>
        <label className="manufacturing-field">
          <span>Warehouse</span>
          <select value={bomForm.warehouse_id} onChange={(e) => setBomForm((c) => ({ ...c, warehouse_id: Number(e.target.value), output_location_id: 0 }))}>
            <option value={0}>Select warehouse</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
            ))}
          </select>
        </label>
        <label className="manufacturing-field">
          <span>Finished Goods Location</span>
          <select value={bomForm.output_location_id} onChange={(e) => setBomForm((c) => ({ ...c, output_location_id: Number(e.target.value) }))}>
            <option value={0}>Select output location</option>
            {selectedWarehouseLocations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </label>
        <label className="manufacturing-field manufacturing-field--full">
          <span>Notes</span>
          <textarea rows={3} value={bomForm.notes} onChange={(e) => setBomForm((c) => ({ ...c, notes: e.target.value }))} />
        </label>
      </div>
      {selectedFinishedProduct && (
        <div className="manufacturing-product-card">
          <div>
            <div className="manufacturing-product-card__eyebrow">Selected finished item</div>
            <strong>{selectedFinishedProduct.name}</strong>
            <p>
              {selectedFinishedProduct.reference || "No item code"} | {selectedFinishedProduct.uom}
            </p>
          </div>
          <div className="manufacturing-product-card__stats">
            <div>
              <span>Available</span>
              <strong>{formatInventoryNumber(selectedFinishedProduct.quantity_available)}</strong>
            </div>
            <div>
              <span>On hand</span>
              <strong>{formatInventoryNumber(selectedFinishedProduct.quantity_on_hand)}</strong>
            </div>
            <div>
              <span>Stock value</span>
              <strong>{formatInventoryNumber(selectedFinishedProduct.stock_value)}</strong>
            </div>
          </div>
        </div>
      )}

      <div className="manufacturing-subsection">
        <div className="manufacturing-subsection-header">
          <h4>Components</h4>
          <button
            className="o-btn o-btn-secondary"
            onClick={() =>
              setBomLines((current) => [
                ...current,
                { component_product_id: 0, sequence: current.length * 10 + 10, quantity: 1, uom: "Units", scrap_rate_percent: 0, notes: "" },
              ])
            }
          >
            <Plus size={16} /> Add Component
          </button>
        </div>
        <div className="manufacturing-stack">
          {bomLines.map((line, index) => (
            <div className="manufacturing-inline-row" key={index}>
              <select
                value={line.component_product_id}
                onChange={(e) =>
                  setBomLines((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, component_product_id: Number(e.target.value) } : item,
                    ),
                  )
                }
              >
                <option value={0}>Component from inventory</option>
                {selectedCompanyProducts.map((product) => (
                  <option key={product.id} value={product.id}>{formatProductOption(product)}</option>
                ))}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={line.quantity}
                onChange={(e) =>
                  setBomLines((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, quantity: Number(e.target.value) } : item,
                    ),
                  )
                }
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.scrap_rate_percent}
                onChange={(e) =>
                  setBomLines((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, scrap_rate_percent: Number(e.target.value) } : item,
                    ),
                  )
                }
              />
              <button className="o-btn o-btn-danger" onClick={() => setBomLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="manufacturing-subsection">
        <div className="manufacturing-subsection-header">
          <h4>Routing Steps</h4>
          <button
            className="o-btn o-btn-secondary"
            onClick={() =>
              setRoutingSteps((current) => [
                ...current,
                { work_center_id: null, sequence: current.length * 10 + 10, name: "", duration_minutes: 30, instructions: "" },
              ])
            }
          >
            <Plus size={16} /> Add Step
          </button>
        </div>
        <div className="manufacturing-stack">
          {routingSteps.map((step, index) => (
            <div className="manufacturing-inline-row manufacturing-inline-row--routing" key={index}>
              <input
                placeholder="Operation"
                value={step.name}
                onChange={(e) =>
                  setRoutingSteps((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name: e.target.value } : item,
                    ),
                  )
                }
              />
              <select
                value={step.work_center_id || 0}
                onChange={(e) =>
                  setRoutingSteps((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, work_center_id: Number(e.target.value) || null } : item,
                    ),
                  )
                }
              >
                <option value={0}>Work center</option>
                {workCenters.map((workCenter) => (
                  <option key={workCenter.id} value={workCenter.id}>{workCenter.name}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={step.duration_minutes}
                onChange={(e) =>
                  setRoutingSteps((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, duration_minutes: Number(e.target.value) } : item,
                    ),
                  )
                }
              />
              <button className="o-btn o-btn-danger" onClick={() => setRoutingSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="manufacturing-actions">
        <button className="o-btn o-btn-primary" onClick={createBOM}>
          <Factory size={16} /> {editingBOMId ? "Save BOM" : "Create BOM"}
        </button>
      </div>
    </section>
  );

  const renderBOMList = () => (
    <section className="manufacturing-panel manufacturing-page-panel">
      <div className="manufacturing-panel-header">
        <div>
          <h3>Bills of Materials</h3>
          <p>Configured manufacturing recipes using inventory items.</p>
        </div>
        <button
          className="o-btn o-btn-primary"
          onClick={() => {
            setEditingBOMId(null);
            setBomScreen("form");
          }}
        >
          <Plus size={16} /> New BOM
        </button>
      </div>
      <div className="manufacturing-stack">
        {boms.map((bom) => (
          <article className="manufacturing-record" key={bom.id}>
            <div className="manufacturing-record-header">
              <div>
                <h4>{bom.name || productById[bom.product_id]?.name || `BOM ${bom.id}`}</h4>
                <p>{bom.code || "No code"} | Version {bom.version} | Base Qty {bom.quantity}</p>
              </div>
              <span className={`manufacturing-badge ${bom.is_active ? "active" : "inactive"}`}>
                {bom.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="manufacturing-record-body">
              <div>
                <strong>Components</strong>
                <p>{bom.lines.map((line) => `${productById[line.component_product_id]?.name || line.component_product_id} x ${line.quantity}`).join(", ")}</p>
              </div>
              <div>
                <strong>Routing</strong>
                <p>{bom.steps.length ? bom.steps.map((step) => `${step.name} (${step.duration_minutes} min)`).join(", ") : "No routing steps"}</p>
              </div>
            </div>
            <div className="manufacturing-actions">
              <button className="o-btn o-btn-secondary" onClick={() => startEditBOM(bom)}>Edit</button>
              <button className="o-btn o-btn-danger" onClick={() => deleteBOM(bom)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  const renderBOMs = () => (
    <div className="manufacturing-page">
      {bomScreen === "form" ? renderBOMForm() : renderBOMList()}
    </div>
  );

  const renderOrderForm = () => (
    <section className="manufacturing-panel manufacturing-form-panel manufacturing-page-panel">
      <div className="manufacturing-panel-header">
        <div>
          <h3>New Production Order</h3>
          <p>Launch work orders from an existing bill of materials.</p>
        </div>
        <button className="o-btn o-btn-secondary" onClick={resetOrderForm}>
          Back to Orders
        </button>
      </div>
      <div className="manufacturing-form-grid">
        <label className="manufacturing-field manufacturing-field--full">
          <span>BOM</span>
          <select value={orderForm.bom_id} onChange={(e) => setOrderForm((c) => ({ ...c, bom_id: Number(e.target.value) }))}>
            <option value={0}>Select BOM</option>
            {boms.map((bom) => (
              <option key={bom.id} value={bom.id}>
                {bom.name || productById[bom.product_id]?.name}
              </option>
            ))}
          </select>
        </label>
        <label className="manufacturing-field">
          <span>Planned Quantity</span>
          <input type="number" min="0.01" step="0.01" value={orderForm.planned_quantity} onChange={(e) => setOrderForm((c) => ({ ...c, planned_quantity: Number(e.target.value) }))} />
        </label>
        <label className="manufacturing-field">
          <span>Priority</span>
          <select value={orderForm.priority} onChange={(e) => setOrderForm((c) => ({ ...c, priority: e.target.value }))}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="manufacturing-field">
          <span>Scheduled Start</span>
          <input type="datetime-local" value={orderForm.scheduled_start} onChange={(e) => setOrderForm((c) => ({ ...c, scheduled_start: e.target.value }))} />
        </label>
        <label className="manufacturing-field">
          <span>Scheduled End</span>
          <input type="datetime-local" value={orderForm.scheduled_end} onChange={(e) => setOrderForm((c) => ({ ...c, scheduled_end: e.target.value }))} />
        </label>
        <label className="manufacturing-field manufacturing-field--full">
          <span>Notes</span>
          <textarea rows={3} value={orderForm.notes} onChange={(e) => setOrderForm((c) => ({ ...c, notes: e.target.value }))} />
        </label>
      </div>
      <div className="manufacturing-actions">
        <button className="o-btn o-btn-primary" onClick={createOrder}>
          <Hammer size={16} /> Create Order
        </button>
      </div>
    </section>
  );

  const renderOrderList = () => (
    <section className="manufacturing-panel manufacturing-page-panel">
      <div className="manufacturing-panel-header">
        <div>
          <h3>Production Orders</h3>
          <p>Execution, traceability, and finished goods recording.</p>
        </div>
        <button className="o-btn o-btn-primary" onClick={() => setOrderScreen("form")}>
          <Plus size={16} /> New Order
        </button>
      </div>
      <div className="manufacturing-stack">
        {orders.map((order) => {
          const bom = bomById[order.bom_id];
          return (
            <article className="manufacturing-order" key={order.id}>
              <div className="manufacturing-record-header">
                <div>
                  <h4>{order.reference}</h4>
                  <p>{productById[order.product_id]?.name || `Product ${order.product_id}`} | {warehouseById[order.warehouse_id || 0]?.name || "-"}</p>
                </div>
                <span className={`manufacturing-state manufacturing-state--${order.state}`}>{formatStateLabel(order.state)}</span>
              </div>

              <div className="manufacturing-order-links">
                <div>
                  <span>Source</span>
                  <strong>{locationById[order.source_location_id || 0]?.name || "-"}</strong>
                </div>
                <div>
                  <span>Finished goods</span>
                  <strong>{locationById[order.output_location_id || 0]?.name || "-"}</strong>
                </div>
                <div>
                  <span>Inventory item</span>
                  <strong>{productById[order.product_id]?.reference || productById[order.product_id]?.uom || "-"}</strong>
                </div>
              </div>

              <div className="manufacturing-order-metrics">
                <div><span>Planned</span><strong>{order.planned_quantity}</strong></div>
                <div><span>Produced</span><strong>{order.produced_quantity}</strong></div>
                <div><span>Scrap</span><strong>{order.scrapped_quantity}</strong></div>
                <div><span>Priority</span><strong>{order.priority}</strong></div>
              </div>

              <div className="manufacturing-order-section">
                <h5>Materials</h5>
                <div className="manufacturing-stack">
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
                      <div className="manufacturing-trace-card" key={material.id}>
                        <div className="manufacturing-trace-head">
                          <strong>{productById[material.component_product_id]?.name || material.component_product_id}</strong>
                          <span>{material.consumed_quantity}/{material.planned_quantity} {material.uom}</span>
                        </div>
                        <p className="manufacturing-muted">Source location: {locationName}</p>
                        <div className="manufacturing-trace-grid">
                          <input
                            list={`material-lots-${material.id}`}
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
                            placeholder="Notes"
                            value={traceability.notes}
                            onChange={(e) =>
                              setMaterialTraceability((current) => ({
                                ...current,
                                [material.id]: { ...traceability, notes: e.target.value },
                              }))
                            }
                          />
                          <button className="o-btn o-btn-secondary" onClick={() => saveMaterialTraceability(order.id, material.id)}>
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="manufacturing-order-section">
                <h5>Operations</h5>
                <div className="manufacturing-stack">
                  {order.operations.length ? (
                    order.operations.map((operation) => (
                      <div className="manufacturing-operation-card" key={operation.id}>
                        <div className="manufacturing-trace-head">
                          <strong>{operation.name}</strong>
                          <span className={`manufacturing-state manufacturing-state--${operation.status}`}>{formatStateLabel(operation.status)}</span>
                        </div>
                        <div className="manufacturing-operation-meta">
                          <span>Planned: {operation.planned_duration_minutes} min</span>
                          <span>Actual: {operation.actual_duration_minutes} min</span>
                          <span>Center: {operation.work_center_id ? workCenters.find((item) => item.id === operation.work_center_id)?.name || operation.work_center_id : "-"}</span>
                        </div>
                        <div className="manufacturing-inline-actions">
                          <input
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
                            <button className="o-btn o-btn-secondary" onClick={() => updateOperation(order.id, operation.id, {}, "start")}>
                              <Play size={16} /> Start
                            </button>
                          )}
                          {operation.status !== "done" && (
                            <button className="o-btn o-btn-success" onClick={() => updateOperation(order.id, operation.id, {}, "complete")}>
                              <CheckCircle2 size={16} /> Complete
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="manufacturing-empty">
                      {bom?.steps.length ? bom.steps.map((step) => step.name).join(", ") : "No routing steps"}
                    </div>
                  )}
                </div>
              </div>

              <div className="manufacturing-order-section">
                <h5>Finished Goods and Scrap</h5>
                <div className="manufacturing-production-grid">
                  <input
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
                  <button className="o-btn o-btn-primary" onClick={() => recordProduction(order.id)}>
                    Record
                  </button>
                </div>
              </div>

              <div className="manufacturing-actions">
                {order.state !== "done" && order.state !== "cancelled" && (
                  <button className="o-btn o-btn-secondary" onClick={() => runOrderAction(order.id, "release")}>
                    <Play size={16} /> Release
                  </button>
                )}
                {order.state !== "done" && order.state !== "cancelled" && (
                  <button className="o-btn o-btn-success" onClick={() => runOrderAction(order.id, "complete")}>
                    <CheckCircle2 size={16} /> Complete
                  </button>
                )}
                {order.state !== "done" && order.state !== "cancelled" && (
                  <button className="o-btn o-btn-danger" onClick={() => runOrderAction(order.id, "cancel")}>
                    <XCircle size={16} /> Cancel
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );

  const renderOrders = () => (
    <div className="manufacturing-page">
      {orderScreen === "form" ? renderOrderForm() : renderOrderList()}
    </div>
  );

  const renderWorkCenterForm = () => (
    <section className="manufacturing-panel manufacturing-form-panel manufacturing-page-panel">
      <div className="manufacturing-panel-header">
        <div>
          <h3>New Work Center</h3>
          <p>Define capacity and operating cost for production resources.</p>
        </div>
        <button
          className="o-btn o-btn-secondary"
          onClick={() => {
            setWorkCenterScreen("list");
            setWorkCenterForm({
              name: "",
              code: "",
              capacity_per_cycle: 1,
              hourly_cost: 0,
              efficiency_percent: 100,
              time_uom: "hours",
              notes: "",
            });
          }}
        >
          Back to Work Centers
        </button>
      </div>
      <div className="manufacturing-form-grid">
        <label className="manufacturing-field">
          <span>Name</span>
          <input value={workCenterForm.name} onChange={(e) => setWorkCenterForm((c) => ({ ...c, name: e.target.value }))} />
        </label>
        <label className="manufacturing-field">
          <span>Code</span>
          <input value={workCenterForm.code} onChange={(e) => setWorkCenterForm((c) => ({ ...c, code: e.target.value }))} />
        </label>
        <label className="manufacturing-field">
          <span>Capacity Per Cycle</span>
          <input type="number" min="0" value={workCenterForm.capacity_per_cycle} onChange={(e) => setWorkCenterForm((c) => ({ ...c, capacity_per_cycle: Number(e.target.value) }))} />
        </label>
        <label className="manufacturing-field">
          <span>Hourly Cost</span>
          <input type="number" min="0" value={workCenterForm.hourly_cost} onChange={(e) => setWorkCenterForm((c) => ({ ...c, hourly_cost: Number(e.target.value) }))} />
        </label>
        <label className="manufacturing-field">
          <span>Efficiency %</span>
          <input type="number" min="0" value={workCenterForm.efficiency_percent} onChange={(e) => setWorkCenterForm((c) => ({ ...c, efficiency_percent: Number(e.target.value) }))} />
        </label>
        <label className="manufacturing-field">
          <span>Time Unit</span>
          <input value={workCenterForm.time_uom} onChange={(e) => setWorkCenterForm((c) => ({ ...c, time_uom: e.target.value }))} />
        </label>
        <label className="manufacturing-field manufacturing-field--full">
          <span>Notes</span>
          <textarea rows={3} value={workCenterForm.notes} onChange={(e) => setWorkCenterForm((c) => ({ ...c, notes: e.target.value }))} />
        </label>
      </div>
      <div className="manufacturing-actions">
        <button className="o-btn o-btn-primary" onClick={createWorkCenter}>
          <Plus size={16} /> Create Work Center
        </button>
      </div>
    </section>
  );

  const renderWorkCenterList = () => (
    <section className="manufacturing-panel manufacturing-page-panel">
      <div className="manufacturing-panel-header">
        <div>
          <h3>Configured Work Centers</h3>
          <p>Centers available to routing and production planning.</p>
        </div>
        <button className="o-btn o-btn-primary" onClick={() => setWorkCenterScreen("form")}>
          <Plus size={16} /> New Work Center
        </button>
      </div>
      <div className="manufacturing-table-wrap">
        <table className="manufacturing-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Capacity</th>
              <th>Hourly Cost</th>
              <th>Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {workCenters.map((workCenter) => (
              <tr key={workCenter.id}>
                <td>{workCenter.name}</td>
                <td>{workCenter.code || "-"}</td>
                <td>{workCenter.capacity_per_cycle}</td>
                <td>{workCenter.hourly_cost}</td>
                <td>{workCenter.efficiency_percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderWorkCenters = () => (
    <div className="manufacturing-page">
      {workCenterScreen === "form" ? renderWorkCenterForm() : renderWorkCenterList()}
    </div>
  );

  const renderContent = () => {
    if (loading) {
      return <div className="manufacturing-empty">Loading manufacturing workspace...</div>;
    }
    if (activeView === "overview") return renderOverview();
    if (activeView === "boms") return renderBOMs();
    if (activeView === "orders") return renderOrders();
    return renderWorkCenters();
  };

  return (
    <div className="two-panel two-panel-left manufacturing-workspace">
      <Sidebar sections={menuSections} />
      <div className="o-content manufacturing-content">
        <div className="o-control-panel manufacturing-toolbar">
          <div className="o-control-panel-left manufacturing-toolbar-left">
            <div>
              <div className="manufacturing-eyebrow">Manufacturing</div>
              <h2 className="manufacturing-title">Production, materials, and finished goods</h2>
            </div>
            <div className="manufacturing-top-metrics">
              <div className="manufacturing-top-metric">
                <span>Inventory items</span>
                <strong>{inventorySnapshot.itemCount}</strong>
              </div>
              <div className="manufacturing-top-metric">
                <span>Available qty</span>
                <strong>{formatInventoryNumber(inventorySnapshot.totalAvailable)}</strong>
              </div>
              <div className="manufacturing-top-metric">
                <span>Warehouses</span>
                <strong>{inventorySnapshot.warehouseCount}</strong>
              </div>
            </div>
          </div>
          <div className="o-control-panel-right manufacturing-toolbar-right">
            {availableCompanies.map((company) => (
              <button
                key={company.id}
                className={`manufacturing-company-chip ${selectedCompanyId === company.id ? "active" : ""}`}
                onClick={() => setSelectedCompanyId(company.id)}
              >
                {company.name}
              </button>
            ))}
            <button className="o-btn o-btn-secondary" onClick={() => navigate("/inventory")}>
              <ShoppingBasket size={16} /> Open Inventory
            </button>
          </div>
        </div>

        <div className="manufacturing-view">{renderContent()}</div>
      </div>
    </div>
  );
}
