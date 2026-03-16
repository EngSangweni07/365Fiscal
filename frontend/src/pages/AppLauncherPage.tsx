import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Building2,
  Calculator,
  ChartColumn,
  CreditCard,
  FilePenLine,
  FileText,
  LayoutDashboard,
  Monitor,
  ReceiptText,
  Settings,
  ShoppingCart,
  UsersRound,
} from "lucide-react";
import { useMe } from "../hooks/useMe";
import { getInitials } from "../hooks/getInitials";
import { apiFetch } from "../api";

type ActivationStatus = {
  activated: boolean;
  plan: string | null;
  status: string | null;
  expires_at: string | null;
  company_name: string | null;
};

// App icons powered by Lucide
const DashboardIcon = LayoutDashboard;
const InvoiceIcon = FileText;
const PurchaseIcon = ShoppingCart;
const ContactIcon = UsersRound;
const QuoteIcon = FilePenLine;
const InventoryIcon = Boxes;
const DeviceIcon = Monitor;
const ReportsIcon = ChartColumn;
const ExpensesIcon = ReceiptText;
const SettingsIcon = Settings;
const CompanyIcon = Building2;
const SubscriptionIcon = CreditCard;
const POSLauncherIcon = Calculator;

interface AppItem {
  to: string;
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  background: string;
  glowColor: string;
}

const adminApps: AppItem[] = [
  {
    to: "/dashboard",
    key: "dashboard",
    label: "Dashboard",
    icon: DashboardIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #f49a52 0%, #f28f42 100%)",
    glowColor: "rgba(249, 115, 22, 0.18)",
  },
  {
    to: "/companies",
    key: "companies",
    label: "Companies",
    icon: CompanyIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #8d68ef 0%, #8458e6 100%)",
    glowColor: "rgba(124, 58, 237, 0.18)",
  },
  {
    to: "/invoices",
    key: "invoices",
    label: "Invoices",
    icon: InvoiceIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #f27c89 0%, #ef6b6b 100%)",
    glowColor: "rgba(239, 68, 68, 0.18)",
  },
  {
    to: "/purchases",
    key: "purchases",
    label: "Purchases",
    icon: PurchaseIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #56c0ee 0%, #38afe6 100%)",
    glowColor: "rgba(14, 165, 233, 0.18)",
  },
  // { to: "/products", label: "Products", icon: ProductIcon, color: "var(--white-500)", background: "var(--cyan-500)" },
  {
    to: "/contacts",
    key: "contacts",
    label: "Contacts",
    icon: ContactIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #5dc99f 0%, #34be90 100%)",
    glowColor: "rgba(16, 185, 129, 0.18)",
  },
  {
    to: "/quotations",
    key: "quotations",
    label: "Quotations",
    icon: QuoteIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #858df0 0%, #7678eb 100%)",
    glowColor: "rgba(99, 102, 241, 0.18)",
  },
  {
    to: "/inventory",
    key: "inventory",
    label: "Inventory",
    icon: InventoryIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #a087ef 0%, #8e61e5 100%)",
    glowColor: "rgba(124, 58, 237, 0.18)",
  },
  // {
  //   to: "/pos",
  //   label: "Point of Sale",
  //   icon: POSLauncherIcon,
  //   color: "var(--white-500)",
  //   background: "linear-gradient(135deg, #4ade80 0%, #22c55e 58%, #16a34a 100%)",
  // },
  {
    to: "/devices",
    key: "devices",
    label: "Devices",
    icon: DeviceIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #ef7eb6 0%, #e56aa7 100%)",
    glowColor: "rgba(236, 72, 153, 0.18)",
  },
  {
    to: "/reports",
    key: "reports",
    label: "Financial Reports",
    icon: ReportsIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #58c8bc 0%, #37b9ab 100%)",
    glowColor: "rgba(20, 184, 166, 0.18)",
  },
  {
    to: "/expenses",
    key: "expenses",
    label: "Expenses",
    icon: ExpensesIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #63d18b 0%, #44c570 100%)",
    glowColor: "rgba(34, 197, 94, 0.18)",
  },
  {
    to: "/subscriptions",
    key: "subscriptions",
    label: "Subscriptions",
    icon: SubscriptionIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #efbc5d 0%, #eeb03f 100%)",
    glowColor: "rgba(245, 158, 11, 0.18)",
  },
  {
    to: "/settings",
    key: "settings",
    label: "Settings",
    icon: SettingsIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #98a5b5 0%, #7a8798 100%)",
    glowColor: "rgba(100, 116, 139, 0.16)",
  },
];

