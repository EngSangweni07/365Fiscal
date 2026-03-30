import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  BriefcaseBusiness,
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

type DemoAccount = {
  id: number;
  company_name: string;
  email: string;
  phone_number: string;
  wants_zimra_fdms: boolean;
  num_users: number;
  wants_actual_three65: boolean;
  requested_apps: string[];
  subscription_period: "monthly" | "yearly";
  payment_link: string;
  payment_method?: "ecocash" | "visa" | "";
  ecocash_phone_number?: string;
  paynow_status?: string;
  tin: string;
  vat_number: string;
  trade_name: string;
  address: string;
  status: string;
};

type DemoInterestForm = {
  wants_actual_three65: boolean;
  company_name: string;
  phone_number: string;
  num_users: number;
  requested_apps: string[];
  subscription_period: "monthly" | "yearly";
  payment_link: string;
  payment_method?: "ecocash" | "visa" | "";
  ecocash_phone_number?: string;
  wants_zimra_fdms: boolean;
  tin: string;
  vat_number: string;
  trade_name: string;
  address: string;
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
const LeadsIcon = BriefcaseBusiness;

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
    to: "/leads",
    key: "leads",
    label: "Leads",
    icon: LeadsIcon,
    color: "var(--white-500)",
    background: "linear-gradient(145deg, #2dd4bf 0%, #0f766e 100%)",
    glowColor: "rgba(20, 184, 166, 0.2)",
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

function parseApiDate(value: string) {
  if (!value) return new Date("");
  const hasTimezone = /[zZ]$|[+\-]\d{2}:\d{2}$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

const demoInterestAppOptions = [
  { key: "invoices", label: "Invoices" },
  { key: "purchases", label: "Purchases" },
  { key: "contacts", label: "Contacts" },
  { key: "quotations", label: "Quotations" },
  { key: "inventory", label: "Inventory" },
  { key: "pos", label: "Point of Sale" },
  { key: "expenses", label: "Expenses" },
  { key: "reports", label: "Financial Reports" },
];

const paymentMethodOptions = [
  { key: "ecocash", label: "EcoCash" },
  { key: "visa", label: "Visa Card" },
] as const;

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
  const [demoCountdown, setDemoCountdown] = useState<number | null>(null);
  const [demoAccount, setDemoAccount] = useState<DemoAccount | null>(null);
  const [demoInterestOpen, setDemoInterestOpen] = useState(false);
  const [demoInterestError, setDemoInterestError] = useState("");
  const [demoInterestSubmitting, setDemoInterestSubmitting] = useState(false);
  const [demoInterestSubmitted, setDemoInterestSubmitted] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    "ecocash" | "visa" | ""
  >("");
  const [ecocashPhoneNumber, setEcocashPhoneNumber] = useState("");
  const [demoInterestForm, setDemoInterestForm] = useState<DemoInterestForm>({
    wants_actual_three65: true,
    company_name: "",
    phone_number: "",
    num_users: 1,
    requested_apps: [],
    subscription_period: "monthly",
    payment_link: "",
    wants_zimra_fdms: false,
    tin: "",
    vat_number: "",
    trade_name: "",
    address: "",
  });
  const companyName = !isAdmin
    ? (me?.companies?.[0]?.name ??
      activationStatus?.find((s) => Boolean(s.company_name))?.company_name ??
      "")
    : "";
  const isDemoWorkspace = companyName === "Three65 Demo Workspace";

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

  useEffect(() => {
    if (!demoInterestForm.company_name.trim()) {
      return;
    }
    const origin = window.location.origin;
    const companyParam = encodeURIComponent(
      demoInterestForm.company_name.trim(),
    );
    const periodParam = encodeURIComponent(
      demoInterestForm.subscription_period,
    );
    const paymentLink = `${origin}/subscriptions?source=demo&period=${periodParam}&company=${companyParam}`;
    setDemoInterestForm((current) =>
      current.payment_link === paymentLink
        ? current
        : { ...current, payment_link: paymentLink },
    );
  }, [demoInterestForm.company_name, demoInterestForm.subscription_period]);

  useEffect(() => {
    const demoEmail = localStorage.getItem("demo_email");
    const demoExpiresAtMs = localStorage.getItem("demo_expires_at_ms");
    if (
      !me ||
      isAdmin ||
      !demoEmail ||
      !demoExpiresAtMs ||
      me.email !== demoEmail
    ) {
      setDemoCountdown(null);
      return;
    }

    const computeRemaining = () => {
      const expiresAtMs = Number(demoExpiresAtMs);
      const remaining = Math.max(
        0,
        Math.floor((expiresAtMs - Date.now()) / 1000),
      );
      setDemoCountdown(remaining);
    };

    computeRemaining();
    const timer = window.setInterval(computeRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [isAdmin, me]);

  useEffect(() => {
    const demoAccountId = localStorage.getItem("demo_account_id");
    const demoEmail = localStorage.getItem("demo_email");
    if (
      !me ||
      isAdmin ||
      !demoAccountId ||
      !demoEmail ||
      me.email !== demoEmail
    ) {
      setDemoAccount(null);
      return;
    }

    const submittedKey = `demo_interest_submitted_${demoAccountId}`;
    setDemoInterestSubmitted(localStorage.getItem(submittedKey) === "true");

    apiFetch<DemoAccount>(`/demo/${demoAccountId}`, {
      auth: false,
      suppress401Redirect: true,
    })
      .then((data) => {
        setDemoAccount(data);
        setSelectedPaymentMethod(data.payment_method || "");
        setEcocashPhoneNumber(data.ecocash_phone_number || "");
        setDemoInterestForm({
          wants_actual_three65:
            typeof data.wants_actual_three65 === "boolean"
              ? data.wants_actual_three65
              : true,
          company_name: data.company_name || me.companies?.[0]?.name || "",
          phone_number: data.phone_number || "",
          num_users: data.num_users || 1,
          requested_apps: data.requested_apps || [],
          subscription_period: data.subscription_period || "monthly",
          payment_link: data.payment_link || "",
          payment_method: data.payment_method || "",
          ecocash_phone_number: data.ecocash_phone_number || "",
          wants_zimra_fdms: data.wants_zimra_fdms,
          tin: data.tin || "",
          vat_number: data.vat_number || "",
          trade_name: data.trade_name || "",
          address: data.address || "",
        });
      })
      .catch(() => setDemoAccount(null));
  }, [isAdmin, me]);

  useEffect(() => {
    const demoAccountId = localStorage.getItem("demo_account_id");
    if (
      isAdmin ||
      demoCountdown === null ||
      demoCountdown > 0 ||
      !demoAccountId ||
      demoInterestSubmitted
    ) {
      return;
    }
    setDemoInterestOpen(true);
  }, [demoCountdown, demoInterestSubmitted, isAdmin]);

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
      localStorage.removeItem("demo_account_id");
      localStorage.removeItem("demo_expires_at");
      localStorage.removeItem("demo_expires_at_ms");
      localStorage.removeItem("demo_email");
      // Reload status
      const data = await apiFetch<ActivationStatus[]>(
        "/subscriptions/my-status",
      );
      setActivationStatus(data);
      setDemoCountdown(null);
      setDemoAccount(null);
      setDemoInterestOpen(false);
    } catch (err: any) {
      setActivateError(err.message || "Invalid or expired activation code.");
    } finally {
      setActivating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("demo_account_id");
    localStorage.removeItem("demo_expires_at");
    localStorage.removeItem("demo_expires_at_ms");
    localStorage.removeItem("demo_email");
    window.location.href = "/login";
  };

  const handleDemoInterestSubmit = async () => {
    const demoAccountId = localStorage.getItem("demo_account_id");
    if (!demoAccountId) {
      setDemoInterestError("Demo account could not be found.");
      return;
    }
    if (
      !demoInterestForm.company_name.trim() ||
      !demoInterestForm.phone_number.trim()
    ) {
      setDemoInterestError("Company name and phone number are required.");
      return;
    }
    if (demoInterestForm.wants_zimra_fdms) {
      const zimraFieldsFilled =
        demoInterestForm.tin.trim() &&
        demoInterestForm.vat_number.trim() &&
        demoInterestForm.trade_name.trim() &&
        demoInterestForm.address.trim();
      if (!zimraFieldsFilled) {
        setDemoInterestError(
          "TIN, VAT, trade name and address are required for ZIMRA fiscalization.",
        );
        return;
      }
    }
    if (!selectedPaymentMethod) {
      setDemoInterestError("Select a payment method.");
      return;
    }
    if (selectedPaymentMethod === "ecocash" && !ecocashPhoneNumber.trim()) {
      setDemoInterestError("Enter an EcoCash phone number.");
      return;
    }

    let visaPaymentTab: Window | null = null;
    if (selectedPaymentMethod === "visa") {
      visaPaymentTab = window.open("", "_blank", "noopener,noreferrer");
      if (!visaPaymentTab) {
        setDemoInterestError(
          "Popup blocked. Please allow popups for this site to continue with Visa payment.",
        );
        return;
      }
      visaPaymentTab.document.title = "Opening Paynow...";
      visaPaymentTab.document.body.innerHTML =
        "<p style='font-family: sans-serif; padding: 24px;'>Opening Paynow payment page...</p>";
    }

    setDemoInterestSubmitting(true);
    setDemoInterestError("");
    try {
      const data = await apiFetch<DemoAccount>(
        `/demo/${demoAccountId}/confirm-interest`,
        {
          method: "POST",
          auth: false,
          suppress401Redirect: true,
          body: JSON.stringify({
            ...demoInterestForm,
            payment_method: selectedPaymentMethod,
            ecocash_phone_number:
              selectedPaymentMethod === "ecocash"
                ? ecocashPhoneNumber.trim()
                : undefined,
          }),
        },
      );
      setDemoAccount(data);
      setDemoInterestSubmitted(true);
      localStorage.setItem(`demo_interest_submitted_${demoAccountId}`, "true");
      setDemoInterestOpen(false);
      if (
        data.payment_method === "visa" &&
        /^https?:\/\//i.test(data.payment_link || "")
      ) {
        if (visaPaymentTab && !visaPaymentTab.closed) {
          visaPaymentTab.location.href = data.payment_link;
        } else {
          window.open(data.payment_link, "_blank", "noopener,noreferrer");
        }
        return;
      }
      window.location.assign("/subscriptions");
      return;
    } catch (err: any) {
      if (visaPaymentTab && !visaPaymentTab.closed) {
        visaPaymentTab.close();
      }
      setDemoInterestError(err.message || "Failed to send your request.");
    } finally {
      setDemoInterestSubmitting(false);
    }
  };

  const formatDemoCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Show loading state
  if (loading || activationLoading) {
    return (
      <div className="app-launcher-page">
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
              <img src="/three.png" alt="Three65" className="logo-365" />
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
      {/* Header */}
      <header className="app-launcher-header">
        <div className="app-launcher-logo">
          <img src="/three65.png" alt="Three65" />
        </div>
        <div className="app-launcher-user">
          {!isAdmin && demoCountdown !== null && isDemoWorkspace && (
            <div
              className={`demo-launcher-banner ${demoCountdown === 0 ? "expired" : ""}`}
            >
              <span className="demo-launcher-label">Demo time</span>
              <strong>
                {demoCountdown === 0
                  ? "Expired"
                  : formatDemoCountdown(demoCountdown)}
              </strong>
            </div>
          )}
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

      {demoInterestOpen && demoAccount && (
        <div className="modal-overlay">
          <div className="modal modal--centered demo-interest-modal">
            <div className="modal-header demo-interest-header">
              <div className="demo-interest-header-copy">
                <span className="demo-interest-eyebrow">
                  Main System Signup
                </span>
                <h3>Continue with the actual Three65</h3>
              </div>
            </div>
            <div className="modal-body demo-interest-body">
              <p className="demo-interest-copy">
                Your demo has ended, Confirm detail to sign up for the Main
                System
              </p>

              <label className="demo-interest-check">
                <input
                  type="checkbox"
                  checked={demoInterestForm.wants_actual_three65}
                  onChange={(event) =>
                    setDemoInterestForm((current) => ({
                      ...current,
                      wants_actual_three65: event.target.checked,
                    }))
                  }
                />
                <span>Please contact me about the actual Three65 system.</span>
              </label>

              <section className="demo-interest-section">
                <div className="demo-interest-section-head">
                  <h4>Business profile</h4>
                  <p>Capture the main company details we will use for setup.</p>
                </div>
                <div className="demo-interest-grid">
                  <div className="input-group">
                    <label className="input-label">Company name</label>
                    <input
                      value={demoInterestForm.company_name}
                      onChange={(event) =>
                        setDemoInterestForm((current) => ({
                          ...current,
                          company_name: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Phone number</label>
                    <input
                      value={demoInterestForm.phone_number}
                      onChange={(event) =>
                        setDemoInterestForm((current) => ({
                          ...current,
                          phone_number: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Email</label>
                    <input value={demoAccount.email} disabled />
                  </div>

                  <div className="input-group">
                    <label className="input-label">
                      Number of users required
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={demoInterestForm.num_users}
                      onChange={(event) =>
                        setDemoInterestForm((current) => ({
                          ...current,
                          num_users: Number(event.target.value) || 1,
                        }))
                      }
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Subscription period</label>
                    <select
                      value={demoInterestForm.subscription_period}
                      onChange={(event) =>
                        setDemoInterestForm((current) => ({
                          ...current,
                          subscription_period: event.target.value as
                            | "monthly"
                            | "yearly",
                        }))
                      }
                    >
                      <option value="monthly">1 month</option>
                      <option value="yearly">1 year</option>
                    </select>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Payment link</label>
                    <input value={demoInterestForm.payment_link} readOnly />
                  </div>
                </div>
              </section>

              <section className="demo-interest-section">
                <div className="demo-interest-section-head">
                  <h4>Apps and access</h4>
                  <p>
                    Dashboard and Settings are included automatically for the
                    portal superuser.
                  </p>
                </div>
                <div className="demo-interest-apps">
                  <div className="demo-interest-apps-head">
                    <span className="input-label">Apps required</span>
                    <span className="demo-interest-apps-note">
                      Select the modules the client wants in the main system.
                    </span>
                  </div>
                  <div className="demo-interest-apps-grid">
                    {demoInterestAppOptions.map((appOption) => {
                      const selected = demoInterestForm.requested_apps.includes(
                        appOption.key,
                      );
                      return (
                        <label
                          key={appOption.key}
                          className={`demo-interest-app-option ${selected ? "selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) =>
                              setDemoInterestForm((current) => ({
                                ...current,
                                requested_apps: event.target.checked
                                  ? [...current.requested_apps, appOption.key]
                                  : current.requested_apps.filter(
                                      (item) => item !== appOption.key,
                                    ),
                              }))
                            }
                          />
                          <span>{appOption.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <label className="demo-interest-check">
                    <input
                      type="checkbox"
                      checked={demoInterestForm.wants_zimra_fdms}
                      onChange={(event) =>
                        setDemoInterestForm((current) => ({
                          ...current,
                          wants_zimra_fdms: event.target.checked,
                        }))
                      }
                    />
                    <span>I want ZIMRA fiscalization.</span>
                  </label>

                  {demoInterestForm.wants_zimra_fdms && (
                    <section className="demo-interest-section">
                      <div className="demo-interest-section-head">
                        <h4>Fiscal details</h4>
                        <p>
                          These details will be included in the onboarding email
                          for follow-up.
                        </p>
                      </div>
                      <div className="demo-interest-grid">
                        <div className="input-group">
                          <label className="input-label">TIN</label>
                          <input
                            value={demoInterestForm.tin}
                            onChange={(event) =>
                              setDemoInterestForm((current) => ({
                                ...current,
                                tin: event.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="input-group">
                          <label className="input-label">VAT</label>
                          <input
                            value={demoInterestForm.vat_number}
                            onChange={(event) =>
                              setDemoInterestForm((current) => ({
                                ...current,
                                vat_number: event.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="input-group">
                          <label className="input-label">Trade name</label>
                          <input
                            value={demoInterestForm.trade_name}
                            onChange={(event) =>
                              setDemoInterestForm((current) => ({
                                ...current,
                                trade_name: event.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="input-group demo-interest-field-full">
                          <label className="input-label">Address</label>
                          <textarea
                            value={demoInterestForm.address}
                            onChange={(event) =>
                              setDemoInterestForm((current) => ({
                                ...current,
                                address: event.target.value,
                              }))
                            }
                            rows={3}
                          />
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              </section>
              <section className="demo-interest-section">
                <div className="demo-interest-section-head">
                  <h4>Payment Method</h4>
                  <p>Select how you would like to pay.</p>
                </div>
                <div className="demo-interest-apps">
                  <div className="demo-interest-apps-head">
                    <span className="input-label">Available options</span>
                  </div>
                  <div className="demo-interest-apps-grid">
                    {paymentMethodOptions.map((method) => {
                      const selected = selectedPaymentMethod === method.key;
                      return (
                        <button
                          key={method.key}
                          type="button"
                          aria-pressed={selected}
                          className={`demo-interest-app-option ${selected ? "selected" : ""}`}
                          onClick={() =>
                            setSelectedPaymentMethod((current) =>
                              current === method.key ? "" : method.key,
                            )
                          }
                        >
                          <span>{method.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedPaymentMethod === "ecocash" && (
                    <div className="input-group" style={{ marginTop: 12 }}>
                      <label className="input-label">
                        EcoCash phone number
                      </label>
                      <input
                        type="tel"
                        value={ecocashPhoneNumber}
                        onChange={(event) =>
                          setEcocashPhoneNumber(event.target.value)
                        }
                        placeholder="Enter phone number"
                      />
                    </div>
                  )}
                </div>
              </section>

              {demoInterestError && (
                <div className="login-error">{demoInterestError}</div>
              )}
            </div>
            <div className="modal-footer">
              {/* <button
                className="btn secondary"
                type="button"
                onClick={() => setDemoInterestOpen(false)}
              >
                Later
              </button> */}
              <button
                className="login-btn demo-interest-submit"
                type="button"
                onClick={handleDemoInterestSubmit}
                disabled={demoInterestSubmitting}
              >
                {demoInterestSubmitting
                  ? "Sending..."
                  : "Create subscription and send email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
