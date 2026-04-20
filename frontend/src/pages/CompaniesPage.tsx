import { Fragment, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { apiFetch } from "../api";
import { TablePagination } from "../components/TablePagination";
import { useMe } from "../hooks/useMe";
import { useListView } from "../context/ListViewContext";
import { useAlert } from "../context/AlertContext";

// Icon components
const EditIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const PlusIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const BuildingIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" />
    <line x1="8" y1="6" x2="8" y2="6.01" />
    <line x1="16" y1="6" x2="16" y2="6.01" />
    <line x1="12" y1="6" x2="12" y2="6.01" />
    <line x1="8" y1="10" x2="8" y2="10.01" />
    <line x1="16" y1="10" x2="16" y2="10.01" />
    <line x1="12" y1="10" x2="12" y2="10.01" />
    <line x1="8" y1="14" x2="8" y2="14.01" />
    <line x1="16" y1="14" x2="16" y2="14.01" />
    <line x1="12" y1="14" x2="12" y2="14.01" />
  </svg>
);

const SearchIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const ListIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const GridIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const DownloadIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const XIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

type Company = {
  id: number;
  name: string;
  address: string;
  email?: string;
  phone: string;
  tin: string;
  vat: string;
  portal_apps?: string[];
};

const PORTAL_APP_OPTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "invoices", label: "Invoices" },
  { key: "purchases", label: "Purchases" },
  { key: "contacts", label: "Contacts" },
  { key: "quotations", label: "Quotations" },
  { key: "inventory", label: "Inventory" },
  { key: "accounting", label: "Accounting" },
  { key: "pos", label: "Point of Sale" },
  { key: "devices", label: "Devices" },
  { key: "reports", label: "Financial Reports" },
  { key: "expenses", label: "Expenses" },
  { key: "settings", label: "Settings" },
] as const;

const DEFAULT_PORTAL_APPS = PORTAL_APP_OPTIONS.map((app) => app.key);

type GroupedCompanies = {
  label: string;
  items: Company[];
};

