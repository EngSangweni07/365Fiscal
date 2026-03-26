import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Building2, Clock3, Mail, Phone, Users } from "lucide-react";
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

export default function LeadsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>("all");
  const [leads, setLeads] = useState<DemoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 1100);

  useEffect(() => {
    let cancelled = false;

    const loadLeads = async () => {
      setLoading(true);
      setError("");
      try {
        const query =
          statusFilter === "all" ? "" : `?status_filter=${encodeURIComponent(statusFilter)}`;
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

  useEffect(() => {
    const handleResize = () => setIsCompact(window.innerWidth < 1100);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const sidebarSections = useMemo<SidebarSection[]>(
    () => [
      {
        id: "lead-views",
        title: "Lead Views",
        items: [
          {
            id: "all-leads",
            label: "All Leads",
            isActive: statusFilter === "all",
            badge: String(leads.length),
            icon: <Building2 size={16} />,
            iconColor: "#0f766e",
            iconBackground: "rgba(45, 212, 191, 0.16)",
            onClick: () => setStatusFilter("all"),
          },
          {
            id: "active-leads",
            label: "Active Demos",
            isActive: statusFilter === "active",
            icon: <Clock3 size={16} />,
            iconColor: "#0369a1",
            iconBackground: "rgba(56, 189, 248, 0.16)",
            onClick: () => setStatusFilter("active"),
          },
          {
            id: "expired-leads",
            label: "Expired Demos",
            isActive: statusFilter === "expired",
            icon: <BadgeCheck size={16} />,
            iconColor: "#9a3412",
            iconBackground: "rgba(251, 146, 60, 0.18)",
            onClick: () => setStatusFilter("expired"),
          },
        ],
      },
    ],
    [leads.length, statusFilter],
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isCompact ? "minmax(0, 1fr)" : "260px minmax(0, 1fr)",
        gap: 24,
      }}
    >
      <Sidebar sections={sidebarSections} />

      <div style={{ display: "grid", gap: 20 }}>
        <section
          style={{
            borderRadius: 26,
            padding: 28,
            background:
              "linear-gradient(135deg, rgba(8,47,73,0.95) 0%, rgba(15,118,110,0.9) 100%)",
            color: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.84 }}>
                Leads App
              </div>
              <h2 style={{ margin: "8px 0 0", fontSize: 30 }}>Demo requests and trial countdowns</h2>
              <p style={{ margin: "10px 0 0", maxWidth: 720, color: "rgba(226,232,240,0.85)", lineHeight: 1.7 }}>
                Every public demo signup lands here for admin review, including
                company details, ZIMRA FDMS interest, requested user count, and
                live expiry information.
              </p>
            </div>
            <button
              className="btn btn-light"
              onClick={() => navigate("/demo")}
              style={{ alignSelf: "start", fontWeight: 700 }}
            >
              Open public form
            </button>
          </div>
        </section>

        <section
          style={{
            borderRadius: 24,
            background: "#fff",
            border: "1px solid rgba(226, 232, 240, 0.9)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              padding: 22,
              borderBottom: "1px solid #e2e8f0",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 22 }}>Lead pipeline</h3>
              <div style={{ marginTop: 6, color: "#64748b" }}>
                Filtered by <strong>{statusFilter}</strong>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {statusOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setStatusFilter(option)}
                  style={{
                    borderRadius: 999,
                    padding: "10px 14px",
                    border: statusFilter === option ? "1px solid #0f766e" : "1px solid #cbd5e1",
                    background: statusFilter === option ? "#ccfbf1" : "#fff",
                    color: statusFilter === option ? "#115e59" : "#334155",
                    fontWeight: 700,
                    textTransform: "capitalize",
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 28, color: "#64748b" }}>Loading demo leads...</div>
          ) : error ? (
            <div style={{ padding: 28, color: "#b91c1c", whiteSpace: "pre-wrap" }}>{error}</div>
          ) : !leads.length ? (
            <div style={{ padding: 28, color: "#64748b" }}>No demo leads yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 0 }}>
              {leads.map((lead) => (
                <article
                  key={lead.id}
                  style={{
                    padding: 22,
                    borderBottom: "1px solid #e2e8f0",
                    display: "grid",
                    gap: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <h4 style={{ margin: 0, fontSize: 22 }}>{lead.company_name}</h4>
                        <span
                          style={{
                            borderRadius: 999,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            background:
                              lead.status === "active"
                                ? "#dcfce7"
                                : lead.status === "expired"
                                  ? "#fee2e2"
                                  : "#dbeafe",
                            color:
                              lead.status === "active"
                                ? "#166534"
                                : lead.status === "expired"
                                  ? "#991b1b"
                                  : "#1d4ed8",
                          }}
                        >
                          {lead.status}
                        </span>
                      </div>
                      <div style={{ marginTop: 8, color: "#64748b" }}>
                        Created {new Date(lead.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div
                      style={{
                        minWidth: 190,
                        borderRadius: 18,
                        padding: "14px 16px",
                        background: lead.is_expired ? "#fff1f2" : "#ecfeff",
                        color: lead.is_expired ? "#9f1239" : "#155e75",
                        fontWeight: 700,
                      }}
                    >
                      {lead.is_expired
                        ? "Expired"
                        : `Time remaining ${formatTimer(lead.time_remaining_seconds)}`}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <InfoCard icon={<Mail size={16} />} label="Email" value={lead.email} />
                    <InfoCard icon={<Phone size={16} />} label="Phone" value={lead.phone_number} />
                    <InfoCard icon={<Users size={16} />} label="Users" value={String(lead.num_users)} />
                    <InfoCard
                      icon={<BadgeCheck size={16} />}
                      label="ZIMRA FDMS"
                      value={lead.wants_zimra_fdms ? "Requested" : "No"}
                    />
                  </div>

                  <div style={{ color: "#475569", fontSize: 14 }}>
                    Expires {new Date(lead.expires_at).toLocaleString()}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13 }}>
        {icon}
        {label}
      </div>
      <div style={{ marginTop: 8, fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}
