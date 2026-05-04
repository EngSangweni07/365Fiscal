import { Fragment, useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchWithTotal, apiRequest } from "../api";
import { useCompanies, Company } from "../hooks/useCompanies";
import { useListView } from "../context/ListViewContext";
import BackButton from "../components/BackButton";
import { TablePagination } from "../components/TablePagination";

import { Trash2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Device = {
  id: number;
  company_id: number;
  device_id: string;
  serial_number: string;
  model: string;
  activation_key: string;
  activation_date?: string | null;
  crt_filename: string;
  key_filename: string;
  fiscal_day_status: string;
  current_fiscal_day_no: number;
  last_fiscal_day_no: number;
  last_receipt_counter: number;
  last_receipt_global_no: number;
};

type DeviceMessage = {
  type: "success" | "error" | "info";
  text: string;
  timestamp: number;
};

type GroupedDevices = { label: string; items: Device[] };

type PageView = "companies" | "devices" | "new-device" | "edit-device";

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

const BuildingIcon = () => (
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
);

const ChevronRight = () => (
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
);

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
    width="14"
    height="14"
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
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="size-6"
    width="16"
    height="16"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
    />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ACTION_LABELS: Record<string, string> = {
  status: "Get Status",
  config: "Get Config",
  ping: "Ping",
  register: "Register",
  "open-day": "Open Day",
  "close-day": "Close Day",
};

function parseErrorDetail(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    // FastAPI wraps errors in { detail: "..." }
    if (parsed.detail) {
      const detail = String(parsed.detail);
      // Check for FDMS bracketed error code: [FISC01] message
      const bracketMatch = detail.match(/^\[([A-Z0-9]+)\]\s*(.+)$/i);
      if (bracketMatch) return `${bracketMatch[1]}: ${bracketMatch[2]}`;
      // Check for embedded JSON in the detail
      const jsonIdx = detail.indexOf("{");
      if (jsonIdx >= 0) {
        try {
          const inner = JSON.parse(detail.slice(jsonIdx));
          const msg = inner.message || "";
          const code = inner.errorCode || "";
          if (msg && code) return `${code}: ${msg}`;
          if (msg) return msg;
        } catch { /* not parseable */ }
      }
      return detail.replace(/^FDMS error \d+:\s*/i, "");
    }
    if (parsed.title && parsed.errors) {
      const msgs = Object.entries(parsed.errors)
        .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
        .join("; ");
      return `${parsed.title} – ${msgs}`;
    }
    // Direct FDMS error object
    if (parsed.message && parsed.errorCode) {
      return `${parsed.errorCode}: ${parsed.message}`;
    }
    if (parsed.message) return parsed.message;
    return raw;
  } catch {
    return raw;
  }
}