const portalApps: AppItem[] = [
  {
    to: "/dashboard",
    key: "dashboard",
    label: "Dashboard",
    icon: DashboardIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #f49a52 0%, #f28f42 100%)",
    glowColor: "rgba(249, 115, 22, 0.18)",
  },
  {
    to: "/invoices",
    key: "invoices",
    label: "Invoices",
    icon: InvoiceIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #f27c89 0%, #ef6b6b 100%)",
    glowColor: "rgba(239, 68, 68, 0.18)",
  },
  {
    to: "/purchases",
    key: "purchases",
    label: "Purchases",
    icon: PurchaseIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #56c0ee 0%, #38afe6 100%)",
    glowColor: "rgba(14, 165, 233, 0.18)",
  },
  {
    to: "/contacts",
    key: "contacts",
    label: "Contacts",
    icon: ContactIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #5dc99f 0%, #34be90 100%)",
    glowColor: "rgba(16, 185, 129, 0.18)",
  },
  {
    to: "/quotations",
    key: "quotations",
    label: "Quotations",
    icon: QuoteIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #858df0 0%, #7678eb 100%)",
    glowColor: "rgba(99, 102, 241, 0.18)",
  },
  {
    to: "/inventory",
    key: "inventory",
    label: "Inventory",
    icon: InventoryIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #a087ef 0%, #8e61e5 100%)",
    glowColor: "rgba(124, 58, 237, 0.18)",
  },
  {
    to: "/pos",
    key: "pos",
    label: "Point of Sale",
    icon: POSLauncherIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #63d18b 0%, #44c570 100%)",
    glowColor: "rgba(34, 197, 94, 0.18)",
  },
  {
    to: "/my-devices",
    key: "devices",
    label: "Devices",
    icon: DeviceIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #ef7eb6 0%, #e56aa7 100%)",
    glowColor: "rgba(236, 72, 153, 0.18)",
  },
  {
    to: "/reports",
    key: "reports",
    label: "Financial Reports",
    icon: ReportsIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #58c8bc 0%, #37b9ab 100%)",
    glowColor: "rgba(20, 184, 166, 0.18)",
  },
  {
    to: "/expenses",
    key: "expenses",
    label: "Expenses",
    icon: ExpensesIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #63d18b 0%, #44c570 100%)",
    glowColor: "rgba(34, 197, 94, 0.18)",
  },
  {
    to: "/settings",
    key: "settings",
    label: "Settings",
    icon: SettingsIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #98a5b5 0%, #7a8798 100%)",
    glowColor: "rgba(100, 116, 139, 0.16)",
  },
];

