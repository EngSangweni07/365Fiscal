import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api";

type DemoAccount = {
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

type DemoFormState = {
  company_name: string;
  phone_number: string;
  email: string;
  wants_zimra_fdms: boolean;
  num_users: number;
};

const initialForm: DemoFormState = {
  company_name: "",
  phone_number: "",
  email: "",
  wants_zimra_fdms: false,
  num_users: 1,
};

const pageShellStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(16, 185, 129, 0.18), transparent 35%), linear-gradient(135deg, #0f172a 0%, #11263c 52%, #1c4b4d 100%)",
  color: "#e2e8f0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 16px",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  borderRadius: 28,
  overflow: "hidden",
  background: "rgba(15, 23, 42, 0.82)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  boxShadow: "0 28px 80px rgba(15, 23, 42, 0.35)",
  backdropFilter: "blur(20px)",
  display: "grid",
  gridTemplateColumns: "minmax(320px, 1.15fr) minmax(320px, 0.85fr)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.6)",
  color: "#f8fafc",
  padding: "14px 16px",
  fontSize: 15,
  outline: "none",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 14,
  color: "#cbd5e1",
};

function formatRemaining(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function DemoSignupPage() {
  const { demoId } = useParams<{ demoId?: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<DemoFormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState<DemoAccount | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 960);

  const isDemoView = Boolean(demoId);

  useEffect(() => {
    if (!demoId) return;
    let cancelled = false;

    const loadDemo = async () => {
      try {
        const payload = await apiFetch<DemoAccount>(`/demo/${demoId}`, {
          auth: false,
          suppress401Redirect: true,
        });
        if (cancelled) return;
        setDemo(payload);
        setTimeRemaining(payload.time_remaining_seconds);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load demo.");
      }
    };

    loadDemo();
    const refreshTimer = window.setInterval(loadDemo, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [demoId]);

  useEffect(() => {
    if (!isDemoView) return;
    const countdown = window.setInterval(() => {
      setTimeRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(countdown);
  }, [isDemoView]);

  useEffect(() => {
    const handleResize = () => setIsCompact(window.innerWidth < 960);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const expiresAtLabel = useMemo(() => {
    if (!demo?.expires_at) return "";
    return new Date(demo.expires_at).toLocaleString();
  }, [demo?.expires_at]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const created = await apiFetch<DemoAccount>("/demo/signup", {
        method: "POST",
        auth: false,
        suppress401Redirect: true,
        body: JSON.stringify(form),
      });
      navigate(`/demo/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create demo.");
    } finally {
      setSubmitting(false);
    }
  };

  const expired = demo?.is_expired || timeRemaining <= 0 || demo?.status === "expired";

  return (
    <div style={pageShellStyle}>
      <div
        style={{
          ...cardStyle,
          gridTemplateColumns: isCompact ? "minmax(0, 1fr)" : cardStyle.gridTemplateColumns,
        }}
      >
        <section
          style={{
            padding: 40,
            background:
              "linear-gradient(180deg, rgba(15,23,42,0.18) 0%, rgba(8,47,73,0.4) 100%)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(16, 185, 129, 0.16)",
              color: "#a7f3d0",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            365Fiscal Demo
          </div>
          <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: "20px 0 12px" }}>
            Explore a live demo account in under 30 minutes.
          </h1>
          <p style={{ margin: 0, color: "#cbd5e1", maxWidth: 520, fontSize: 16, lineHeight: 1.7 }}>
            Capture your company details, tell us how many users you expect, and let
            us know whether you want ZIMRA FDMS support. Your request is saved into
            the admin Leads app immediately.
          </p>

          <div
            style={{
              marginTop: 30,
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            {[
              { label: "Demo lifetime", value: "30 minutes" },
              { label: "Lead captured", value: "Visible to admin" },
              { label: "FDMS preference", value: "Optional" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: 18,
                  borderRadius: 18,
                  background: "rgba(15, 23, 42, 0.5)",
                  border: "1px solid rgba(148, 163, 184, 0.14)",
                }}
              >
                <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {item.label}
                </div>
                <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: 40 }}>
          {!isDemoView ? (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 30 }}>Create demo account</h2>
                <p style={{ margin: "8px 0 0", color: "#94a3b8", lineHeight: 1.6 }}>
                  Fill in your details and we will open a 30-minute demo session.
                </p>
              </div>

              <label style={labelStyle}>
                Company
                <input
                  style={inputStyle}
                  value={form.company_name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, company_name: event.target.value }))
                  }
                  placeholder="Acme Retail"
                  required
                />
              </label>

              <label style={labelStyle}>
                Phone number
                <input
                  style={inputStyle}
                  value={form.phone_number}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone_number: event.target.value }))
                  }
                  placeholder="+263 77 123 4567"
                  required
                />
              </label>

              <label style={labelStyle}>
                Email
                <input
                  type="email"
                  style={inputStyle}
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="you@company.com"
                  required
                />
              </label>

              <label style={labelStyle}>
                Number of users
                <input
                  type="number"
                  min={1}
                  max={500}
                  style={inputStyle}
                  value={form.num_users}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      num_users: Number(event.target.value) || 1,
                    }))
                  }
                  required
                />
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 16,
                  borderRadius: 16,
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  background: "rgba(15, 23, 42, 0.42)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.wants_zimra_fdms}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      wants_zimra_fdms: event.target.checked,
                    }))
                  }
                />
                <span>I want ZIMRA FDMS enabled for the demo.</span>
              </label>

              {error && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(248, 113, 113, 0.28)",
                    color: "#fecaca",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  border: 0,
                  borderRadius: 16,
                  padding: "16px 20px",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#022c22",
                  background: "linear-gradient(135deg, #6ee7b7 0%, #34d399 100%)",
                  cursor: submitting ? "wait" : "pointer",
                }}
              >
                {submitting ? "Creating demo..." : "Start demo"}
              </button>
            </form>
          ) : (
            <div style={{ display: "grid", gap: 22 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 30 }}>
                  {demo?.company_name || "Demo session"}
                </h2>
                <p style={{ margin: "8px 0 0", color: "#94a3b8", lineHeight: 1.6 }}>
                  Your demo account is active for 30 minutes from creation time.
                </p>
              </div>

              <div
                style={{
                  padding: 24,
                  borderRadius: 24,
                  background: expired
                    ? "linear-gradient(135deg, rgba(127,29,29,0.65), rgba(69,10,10,0.8))"
                    : "linear-gradient(135deg, rgba(5,150,105,0.22), rgba(8,47,73,0.7))",
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                }}
              >
                <div style={{ fontSize: 13, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Time remaining
                </div>
                <div style={{ fontSize: 64, lineHeight: 1, margin: "14px 0 10px", fontWeight: 800 }}>
                  {formatRemaining(timeRemaining)}
                </div>
                <div style={{ color: "#cbd5e1" }}>
                  {expired ? "This demo has expired." : `Expires at ${expiresAtLabel}`}
                </div>
              </div>

              {demo && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 14,
                  }}
                >
                  {[
                    { label: "Email", value: demo.email },
                    { label: "Phone", value: demo.phone_number },
                    { label: "Users", value: String(demo.num_users) },
                    {
                      label: "ZIMRA FDMS",
                      value: demo.wants_zimra_fdms ? "Requested" : "Not requested",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        padding: 16,
                        borderRadius: 16,
                        background: "rgba(15, 23, 42, 0.45)",
                        border: "1px solid rgba(148, 163, 184, 0.14)",
                      }}
                    >
                      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {item.label}
                      </div>
                      <div style={{ marginTop: 8, fontWeight: 700, wordBreak: "break-word" }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(248, 113, 113, 0.28)",
                    color: "#fecaca",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link
                  to="/demo"
                  style={{
                    textDecoration: "none",
                    borderRadius: 14,
                    padding: "14px 18px",
                    fontWeight: 700,
                    color: "#022c22",
                    background: "linear-gradient(135deg, #6ee7b7 0%, #34d399 100%)",
                  }}
                >
                  Create another demo later
                </Link>
                <Link
                  to="/login"
                  style={{
                    textDecoration: "none",
                    borderRadius: 14,
                    padding: "14px 18px",
                    fontWeight: 700,
                    color: "#e2e8f0",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    background: "rgba(15, 23, 42, 0.45)",
                  }}
                >
                  Admin login
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
