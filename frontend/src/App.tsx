import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Bell,
  Boxes,
  Building2,
  Calculator,
  ChartColumn,
  CreditCard,
  ExternalLink,
  FilePenLine,
  FileText,
  House,
  LayoutDashboard,
  Monitor,
  Package,
  ReceiptText,
  Settings as SettingsGlyph,
  ShieldCheck,
  ShoppingCart,
  UserCog,
  UsersRound,
  WalletCards,
  Store,
} from "lucide-react";
import AppLauncherPage from "./pages/AppLauncherPage";
import DashboardPage from "./pages/DashboardPage";
import CompaniesPage from "./pages/CompaniesPage";
import ProductsPage from "./pages/ProductsPage";
import ContactsPage from "./pages/ContactsPage";
import ContactFormPage from "./pages/ContactFormPage";
import QuotationsPage from "./pages/QuotationsPage";
import InvoicesPage from "./pages/InvoicesPage";
import PurchasesPage from "./pages/PurchasesPage";
import InventoryPage from "./pages/InventoryPage";
import LoginPage from "./pages/LoginPage";
import PortalLoginPage from "./pages/PortalLoginPage";
import SettingsPage from "./pages/SettingsPage";
import DevicesPage from "./pages/DevicesPage";
import PortalDevicesPage from "./pages/PortalDevicesPage";
import ReportsPage from "./pages/ReportsPage";
import ExpensesPage from "./pages/ExpensesPage";
import UsersRolesPage from "./pages/UsersRolesPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import PaymentsPage from "./pages/PaymentsPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import POSPage from "./pages/POSPage";
import CustomerDisplayPage from "./pages/CustomerDisplayPage";
import DemoSignupPage from "./pages/DemoSignupPage";
import DemoPaymentSuccessPage from "./pages/DemoPaymentSuccessPage";
import LeadsPage from "./pages/LeadsPage";
import AccountingPage from "./pages/AccountingPage";
import AccountingReportsPage from "./pages/AccountingReportsPage";
import AccountingConfigPage from "./pages/AccountingConfigPage";
import { apiFetch } from "./api";
import { useMe } from "./hooks/useMe";
import BackIcon from "./assets/back.svg?react";
import ListViewContext, {
  FilterChip,
  ListViewState,
  SavedFilter,
} from "./context/ListViewContext";
import { AlertProvider } from "./context/AlertContext";
import AuthGuard from "./components/AuthGuard";

