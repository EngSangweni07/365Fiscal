import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchWithTotal } from "../api";
import { TablePagination } from "../components/TablePagination";
import { useMe } from "../hooks/useMe";

interface AuditLog {
  id: number;
  user_id: number | null;
  user_email: string;
  company_id: number | null;
  company_name: string;
  action: string;
  resource_type: string;
  resource_id: number | null;
  resource_reference: string;
  changes_summary: string;
  status: string;
  error_message: string;
  action_at: string;
  created_at: string;
}

interface AuditSummary {
  total_actions: number;
  actions_by_type: Record<string, number>;
  actions_by_user: Record<string, number>;
  recent_errors: AuditLog[];
}

// Icons
const ActivityIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const FilterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const AlertCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

const formatAction = (action: string) => {
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getActionColor = (action: string): string => {
  if (action.includes("create")) return "var(--green-600)";
  if (action.includes("delete") || action.includes("cancel")) return "var(--red-600)";
  if (action.includes("update") || action.includes("edit")) return "var(--blue-600)";
  if (action.includes("fiscalize")) return "var(--violet-600)";
  if (action.includes("payment")) return "var(--cyan-600)";
  if (action.includes("confirm") || action.includes("post")) return "var(--orange-600)";
  if (action.includes("login")) return "var(--slate-500)";
  return "var(--slate-500)";
};

const getResourceIcon = (resourceType: string): string => {
  const icons: Record<string, string> = {
    invoice: "📄",
    quotation: "📋",
    credit_note: "📝",
    payment: "💳",
    product: "📦",
    contact: "👤",
    user: "👥",
    company: "🏢",
    device: "🖥️",
    settings: "⚙️",
  };
  return icons[resourceType] || "📁";
};

export default function AuditLogsPage() {
  const { me } = useMe();
  const companyId = me?.company_ids?.[0];

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState(7);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exportingSelected, setExportingSelected] = useState(false);

  // Available filter options
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    loadData();
  }, [companyId, actionFilter, resourceFilter, statusFilter, searchFilter, daysFilter, page, pageSize]);

  const loadFilterOptions = async () => {
    try {
      const [actions, resources] = await Promise.all([
        apiFetch<string[]>("/audit-logs/actions").catch(() => []),
        apiFetch<string[]>("/audit-logs/resource-types").catch(() => []),
      ]);
      setActionTypes(actions);
      setResourceTypes(resources);
    } catch {
      // Ignore errors for filter options
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (companyId) params.append("company_id", String(companyId));
      if (actionFilter) params.append("action", actionFilter);
      if (resourceFilter) params.append("resource_type", resourceFilter);
      if (statusFilter) params.append("status", statusFilter);
      if (searchFilter) params.append("search", searchFilter);
      params.append("limit", String(pageSize));
      params.append("offset", String((page - 1) * pageSize));

      const [{ data: logsData, total }, summaryData] = await Promise.all([
        apiFetchWithTotal<AuditLog[]>(`/audit-logs?${params.toString()}`),
        apiFetch<AuditSummary>(`/audit-logs/summary?days=${daysFilter}${companyId ? `&company_id=${companyId}` : ""}`).catch(() => null),
      ]);

      setLogs(logsData);
      setTotalLogs(total);
      setSummary(summaryData);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setActionFilter("");
    setResourceFilter("");
    setStatusFilter("");
    setSearchFilter("");
  };

  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
  const pagedLogs = useMemo(() => logs, [logs]);
  const visibleLogIds = pagedLogs.map((log) => log.id);
  const allVisibleSelected =
    visibleLogIds.length > 0 &&
    visibleLogIds.every((id) => selectedIds.has(id));
  const selectedLogs = logs.filter((log) => selectedIds.has(log.id));

  const toggleSelect = (logId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) next.delete(logId);
      else next.add(logId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleLogIds.forEach((id) => next.delete(id));
      } else {
        visibleLogIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleExportSelected = () => {
    if (!selectedLogs.length) return;
    setExportingSelected(true);
    try {
      const rows = selectedLogs.map((log) => ({
        Time: formatDate(log.action_at),
        User: log.user_email || "System",
        Action: formatAction(log.action),
        Resource: log.resource_reference || `#${log.resource_id ?? ""}`,
        Details: log.changes_summary || log.error_message || "",
        Status: log.status,
      }));
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((header) =>
              `"${String(row[header as keyof typeof row] ?? "").replace(/"/g, '""')}"`,
            )
            .join(","),
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "audit-logs-selected.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExportingSelected(false);
    }
  };

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [
    actionFilter,
    resourceFilter,
    statusFilter,
    searchFilter,
    daysFilter,
    companyId,
    pageSize,
  ]);

  return (
    <div className="content-area">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Track all system activities and changes</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FilterIcon /> Filters
          </button>
          <button className="btn btn-secondary" onClick={loadData}>
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8 }}>×</button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
          <div className="summary-card card" style={{ padding: 20 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--slate-800)" }}>
              {summary.total_actions.toLocaleString()}
            </div>
            <div style={{ fontSize: 13, color: "var(--slate-500)" }}>Total Actions (Last {daysFilter} days)</div>
          </div>
          <div className="summary-card card" style={{ padding: 20 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--green-600)" }}>
              {Object.values(summary.actions_by_type).reduce((a, b) => a + b, 0) - (summary.recent_errors?.length || 0)}
            </div>
            <div style={{ fontSize: 13, color: "var(--slate-500)" }}>Successful Actions</div>
          </div>
          <div className="summary-card card" style={{ padding: 20 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--red-600)" }}>
              {summary.recent_errors?.length || 0}
            </div>
            <div style={{ fontSize: 13, color: "var(--slate-500)" }}>Recent Errors</div>
          </div>
          <div className="summary-card card" style={{ padding: 20 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--blue-600)" }}>
              {Object.keys(summary.actions_by_user).length}
            </div>
            <div style={{ fontSize: 13, color: "var(--slate-500)" }}>Active Users</div>
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
              <label>Search</label>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search references, users..."
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
              <label>Action Type</label>
              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="">All Actions</option>
                {actionTypes.map((action) => (
                  <option key={action} value={action}>
                    {formatAction(action)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
              <label>Resource Type</label>
              <select value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)}>
                <option value="">All Resources</option>
                {resourceTypes.map((resource) => (
                  <option key={resource} value={resource}>
                    {resource.charAt(0).toUpperCase() + resource.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
              <label>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
              <label>Time Range</label>
              <select value={daysFilter} onChange={(e) => setDaysFilter(Number(e.target.value))}>
                <option value={1}>Last 24h</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
            <button className="btn btn-secondary" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Logs Table */}
      {loading ? (
        <div className="loading-spinner" style={{ padding: 40, textAlign: "center", color: "var(--slate-500)" }}>
          Loading audit logs...
        </div>
      ) : (
        <div className="table-container">
          {selectedIds.size > 0 && (
            <div className="batch-action-bar">
              <label className="batch-master-toggle">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="batch-checkbox"
                />
                <span>Select all</span>
              </label>
              <span className="batch-count">{selectedIds.size} selected</span>
              <button
                className="batch-btn export-btn"
                onClick={handleExportSelected}
                disabled={exportingSelected}
              >
                {exportingSelected ? "Exporting..." : "Export Selected"}
              </button>
              <button
                className="batch-btn clear-btn"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </button>
            </div>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    className="batch-checkbox"
                  />
                </th>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Details</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--slate-500)" }}>
                    No audit logs found matching your filters
                  </td>
                </tr>
              ) : (
                pagedLogs.map((log) => (
                  <tr key={log.id} className={selectedIds.has(log.id) ? "row-selected" : ""}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(log.id)}
                        onChange={() => toggleSelect(log.id)}
                        className="batch-checkbox"
                        aria-label={`Select audit log ${log.id}`}
                      />
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12, color: "var(--slate-500)" }}>
                      {formatDate(log.action_at)}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "var(--slate-200)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {log.user_email?.charAt(0).toUpperCase() || "S"}
                        </div>
                        <span style={{ fontSize: 13 }}>{log.user_email || "System"}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          background: getActionColor(log.action) + "15",
                          color: getActionColor(log.action),
                        }}
                      >
                        {formatAction(log.action)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{getResourceIcon(log.resource_type)}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {log.resource_reference || `#${log.resource_id}`}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--slate-400)" }}>
                            {log.resource_type}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ maxWidth: 300 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--slate-500)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={log.changes_summary || log.error_message}
                      >
                        {log.changes_summary || log.error_message || "-"}
                      </div>
                    </td>
                    <td>
                      {log.status === "success" ? (
                        <span style={{ color: "var(--green-600)", display: "flex", alignItems: "center", gap: 4 }}>
                          <CheckCircleIcon /> Success
                        </span>
                      ) : (
                        <span style={{ color: "var(--red-600)", display: "flex", alignItems: "center", gap: 4 }}>
                          <AlertCircleIcon /> Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalItems={totalLogs}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <style>{`
        .alert-error {
          background: var(--red-100);
          color: var(--red-600);
          padding: 12px 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .summary-card {
          background: linear-gradient(135deg, var(--white-500) 0%, var(--slate-50) 100%);
          border: 1px solid var(--slate-200);
        }
      `}</style>
    </div>
  );
}
