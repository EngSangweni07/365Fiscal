import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Building2,
  Clock3,
  LayoutGrid,
  List,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { apiFetch } from "../api";
import { Sidebar } from "../components/Sidebar";
import type { SidebarSection } from "../types/sidebar";

type DemoLead = {
  id: number;
  company_name: string;
  email: string;
  phone_number: string;
  wants_zimra_fdms: boolean;
  num_users: number;
  status: string;
  created_at: string;
  expires_at: string;
  notes: string;
  time_remaining_seconds: number;
  is_expired: boolean;
  company_id?: number | null;
  user_id?: number | null;
};

type CompanyPayload = {
  name: string;
  email: string;
  phone: string;
  address: string;
  tin: string;
  vat: string;
  portal_apps: string[];
};

const statusOptions = ["all", "active", "expired", "converted"] as const;
const PORTAL_APPS = [
  "dashboard",
  "invoices",
  "purchases",
  "contacts",
  "quotations",
  "inventory",
  "pos",
  "devices",
  "reports",
  "expenses",
  "settings",
];

const formatTimer = (seconds: number) => {
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const parseApiDate = (value: string) => {
  if (!value) return new Date("");
  const hasTimezone = /[zZ]$|[+\-]\d{2}:\d{2}$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
};

const formatHarareDateTime = (value: string) =>
  parseApiDate(value).toLocaleString("en-ZW", {
    timeZone: "Africa/Harare",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

const buildInitialCompanyPayload = (lead: DemoLead): CompanyPayload => ({
  name: lead.company_name,
  email: lead.email,
  phone: lead.phone_number,
  address: "",
  tin: "",
  vat: "",
  portal_apps: PORTAL_APPS,
});

export default function LeadsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] =
    useState<(typeof statusOptions)[number]>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [leads, setLeads] = useState<DemoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLead, setSelectedLead] = useState<DemoLead | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyPayload | null>(null);
  const [portalPassword, setPortalPassword] = useState("Temp12345!");
  const [savingPortal, setSavingPortal] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadLeads = async (filter: (typeof statusOptions)[number]) => {
    setLoading(true);
    setError("");
    try {
      const query =
        filter === "all" ? "" : `?status_filter=${encodeURIComponent(filter)}`;
      const payload = await apiFetch<DemoLead[]>(`/demo${query}`);
      setLeads(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchQuery, viewMode, pageSize]);

  const counts = useMemo(() => {
    const active = leads.filter((lead) => lead.status === "active").length;
    const expired = leads.filter((lead) => lead.status === "expired").length;
    const converted = leads.filter((lead) => lead.status === "converted").length;
    return { active, expired, converted };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return leads;
    return leads.filter((lead) =>
      [
        lead.company_name,
        lead.email,
        lead.phone_number,
        lead.status,
        String(lead.num_users),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [leads, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLeads.slice(start, start + pageSize);
  }, [currentPage, filteredLeads, pageSize]);

  const pageStart = filteredLeads.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, filteredLeads.length);

  const sidebarSections = useMemo<SidebarSection[]>(
    () => [
      {
        id: "lead-views",
        title: "LEAD STATUS",
        items: [
          {
            id: "all-leads",
            label: "ALL LEADS",
            isActive: statusFilter === "all",
            badge: leads.length,
            icon: <Building2 size={18} strokeWidth={1.5} />,
            iconColor: "var(--blue-600)",
            iconBackground: "rgba(37, 99, 235, 0.12)",
            onClick: () => setStatusFilter("all"),
          },
          {
            id: "active-leads",
            label: "ACTIVE DEMOS",
            isActive: statusFilter === "active",
            badge: counts.active,
            icon: <Clock3 size={18} strokeWidth={1.5} />,
            iconColor: "var(--teal-700)",
            iconBackground: "rgba(13, 148, 136, 0.15)",
            onClick: () => setStatusFilter("active"),
          },
          {
            id: "expired-leads",
            label: "EXPIRED",
            isActive: statusFilter === "expired",
            badge: counts.expired,
            icon: <BadgeCheck size={18} strokeWidth={1.5} />,
            iconColor: "var(--orange-600)",
            iconBackground: "rgba(249, 115, 22, 0.16)",
            onClick: () => setStatusFilter("expired"),
          },
          {
            id: "converted-leads",
            label: "CONVERTED",
            isActive: statusFilter === "converted",
            badge: counts.converted,
            icon: <ShieldCheck size={18} strokeWidth={1.5} />,
            iconColor: "var(--violet-600)",
            iconBackground: "rgba(139, 92, 246, 0.15)",
            onClick: () => setStatusFilter("converted"),
          },
        ],
      },
    ],
    [counts.active, counts.converted, counts.expired, leads.length, statusFilter],
  );

  const openLead = (lead: DemoLead) => {
    setSelectedLead(lead);
    setCompanyForm(buildInitialCompanyPayload(lead));
    setPortalPassword("Temp12345!");
    setActionMessage("");
  };

  const closeLead = () => {
    setSelectedLead(null);
    setCompanyForm(null);
    setPortalPassword("Temp12345!");
    setActionMessage("");
  };

  const handleDeleteLead = async (lead: DemoLead) => {
    const confirmed = window.confirm(`Delete lead for ${lead.company_name}?`);
    if (!confirmed) return;

    setDeletingLeadId(lead.id);
    setActionMessage("");
    try {
      await apiFetch(`/demo/${lead.id}`, { method: "DELETE" });
      const remaining = leads.filter((item) => item.id !== lead.id);
      setLeads(remaining);
      if (selectedLead?.id === lead.id) {
        closeLead();
      }
    } catch (err) {
      setActionMessage(
        err instanceof Error ? err.message : "Failed to delete lead.",
      );
    } finally {
      setDeletingLeadId(null);
    }
  };

  const handleCreatePortal = async () => {
    if (!selectedLead || !companyForm) return;
    setSavingPortal(true);
    setActionMessage("");

    try {
      let companyId = selectedLead.company_id ?? null;

      if (companyId) {
        const updated = await apiFetch<{ id: number }>(`/companies/${companyId}`, {
          method: "PATCH",
          body: JSON.stringify(companyForm),
        });
        companyId = updated.id;
      } else {
        const created = await apiFetch<{ id: number }>(`/companies`, {
          method: "POST",
          body: JSON.stringify(companyForm),
        });
        companyId = created.id;
      }

      await apiFetch(`/companies/${companyId}/portal-user`, {
        method: "PATCH",
        body: JSON.stringify({
          email: companyForm.email,
          password: portalPassword,
        }),
      });

      await apiFetch(`/demo/${selectedLead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "converted",
          notes: `Lead converted to company portal on ${new Date().toISOString()}.`,
        }),
      });

      setActionMessage("Company and portal user created successfully.");
      await loadLeads(statusFilter);
      setSelectedLead((current) =>
        current
          ? {
              ...current,
              status: "converted",
              company_id: companyId,
            }
          : current,
      );
    } catch (err) {
      setActionMessage(
        err instanceof Error ? err.message : "Failed to create company portal.",
      );
    } finally {
      setSavingPortal(false);
    }
  };

  return (
    <div className="content">
      <div className="two-panel two-panel-left">
        <Sidebar sections={sidebarSections} />

        <div className="form-shell leads-page">
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <div className="toolbar-left">
              <h3>Leads</h3>
              <div className="leads-search">
                <Search size={16} />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search company, email, phone, or status"
                />
              </div>
            </div>
            <div className="toolbar-right">
              <button
                className={viewMode === "cards" ? "tab active" : "tab"}
                onClick={() => setViewMode("cards")}
                type="button"
                title="Card view"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                className={viewMode === "list" ? "tab active" : "tab"}
                onClick={() => setViewMode("list")}
                type="button"
                title="List view"
              >
                <List size={16} />
              </button>
              {statusOptions.map((option) => (
                <button
                  key={option}
                  className={statusFilter === option ? "tab active" : "tab"}
                  onClick={() => setStatusFilter(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
              <button className="primary" onClick={() => navigate("/demo")}>
                Open Demo Form
              </button>
            </div>
          </div>

          {loading ? (
            <div className="table-card full-width">
              <div className="leads-empty-state">Loading demo leads...</div>
            </div>
          ) : error ? (
            <div className="table-card full-width">
              <div className="leads-error-state">{error}</div>
            </div>
          ) : !filteredLeads.length ? (
            <div className="table-card full-width">
              <div className="leads-empty-state">No matching leads found.</div>
            </div>
          ) : viewMode === "list" ? (
            <div className="table-card full-width">
              <table className="table leads-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Users</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="leads-table-row"
                      onClick={() => openLead(lead)}
                    >
                      <td>{lead.company_name}</td>
                      <td>{lead.email}</td>
                      <td>{lead.phone_number}</td>
                      <td>{lead.num_users}</td>
                      <td>
                        <span className={`leads-status-chip status-${lead.status}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td>{formatHarareDateTime(lead.created_at)} CAT</td>
                      <td>{formatHarareDateTime(lead.expires_at)} CAT</td>
                      <td className="leads-actions-cell" onClick={(event) => event.stopPropagation()}>
                        <button
                          className="leads-delete-btn"
                          type="button"
                          onClick={() => handleDeleteLead(lead)}
                          disabled={deletingLeadId === lead.id}
                          title="Delete lead"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="leads-grid">
              {paginatedLeads.map((lead) => (
                <article
                  key={lead.id}
                  className="table-card leads-lead-card"
                  onClick={() => openLead(lead)}
                >
                  <button
                    className="leads-delete-btn leads-delete-btn-card"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteLead(lead);
                    }}
                    disabled={deletingLeadId === lead.id}
                    title="Delete lead"
                  >
                    <Trash2 size={15} />
                  </button>
                  <div className="leads-lead-top">
                    <div>
                      <div className="leads-lead-title-row">
                        <h4>{lead.company_name}</h4>
                        <span className={`leads-status-chip status-${lead.status}`}>
                          {lead.status}
                        </span>
                      </div>
                      <div className="leads-meta">
                        Created {formatHarareDateTime(lead.created_at)} CAT
                      </div>
                    </div>
                    <div
                      className={`leads-timer-chip ${
                        lead.is_expired ? "expired" : "active"
                      }`}
                    >
                      {lead.is_expired
                        ? "Expired"
                        : `Time remaining ${formatTimer(
                            lead.time_remaining_seconds,
                          )}`}
                    </div>
                  </div>

                  <div className="leads-info-grid">
                    <LeadInfo
                      icon={<Mail size={16} />}
                      label="Email"
                      value={lead.email}
                    />
                    <LeadInfo
                      icon={<Phone size={16} />}
                      label="Phone"
                      value={lead.phone_number}
                    />
                    <LeadInfo
                      icon={<Users size={16} />}
                      label="Users"
                      value={String(lead.num_users)}
                    />
                    <LeadInfo
                      icon={<ShieldCheck size={16} />}
                      label="ZIMRA FDMS"
                      value={lead.wants_zimra_fdms ? "Requested" : "No"}
                    />
                  </div>

                  <div className="leads-meta">
                    Expires {formatHarareDateTime(lead.expires_at)} CAT
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && !error && filteredLeads.length > 0 && (
            <div className="table-pagination">
              <div className="pager-left">
                <label className="pager-size-label">
                  Show
                  <select
                    className="pager-size-select"
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </label>
                <span className="pager-info">
                  {pageStart}-{pageEnd} of {filteredLeads.length}
                </span>
              </div>

              <div className="pager-buttons">
                <button
                  className="pager-btn"
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span className="pager-page">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="pager-btn"
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={currentPage >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedLead && companyForm && (
        <div className="modal-overlay" onClick={closeLead}>
          <div
            className="modal modal-centered leads-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{selectedLead.company_name}</h3>
              <button className="outline" onClick={closeLead} type="button">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="leads-modal-grid">
                <LeadModalInfo label="Lead status" value={selectedLead.status} />
                <LeadModalInfo
                  label="Created"
                  value={`${formatHarareDateTime(selectedLead.created_at)} CAT`}
                />
                <LeadModalInfo
                  label="Expires"
                  value={`${formatHarareDateTime(selectedLead.expires_at)} CAT`}
                />
                <LeadModalInfo
                  label="Demo users"
                  value={String(selectedLead.num_users)}
                />
              </div>

              <div className="form-section">
                <h4>Create Company / Portal</h4>
                <div className="settings-modal-grid">
                  <label className="input">
                    <span>Company Name</span>
                    <input
                      value={companyForm.name}
                      onChange={(event) =>
                        setCompanyForm((current) =>
                          current ? { ...current, name: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label className="input">
                    <span>Email</span>
                    <input
                      value={companyForm.email}
                      onChange={(event) =>
                        setCompanyForm((current) =>
                          current ? { ...current, email: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label className="input">
                    <span>Phone</span>
                    <input
                      value={companyForm.phone}
                      onChange={(event) =>
                        setCompanyForm((current) =>
                          current ? { ...current, phone: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label className="input">
                    <span>Portal Password</span>
                    <input
                      value={portalPassword}
                      onChange={(event) => setPortalPassword(event.target.value)}
                    />
                  </label>
                </div>
                {actionMessage && (
                  <div
                    className={
                      actionMessage.includes("successfully")
                        ? "login-status leads-action-message"
                        : "login-error leads-action-message"
                    }
                  >
                    {actionMessage}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="outline danger"
                onClick={() => handleDeleteLead(selectedLead)}
                type="button"
                disabled={deletingLeadId === selectedLead.id}
              >
                {deletingLeadId === selectedLead.id ? "Deleting..." : "Delete Lead"}
              </button>
              <button className="outline" onClick={closeLead} type="button">
                Close
              </button>
              <button
                className="primary"
                onClick={handleCreatePortal}
                type="button"
                disabled={savingPortal}
              >
                {savingPortal ? "Saving..." : "Create Company / Portal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadInfo({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="leads-info-card">
      <div className="leads-info-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="leads-info-value">{value}</div>
    </div>
  );
}

function LeadModalInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="leads-modal-info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