const adminNav = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { to: "/companies", label: "Companies", icon: CompanyIcon },
  { to: "/invoices", label: "Invoices", icon: InvoiceIcon },
  { to: "/purchases", label: "Purchases", icon: PurchaseIcon },
  { to: "/products", label: "Products", icon: ProductIcon },
  { to: "/contacts", label: "Contacts", icon: ContactIcon },
  { to: "/quotations", label: "Quotations", icon: QuoteIcon },
  { to: "/inventory", label: "Inventory", icon: InventoryIcon },
  { to: "/devices", label: "Devices", icon: DeviceIcon },
  { to: "/pos", label: "Point of Sale", icon: POSIcon },
  { to: "/payments", label: "Payments", icon: PaymentIcon },
  { to: "/expenses", label: "Expenses", icon: ExpenseIcon },
  { to: "/accounting", label: "Accounting", icon: ReportsIcon },
  { to: "/reports", label: "Financial Reports", icon: ReportsIcon },
  { to: "/users-roles", label: "Users & Roles", icon: UsersIcon },
  { to: "/audit-logs", label: "Audit Logs", icon: AuditIcon },
  { to: "/leads", label: "Leads", icon: ContactIcon },
  { to: "/subscriptions", label: "Subscriptions", icon: SubscriptionIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const portalNav = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { to: "/invoices", label: "Invoices", icon: InvoiceIcon },
  { to: "/purchases", label: "Purchases", icon: PurchaseIcon },
  { to: "/contacts", label: "Contacts", icon: ContactIcon },
  { to: "/quotations", label: "Quotations", icon: QuoteIcon },
  { to: "/pos", label: "Point of Sale", icon: POSIcon },
  { to: "/inventory", label: "Inventory", icon: InventoryIcon },
  { to: "/my-devices", label: "Devices", icon: DeviceIcon },
  { to: "/expenses", label: "Expenses", icon: ExpenseIcon },
  { to: "/accounting", label: "Accounting", icon: ReportsIcon },
  { to: "/reports", label: "Financial Reports", icon: ReportsIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const PORTAL_NAV_APP_KEYS: Record<string, string> = {
  "/": "dashboard",
  "/dashboard": "dashboard",
  "/invoices": "invoices",
  "/purchases": "purchases",
  "/contacts": "contacts",
  "/quotations": "quotations",
  "/pos": "pos",
  "/inventory": "inventory",
  "/my-devices": "devices",
  "/expenses": "expenses",
  "/accounting": "accounting",
  "/accounting/reports": "accounting",
  "/accounting/configuration": "accounting",
  "/reports": "reports",
  "/settings": "settings",
};

const PORTAL_APP_ROUTES: Record<string, string> = {
  dashboard: "/dashboard",
  invoices: "/invoices",
  purchases: "/purchases",
  contacts: "/contacts",
  quotations: "/quotations",
  pos: "/pos",
  inventory: "/inventory",
  devices: "/my-devices",
  expenses: "/expenses",
  accounting: "/accounting",
  reports: "/reports",
  settings: "/settings",
};

type FilterCondition = {
  id: string;
  field: string;
  operator: string;
  value: string;
};

type CustomField = {
  label: string;
  value: string;
  type?: "text" | "choice" | "date";
  valuesEndpoint?: string;
};

type AppNotification = {
  id: number;
  title: string;
  message: string;
  link_url: string;
  notification_type: string;
  is_read: boolean;
  created_at: string | null;
};

function POSWindowLauncher() {
  const navigate = useNavigate();
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const openPOSWindow = useCallback(() => {
    const posWindow = window.open(
      "/pos/window",
      "_blank",
      "noopener,noreferrer",
    );
    if (posWindow) {
      try {
        posWindow.focus();
      } catch {
        // ignore focus errors
      }
      navigate("/", { replace: true });
      return true;
    }
    return false;
  }, [navigate]);

  useEffect(() => {
    if (!openPOSWindow()) setPopupBlocked(true);
  }, [openPOSWindow]);

  const timeString = currentTime.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateString = currentTime.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="content"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: "1.5rem",
        textAlign: "center",
      }}
    >
      {/* POS Icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 24px rgba(99,102,241,0.35)",
        }}
      >
        <Store size={40} color="#fff" strokeWidth={1.75} />
      </div>

      {/* Live Clock */}
      <div style={{ lineHeight: 1.2 }}>
        <div
          style={{
            fontSize: "3rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text-primary, #111)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {timeString}
        </div>
        <div
          style={{
            fontSize: "0.95rem",
            color: "var(--text-muted, #6b7280)",
            marginTop: "0.25rem",
          }}
        >
          {dateString}
        </div>
      </div>

      {/* Open POS Button */}
      {popupBlocked && (
        <button
          className="btn btn-primary"
          style={{
            padding: "0.65rem 2rem",
            fontSize: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
          onClick={openPOSWindow}
        >
          <ExternalLink size={18} strokeWidth={2} />
          Open POS
        </button>
      )}
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const { me } = useMe();
  const isDashboardRoute = location.pathname === "/dashboard";
  const isPortalMode = !me?.is_admin;
  const [listViewByPath, setListViewByPath] = useState<
    Record<string, ListViewState>
  >({});
  const [fieldValues, setFieldValues] = useState<Record<string, string[]>>({});
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);

  // (moved) fetch choice field values when filter menu opens; placed after currentPath declaration
  const [conditions, setConditions] = useState<FilterCondition[]>([
    { id: "cond-1", field: "", operator: "contains", value: "" },
  ]);
  const topbarRef = useRef<HTMLDivElement | null>(null);

  const allowedPortalApps = useMemo(() => {
    const apps =
      me?.companies?.[0]?.user_portal_apps ??
      me?.companies?.[0]?.portal_apps ??
      [];
    const normalized = apps
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    return normalized.length ? normalized : null;
  }, [me?.companies]);
  const isPortalSuperUser = Boolean(me?.companies?.[0]?.is_portal_super_user);
  const navItems = isPortalMode
    ? portalNav.filter((item) => {
        if (item.to === "/settings") return isPortalSuperUser;
        if (!allowedPortalApps) return true;
        const appKey = PORTAL_NAV_APP_KEYS[item.to];
        return appKey ? allowedPortalApps.includes(appKey) : true;
      })
    : adminNav;
  const displayName = me?.email ?? (isPortalMode ? "Portal User" : "Admin");
  const initials = getInitials(displayName);
  const currentPath = location.pathname === "/" ? "/" : location.pathname;
  const isDashboard = currentPath === "/";
  const listState = listViewByPath[currentPath] ?? {
    search: "",
    filters: [],
    groupBy: "",
    favorites: [],
  };
  const savedFilters = useMemo(
    () => getSavedFilters(currentPath),
    [currentPath],
  );
  const groupOptions = useMemo(
    () => getGroupOptions(currentPath),
    [currentPath],
  );
  const customFields = useMemo(
    () => getCustomFields(currentPath),
    [currentPath],
  );
  const appTitle = getAppTitle(currentPath, navItems);

  useEffect(() => {
    const fields = getCustomFields(currentPath).filter((f) => f.valuesEndpoint);
    fields.forEach((f) => {
      if (!f.valuesEndpoint) return;
      apiFetch<string[]>(f.valuesEndpoint)
        .then((vals) => {
          setFieldValues((prev) => ({ ...prev, [f.value]: vals || [] }));
        })
        .catch(() => {});
    });
  }, [currentPath, me?.company_ids]);

  const updateListState = (next: Partial<ListViewState>) => {
    setListViewByPath((prev) => ({
      ...prev,
      [currentPath]: {
        ...listState,
        ...next,
      },
    }));
  };

  const listViewContextValue = {
    state: listState,
    setSearch: (value: string) => updateListState({ search: value }),
    addFilter: (chip: FilterChip) =>
      updateListState({ filters: [...listState.filters, chip] }),
    removeFilter: (id: string) =>
      updateListState({
        filters: listState.filters.filter((chip) => chip.id !== id),
      }),
    clearFilters: () => updateListState({ filters: [] }),
    setGroupBy: (value: string) => updateListState({ groupBy: value }),
    toggleFavorite: (name: string) => {
      const exists = listState.favorites.includes(name);
      updateListState({
        favorites: exists
          ? listState.favorites.filter((item) => item !== name)
          : [...listState.favorites, name],
      });
    },
    applySavedFilter: (saved: SavedFilter) =>
      updateListState({ filters: saved.filters }),
    savedFilters,
  };

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (topbarRef.current && !topbarRef.current.contains(target)) {
        setAppMenuOpen(false);
        setUserMenuOpen(false);
        setNotificationMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    const loadNotifications = () => {
      apiFetch<{ unread_count: number; items: AppNotification[] }>(
        "/notifications",
      )
        .then((payload) => {
          if (cancelled) return;
          setNotificationUnreadCount(payload.unread_count || 0);
          setNotifications(payload.items || []);
        })
        .catch(() => {
          if (cancelled) return;
          setNotificationUnreadCount(0);
          setNotifications([]);
        });
    };

    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [me]);

  const openNotification = async (notification: AppNotification) => {
    try {
      if (!notification.is_read) {
        await apiFetch(`/notifications/${notification.id}/read`, {
          method: "POST",
        });
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === notification.id ? { ...item, is_read: true } : item,
          ),
        );
        setNotificationUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // ignore read errors and still navigate
    }

    setNotificationMenuOpen(false);
    if (notification.link_url) {
      window.location.href = notification.link_url;
    }
  };

  const isHomePage = currentPath === "/";
  const launcherApps = useMemo(() => {
    if (!isPortalMode) return null;
    const apps = navItems
      .map((item) => PORTAL_NAV_APP_KEYS[item.to])
      .filter(Boolean);
    return Array.from(new Set(apps));
  }, [isPortalMode, navItems]);
  const portalLandingRoute = useMemo(() => {
    if (!isPortalMode || !launcherApps?.length) return "/";
    if (launcherApps.length === 1) {
      return PORTAL_APP_ROUTES[launcherApps[0]] ?? "/";
    }
    return "/";
  }, [isPortalMode, launcherApps]);
  const requestedPortalApp = useMemo(
    () => getPortalAppKeyForPath(currentPath),
    [currentPath],
  );
  const isAllowedPortalRoute = useMemo(() => {
    if (!isPortalMode) return true;
    if (currentPath === "/") return true;
    if (!requestedPortalApp) return false;
    if (requestedPortalApp === "settings") return isPortalSuperUser;
    if (!allowedPortalApps) return true;
    return allowedPortalApps.includes(requestedPortalApp);
  }, [
    allowedPortalApps,
    currentPath,
    isPortalMode,
    isPortalSuperUser,
    requestedPortalApp,
  ]);

  if (isPortalMode && !isAllowedPortalRoute) {
    return <Navigate to={portalLandingRoute} replace />;
  }

  // If on home page, render the app launcher without sidebar
  if (isHomePage) {
    if (isPortalMode && portalLandingRoute !== "/") {
      return <Navigate to={portalLandingRoute} replace />;
    }
    if (isPortalMode && launcherApps && launcherApps.length === 1) {
      const onlyAppRoute = PORTAL_APP_ROUTES[launcherApps[0]];
      if (onlyAppRoute) {
        return <Navigate to={onlyAppRoute} replace />;
      }
    }
    return (
      <ListViewContext.Provider value={listViewContextValue}>
        <AppLauncherPage />
      </ListViewContext.Provider>
    );
  }

  return (
    <ListViewContext.Provider value={listViewContextValue}>
      <div className="app-shell no-sidebar">
        <main className="main-content">
          <header className="main-header">
            <nav
              className="topbar"
              ref={topbarRef}
              aria-label="Primary navigation"
            >
              <div className="topbar-left">
                <NavLink to="/" className="app-switcher">
                  <span className="app-switcher-icon">
                    <BackIcon aria-hidden="true" focusable="false" />
                  </span>
                </NavLink>
                <div className="topbar-brand">
                  <div>
                    <h1 className="topbar-title">{appTitle}</h1>
                  </div>
                </div>
              </div>
              <div className="topbar-right">
                <button
                  className="user-menu"
                  onClick={() => setNotificationMenuOpen((v) => !v)}
                  style={{ position: "relative" }}
                  aria-label="Notifications"
                >
                  <Bell size={18} />
                  {notificationUnreadCount > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -2,
                        minWidth: 18,
                        height: 18,
                        padding: "0 5px",
                        borderRadius: 999,
                        background: "var(--red-500)",
                        color: "white",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {notificationUnreadCount > 9
                        ? "9+"
                        : notificationUnreadCount}
                    </span>
                  )}
                </button>
                {notificationMenuOpen && (
                  <div className="menu-popover right" style={{ width: 340 }}>
                    <div
                      className="menu-title"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>Notifications</span>
                      {notificationUnreadCount > 0 && (
                        <button
                          className="menu-item"
                          style={{ padding: 0, minHeight: "auto" }}
                          onClick={async () => {
                            await apiFetch("/notifications/read-all", {
                              method: "POST",
                            });
                            setNotifications((prev) =>
                              prev.map((item) => ({ ...item, is_read: true })),
                            );
                            setNotificationUnreadCount(0);
                          }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: 360, overflowY: "auto" }}>
                      {notifications.length ? (
                        notifications.map((notification) => (
                          <button
                            key={notification.id}
                            className="menu-item"
                            onClick={() => openNotification(notification)}
                            style={{
                              display: "block",
                              textAlign: "left",
                              minHeight: "auto",
                              borderLeft: notification.is_read
                                ? "3px solid transparent"
                                : "3px solid var(--blue-500)",
                              background: notification.is_read
                                ? "transparent"
                                : "rgba(59, 130, 246, 0.06)",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                marginBottom: 4,
                              }}
                            >
                              {notification.title}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--muted)",
                                lineHeight: 1.45,
                              }}
                            >
                              {notification.message}
                            </div>
                            {notification.created_at && (
                              <div
                                style={{
                                  marginTop: 6,
                                  fontSize: 11,
                                  color: "var(--muted)",
                                }}
                              >
                                {new Date(
                                  notification.created_at,
                                ).toLocaleString()}
                              </div>
                            )}
                          </button>
                        ))
                      ) : (
                        <div
                          style={{
                            padding: 16,
                            color: "var(--muted)",
                            fontSize: 13,
                          }}
                        >
                          No notifications yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <button
                  className="user-menu"
                  onClick={() => setUserMenuOpen((v) => !v)}
                >
                  <span className="user-avatar-sm">{initials}</span>
                </button>
                {userMenuOpen && (
                  <div className="menu-popover right">
                    <div className="menu-title">
                      <span className="user-name-sm">{displayName}</span>
                    </div>
                    {(me?.is_admin || isPortalSuperUser) && (
                      <button
                        className="menu-item"
                        onClick={() => {
                          window.location.href = "/settings";
                        }}
                      >
                        Settings
                      </button>
                    )}
                    <button
                      className="menu-item danger"
                      onClick={() => {
                        localStorage.removeItem("access_token");
                        window.location.href = "/login";
                      }}
                    >
                      Log Out
                    </button>
                  </div>
                )}
              </div>
            </nav>
          </header>
          <div
            className={[
              "page-content",
              isDashboardRoute && "page-content--overflow-auto",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Routes>
              <Route path="/" element={<AppLauncherPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/invoices" element={<InvoicesPage mode="list" />} />
              <Route
                path="/invoices/new"
                element={<InvoicesPage mode="new" />}
              />
              <Route
                path="/invoices/:invoiceId"
                element={<InvoicesPage mode="detail" />}
              />
              <Route
                path="/purchases"
                element={<PurchasesPage mode="list" />}
              />
              <Route
                path="/purchases/new"
                element={<PurchasesPage mode="new" />}
              />
              <Route
                path="/purchases/:purchaseId"
                element={<PurchasesPage mode="detail" />}
              />
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/contacts/new" element={<ContactFormPage />} />
              <Route
                path="/contacts/:contactId"
                element={<ContactFormPage />}
              />
              <Route
                path="/quotations"
                element={<QuotationsPage mode="list" />}
              />
              <Route
                path="/quotations/new"
                element={<QuotationsPage mode="new" />}
              />
              <Route
                path="/quotations/:quotationId"
                element={<QuotationsPage mode="detail" />}
              />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/accounting" element={<AccountingPage />} />
              <Route path="/accounting/reports" element={<AccountingReportsPage />} />
              <Route path="/accounting/configuration" element={<AccountingConfigPage />} />
              <Route
                path="/settings"
                element={
                  isPortalMode && !isPortalSuperUser ? (
                    <DashboardPage />
                  ) : (
                    <SettingsPage />
                  )
                }
              />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/my-devices" element={<PortalDevicesPage />} />
              <Route path="/users-roles" element={<UsersRolesPage />} />
              <Route path="/audit-logs" element={<AuditLogsPage />} />
              <Route path="/leads" element={isPortalMode ? <DashboardPage /> : <LeadsPage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/pos" element={<POSWindowLauncher />} />
              <Route path="/pos/window" element={<POSPage />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </ListViewContext.Provider>
  );
}

export default function App() {
  return (
    <AlertProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/portal-login" element={<PortalLoginPage />} />
        <Route path="/demo" element={<DemoSignupPage />} />
        <Route path="/demo/payment-success" element={<DemoPaymentSuccessPage />} />
        <Route path="/demo/:demoId" element={<DemoSignupPage />} />
        <Route path="/pos/customer-display" element={<CustomerDisplayPage />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <AppContent />
            </AuthGuard>
          }
        />
      </Routes>
    </AlertProvider>
  );
}

// ... (rest of the functions: getInitials, getSavedFilters, etc.)
// ... make sure to keep them

function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.split(" ");
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getSavedFilters(path: string): SavedFilter[] {
  // Mock data, replace with API call
  if (path === "/companies") {
    return [
      {
        id: "active-companies",
        label: "Active Companies",
        filters: [
          { id: "f1", label: "Status is Active", params: { status: "active" } },
        ],
      },
      {
        id: "inactive-companies",
        label: "Inactive Companies",
        filters: [
          {
            id: "f2",
            label: "Status is Inactive",
            params: { status: "inactive" },
          },
        ],
      },
    ];
  }
  return [];
}

function getGroupOptions(path: string): { label: string; value: string }[] {
  if (path === "/companies") {
    return [{ label: "Status", value: "status" }];
  }
  if (path === "/devices") {
    return [
      { label: "Company", value: "company" },
      { label: "Status", value: "status" },
    ];
  }
  return [];
}

function getAppTitle(path: string, navItems: { to: string; label: string }[]) {
  const exactMatch = navItems.find((item) => item.to === path);
  if (exactMatch) return exactMatch.label;

  const baseMatch = navItems
    .filter((item) => item.to !== "/" && path.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
  if (baseMatch) return baseMatch.label;

  return "Dashboard";
}

function getPortalAppKeyForPath(path: string) {
  const exactMatch = PORTAL_NAV_APP_KEYS[path];
  if (exactMatch) return exactMatch;

  const baseMatch = Object.entries(PORTAL_NAV_APP_KEYS)
    .filter(([route]) => route !== "/" && path.startsWith(`${route}/`))
    .sort((a, b) => b[0].length - a[0].length)[0];

  return baseMatch?.[1] ?? null;
}

function getCustomFields(path: string): CustomField[] {
  if (path === "/") {
    return [
      {
        label: "Invoice Reference",
        value: "reference",
        type: "text",
        valuesEndpoint: "/invoices/values?field=reference",
      },
      {
        label: "Invoice Status",
        value: "status",
        type: "choice",
        valuesEndpoint: "/invoices/values?field=status",
      },
      {
        label: "Quotation Reference",
        value: "quotation_reference",
        type: "text",
      },
    ];
  }
  if (path === "/companies") {
    return [
      {
        label: "Name",
        value: "name",
        type: "text",
        valuesEndpoint: "/companies/values?field=name",
      },
      {
        label: "TIN",
        value: "tin",
        type: "text",
        valuesEndpoint: "/companies/values?field=tin",
      },
      { label: "VAT", value: "vat", type: "text" },
      { label: "Email", value: "email", type: "text" },
      { label: "Phone", value: "phone", type: "text" },
      { label: "Created", value: "created", type: "date" },
    ];
  }
  if (path === "/devices") {
    return [
      { label: "Serial", value: "serial", type: "text" },
      { label: "Model", value: "model", type: "text" },
      {
        label: "Status",
        value: "status",
        type: "choice",
        valuesEndpoint: "/devices/values?field=status",
      },
    ];
  }
  return [];
}

// --- Icon Components ---

function HomeIcon() {
  return <House size={20} strokeWidth={2} />;
}

function DashboardIcon() {
  return <LayoutDashboard size={20} strokeWidth={2} />;
}

function CompanyIcon() {
  return <Building2 size={20} strokeWidth={2} />;
}

function DeviceIcon() {
  return <Monitor size={20} strokeWidth={2} />;
}

function SettingsIcon() {
  return <SettingsGlyph size={20} strokeWidth={2} />;
}

function ReportsIcon() {
  return <ChartColumn size={20} strokeWidth={2} />;
}

function ExpenseIcon() {
  return <ReceiptText size={20} strokeWidth={2} />;
}

function ProductIcon() {
  return <Package size={20} strokeWidth={2} />;
}

function InvoiceIcon() {
  return <FileText size={20} strokeWidth={2} />;
}

function PurchaseIcon() {
  return <ShoppingCart size={20} strokeWidth={2} />;
}

function ContactIcon() {
  return <UsersRound size={20} strokeWidth={2} />;
}

function QuoteIcon() {
  return <FilePenLine size={20} strokeWidth={2} />;
}

function InventoryIcon() {
  return <Boxes size={20} strokeWidth={2} />;
}

function UsersIcon() {
  return <UserCog size={20} strokeWidth={2} />;
}

function AuditIcon() {
  return <ShieldCheck size={20} strokeWidth={2} />;
}

function PaymentIcon() {
  return <CreditCard size={20} strokeWidth={2} />;
}

function POSIcon() {
  return <Calculator size={20} strokeWidth={2} />;
}

function SubscriptionIcon() {
  return <WalletCards size={20} strokeWidth={2} />;
}