export default function CompaniesPage() {
  const { me } = useMe();
  const { state } = useListView();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    email: "",
    phone: "",
    tin: "",
    vat: "",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    address: "",
    email: "",
    phone: "",
    tin: "",
    vat: "",
  });
  const [editPortalUserId, setEditPortalUserId] = useState<number | null>(null);
  const [editPortalEmail, setEditPortalEmail] = useState("");
  const [editPortalPassword, setEditPortalPassword] = useState("");
  const [portalEmail, setPortalEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [portalApps, setPortalApps] = useState<string[]>(DEFAULT_PORTAL_APPS);
  const [editPortalApps, setEditPortalApps] =
    useState<string[]>(DEFAULT_PORTAL_APPS);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchExporting, setBatchExporting] = useState(false);
  const { showConfirm } = useAlert();

  const loadCompanies = async () => {
    const params = new URLSearchParams();
    state.filters.forEach((chip) => {
      Object.entries(chip.params).forEach(([key, value]) => {
        params.set(key, value);
      });
    });
    const query = params.toString();
    try {
      setError(null);
      if (me?.is_admin) {
        const data = await apiFetch<Company[]>(
          `/companies${query ? `?${query}` : ""}`,
        );
        setCompanies(data);
        setSelectedIds(new Set());
      } else {
        const data = await apiFetch<Company[]>(
          `/companies/me${query ? `?${query}` : ""}`,
        );
        setCompanies(data);
        setSelectedIds(new Set());
      }
    } catch (err: any) {
      setError(err.message || "Failed to load companies");
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadCompanies();
    }, 300);
    return () => clearTimeout(timeout);
  }, [me?.is_admin, state.filters]);

  const togglePortalApp = (
    appKey: string,
    selected: string[],
    setter: (apps: string[]) => void,
  ) => {
    setter(
      selected.includes(appKey)
        ? selected.filter((item) => item !== appKey)
        : [...selected, appKey],
    );
  };

  const createCompany = async () => {
    if (!form.name || !form.tin) {
      setError("Company name and TIN are required");
      return;
    }
    try {
      setError(null);
      setStatus(null);
      setSaving(true);
      const company = await apiFetch<Company>("/companies", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          portal_apps: portalApps,
        }),
      });
      let portalCreated = false;
      const portalEmailSnapshot = portalEmail;
      if (portalEmail && portalPassword) {
        try {
          await apiFetch(`/companies/${company.id}/portal-user`, {
            method: "PATCH",
            body: JSON.stringify({
              email: portalEmail,
              password: portalPassword,
            }),
          });
          portalCreated = true;
        } catch (portalErr: any) {
          setError(
            `Company created but portal user failed: ${portalErr.message}`,
          );
        }
        setPortalEmail("");
        setPortalPassword("");
      }
      setForm({
        name: "",
        address: "",
        email: "",
        phone: "",
        tin: "",
        vat: "",
      });
      setPortalApps(DEFAULT_PORTAL_APPS);
      setShowAddModal(false);
      if (portalCreated) {
        setStatus(
          `Company "${company.name}" created successfully! Portal user can now log in at /login with email: ${portalEmailSnapshot}`,
        );
      } else if (portalEmailSnapshot) {
        // Error already set above
      } else {
        setStatus("Company created successfully");
      }
      loadCompanies();
    } catch (err: any) {
      setError(err.message || "Failed to create company");
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = async (company: Company) => {
    console.log("Opening edit modal for company:", company);
    setEditingCompany(company);
    setEditForm({
      name: company.name || "",
      address: company.address || "",
      email: company.email || "",
      phone: company.phone || "",
      tin: company.tin || "",
      vat: company.vat || "",
    });
    setEditPortalApps(
      company.portal_apps?.length ? company.portal_apps : DEFAULT_PORTAL_APPS,
    );
    setEditPortalPassword("");
    setEditPortalUserId(null);
    setEditPortalEmail("");
    setError(null);
    setShowEditModal(true);

    // Load portal user info in background
    try {
      const portalUsers = await apiFetch<{ id: number; email: string }[]>(
        `/company-users/portal-users?company_id=${company.id}`,
      );
      if (portalUsers && portalUsers.length) {
        setEditPortalUserId(portalUsers[0].id);
        setEditPortalEmail(portalUsers[0].email);
      }
    } catch (err) {
      console.log("No portal users found or error:", err);
      // Silently ignore - portal user info is optional
    }
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingCompany(null);
    setEditForm({
      name: "",
      address: "",
      email: "",
      phone: "",
      tin: "",
      vat: "",
    });
    setEditPortalApps(DEFAULT_PORTAL_APPS);
    setEditPortalUserId(null);
    setEditPortalEmail("");
    setEditPortalPassword("");
  };

  const saveEdit = async () => {
    if (!editingCompany) return;
    if (!editForm.name || !editForm.tin) {
      setError("Company name and TIN are required");
      return;
    }
    try {
      setError(null);
      setSaving(true);
      await apiFetch(`/companies/${editingCompany.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...editForm,
          portal_apps: editPortalApps,
        }),
      });
      // Update or create portal user if email/password provided
      if (editPortalEmail && editPortalPassword) {
        await apiFetch(`/companies/${editingCompany.id}/portal-user`, {
          method: "PATCH",
          body: JSON.stringify({
            email: editPortalEmail,
            password: editPortalPassword,
          }),
        });
      } else if (editPortalUserId && editPortalPassword) {
        // Just update password for existing user
        await apiFetch(
          `/company-users/portal-users/${editPortalUserId}/password?password=${encodeURIComponent(editPortalPassword)}`,
          {
            method: "PATCH",
          },
        );
      }
      closeEditModal();
      setStatus("Company updated successfully");
      loadCompanies();
    } catch (err: any) {
      setError(err.message || "Failed to update company");
    } finally {
      setSaving(false);
    }
  };

  const deleteCompany = async (companyId: number) => {
    const confirmed = await showConfirm({
      title: "Delete company",
      message:
        "Are you sure you want to delete this company? This action cannot be undone.",
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    try {
      setError(null);
      await apiFetch(`/companies/${companyId}`, { method: "DELETE" });
      setStatus("Company deleted successfully");
      loadCompanies();
    } catch (err: any) {
      setError(err.message || "Failed to delete company");
    }
  };

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((company) =>
      [
        company.name,
        company.tin,
        company.vat,
        company.phone,
        company.email,
        company.address,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [companies, search]);

  const pagedCompanies = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCompanies.slice(start, start + pageSize);
  }, [filteredCompanies, page, pageSize]);

  const groupedCompanies = useMemo<GroupedCompanies[]>(() => {
    if (!state.groupBy || state.groupBy === "") {
      return [{ label: "", items: pagedCompanies }];
    }
    if (state.groupBy === "vat") {
      const hasVat = pagedCompanies.filter((company) => Boolean(company.vat));
      const noVat = pagedCompanies.filter((company) => !company.vat);
      return [
        { label: "Has VAT", items: hasVat },
        { label: "No VAT", items: noVat },
      ];
    }
    return [{ label: "", items: pagedCompanies }];
  }, [pagedCompanies, state.groupBy]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize));
  const visibleCompanyIds = pagedCompanies.map((company) => company.id);
  const allVisibleSelected =
    visibleCompanyIds.length > 0 &&
    visibleCompanyIds.every((id) => selectedIds.has(id));
  const hasSelection = selectedIds.size > 0;
  const selectedCompanies = companies.filter((company) => selectedIds.has(company.id));

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [state.groupBy, state.filters, pageSize, search, viewMode]);

  const exportRows = useMemo(
    () =>
      filteredCompanies.map((company) => ({
        "Company Name": company.name || "",
        TIN: company.tin || "",
        VAT: company.vat || "",
        Phone: company.phone || "",
        Email: company.email || "",
        Address: company.address || "",
        "Portal Apps": (company.portal_apps || []).join(", "),
      })),
    [filteredCompanies],
  );

  const exportCsv = () => {
    const headers = Object.keys(exportRows[0] || {
      "Company Name": "",
      TIN: "",
      VAT: "",
      Phone: "",
      Email: "",
      Address: "",
      "Portal Apps": "",
    });
    const csv = [
      headers.join(","),
      ...exportRows.map((row) =>
        headers
          .map((header) =>
            `"${String(row[header as keyof typeof row] ?? "").replace(/"/g, '""')}"`,
          )
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "companies.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportXlsx = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Companies");
    XLSX.writeFile(workbook, "companies.xlsx");
  };

  const toggleSelect = (companyId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleCompanyIds.forEach((id) => next.delete(id));
      } else {
        visibleCompanyIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const exportSelectedRows = useMemo(
    () =>
      selectedCompanies.map((company) => ({
        "Company Name": company.name || "",
        TIN: company.tin || "",
        VAT: company.vat || "",
        Phone: company.phone || "",
        Email: company.email || "",
        Address: company.address || "",
        "Portal Apps": (company.portal_apps || []).join(", "),
      })),
    [selectedCompanies],
  );

  const handleExportSelectedCsv = () => {
    if (!exportSelectedRows.length) return;
    setBatchExporting(true);
    try {
      const headers = Object.keys(exportSelectedRows[0]);
      const csv = [
        headers.join(","),
        ...exportSelectedRows.map((row) =>
          headers
            .map((header) =>
              `"${String(row[header as keyof typeof row] ?? "").replace(/"/g, '""')}"`,
            )
            .join(","),
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "companies-selected.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setBatchExporting(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!me?.is_admin || !selectedIds.size) return;
    const confirmed = await showConfirm({
      title: "Delete selected companies",
      message: `Delete ${selectedIds.size} selected compan${selectedIds.size === 1 ? "y" : "ies"}? This action cannot be undone.`,
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) {
      return;
    }

    setBatchDeleting(true);
    setError(null);
    try {
      await Promise.all(
        Array.from(selectedIds).map((companyId) =>
          apiFetch(`/companies/${companyId}`, { method: "DELETE" }),
        ),
      );
      setStatus(
        `${selectedIds.size} compan${selectedIds.size === 1 ? "y" : "ies"} deleted successfully`,
      );
      await loadCompanies();
    } catch (err: any) {
      setError(err.message || "Failed to delete selected companies");
    } finally {
      setBatchDeleting(false);
    }
  };

  // Clear status message after 5 seconds
  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <div className="content">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title">
          <h2>Companies</h2>
        </div>
        {me?.is_admin && (
          <button
            className="primary"
            style={{ display: "flex" }}
            onClick={() => setShowAddModal(true)}
          >
            <PlusIcon />
            ADD COMPANY
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {status && <div className="alert alert-success">{status}</div>}

      <div className="card">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div
            style={{
              position: "relative",
              flex: "1 1 320px",
              maxWidth: "520px",
            }}
          >
            <input
              type="text"
              placeholder="Search companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                height: "44px",
                borderRadius: "12px",
                border: "1px solid var(--stroke)",
                background: "var(--white-500)",
                padding: "0 14px 0 42px",
                fontSize: "14px",
                outline: "none",
              }}
            />
            <span
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)",
                display: "inline-flex",
              }}
            >
              <SearchIcon />
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                border: "1px solid var(--stroke)",
                borderRadius: "12px",
                overflow: "hidden",
                background: "var(--white-500)",
              }}
            >
              <button
                className={viewMode === "list" ? "primary" : "ghost"}
                type="button"
                onClick={() => setViewMode("list")}
                style={{
                  borderRadius: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <ListIcon />
                List
              </button>
              <button
                className={viewMode === "grid" ? "primary" : "ghost"}
                type="button"
                onClick={() => setViewMode("grid")}
                style={{
                  borderRadius: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <GridIcon />
                Grid
              </button>
            </div>
            <div style={{ position: "relative" }}>
              <button
                className="ghost"
                type="button"
                onClick={() => setShowActionMenu((prev) => !prev)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  minWidth: "120px",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <DownloadIcon />
                  Action
                </span>
                <ChevronDownIcon />
              </button>
              {showActionMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    minWidth: "180px",
                    background: "var(--white-500)",
                    border: "1px solid var(--stroke)",
                    borderRadius: "12px",
                    boxShadow: "var(--shadow)",
                    padding: "8px",
                    zIndex: 20,
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => {
                      exportCsv();
                      setShowActionMenu(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      justifyContent: "flex-start",
                      border: "none",
                    }}
                  >
                    <DownloadIcon />
                    Export CSV
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => {
                      exportXlsx();
                      setShowActionMenu(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      justifyContent: "flex-start",
                      border: "none",
                    }}
                  >
                    <DownloadIcon />
                    Export XLSX
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Company Modal */}
      {showAddModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="modal modal-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Register New Company</h3>
              <button
                className="icon-btn"
                onClick={() => setShowAddModal(false)}
              >
                <XIcon />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label className="input">
                  Company Name *
                  <input
                    type="text"
                    placeholder="Enter company name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label className="input">
                  TIN *
                  <input
                    type="text"
                    placeholder="Tax Identification Number"
                    value={form.tin}
                    onChange={(e) => setForm({ ...form, tin: e.target.value })}
                  />
                </label>
                <label className="input">
                  VAT
                  <input
                    type="text"
                    placeholder="VAT Number"
                    value={form.vat}
                    onChange={(e) => setForm({ ...form, vat: e.target.value })}
                  />
                </label>
                <label className="input">
                  Address
                  <input
                    type="text"
                    placeholder="Company address"
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                  />
                </label>
                <label className="input">
                  Email
                  <input
                    type="email"
                    placeholder="company@example.com"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                  />
                </label>
                <label className="input">
                  Phone
                  <input
                    type="text"
                    placeholder="+263 xxx xxx xxx"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="form-section">
                <h4>Portal Access (Optional)</h4>
                <div className="form-grid">
                  <label className="input">
                    Portal Email
                    <input
                      type="email"
                      placeholder="portal@company.com"
                      value={portalEmail}
                      onChange={(e) => setPortalEmail(e.target.value)}
                    />
                  </label>
                  <label className="input">
                    Portal Password
                    <input
                      type="password"
                      placeholder="Password"
                      value={portalPassword}
                      onChange={(e) => setPortalPassword(e.target.value)}
                    />
                  </label>
                </div>
                <div className="portal-app-access">
                  <div className="portal-app-access-head">
                    <h5>Portal Apps</h5>
                    <span>
                      Choose which apps can appear on the portal user dashboard.
                    </span>
                  </div>
                  <div className="portal-app-grid">
                    {PORTAL_APP_OPTIONS.map((app) => {
                      const selected = portalApps.includes(app.key);
                      return (
                        <label
                          key={app.key}
                          className={`portal-app-option ${selected ? "selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              togglePortalApp(
                                app.key,
                                portalApps,
                                setPortalApps,
                              )
                            }
                          />
                          <span>{app.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="portal-app-badges">
                    {portalApps.map((appKey) => {
                      const option = PORTAL_APP_OPTIONS.find(
                        (item) => item.key === appKey,
                      );
                      return (
                        <span key={appKey} className="portal-app-badge">
                          {option?.label || appKey}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button
                className="primary"
                onClick={createCompany}
                disabled={saving}
              >
                {saving ? "Creating..." : "Create Company"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {showEditModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={closeEditModal}
        >
          <div
            className="modal modal--centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Edit Company</h3>
              <button className="icon-btn" onClick={closeEditModal}>
                <XIcon />
              </button>
            </div>
            <div className="modal-body">
              {error && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <div className="form-grid">
                <label className="input">
                  Company Name *
                  <input
                    type="text"
                    placeholder="Enter company name"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                  />
                </label>
                <label className="input">
                  TIN *
                  <input
                    type="text"
                    placeholder="Tax Identification Number"
                    value={editForm.tin}
                    onChange={(e) =>
                      setEditForm({ ...editForm, tin: e.target.value })
                    }
                  />
                </label>
                <label className="input">
                  VAT
                  <input
                    type="text"
                    placeholder="VAT Number"
                    value={editForm.vat}
                    onChange={(e) =>
                      setEditForm({ ...editForm, vat: e.target.value })
                    }
                  />
                </label>
                <label className="input">
                  Address
                  <input
                    type="text"
                    placeholder="Company address"
                    value={editForm.address}
                    onChange={(e) =>
                      setEditForm({ ...editForm, address: e.target.value })
                    }
                  />
                </label>
                <label className="input">
                  Email
                  <input
                    type="email"
                    placeholder="company@example.com"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                  />
                </label>
                <label className="input">
                  Phone
                  <input
                    type="text"
                    placeholder="+263 xxx xxx xxx"
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phone: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="form-section">
                <h4>Portal Access</h4>
                <div className="form-grid">
                  <label className="input">
                    Portal Email
                    <input
                      type="email"
                      placeholder="portal@company.com"
                      value={editPortalEmail}
                      onChange={(e) => setEditPortalEmail(e.target.value)}
                    />
                    {editPortalUserId && (
                      <small style={{ color: "var(--muted)", marginTop: 4 }}>
                        Current portal user exists
                      </small>
                    )}
                  </label>
                  <label className="input">
                    {editPortalUserId
                      ? "New Password (leave blank to keep)"
                      : "Portal Password"}
                    <input
                      type="password"
                      placeholder={
                        editPortalUserId ? "Enter new password" : "Password"
                      }
                      value={editPortalPassword}
                      onChange={(e) => setEditPortalPassword(e.target.value)}
                    />
                  </label>
                </div>
                <div className="portal-app-access">
                  <div className="portal-app-access-head">
                    <h5>Activated Apps</h5>
                    <span>
                      These apps will be shown on the portal user dashboard.
                    </span>
                  </div>
                  <div className="portal-app-grid">
                    {PORTAL_APP_OPTIONS.map((app) => {
                      const selected = editPortalApps.includes(app.key);
                      return (
                        <label
                          key={app.key}
                          className={`portal-app-option ${selected ? "selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              togglePortalApp(
                                app.key,
                                editPortalApps,
                                setEditPortalApps,
                              )
                            }
                          />
                          <span>{app.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="portal-app-badges">
                    {editPortalApps.map((appKey) => {
                      const option = PORTAL_APP_OPTIONS.find(
                        (item) => item.key === appKey,
                      );
                      return (
                        <span key={appKey} className="portal-app-badge">
                          {option?.label || appKey}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={closeEditModal}>
                Cancel
              </button>
              <button className="primary" onClick={saveEdit} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Companies Table */}
      <div className="card">
        {hasSelection && (
          <div className="batch-actions-bar">
            <label className="batch-master-toggle">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                className="batch-checkbox"
              />
              <span>Select all</span>
            </label>
            <span className="batch-count">{selectedIds.size} selected</span>
            <button
              className="batch-btn export-btn"
              onClick={handleExportSelectedCsv}
              disabled={batchExporting}
            >
              {batchExporting ? "Exporting..." : "Export Selected"}
            </button>
            {me?.is_admin && (
              <button
                className="batch-btn delete-btn"
                onClick={handleBatchDelete}
                disabled={batchDeleting}
              >
                {batchDeleting
                  ? "Deleting..."
                  : `Delete (${selectedIds.size})`}
              </button>
            )}
            <button className="batch-btn clear-btn" onClick={clearSelection}>
              Clear
            </button>
          </div>
        )}
        {viewMode === "grid" ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              {pagedCompanies.map((company) => (
                <div
                  key={company.id}
                  className={selectedIds.has(company.id) ? "card-selected" : ""}
                  style={{
                    border: "1px solid var(--stroke)",
                    borderRadius: "16px",
                    padding: "18px",
                    background: "linear-gradient(180deg, var(--white-500), var(--slate-50))",
                    boxShadow: "var(--shadow-soft)",
                    display: "grid",
                    gap: "14px",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "16px",
                      left: "16px",
                      zIndex: 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(company.id)}
                      onChange={() => toggleSelect(company.id)}
                      className="batch-checkbox"
                      aria-label={`Select ${company.name}`}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "grid", gap: "6px" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <span
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "12px",
                            background: "var(--blue-50)",
                            color: "var(--blue-700)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginLeft: "28px",
                          }}
                        >
                          <BuildingIcon />
                        </span>
                        <div>
                          <div style={{ fontSize: "18px", fontWeight: 700 }}>
                            {company.name}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                            TIN {company.tin || "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                    {me?.is_admin && (
                      <div className="action-icons">
                        <button
                          className="icon-btn"
                          onClick={() => openEditModal(company)}
                          title="Edit company"
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => deleteCompany(company.id)}
                          title="Delete company"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>
                        VAT
                      </div>
                      <div>{company.vat || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>
                        Phone
                      </div>
                      <div>{company.phone || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>
                        Email
                      </div>
                      <div style={{ wordBreak: "break-word" }}>
                        {company.email || "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>
                        Portal Apps
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                        {(company.portal_apps?.length
                          ? company.portal_apps
                          : ["settings"]
                        ).slice(0, 3).map((appKey) => {
                          const option = PORTAL_APP_OPTIONS.find(
                            (item) => item.key === appKey,
                          );
                          return (
                            <span key={appKey} className="portal-app-badge">
                              {option?.label || appKey}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!filteredCompanies.length && (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px",
                  color: "var(--muted)",
                }}
              >
                <BuildingIcon />
                <p style={{ marginTop: "8px" }}>No companies found</p>
              </div>
            )}
          </>
        ) : (
          <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="batch-checkbox"
                />
              </th>
              <th>Company Name</th>
              <th>TIN</th>
              <th>VAT</th>
              <th>Phone</th>
              <th>Email</th>
              {me?.is_admin && <th>Portal User</th>}
              {me?.is_admin && (
                <th style={{ width: "100px", textAlign: "center" }}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {groupedCompanies.map((group, index) => (
              <Fragment key={group.label || `group-${index}`}>
                {group.label && (
                  <tr className="table-group">
                    <td colSpan={me?.is_admin ? 8 : 6}>
                      <strong>{group.label}</strong> ({group.items.length})
                    </td>
                  </tr>
                )}
                {group.items.map((c) => (
                  <tr key={c.id} className={selectedIds.has(c.id) ? "row-selected" : ""}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="batch-checkbox"
                        aria-label={`Select ${c.name}`}
                      />
                    </td>
                    <td>
                      <span className="company-name">{c.name}</span>
                    </td>
                    <td>
                      <code style={{ color: "var(--blue-500)" }}>{c.tin}</code>
                    </td>
                    <td>
                      {c.vat ? (
                        <span className="badge badge-info">{c.vat}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>{c.phone || <span className="text-muted">—</span>}</td>
                    <td>
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          style={{ color: "var(--blue-500)" }}
                        >
                          {c.email}
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {me?.is_admin && (
                      <td>
                        <span className="text-muted">••••••••</span>
                      </td>
                    )}
                    {me?.is_admin && (
                      <td>
                        <div className="action-icons">
                          <button
                            className="icon-btn"
                            onClick={() => openEditModal(c)}
                            title="Edit company"
                          >
                            <EditIcon />
                          </button>
                          <button
                            className="icon-btn danger"
                            onClick={() => deleteCompany(c.id)}
                            title="Delete company"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </Fragment>
            ))}
            {!filteredCompanies.length && (
              <tr>
                <td
                  colSpan={me?.is_admin ? 8 : 6}
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "var(--muted)",
                  }}
                >
                  <BuildingIcon />
                  <p style={{ marginTop: "8px" }}>No companies found</p>
                </td>
              </tr>
            )}
          </tbody>
          </table>
        )}
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={filteredCompanies.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