export default function AppLauncherPage() {
  const { me, loading } = useMe();
  const isAdmin = Boolean(me?.is_admin);
  const allowedPortalApps = (
    me?.companies?.[0]?.user_portal_apps ??
    me?.companies?.[0]?.portal_apps ??
    []
  )
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const isPortalSuperUser = Boolean(me?.companies?.[0]?.is_portal_super_user);
  const apps = isAdmin
    ? adminApps
    : portalApps.filter((app) =>
        app.key === "settings"
          ? isPortalSuperUser
          : allowedPortalApps.length
            ? allowedPortalApps.includes(app.key)
            : true,
      );
  const displayName = me?.email ?? "User";
  const initials = getInitials(displayName);

  // Portal activation gate
  const [activationStatus, setActivationStatus] = useState<
    ActivationStatus[] | null
  >(null);
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [activateError, setActivateError] = useState("");
  const [activateSuccess, setActivateSuccess] = useState("");
  const [activating, setActivating] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const companyName = !isAdmin
    ? (me?.companies?.[0]?.name ??
      activationStatus?.find((s) => Boolean(s.company_name))?.company_name ??
      "")
    : "";

  const formatActivationCode = (raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const groups = cleaned.match(/.{1,4}/g) || [];
    return groups.join("-");
  };

  useEffect(() => {
    if (!isAdmin && me) {
      setActivationLoading(true);
      apiFetch<ActivationStatus[]>("/subscriptions/my-status")
        .then((data) => setActivationStatus(data))
        .catch(() => setActivationStatus([]))
        .finally(() => setActivationLoading(false));
    }
  }, [isAdmin, me]);

  const hasActiveSubscription = activationStatus?.some(
    (s) => s.activated && s.status === "active",
  );

  const handleActivate = async () => {
    if (!activationCode.trim()) return;
    setActivating(true);
    setActivateError("");
    setActivateSuccess("");
    try {
      await apiFetch("/subscriptions/activate", {
        method: "POST",
        body: JSON.stringify({ code: activationCode.trim() }),
      });
      setActivateSuccess("Subscription activated successfully!");
      setActivationCode("");
      // Reload status
      const data = await apiFetch<ActivationStatus[]>(
        "/subscriptions/my-status",
      );
      setActivationStatus(data);
    } catch (err: any) {
      setActivateError(err.message || "Invalid or expired activation code.");
    } finally {
      setActivating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    window.location.href = "/login";
  };

  // Show loading state
  if (loading || activationLoading) {
    return (
      <div className="app-launcher-page">
        <div className="app-launcher-watermark" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div
          className="app-launcher-watermark app-launcher-watermark-top"
          aria-hidden="true"
        >
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div
          className="app-launcher-container"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center", color: "var(--slate-500)" }}>
            <div style={{ fontSize: "18px", fontWeight: 600 }}>Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  // Portal activation gate — no active subscription
  if (!isAdmin && !hasActiveSubscription && me) {
    return (
      <div className="app-launcher-page">
        <div className="app-launcher-watermark" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div
          className="app-launcher-watermark app-launcher-watermark-top"
          aria-hidden="true"
        >
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="app-launcher-container app-launcher-activation">
          <div className="login-card login-card-glass activation-card">
            <div className="login-card-body activation-card-body">
              {/* <div className="activation-icon">
                <svg
                  width="44"
                  height="44"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div> */}
              <img src="/365.png" alt="365 Fiscal" className="logo-365" />
              <h2 className="login-card-title activation-title">
                Enter your subscription code
              </h2>
              s
              {activateError && (
                <div className="login-error activation-message">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {activateError}
                </div>
              )}
              {activateSuccess && (
                <div className="login-status activation-message">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  {activateSuccess}
                </div>
              )}
              <div className="login-form activation-form">
                <div className="input-group">
                  <input
                    type="text"
                    value={activationCode}
                    onChange={(e) =>
                      setActivationCode(formatActivationCode(e.target.value))
                    }
                    placeholder="XXXX – XXXX – XXXX – XXXX"
                    maxLength={19}
                    className="activation-code-input"
                    onKeyDown={(e) => e.key === "Enter" && handleActivate()}
                  />
                </div>

                <button
                  className="login-btn"
                  onClick={handleActivate}
                  disabled={activating || activationCode.trim().length < 10}
                >
                  {activating ? (
                    <>
                      <span className="spinner"></span>
                      <span>Activating...</span>
                    </>
                  ) : (
                    <>
                      <span>Activate</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
              <p
                className="activation-note,  "
                style={{
                  color: "var(--black-500)",
                  textAlign: "center",
                  marginTop: "1rem",
                }}
              >
                Don't have a code?{" "}
                <a
                  style={{
                    textDecoration: "underline",
                    color: "var(--black-500)",
                  }}
                  target="_blank"
                  rel="noreferrer"
                  href="http://www.geenet.co.zw"
                >
                  Contact us for support
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-launcher-page">
      <div className="app-launcher-watermark" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div
        className="app-launcher-watermark app-launcher-watermark-top"
        aria-hidden="true"
      >
        <span></span>
        <span></span>
        <span></span>
      </div>
      {/* Header */}
      <header className="app-launcher-header">
        <div className="app-launcher-user">
          {!isAdmin && companyName && (
            <div className="text-decoration-line rounded-md p-2 flex items-center gap-2 font-bold">
              <span>{companyName}</span>
            </div>
          )}
          <button
            type="button"
            className="user-menu"
            onClick={() => setUserMenuOpen((prev) => !prev)}
          >
            <span className="user-avatar-sm">{initials}</span>
          </button>
          {userMenuOpen && (
            <div className="menu-popover right" role="menu">
              <div className="menu-title">
                <span className="user-name-sm">{displayName}</span>
              </div>
              {(isAdmin || isPortalSuperUser) && (
                <button
                  className="menu-item"
                  onClick={() => {
                    window.location.href = "/settings";
                  }}
                  role="menuitem"
                >
                  Settings
                </button>
              )}
              <button
                className="menu-item danger"
                onClick={handleLogout}
                role="menuitem"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* App Grid Container */}
      <div className="app-launcher-container">
        <div className="app-grid">
          {apps.map((app, index) => (
            <NavLink
              key={app.to}
              to={app.to}
              className="app-tile"
              style={{ animationDelay: `${60 + index * 40}ms` }}
            >
              <div
                className="app-tile-icon-wrapper"
                style={
                  {
                    background: app.background,
                    "--app-tile-glow": app.glowColor,
                  } as CSSProperties
                }
              >
                <div className="app-tile-icon" style={{ color: app.color }}>
                  <app.icon size={34} strokeWidth={2} />
                </div>
              </div>
              <span className="app-tile-label">{app.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
