import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Building2,
  Clock3,
  Mail,
  Phone,
  ShieldCheck,
  Users,
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
};

const statusOptions = ["all", "active", "expired", "converted"] as const;

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

export default function LeadsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] =
    useState<(typeof statusOptions)[number]>("all");
  const [leads, setLeads] = useState<DemoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadLeads = async () => {
      setLoading(true);
      setError("");
      try {
        const query =
          statusFilter === "all"
            ? ""
            : `?status_filter=${encodeURIComponent(statusFilter)}`;
        const payload = await apiFetch<DemoLead[]>(`/demo${query}`);
        if (cancelled) return;
        setLeads(payload);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load leads.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadLeads();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const counts = useMemo(() => {
    const active = leads.filter((lead) => lead.status === "active").length;
    const expired = leads.filter((lead) => lead.status === "expired").length;
    const converted = leads.filter((lead) => lead.status === "converted").length;
    return { active, expired, converted };
  }, [leads]);

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

  return (
    <div className="content">
      <div className="two-panel two-panel-left">
        <Sidebar sections={sidebarSections} />

        <div className="form-shell leads-page">
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <div className="toolbar-left">
              <h3>Leads</h3>
            </div>
            <div className="toolbar-right">
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

          <div className="table-card full-width leads-summary-card">
            <div className="table-header">
              <h3>Demo Requests</h3>
            </div>
            <p className="leads-summary-text">
              Public demo signups appear here for admin follow-up with company
              details, contact information, requested user count, FDMS interest,
              and live demo timing.
            </p>
            <div className="leads-stat-grid">
              <div className="leads-stat-tile">
                <span className="leads-stat-label">Total leads</span>
                <strong>{leads.length}</strong>
              </div>
              <div className="leads-stat-tile">
                <span className="leads-stat-label">Active demos</span>
                <strong>{counts.active}</strong>
              </div>
              <div className="leads-stat-tile">
                <span className="leads-stat-label">Expired demos</span>
                <strong>{counts.expired}</strong>
              </div>
              <div className="leads-stat-tile">
                <span className="leads-stat-label">Converted</span>
                <strong>{counts.converted}</strong>
              </div>
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
          ) : !leads.length ? (
            <div className="table-card full-width">
              <div className="leads-empty-state">No demo leads yet.</div>
            </div>
          ) : (
            <div className="leads-grid">
              {leads.map((lead) => (
                <article key={lead.id} className="table-card leads-lead-card">
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
        </div>
      </div>
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
