import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useCompanies } from "../hooks/useCompanies";
import { useAlert } from "../context/AlertContext";
import BackButton from "../components/BackButton";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type Device = {
  id: number;
  company_id: number;
  device_id: string;
  serial_number: string;
  model: string;
  fiscal_day_status: string;
  current_fiscal_day_no: number;
  last_fiscal_day_no: number;
  last_receipt_counter: number;
  last_receipt_global_no: number;
  activation_date?: string | null;
};

type DeviceStatusResult = {
  fiscalDayStatus?: string;
  lastFiscalDayNo?: number;
  lastReceiptCounter?: number;
  lastReceiptGlobalNo?: number;
  serverDate?: string;
  operationID?: string;
  [key: string]: unknown;
};

type FiscalDayEntry = {
  dayNo: number;
  status: string;
  action: string;
  timestamp: string;
};

type AuditLog = {
  id: number;
  action: string;
  resource_type: string;
  resource_reference: string;
  changes_summary: string;
  status: string;
  error_message: string;
  action_at: string;
  user_email: string;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function statusColor(s: string) {
  if (s === "open" || s === "FiscalDayOpened") return "var(--green-600)";
  if (s === "closed" || s === "FiscalDayClosed") return "var(--blue-600)";
  return "var(--muted)";
}

function statusBg(s: string) {
  if (s === "open" || s === "FiscalDayOpened") return "#dcfce7";
  if (s === "closed" || s === "FiscalDayClosed") return "#dbeafe";
  return "#f1f5f9";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Parse FDMS / API errors into a clean human-readable string. */
function parseFdmsError(raw: string): { message: string; code: string } {
  // Try to parse as JSON first (FastAPI wraps errors in {"detail": "..."})
  let text = raw;
  try {
    const outer = JSON.parse(raw);
    if (typeof outer === "object" && outer.detail) {
      text = String(outer.detail);
    }
  } catch { /* not JSON */ }

  // Check if the detail itself contains an FDMS-style bracketed code: [FISC01] message
  const bracketMatch = text.match(/^\[([A-Z0-9]+)\]\s*(.+)$/i);
  if (bracketMatch) {
    return { code: bracketMatch[1], message: bracketMatch[2] };
  }

  // Check for embedded JSON in the string (legacy: "FDMS error 400: {...}")
  const jsonIdx = text.indexOf("{");
  if (jsonIdx >= 0) {
    try {
      const inner = JSON.parse(text.slice(jsonIdx));
      const msg = inner.message || inner.detail || "";
      const code = inner.errorCode || "";
      if (msg) return { code, message: msg };
    } catch { /* not parseable */ }
  }

  // Strip the "FDMS error NNN: " prefix if present
  const stripped = text.replace(/^FDMS error \d+:\s*/i, "");
  return { code: "", message: stripped || text || "Unknown error" };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function PortalDevicesPage() {
  const { companies, loading: companiesLoading } = useCompanies();
  const { showConfirm } = useAlert();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [tab, setTab] = useState<"days" | "logs">("days");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string; code?: string } | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [statusResult, setStatusResult] = useState<DeviceStatusResult | null>(null);
  const [fiscalDays, setFiscalDays] = useState<FiscalDayEntry[]>([]);


  // Load devices for all user companies
  useEffect(() => {
    if (!companies.length) return;
    setLoading(true);
    Promise.all(
      companies.map((c) =>
        apiFetch<Device[]>(`/devices?company_id=${c.id}`).catch(() => [] as Device[])
      )
    ).then((results) => {
      setDevices(results.flat());
      setLoading(false);
    });
  }, [companies]);

  // When a device is selected, fetch status + logs
  useEffect(() => {
    if (!selectedDevice) return;
    fetchDeviceStatus(selectedDevice.id);
    fetchDeviceLogs(selectedDevice.id);
  }, [selectedDevice?.id]);

  const fetchDeviceStatus = async (id: number) => {
    try {
      const result = await apiFetch<DeviceStatusResult>(`/devices/${id}/status`);
      setStatusResult(result);
      // Rebuild fiscal days list from what we know
      buildFiscalDays(result);
      // Also refresh the device in our list
      setDevices((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                fiscal_day_status:
                  result.fiscalDayStatus === "FiscalDayOpened"
                    ? "open"
                    : result.fiscalDayStatus === "FiscalDayClosed" || result.fiscalDayStatus === ""
                      ? "closed"
                      : d.fiscal_day_status,
                last_fiscal_day_no: result.lastFiscalDayNo ?? d.last_fiscal_day_no,
                last_receipt_counter: result.lastReceiptCounter ?? d.last_receipt_counter,
                last_receipt_global_no: result.lastReceiptGlobalNo ?? d.last_receipt_global_no,
              }
            : d
        )
      );
      if (selectedDevice && selectedDevice.id === id) {
        setSelectedDevice((prev) =>
          prev
            ? {
                ...prev,
                fiscal_day_status:
                  result.fiscalDayStatus === "FiscalDayOpened"
                    ? "open"
                    : result.fiscalDayStatus === "FiscalDayClosed" || result.fiscalDayStatus === ""
                      ? "closed"
                      : prev.fiscal_day_status,
                last_fiscal_day_no: result.lastFiscalDayNo ?? prev.last_fiscal_day_no,
                last_receipt_counter: result.lastReceiptCounter ?? prev.last_receipt_counter,
                last_receipt_global_no: result.lastReceiptGlobalNo ?? prev.last_receipt_global_no,
              }
            : prev
        );
      }
    } catch {
      // silent fail — we still have local data
    }
  };

  const buildFiscalDays = (result: DeviceStatusResult) => {
    const lastDay = result.lastFiscalDayNo ?? 0;
    const currentStatus = result.fiscalDayStatus ?? "";
    const entries: FiscalDayEntry[] = [];

    // Current open day
    if (currentStatus === "FiscalDayOpened" || currentStatus === "open") {
      entries.push({
        dayNo: lastDay + 1,
        status: "Open",
        action: "Opened",
        timestamp: result.serverDate || new Date().toISOString(),
      });
    }

    // Past closed days
    for (let i = lastDay; i >= Math.max(1, lastDay - 29); i--) {
      entries.push({
        dayNo: i,
        status: "Closed",
        action: "Closed",
        timestamp: "",
      });
    }
    setFiscalDays(entries);
  };

  const fetchDeviceLogs = async (id: number) => {
    setLogsLoading(true);
    try {
      const data = await apiFetch<AuditLog[]>(`/devices/${id}/logs?limit=100`);
      setLogs(data);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleOpenDay = async () => {
    if (!selectedDevice) return;
    setActionLoading("open");
    setMessage(null);
    try {
      await apiFetch(`/devices/${selectedDevice.id}/open-day`, { method: "POST" });
      setMessage({ type: "success", text: "Fiscal day opened successfully" });
      await fetchDeviceStatus(selectedDevice.id);
      await fetchDeviceLogs(selectedDevice.id);
    } catch (err) {
      const parsed = parseFdmsError(err instanceof Error ? err.message : String(err));
      setMessage({ type: "error", text: parsed.message, code: parsed.code });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCloseDay = async () => {
    if (!selectedDevice) return;
    const confirmed = await showConfirm({
      title: "Close fiscal day",
      message: "Are you sure you want to close the fiscal day?",
      variant: "warning",
      confirmLabel: "Close day",
    });
    if (!confirmed) return;
    setActionLoading("close");
    setMessage(null);
    try {
      await apiFetch(`/devices/${selectedDevice.id}/close-day`, { method: "POST" });
      setMessage({ type: "success", text: "Fiscal day closed successfully" });
      await fetchDeviceStatus(selectedDevice.id);
      await fetchDeviceLogs(selectedDevice.id);
    } catch (err) {
      const parsed = parseFdmsError(err instanceof Error ? err.message : String(err));
      setMessage({ type: "error", text: parsed.message, code: parsed.code });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefreshStatus = async () => {
    if (!selectedDevice) return;
    setActionLoading("refresh");
    try {
      await fetchDeviceStatus(selectedDevice.id);
      setMessage({ type: "success", text: "Status refreshed" });
    } catch (err) {
      const parsed = parseFdmsError(err instanceof Error ? err.message : String(err));
      setMessage({ type: "error", text: parsed.message, code: parsed.code });
    } finally {
      setActionLoading(null);
    }
  };

  const companyName = (companyId: number) => {
    return companies.find((c) => c.id === companyId)?.name || "—";
  };

  if (companiesLoading) {
    return <div className="loading-indicator">Loading companies...</div>;
  }

  // ─── Device List View ───
  if (!selectedDevice) {
    return (
      <div className="content">
        <div className="form-shell">
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <div className="toolbar-left">
              <h3>My Devices</h3>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading devices...</div>
          ) : devices.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
              No devices found for your account.
            </div>
          ) : (
            <div className="portal-device-grid">
              {devices.map((d) => (
                <div
                  key={d.id}
                  className="portal-device-card"
                  onClick={() => {
                    setSelectedDevice(d);
                    setTab("days");
                    setMessage(null);
                    setStatusResult(null);
                    setFiscalDays([]);
                    setLogs([]);
                  }}
                >
                  <div className="portal-device-card-header">
                    <div className="portal-device-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                    </div>
                    <span
                      className="portal-device-status-badge"
                      style={{ background: statusBg(d.fiscal_day_status), color: statusColor(d.fiscal_day_status) }}
                    >
                      {d.fiscal_day_status === "open" ? "Day Open" : "Day Closed"}
                    </span>
                  </div>
                  <div className="portal-device-card-body">
                    <div className="portal-device-name">{d.device_id || d.serial_number || `Device #${d.id}`}</div>
                    <div className="portal-device-meta">{d.model || "—"}</div>
                    <div className="portal-device-meta">{companyName(d.company_id)}</div>
                  </div>
                  <div className="portal-device-card-footer">
                    <div className="portal-device-stat">
                      <span className="portal-device-stat-label">Fiscal Day</span>
                      <span className="portal-device-stat-value">#{d.last_fiscal_day_no}</span>
                    </div>
                    <div className="portal-device-stat">
                      <span className="portal-device-stat-label">Receipts</span>
                      <span className="portal-device-stat-value">{d.last_receipt_global_no}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Device Detail View ───
  const isDayOpen = selectedDevice.fiscal_day_status === "open";

  return (
    <div className="content">
      <div className="form-shell">
        {/* Header */}
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="toolbar-left" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BackButton
              className="outline"
              onBack={() => {
                setSelectedDevice(null);
                setMessage(null);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              title="Back"
              ariaLabel="Back"
            >
              Back
            </BackButton>
            <h3 style={{ margin: 0 }}>
              {selectedDevice.device_id || selectedDevice.serial_number || `Device #${selectedDevice.id}`}
            </h3>
            <span
              className="portal-device-status-badge"
              style={{ background: statusBg(selectedDevice.fiscal_day_status), color: statusColor(selectedDevice.fiscal_day_status), fontSize: 13 }}
            >
              {isDayOpen ? "Day Open" : "Day Closed"}
            </span>
          </div>
          <div className="toolbar-right" style={{ display: "flex", gap: 8 }}>
            <button className="outline" onClick={handleRefreshStatus} disabled={actionLoading !== null}>
              {actionLoading === "refresh" ? "Refreshing..." : "↻ Refresh"}
            </button>
            {isDayOpen ? (
              <button
                className="portal-btn-close-day"
                onClick={handleCloseDay}
                disabled={actionLoading !== null}
              >
                {actionLoading === "close" ? "Closing..." : "Close Day"}
              </button>
            ) : (
              <button
                className="primary"
                onClick={handleOpenDay}
                disabled={actionLoading !== null}
              >
                {actionLoading === "open" ? "Opening..." : "Open Day"}
              </button>
            )}
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`portal-device-msg ${message.type}`}
            style={{ marginBottom: 12 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
              {message.type === "error" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              )}
              {message.type === "success" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
              {message.code && (
                <span style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  background: message.type === "error" ? "#fecaca" : "#bbf7d0",
                  color: message.type === "error" ? "var(--red-700, #b91c1c)" : "var(--green-700, #15803d)",
                  flexShrink: 0,
                }}>
                  {message.code}
                </span>
              )}
              <span style={{ wordBreak: "break-word" }}>{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: 8, fontWeight: 700, flexShrink: 0 }}>✕</button>
          </div>
        )}

        {/* Stats bar */}
        <div className="portal-device-stats-bar">
          <div className="portal-device-stat-box">
            <div className="portal-device-stat-box-label">Model</div>
            <div className="portal-device-stat-box-value">{selectedDevice.model || "—"}</div>
          </div>
          <div className="portal-device-stat-box">
            <div className="portal-device-stat-box-label">Serial</div>
            <div className="portal-device-stat-box-value">{selectedDevice.serial_number || "—"}</div>
          </div>
          <div className="portal-device-stat-box">
            <div className="portal-device-stat-box-label">Current Day</div>
            <div className="portal-device-stat-box-value">#{selectedDevice.last_fiscal_day_no + (isDayOpen ? 1 : 0)}</div>
          </div>
          <div className="portal-device-stat-box">
            <div className="portal-device-stat-box-label">Last Closed Day</div>
            <div className="portal-device-stat-box-value">#{selectedDevice.last_fiscal_day_no}</div>
          </div>
          <div className="portal-device-stat-box">
            <div className="portal-device-stat-box-label">Receipt Counter</div>
            <div className="portal-device-stat-box-value">{selectedDevice.last_receipt_counter}</div>
          </div>
          <div className="portal-device-stat-box">
            <div className="portal-device-stat-box-label">Global Receipts</div>
            <div className="portal-device-stat-box-value">{selectedDevice.last_receipt_global_no}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="portal-device-tabs">
          <button className={`portal-device-tab ${tab === "days" ? "active" : ""}`} onClick={() => setTab("days")}>
            Fiscal Days
          </button>
          <button className={`portal-device-tab ${tab === "logs" ? "active" : ""}`} onClick={() => setTab("logs")}>
            Traffic Logs
          </button>
        </div>

        {/* Tab content */}
        {tab === "days" && (
          <div className="portal-device-tab-content">
            {fiscalDays.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>
                No fiscal day data available. Click "Refresh" to fetch latest status.
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Day #</th>
                    <th>Status</th>
                    <th>Action</th>
                    <th>Server Date</th>
                  </tr>
                </thead>
                <tbody>
                  {fiscalDays.map((fd, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{fd.dayNo}</td>
                      <td>
                        <span
                          className="portal-device-status-badge"
                          style={{
                            background: fd.status === "Open" ? "#dcfce7" : "#dbeafe",
                            color: fd.status === "Open" ? "var(--green-600)" : "var(--blue-600)",
                          }}
                        >
                          {fd.status}
                        </span>
                      </td>
                      <td>{fd.action}</td>
                      <td>{fd.timestamp ? formatDate(fd.timestamp) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "logs" && (
          <div className="portal-device-tab-content">
            {logsLoading ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading logs...</div>
            ) : logs.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>
                No traffic logs found for this device.
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>User</th>
                    <th>Details</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    // Parse error_message for clean display
                    const errParsed = log.error_message ? parseFdmsError(log.error_message) : null;
                    const summary = log.changes_summary || log.resource_reference || "";
                    return (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{formatDate(log.action_at)}</td>
                        <td>
                          <span className="portal-log-action">{log.action.replace(/_/g, " ")}</span>
                        </td>
                        <td style={{ fontSize: 13 }}>{log.user_email || "—"}</td>
                        <td style={{ fontSize: 13, maxWidth: 400 }}>
                          {log.status === "error" && errParsed ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              {errParsed.code && (
                                <span style={{
                                  display: "inline-block",
                                  width: "fit-content",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  background: "#fecaca",
                                  color: "#b91c1c",
                                  letterSpacing: 0.5,
                                }}>
                                  {errParsed.code}
                                </span>
                              )}
                              <span style={{ wordBreak: "break-word", color: "var(--red-600)" }}>
                                {errParsed.message}
                              </span>
                            </div>
                          ) : (
                            <span style={{ wordBreak: "break-word" }}>{summary || "—"}</span>
                          )}
                        </td>
                        <td>
                          <span
                            className="portal-device-status-badge"
                            style={{
                              background: log.status === "success" ? "#dcfce7" : log.status === "error" ? "#fef2f2" : "#fefce8",
                              color: log.status === "success" ? "var(--green-600)" : log.status === "error" ? "var(--red-600)" : "var(--amber-500)",
                            }}
                          >
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
