import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Building2, Mail, Users, Phone } from "lucide-react";
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

function parseApiDate(value: string) {
  if (!value) return new Date("");
  const hasTimezone = /[zZ]$|[+\-]\d{2}:\d{2}$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

function formatHarareDateTime(value: string) {
  return parseApiDate(value).toLocaleString("en-ZW", {
    timeZone: "Africa/Harare",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
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
    return `${formatHarareDateTime(demo.expires_at)} CAT`;
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
        localStorage.removeItem("demo_expires_at");
        localStorage.setItem(
          "demo_expires_at_ms",
          String(Date.now() + created.time_remaining_seconds * 1000),
        );
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
      <div className="demo-shell demo-shell-single">
        <div className="login-card login-card-glass demo-card">
          <div className="login-card-body demo-card-body">
            <img src="/three.png" alt="365 Fiscal" className="logo-365 demo-card-logo" />

            {!isDemoView ? (
              <>
                <div className="demo-form-head">
                  <h2 className="login-card-title">Create demo account</h2>
                </div>

                <form className="login-form demo-form-compact" onSubmit={handleSubmit}>
                  <div className="input-group demo-field">
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

                  <div className="input-group demo-field">
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

                  <div className="input-group demo-field">
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

                  <div className="input-group demo-field">
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

                  <button
                    className="login-btn demo-submit-btn"
                    type="submit"
                    disabled={submitting}
                  >
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
                  <Link to="/demo" className="login-btn demo-submit-btn demo-secondary-btn">
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
