import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Building2, Clock3, Mail, ShieldCheck, Users, Phone } from "lucide-react";
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
  access_token?: string;
  portal_redirect_url?: string;
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
        setError("");
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
      if (created.access_token) {
        localStorage.setItem("access_token", created.access_token);
        localStorage.setItem("demo_account_id", String(created.id));
        localStorage.setItem("demo_expires_at", created.expires_at);
        localStorage.setItem("demo_email", created.email);
        window.location.href = created.portal_redirect_url || "/";
        return;
      }
      navigate(`/demo/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create demo.");
    } finally {
      setSubmitting(false);
    }
  };

  const expired =
    demo?.is_expired || timeRemaining <= 0 || demo?.status === "expired";

  return (
    <div className="login-shell login-centered">
      <div className="demo-shell">
        <section className="demo-panel">
          <div className="demo-panel-badge">365Fiscal Demo</div>
          <img src="/365.png" alt="365 Fiscal" className="demo-panel-logo" />
          <div className="login-headline">
            <h1 className="login-title">
              {isDemoView
                ? "Your demo session is ready."
                : "Create a demo account that feels like the real system."}
            </h1>
            <p className="login-lead">
              {isDemoView
                ? "Your lead is already saved for the admin in the Leads app. Keep an eye on the countdown while you explore."
                : "Use the same product experience and background as the main login page while capturing company details, phone number, email, ZIMRA FDMS preference, and expected user count."}
            </p>
          </div>

          {!isDemoView ? (
            <div className="login-features demo-features">
              <div className="login-feature">
                <span className="feature-icon">
                  <Clock3 size={18} />
                </span>
                <span className="feature-text">
                  <strong>30-minute live trial</strong>
                  <span>Every demo expires automatically after thirty minutes.</span>
                </span>
              </div>
              <div className="login-feature">
                <span className="feature-icon">
                  <ShieldCheck size={18} />
                </span>
                <span className="feature-text">
                  <strong>Lead captured for admin</strong>
                  <span>Requests appear in the Leads app for follow-up and conversion.</span>
                </span>
              </div>
              <div className="login-feature">
                <span className="feature-icon">
                  <Users size={18} />
                </span>
                <span className="feature-text">
                  <strong>ZIMRA FDMS and user sizing</strong>
                  <span>Capture fiscal needs and the expected number of users up front.</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="demo-summary-grid">
              <SummaryCard label="Company" value={demo?.company_name ?? "Demo"} />
              <SummaryCard label="Email" value={demo?.email ?? "-"} />
              <SummaryCard label="Phone" value={demo?.phone_number ?? "-"} />
              <SummaryCard
                label="ZIMRA FDMS"
                value={demo?.wants_zimra_fdms ? "Requested" : "Not requested"}
              />
            </div>
          )}
        </section>

        <div className="login-card login-card-glass demo-card">
          <div className="login-card-body demo-card-body">
            <img src="/365.png" alt="365 Fiscal" className="logo-365 demo-card-logo" />

            {!isDemoView ? (
              <>
                <div className="demo-form-head">
                  <h2 className="login-card-title">Create demo account</h2>
                  <p className="login-card-sub">
                    Fill in your details and we will open a 30-minute demo session.
                  </p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                  <div className="input-group">
                    <label className="input-label" htmlFor="demo-company">
                      <Building2 size={14} />
                      Company
                    </label>
                    <input
                      id="demo-company"
                      value={form.company_name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          company_name: event.target.value,
                        }))
                      }
                      placeholder="Acme Retail"
                      required
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label" htmlFor="demo-phone">
                      <Phone size={14} />
                      Phone number
                    </label>
                    <input
                      id="demo-phone"
                      value={form.phone_number}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          phone_number: event.target.value,
                        }))
                      }
                      placeholder="+263 77 123 4567"
                      required
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label" htmlFor="demo-email">
                      <Mail size={14} />
                      Email
                    </label>
                    <input
                      id="demo-email"
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      placeholder="you@company.com"
                      required
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label" htmlFor="demo-users">
                      <Users size={14} />
                      Number of users
                    </label>
                    <input
                      id="demo-users"
                      type="number"
                      min={1}
                      max={500}
                      value={form.num_users}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          num_users: Number(event.target.value) || 1,
                        }))
                      }
                      required
                    />
                  </div>

                  <label className="demo-checkbox">
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

                  {error && <div className="login-error">{error}</div>}

                  <button className="login-btn" type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <span className="spinner"></span>
                        <span>Creating demo...</span>
                      </>
                    ) : (
                      <span>Start demo</span>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="demo-session">
                <div className="demo-form-head">
                  <h2 className="login-card-title">{demo?.company_name || "Demo session"}</h2>
                  <p className="login-card-sub">
                    Your live session is active for 30 minutes from the time it was created.
                  </p>
                </div>

                <div className={`demo-timer-card ${expired ? "expired" : ""}`}>
                  <div className="demo-timer-label">Time remaining</div>
                  <div className="demo-timer-value">{formatRemaining(timeRemaining)}</div>
                  <div className="demo-timer-meta">
                    {expired ? "This demo has expired." : `Expires at ${expiresAtLabel}`}
                  </div>
                </div>

                {error && <div className="login-error">{error}</div>}

                <div className="demo-link-row">
                  <Link to="/demo" className="login-btn demo-secondary-btn">
                    Create another demo later
                  </Link>
                  <Link to="/login" className="demo-text-link">
                    Go to admin login
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="login-card-footer">
            <span>
              <strong>
                <a
                  style={{ textDecoration: "underline", color: "var(--blue-50)" }}
                  target="_blank"
                  rel="noreferrer"
                  href="http://www.geenet.co.zw"
                >
                  Powered by GeeNet
                </a>
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="demo-summary-card">
      <div className="demo-summary-label">{label}</div>
      <div className="demo-summary-value">{value}</div>
    </div>
  );
}