function formatResponse(action: string, raw: string): string {
  const label = ACTION_LABELS[action] || action;
  try {
    const data = JSON.parse(raw);
    const parts: string[] = [];
    if (data.operationID) parts.push(`Op: ${data.operationID}`);
    if (data.fiscalDayStatus) parts.push(`Day: ${data.fiscalDayStatus}`);
    if (data.lastFiscalDayNo !== undefined)
      parts.push(`Day #${data.lastFiscalDayNo}`);
    if (data.lastReceiptGlobalNo !== undefined)
      parts.push(`Receipt #${data.lastReceiptGlobalNo}`);
    if (data.reportingFrequency !== undefined)
      parts.push(`Ping in ${data.reportingFrequency}m`);
    if (data.taxPayerName) parts.push(data.taxPayerName);
    if (data.certificateValidTill)
      parts.push(`Cert → ${data.certificateValidTill}`);
    if (data.qrUrl) parts.push(`QR: ${data.qrUrl}`);
    if (data.serverDate) parts.push(`Server: ${data.serverDate}`);
    if (parts.length) return `${label} ✓ — ${parts.join(" · ")}`;
    return `${label} ✓`;
  } catch {
    return raw || `${label} completed`;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DevicesPage() {
  const { companies, loading: companiesLoading } = useCompanies();
  const { state } = useListView();

  /* ---- navigation state ---- */
  const [view, setView] = useState<PageView>("companies");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");


  /* ---- data ---- */
  const [devices, setDevices] = useState<Device[]>([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [devicesPage, setDevicesPage] = useState(1);
  const [devicesPageSize, setDevicesPageSize] = useState(10);
  const [certStatus, setCertStatus] = useState<"loading" | "ready" | "missing">(
    "loading",
  );
  const [certInfo, setCertInfo] = useState<{ crt?: string; key?: string }>({});

  /* ---- create-device form ---- */
  const [form, setForm] = useState({
    device_id: "",
    serial_number: "",
    model: "",
    activation_key: "",
    activation_date: "",
  });

  /* ---- UI state ---- */
  const [globalMsg, setGlobalMsg] = useState<DeviceMessage | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editForm, setEditForm] = useState({
    device_id: "",
    serial_number: "",
    model: "",
    activation_key: "",
    activation_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Device | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [actionLog, setActionLog] = useState<DeviceMessage[]>([]);
  const [deviceMessages, setDeviceMessages] = useState<
    Record<number, DeviceMessage>
  >({});

  /* ---- auto-clear messages ---- */
  useEffect(() => {
    if (!globalMsg) return;
    const t = setTimeout(() => setGlobalMsg(null), 8000);
    return () => clearTimeout(t);
  }, [globalMsg]);

  useEffect(() => {
    if (!Object.keys(deviceMessages).length) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setDeviceMessages((prev) => {
        const next: Record<number, DeviceMessage> = {};
        for (const [k, v] of Object.entries(prev))
          if (now - v.timestamp < 15_000) next[Number(k)] = v;
        return next;
      });
    }, 15_000);
    return () => clearTimeout(t);
  }, [deviceMessages]);

  /* ---- select a company → go to device view ---- */
  const openCompany = (c: Company) => {
    setSelectedCompany(c);
    setView("devices");
    setDevices([]);
    setDevicesPage(1);
    setActionLog([]);
    setDeviceMessages({});
    setGlobalMsg(null);
  };

  const goBack = () => {
    setView("companies");
    setSelectedCompany(null);
  };

  /* ---- load devices ---- */
  const loadDevices = async (cid: number) => {
    setLoadingDevices(true);
    const params = new URLSearchParams({ company_id: String(cid) });
    state.filters.forEach((chip) =>
      Object.entries(chip.params).forEach(([key, value]) =>
        params.set(key, value),
      ),
    );
    params.set("limit", String(devicesPageSize));
    params.set("offset", String((devicesPage - 1) * devicesPageSize));
    try {
      const { data, total } = await apiFetchWithTotal<Device[]>(
        `/devices?${params.toString()}`,
      );
      setDevices(data);
      setTotalDevices(total);
    } catch (err: any) {
      pushGlobal("error", err.message || "Failed to load devices");
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    if (selectedCompany && view === "devices") {
      const t = setTimeout(() => loadDevices(selectedCompany.id), 200);
      return () => clearTimeout(t);
    }
  }, [selectedCompany, view, state.filters, devicesPage, devicesPageSize]);

  useEffect(() => {
    setDevicesPage(1);
  }, [selectedCompany, state.filters, devicesPageSize]);

  /* ---- cert status ---- */
  useEffect(() => {
    if (!selectedCompany) return;
    (async () => {
      try {
        setCertStatus("loading");
        const cert = await apiFetch<{
          crt_filename?: string;
          key_filename?: string;
        } | null>(`/company-certificates?company_id=${selectedCompany.id}`);
        setCertInfo({
          crt: cert?.crt_filename ?? undefined,
          key: cert?.key_filename ?? undefined,
        });
        setCertStatus(
          cert?.crt_filename && cert?.key_filename ? "ready" : "missing",
        );
      } catch {
        setCertStatus("missing");
        setCertInfo({});
      }
    })();
  }, [selectedCompany]);

  /* ---- message helpers ---- */
  const pushGlobal = (type: DeviceMessage["type"], text: string) =>
    setGlobalMsg({ type, text, timestamp: Date.now() });
  const pushLog = (type: DeviceMessage["type"], text: string) =>
    setActionLog((prev) =>
      [{ type, text, timestamp: Date.now() }, ...prev].slice(0, 20),
    );
  const pushDeviceMsg = (
    id: number,
    type: DeviceMessage["type"],
    text: string,
  ) =>
    setDeviceMessages((prev) => ({
      ...prev,
      [id]: { type, text, timestamp: Date.now() },
    }));
  const setLoading = (key: string, on: boolean) =>
    setActionLoading((prev) => ({ ...prev, [key]: on }));

  /* ---- upload company cert ---- */
  const uploadCompanyCert = async (type: "crt" | "key", file: File) => {
    if (!selectedCompany) return;
    const fd = new FormData();
    fd.append(type, file);
    try {
      const res = await apiRequest(
        `/company-certificates/${selectedCompany.id}/${type}`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        pushGlobal(
          "error",
          parseErrorDetail(await res.text()) || "Upload failed",
        );
        return;
      }
      pushGlobal("success", `${type.toUpperCase()} certificate uploaded`);
      pushLog("success", `Company ${type.toUpperCase()} certificate uploaded`);
      const updated = await apiFetch<{
        crt_filename?: string;
        key_filename?: string;
      } | null>(`/company-certificates?company_id=${selectedCompany.id}`);
      setCertInfo({
        crt: updated?.crt_filename ?? undefined,
        key: updated?.key_filename ?? undefined,
      });
      setCertStatus(
        updated?.crt_filename && updated?.key_filename ? "ready" : "missing",
      );
    } catch (err: any) {
      pushGlobal("error", err.message || "Upload failed");
    }
  };

  /* ---- create device ---- */
  const createDevice = async () => {
    if (!selectedCompany) return;
    if (!form.device_id.trim())
      return pushGlobal("error", "Device ID is required");
    if (!form.serial_number.trim())
      return pushGlobal("error", "Serial Number is required");
    if (!form.model.trim()) return pushGlobal("error", "Model is required");
    try {
      setCreating(true);
      setGlobalMsg(null);
      await apiFetch<Device>("/devices", {
        method: "POST",
        body: JSON.stringify({ ...form, company_id: selectedCompany.id }),
      });
      setForm({
        device_id: "",
        serial_number: "",
        model: "",
        activation_key: "",
        activation_date: "",
      });
      pushGlobal("success", "Device created successfully");
      pushLog("success", `Device ${form.device_id} created`);
      setView("devices");
      loadDevices(selectedCompany.id);
    } catch (err: any) {
      pushGlobal(
        "error",
        parseErrorDetail(err.message) || "Failed to create device",
      );
    } finally {
      setCreating(false);
    }
  };

  /* ---- edit device ---- */
  const startEdit = (d: Device) => {
    setEditingDevice(d);
    setEditForm({
      device_id: d.device_id,
      serial_number: d.serial_number,
      model: d.model,
      activation_key: d.activation_key || "",
      activation_date: d.activation_date ? d.activation_date.slice(0, 10) : "",
    });
    setView("edit-device");
  };

  const updateDevice = async () => {
    if (!editingDevice || !selectedCompany) return;
    if (!editForm.device_id.trim())
      return pushGlobal("error", "Device ID is required");
    if (!editForm.serial_number.trim())
      return pushGlobal("error", "Serial Number is required");
    if (!editForm.model.trim()) return pushGlobal("error", "Model is required");
    try {
      setSaving(true);
      setGlobalMsg(null);
      await apiFetch<Device>(`/devices/${editingDevice.id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      pushGlobal("success", "Device updated successfully");
      pushLog("success", `Device ${editForm.device_id} updated`);
      setEditingDevice(null);
      setView("devices");
      loadDevices(selectedCompany.id);
    } catch (err: any) {
      pushGlobal(
        "error",
        parseErrorDetail(err.message) || "Failed to update device",
      );
    } finally {
      setSaving(false);
    }
  };

  /* ---- delete device ---- */
  const deleteDevice = async (d: Device) => {
    if (!selectedCompany) return;
    try {
      setDeleting(d.id);
      await apiRequest(`/devices/${d.id}`, { method: "DELETE" });
      pushGlobal("success", `Device ${d.device_id} deleted`);
      pushLog("success", `Device ${d.device_id} deleted`);
      setConfirmDelete(null);
      loadDevices(selectedCompany.id);
    } catch (err: any) {
      pushGlobal(
        "error",
        parseErrorDetail(err.message) || "Failed to delete device",
      );
    } finally {
      setDeleting(null);
    }
  };

  /* ---- upload device cert ---- */
  const uploadCert = async (
    deviceId: number,
    type: "crt" | "key",
    file: File,
  ) => {
    const fd = new FormData();
    fd.append(type, file);
    try {
      const res = await apiRequest(`/devices/${deviceId}/${type}`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        pushDeviceMsg(deviceId, "success", `${type.toUpperCase()} uploaded`);
        pushLog(
          "success",
          `Device #${deviceId} ${type.toUpperCase()} uploaded`,
        );
        if (selectedCompany) loadDevices(selectedCompany.id);
      } else {
        pushDeviceMsg(
          deviceId,
          "error",
          parseErrorDetail(await res.text()) || "Upload failed",
        );
      }
    } catch (err: any) {
      pushDeviceMsg(deviceId, "error", err.message || "Upload failed");
    }
  };

  /* ---- FDMS action ---- */
  const runAction = async (
    deviceId: number,
    action: string,
    method: "GET" | "POST" = "GET",
  ) => {
    const key = `${deviceId}-${action}`;
    const label = ACTION_LABELS[action] || action;
    setLoading(key, true);
    pushDeviceMsg(deviceId, "info", `Running ${label}…`);
    try {
      const res = await apiRequest(`/devices/${deviceId}/${action}`, {
        method,
      });
      const text = await res.text();
      if (!res.ok) {
        const msg = parseErrorDetail(text) || `${label} failed`;
        pushDeviceMsg(deviceId, "error", msg);
        pushLog("error", `${label} – ${msg}`);
      } else {
        const msg = formatResponse(action, text);
        pushDeviceMsg(deviceId, "success", msg);
        pushLog("success", msg);
      }
      if (selectedCompany) loadDevices(selectedCompany.id);
    } catch (err: any) {
      const msg = err.message || `${label} failed`;
      pushDeviceMsg(deviceId, "error", msg);
      pushLog("error", `${label} – ${msg}`);
    } finally {
      setLoading(key, false);
    }
  };

  /* ---- display helpers ---- */
  const fmtStatus = (s: string) => {
    if (s === "open" || s === "FiscalDayOpened") return "Open";
    if (s === "closed" || s === "FiscalDayClosed") return "Closed";
    return s || "—";
  };

  const grouped = useMemo<GroupedDevices[]>(() => {
    if (!state.groupBy || state.groupBy === "")
      return [{ label: "", items: devices }];
    if (state.groupBy === "status") {
      return [
        {
          label: "Open Day",
          items: devices.filter((d) => d.fiscal_day_status === "open"),
        },
        {
          label: "Closed Day",
          items: devices.filter((d) => d.fiscal_day_status !== "open"),
        },
      ];
    }
    return [{ label: "", items: devices }];
  }, [devices, state.groupBy]);

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.name, c.vat, c.tin].some((value) =>
        value ? String(value).toLowerCase().includes(q) : false,
      ),
    );
  }, [companies, companyQuery]);

  const isLoading = (id: number, action: string) =>
    !!actionLoading[`${id}-${action}`];

  /* ================================================================ */
  /*  VIEW: Company Grid                                               */
  /* ================================================================ */

  if (companiesLoading) {
    return <div className="loading-indicator">Loading companies...</div>;
  }

  if (view === "companies") {
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
              onClick={() => openCompany(c)}
            >
              <div className="device-company-icon">
                <BuildingIcon />
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
                <ChevronRight />
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

  /* ================================================================ */
  /*  VIEW: New Device Form                                            */
  /* ================================================================ */

  if (view === "new-device" && selectedCompany) {
    return (
      <div className="content">
        {/* breadcrumb */}
        <div className="o-control-panel" style={{ marginBottom: 24 }}>
          <div className="o-breadcrumb">
            <span className="o-breadcrumb-item" onClick={goBack}>
              Devices
            </span>
            <span className="o-breadcrumb-separator">
              <ChevronRight />
            </span>
            <span
              className="o-breadcrumb-item"
              onClick={() => setView("devices")}
            >
              {selectedCompany.name}
            </span>
            <span className="o-breadcrumb-separator">
              <ChevronRight />
            </span>
            <span className="o-breadcrumb-current">New Device</span>
          </div>
        </div>

        {/* global alert */}
        {globalMsg && (
          <div
            className={`alert ${globalMsg.type === "success" ? "alert-success" : globalMsg.type === "error" ? "alert-error" : ""}`}
            style={{ marginBottom: 16 }}
          >
            {globalMsg.text}
          </div>
        )}

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>
            Add Device to {selectedCompany.name}
          </h3>

          <div className="form-grid">
            <label className="input">
              Device ID <span style={{ color: "var(--danger)" }}>*</span>
              <input
                value={form.device_id}
                placeholder="e.g. 12345"
                onChange={(e) =>
                  setForm({ ...form, device_id: e.target.value })
                }
              />
            </label>
            <label className="input">
              Serial Number <span style={{ color: "var(--danger)" }}>*</span>
              <input
                value={form.serial_number}
                placeholder="e.g. SN-001"
                onChange={(e) =>
                  setForm({ ...form, serial_number: e.target.value })
                }
              />
            </label>
            <label className="input">
              Model <span style={{ color: "var(--danger)" }}>*</span>
              <input
                value={form.model}
                placeholder="e.g. Three65"
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </label>
            <label className="input">
              Activation Key
              <input
                value={form.activation_key}
                placeholder="e.g. ABCD1234"
                maxLength={8}
                style={{ textTransform: "uppercase" }}
                onChange={(e) =>
                  setForm({
                    ...form,
                    activation_key: e.target.value.toUpperCase(),
                  })
                }
              />
            </label>
            <label className="input">
              Activation Date
              <input
                type="date"
                value={form.activation_date}
                onChange={(e) =>
                  setForm({ ...form, activation_date: e.target.value })
                }
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              className="primary"
              onClick={createDevice}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create Device"}
            </button>
            <button className="outline" onClick={() => setView("devices")}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  VIEW: Edit Device Form                                           */
  /* ================================================================ */

  if (view === "edit-device" && selectedCompany && editingDevice) {
    return (
      <div className="content">
        <div className="o-control-panel" style={{ marginBottom: 24 }}>
          <div className="o-breadcrumb">
            <span className="o-breadcrumb-item" onClick={goBack}>
              Devices
            </span>
            <span className="o-breadcrumb-separator">
              <ChevronRight />
            </span>
            <span
              className="o-breadcrumb-item"
              onClick={() => setView("devices")}
            >
              {selectedCompany.name}
            </span>
            <span className="o-breadcrumb-separator">
              <ChevronRight />
            </span>
            <span className="o-breadcrumb-current">
              Edit Device {editingDevice.device_id}
            </span>
          </div>
        </div>

        {globalMsg && (
          <div
            className={`alert ${globalMsg.type === "success" ? "alert-success" : globalMsg.type === "error" ? "alert-error" : ""}`}
            style={{ marginBottom: 16 }}
          >
            {globalMsg.text}
          </div>
        )}

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>
            Edit Device {editingDevice.device_id}
          </h3>

          <div className="form-grid">
            <label className="input">
              Device ID <span style={{ color: "var(--danger)" }}>*</span>
              <input
                value={editForm.device_id}
                placeholder="e.g. 12345"
                onChange={(e) =>
                  setEditForm({ ...editForm, device_id: e.target.value })
                }
              />
            </label>
            <label className="input">
              Serial Number <span style={{ color: "var(--danger)" }}>*</span>
              <input
                value={editForm.serial_number}
                placeholder="e.g. SN-001"
                onChange={(e) =>
                  setEditForm({ ...editForm, serial_number: e.target.value })
                }
              />
            </label>
            <label className="input">
              Model <span style={{ color: "var(--danger)" }}>*</span>
              <input
                value={editForm.model}
                placeholder="e.g. Three65"
                onChange={(e) =>
                  setEditForm({ ...editForm, model: e.target.value })
                }
              />
            </label>
            <label className="input">
              Activation Key
              <input
                value={editForm.activation_key}
                placeholder="e.g. ABCD1234"
                maxLength={8}
                style={{ textTransform: "uppercase" }}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    activation_key: e.target.value.toUpperCase(),
                  })
                }
              />
            </label>
            <label className="input">
              Activation Date
              <input
                type="date"
                value={editForm.activation_date}
                onChange={(e) =>
                  setEditForm({ ...editForm, activation_date: e.target.value })
                }
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              className="primary"
              onClick={updateDevice}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              className="outline"
              onClick={() => {
                setEditingDevice(null);
                setView("devices");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  VIEW: Device List for selected company                           */
  /* ================================================================ */

  return (
    <div className="content">
      {/* breadcrumb + actions bar */}
      <div
        className="o-control-panel"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 20,
          width: "98%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flex: 1,
          }}
        >
          <BackButton
            className="outline"
            onBack={goBack}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 10px",
            }}
            title="Back"
            ariaLabel="Back"
          >
            Back
          </BackButton>
          <div className="o-breadcrumb">
            <span className="o-breadcrumb-item" onClick={goBack}>
              Devices
            </span>
            <span className="o-breadcrumb-separator">
              <ChevronRight />
            </span>
            <span className="o-breadcrumb-current">
              {selectedCompany?.name}
            </span>
          </div>
        </div>
        <button
          className="primary"
          onClick={() => setView("new-device")}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <PlusIcon /> New Device
        </button>
      </div>

      {/* global alert */}
      {globalMsg && (
        <div
          className={`alert ${globalMsg.type === "success" ? "alert-success" : globalMsg.type === "error" ? "alert-error" : ""}`}
          style={{ marginBottom: 16 }}
        >
          {globalMsg.text}
        </div>
      )}

      {/* cert status card */}
      {/* <div className="card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <h4 style={{ margin: "0 0 8px" }}>Company Certificate</h4>
            {certStatus === "loading" && (
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                Checking…
              </span>
            )}
            {certStatus === "ready" && (
              <span style={{ color: "var(--success, var(--green-500))", fontSize: 13 }}>
                ✓ Certificate and key are configured
              </span>
            )}
            {certStatus === "missing" && (
              <span style={{ color: "var(--danger, var(--orange-700))", fontSize: 13 }}>
                ⚠ Certificate or key missing — upload below
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label className="device-cert-upload">
              <span className="device-cert-label">
                CRT: {certInfo.crt || "—"}
              </span>
              <input
                type="file"
                accept=".crt,.pem,.cer"
                onChange={(e) =>
                  e.target.files?.[0] &&
                  uploadCompanyCert("crt", e.target.files[0])
                }
              />
            </label>
            <label className="device-cert-upload">
              <span className="device-cert-label">
                KEY: {certInfo.key || "—"}
              </span>
              <input
                type="file"
                accept=".key,.pem"
                onChange={(e) =>
                  e.target.files?.[0] &&
                  uploadCompanyCert("key", e.target.files[0])
                }
              />
            </label>
          </div>
        </div>
      </div> */}

      {/* device cards */}
      {loadingDevices && (
        <p style={{ color: "var(--muted)", padding: 20 }}>Loading devices…</p>
      )}

      {!loadingDevices && !devices.length && (
        <div
          className="card"
          style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}
        >
          <p style={{ fontSize: 16, marginBottom: 12 }}>No devices yet</p>
          <button
            className="primary"
            onClick={() => setView("new-device")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <PlusIcon /> Add First Device
          </button>
        </div>
      )}

      {/* delete confirmation modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal--centered" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12 }}>Delete Device</h3>
            <p style={{ marginBottom: 20, color: "var(--muted)" }}>
              Are you sure you want to delete device{" "}
              <strong>{confirmDelete.device_id}</strong> (
              {confirmDelete.serial_number})? This action cannot be undone.
            </p>
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <button
                className="outline"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="danger"
                disabled={deleting === confirmDelete.id}
                onClick={() => deleteDevice(confirmDelete)}
              >
                {deleting === confirmDelete.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {grouped.map((group, gi) => (
        <Fragment key={group.label || `g-${gi}`}>
          {group.label && (
            <h4
              style={{
                margin: "16px 0 8px",
                color: "var(--muted)",
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {group.label}
            </h4>
          )}
          <div className="device-cards-grid">
            {group.items.map((d) => {
              const msg = deviceMessages[d.id];
              return (
                <div key={d.id} className="device-card">
                  {/* header */}
                  <div className="device-card-header">
                    <div>
                      <div className="device-card-title">
                        Device {d.device_id}
                      </div>
                      <div className="device-card-sub">
                        {d.serial_number} · {d.model}
                      </div>
                      {d.activation_key && (
                        <div
                          className="device-card-sub"
                          style={{ fontSize: 11, opacity: 0.7 }}
                        >
                          Key: {d.activation_key}
                        </div>
                      )}
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        className={`badge ${d.fiscal_day_status === "open" ? "badge-success" : "badge-warning"}`}
                      >
                        {fmtStatus(d.fiscal_day_status)}
                      </span>
                      <button
                        className="device-icon-btn"
                        title="Edit"
                        onClick={() => startEdit(d)}
                      >
                        <EditIcon />
                      </button>
                      <button
                        className="device-icon-btn danger"
                        title="Delete"
                        onClick={() => setConfirmDelete(d)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>

                  {/* stats */}
                  <div className="device-card-stats">
                    <div className="device-stat">
                      <span className="device-stat-label">Fiscal Day</span>
                      <span className="device-stat-value">
                        #{d.current_fiscal_day_no || d.last_fiscal_day_no || 0}
                      </span>
                    </div>
                    <div className="device-stat">
                      <span className="device-stat-label">Receipts</span>
                      <span className="device-stat-value">
                        {d.last_receipt_counter}
                      </span>
                    </div>
                    <div className="device-stat">
                      <span className="device-stat-label">Global #</span>
                      <span className="device-stat-value">
                        {d.last_receipt_global_no}
                      </span>
                    </div>
                  </div>

                  {/* certs row */}
                  <div className="device-card-certs">
                    <label className="device-cert-upload small">
                      <span className="device-cert-label">
                        {d.crt_filename ? `✓ ${d.crt_filename}` : "Upload CRT"}
                      </span>
                      <input
                        type="file"
                        accept=".crt,.pem,.cer"
                        onChange={(e) =>
                          e.target.files?.[0] &&
                          uploadCert(d.id, "crt", e.target.files[0])
                        }
                      />
                    </label>
                    <label className="device-cert-upload small">
                      <span className="device-cert-label">
                        {d.key_filename ? `✓ ${d.key_filename}` : "Upload KEY"}
                      </span>
                      <input
                        type="file"
                        accept=".key,.pem"
                        onChange={(e) =>
                          e.target.files?.[0] &&
                          uploadCert(d.id, "key", e.target.files[0])
                        }
                      />
                    </label>
                  </div>

                  {/* actions */}
                  <div className="device-card-actions">
                    <button
                      className="outline small"
                      disabled={isLoading(d.id, "status")}
                      onClick={() => runAction(d.id, "status")}
                    >
                      {isLoading(d.id, "status") ? "…" : "Status"}
                    </button>
                    <button
                      className="outline small"
                      disabled={isLoading(d.id, "config")}
                      onClick={() => runAction(d.id, "config")}
                    >
                      {isLoading(d.id, "config") ? "…" : "Config"}
                    </button>
                    <button
                      className="outline small"
                      disabled={isLoading(d.id, "ping")}
                      onClick={() => runAction(d.id, "ping", "POST")}
                    >
                      {isLoading(d.id, "ping") ? "…" : "Ping"}
                    </button>
                    <button
                      className="outline small"
                      disabled={isLoading(d.id, "register")}
                      onClick={() => runAction(d.id, "register", "POST")}
                    >
                      {isLoading(d.id, "register") ? "…" : "Register"}
                    </button>
                    <button
                      className="outline small"
                      disabled={isLoading(d.id, "open-day")}
                      onClick={() => runAction(d.id, "open-day", "POST")}
                    >
                      {isLoading(d.id, "open-day") ? "…" : "Open Day"}
                    </button>
                    <button
                      className="outline small"
                      disabled={isLoading(d.id, "close-day")}
                      onClick={() => runAction(d.id, "close-day", "POST")}
                    >
                      {isLoading(d.id, "close-day") ? "…" : "Close Day"}
                    </button>
                  </div>

                  {/* per-device message */}
                  {msg && (
                    <div className={`device-card-msg ${msg.type}`}>
                      {msg.type === "info" && "⏳ "}
                      {msg.type === "success" && "✓ "}
                      {msg.type === "error" && "✗ "}
                      {msg.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Fragment>
      ))}
      {!loadingDevices && (
        <TablePagination
          page={devicesPage}
          pageSize={devicesPageSize}
          totalItems={totalDevices}
          onPageChange={setDevicesPage}
          onPageSizeChange={setDevicesPageSize}
        />
      )}
      {/* activity log */}
      {actionLog.length > 0 && (
        <details style={{ marginBottom: 16 }}>
          <summary
            style={{
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
              color: "var(--muted)",
            }}
          >
            Activity Log ({actionLog.length})
          </summary>
          <div className="device-log">
            {actionLog.map((entry, i) => (
              <div key={i} className={`device-log-entry ${entry.type}`}>
                <span className="device-log-time">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span>{entry.text}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
