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
            <img
              src="/three65.png"
              alt="Three65"
              className="logo-365 demo-card-logo"
            />

            {!isDemoView ? (
              <>
                <div className="demo-form-head">
                  <h2 className="login-card-title">Create demo account</h2>
                </div>

                <form
                  className="login-form demo-form-compact"
                  onSubmit={handleSubmit}
                >
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
                    <span>
                      Do you want ZIMRA fiscalization of your main system?
                    </span>
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
                  <h2 className="login-card-title">
                    {demo?.company_name || "Demo session"}
                  </h2>
                  <p className="login-card-sub">
                    Your live session is active for 30 seconds from the time it
                    was created.
                  </p>
                </div>

                <div className={`demo-timer-card ${expired ? "expired" : ""}`}>
                  <div className="demo-timer-label">Time remaining</div>
                  <div className="demo-timer-value">
                    {formatRemaining(timeRemaining)}
                  </div>
                  <div className="demo-timer-meta">
                    {expired
                      ? "This demo has expired."
                      : `Expires at ${expiresAtLabel}`}
                  </div>
                </div>

                {error && <div className="login-error">{error}</div>}

                <div className="demo-link-row">
                  <Link
                    to="/demo"
                    className="login-btn demo-submit-btn demo-secondary-btn"
                  >
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
                  style={{
                    textDecoration: "underline",
                    color: "var(--blue-50)",
                  }}
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            version="1.1"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            width="512"
            height="512"
            x="0"
            y="0"
            viewBox="0 0 24 24"
            style="enable-background:new 0 0 512 512"
            xml:space="preserve"
            class=""
          >
            <g>
              <path
                d="m17.507 14.307-.009.075c-2.199-1.096-2.429-1.242-2.713-.816-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.293-.506.32-.578.878-1.634.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.576-.05-.997-.042-1.368.344-1.614 1.774-1.207 3.604.174 5.55 2.714 3.552 4.16 4.206 6.804 5.114.714.227 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345z"
                fill="#ffffff"
                opacity="1"
                data-original="#000000"
                class=""
              ></path>
              <path
                d="M20.52 3.449C12.831-3.984.106 1.407.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652c7.905 4.27 17.661-1.4 17.665-10.449 0-3.176-1.24-6.165-3.495-8.411zm1.482 8.417c-.006 7.633-8.385 12.4-15.012 8.504l-.36-.214-3.75.975 1.005-3.645-.239-.375c-4.124-6.565.614-15.145 8.426-15.145a9.865 9.865 0 0 1 7.021 2.91 9.788 9.788 0 0 1 2.909 6.99z"
                fill="#ffffff"
                opacity="1"
                data-original="#000000"
                class=""
              ></path>
            </g>
          </svg>
        </a>
      </div>
    </div>
  );
}
