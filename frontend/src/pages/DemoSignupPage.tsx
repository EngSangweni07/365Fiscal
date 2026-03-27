import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Building2, Mail, Users, Phone } from "lucide-react";
import { apiFetch } from "../api";

const GEE_NET_SUPPORT_EMAIL = "support@geenet.co.zw";
const GEE_NET_WHATSAPP_URL =
  "https://wa.me/263777589119?text=Hello%20GeeNet,%20I%20need%20help%20with%20the%20Three65%20demo.";

type DemoAccount = {
  id: number;
  company_name: string;
  email: string;
  phone_number: string;
  wants_zimra_fdms: boolean;
  num_users: number;
  wants_actual_three65: boolean;
  tin: string;
  vat_number: string;
  trade_name: string;
  address: string;
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
    <div className="login-shell login-centered demo-page-shell">
      <div className="demo-shell demo-shell-single">
        <div className="login-card login-card-glass demo-card">
          <div className="login-card-body demo-card-body">
            <img src="/three.png" alt="Three65" className="logo-365 demo-card-logo" />

            {!isDemoView ? (
              <>
                <div className="demo-form-head">
                  <div className="demo-brand-chip">Three65 demo</div>
                  <h2 className="login-card-title">Create demo account</h2>
                  <p className="demo-form-caption">
                    Explore the live portal in minutes and let us know if you want the
                    full Three65 setup for your business.
                  </p>
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
                      placeholder="Three65"
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
                      placeholder={GEE_NET_SUPPORT_EMAIL}
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
                    <span>Do you want ZIMRA fiscalization of your main system?</span>
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

                  <p className="demo-support-copy">
                    Need help before starting? Chat with our team on WhatsApp.
                  </p>
                </form>
              </>
            ) : (
              <div className="demo-session">
                <div className="demo-form-head">
                  <h2 className="login-card-title">{demo?.company_name || "Demo session"}</h2>
                  <p className="login-card-sub">
                    Your live session is active for 3 minutes from the time it was created.
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

        <a
          className="demo-whatsapp-float"
          href={GEE_NET_WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat with GeeNet on WhatsApp"
          title="Chat with GeeNet on WhatsApp"
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.11 17.23c-.28-.14-1.64-.81-1.9-.9-.25-.09-.43-.14-.61.14-.18.28-.7.9-.86 1.08-.16.19-.31.21-.59.07-.28-.14-1.17-.43-2.23-1.37-.82-.74-1.38-1.65-1.54-1.93-.16-.28-.02-.43.12-.57.12-.12.28-.31.42-.47.14-.16.19-.28.28-.47.09-.19.05-.35-.02-.49-.07-.14-.61-1.48-.84-2.03-.22-.52-.45-.45-.61-.46h-.52c-.19 0-.49.07-.75.35-.26.28-.98.96-.98 2.35s1 2.74 1.14 2.93c.14.19 1.96 2.99 4.75 4.2.66.28 1.18.45 1.58.57.66.21 1.26.18 1.73.11.53-.08 1.64-.67 1.87-1.32.23-.66.23-1.22.16-1.33-.06-.12-.24-.19-.52-.33Z"
            />
            <path
              fill="currentColor"
              d="M16.03 3.2c-7.08 0-12.8 5.68-12.8 12.68 0 2.24.59 4.43 1.7 6.36L3.2 28.8l6.78-1.77a12.9 12.9 0 0 0 6.05 1.54h.01c7.07 0 12.8-5.68 12.8-12.68S23.1 3.2 16.03 3.2Zm0 23.2h-.01a10.8 10.8 0 0 1-5.5-1.5l-.39-.23-4.02 1.05 1.08-3.9-.25-.4a10.57 10.57 0 0 1-1.64-5.55c0-5.86 4.82-10.63 10.74-10.63 2.87 0 5.56 1.11 7.59 3.13a10.51 10.51 0 0 1 3.14 7.5c0 5.86-4.83 10.63-10.74 10.63Z"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
