import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, apiFetchWithTotal, apiRequest } from "../api";
import { Sidebar } from "../components/Sidebar";
import { TablePagination } from "../components/TablePagination";
import type { AlertModalVariant } from "../components/AlertModal";
import type { SidebarSection } from "../types/sidebar";
import { useCompanies } from "../hooks/useCompanies";
import { useMe } from "../hooks/useMe";
import { useAlert } from "../context/AlertContext";
import { Briefcase, LayoutGrid, List, User, Users } from "lucide-react";

type Contact = {
  id: number;
  company_id: number;
  name: string;
  address: string;
  vat: string;
  tin: string;
  phone: string;
  email?: string;
  reference?: string;
};

type DepositBalance = {
  company_id: number;
  contact_id: number;
  total_deposited: number;
  total_used: number;
  balance: number;
};

type CompanySettings = {
  currency_code?: string | null;
  currency_symbol?: string | null;
};

type ContactTypeFilter = "all" | "personal" | "company";

export default function ContactsPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { companies: allCompanies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    null,
  );
  const [companyQuery, setCompanyQuery] = useState("");
  const companyId = selectedCompanyId;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsPageSize, setContactsPageSize] = useState(10);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [contactTypeFilter, setContactTypeFilter] = useState<
    "all" | "personal" | "company"
  >("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [depositByContactId, setDepositByContactId] = useState<Record<number, number>>({});
  const [depositLoading, setDepositLoading] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const { showAlert, showConfirm } = useAlert();
  const showAlertMessage = (message: string, variant: AlertModalVariant = "danger") => {
    showAlert({ message, variant });
  };

  useEffect(() => {
    if (!isAdmin && me?.company_ids?.length && !selectedCompanyId) {
      setSelectedCompanyId(me.company_ids[0]);
    }
  }, [isAdmin, me?.company_ids, selectedCompanyId]);

  const filteredCompanies = useMemo(() => {
    if (!companyQuery.trim()) return allCompanies;
    const q = companyQuery.toLowerCase();
    return allCompanies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tin && c.tin.toLowerCase().includes(q)) ||
        (c.vat && c.vat.toLowerCase().includes(q)),
    );
  }, [allCompanies, companyQuery]);

  const loadContacts = async (cid: number) => {
    const params = new URLSearchParams({
      company_id: String(cid),
      limit: String(contactsPageSize),
      offset: String((contactsPage - 1) * contactsPageSize),
    });
    if (contactTypeFilter !== "all") {
      params.set("contact_type", contactTypeFilter);
    }
    const { data, total } = await apiFetchWithTotal<Contact[]>(
      `/contacts?${params.toString()}`,
    );
    setContacts(data);
    setTotalContacts(total);
    setSelectedIds(new Set());
  };

  useEffect(() => {
    if (companyId) {
      loadContacts(companyId);
    }
  }, [companyId, contactTypeFilter, contactsPage, contactsPageSize]);

  useEffect(() => {
    setContactsPage(1);
  }, [companyId, contactTypeFilter, contactsPageSize]);

  useEffect(() => {
    if (!companyId) return;
    apiFetch<CompanySettings>(`/company-settings?company_id=${companyId}`)
      .then((settings) => {
        setCurrencyCode((settings?.currency_code || "USD").toUpperCase());
        setCurrencySymbol((settings?.currency_symbol || "$"));
      })
      .catch(() => {
        setCurrencyCode("USD");
        setCurrencySymbol("$");
      });
  }, [companyId]);

  useEffect(() => {
    if (!companyId || contacts.length === 0) {
      setDepositByContactId({});
      return;
    }

    let cancelled = false;
    setDepositLoading(true);

    Promise.all(
      contacts.map(async (contact) => {
        try {
          const data = await apiFetch<DepositBalance>(
            `/payments/deposits/balance?company_id=${companyId}&contact_id=${contact.id}`,
          );
          return [contact.id, data.balance || 0] as const;
        } catch {
          return [contact.id, 0] as const;
        }
      }),
    )
      .then((rows) => {
        if (cancelled) return;
        const next: Record<number, number> = {};
        rows.forEach(([contactId, balance]) => {
          next[contactId] = balance;
        });
        setDepositByContactId(next);
      })
      .finally(() => {
        if (!cancelled) setDepositLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, contacts]);

  const formatMoney = (value: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode || "USD",
      }).format(value || 0);
    } catch {
      return `${currencySymbol || "$"}${(value || 0).toFixed(2)}`;
    }
  };

  const openDepositPayments = (contactId: number) => {
    if (!companyId) return;
    navigate(`/payments?company_id=${companyId}&contact_id=${contactId}`);
  };

  const startNew = () => {
    navigate("/contacts/new");
  };

  const openContact = (contact: Contact) => {
    navigate(`/contacts/${contact.id}`);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isCompanyContact = (contact: Contact) =>
    Boolean(
      (contact.vat && contact.vat.trim().length) ||
      (contact.tin && contact.tin.trim().length),
    );

  const filteredContacts = contacts;

  const toggleSelectAll = () => {
    const visibleIds = filteredContacts.map((c) => c.id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmMsg = `Are you sure you want to delete ${selectedIds.size} contact${selectedIds.size > 1 ? "s" : ""}? This action cannot be undone.`;
    const confirmed = await showConfirm({
      title: "Delete contacts",
      message: confirmMsg,
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await apiFetch("/contacts/batch-delete", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (companyId) await loadContacts(companyId);
    } catch (err) {
      showAlertMessage(
        "Failed to delete contacts. " +
          (err instanceof Error ? err.message : ""),
        "danger",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCSV = async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const res = await apiRequest("/contacts/export-csv", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contacts_export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showAlertMessage(
        "Failed to export contacts. " +
          (err instanceof Error ? err.message : ""),
        "danger",
      );
    } finally {
      setExporting(false);
    }
  };

  const allSelected =
    filteredContacts.length > 0 &&
    filteredContacts.every((c) => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0;
  const companyCount = contacts.filter((c) => isCompanyContact(c)).length;
  const personalCount = contacts.length - companyCount;

  const contactSidebarSections = useMemo<SidebarSection[]>(() => {
    const typeFilters = [
      {
        key: "all" as ContactTypeFilter,
        label: "ALL CONTACTS",
        icon: Users,
        color: "var(--blue-600)",
        background: "rgba(37, 99, 235, 0.12)",
        count: contacts.length,
      },
      {
        key: "personal" as ContactTypeFilter,
        label: "PERSONAL",
        icon: User,
        color: "var(--teal-600)",
        background: "rgba(5, 150, 105, 0.15)",
        count: personalCount,
      },
      {
        key: "company" as ContactTypeFilter,
        label: "COMPANY",
        icon: Briefcase,
        color: "var(--violet-600)",
        background: "rgba(139, 92, 246, 0.15)",
        count: companyCount,
      },
    ];

    return [
      {
        id: "contact-types",
        title: "CONTACT TYPE",
        items: typeFilters.map((filter) => {
          const Icon = filter.icon;
          return {
            id: `contact-type-${filter.key}`,
            label: filter.label,
            icon: (
              <Icon
                size={18}
                strokeWidth={1.5}
                aria-hidden="true"
                color={filter.color}
              />
            ),
            badge: filter.count,
            isActive: contactTypeFilter === filter.key,
            onClick: () => setContactTypeFilter(filter.key),
            iconColor: filter.color,
            iconBackground: filter.background,
          };
        }),
      },
    ];
  }, [contacts.length, companyCount, contactTypeFilter, personalCount]);

  if (companiesLoading && !companyId) {
    return <div className="loading-indicator">Loading companies...</div>;
  }
  if (!isAdmin && !companyId && allCompanies.length) {
    return <div className="loading-indicator">Loading companies...</div>;
  }

  if (isAdmin && !companyId) {
    return (
      <div className="content">
        <div
          className=""
          style={{
            display: "flex",
            width: "auto",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div className="company-search">
            <input
              type="text"
              placeholder="Search company by name, VAT, or TIN"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
            />
          </div>
        </div>

        <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>
          Select a company to view its purchase orders.
        </p>

        <div className="device-company-grid">
          {filteredCompanies.map((c) => (
            <button
              key={c.id}
              className="device-company-card"
              onClick={() => setSelectedCompanyId(c.id)}
            >
              <div className="device-company-icon">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
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
              </div>
              <div className="device-company-info">
                <div className="device-company-name">{c.name}</div>
                {c.tin && (
                  <div className="device-company-detail">TIN: {c.tin}</div>
                )}
                {c.vat && (
                  <div className="device-company-detail">VAT: {c.vat}</div>
                )}
              </div>
              <div className="device-company-arrow">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}
          {!filteredCompanies.length && (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: 40,
                color: "var(--muted)",
              }}
            >
              {companyQuery.trim()
                ? "No companies match your search."
                : "No companies found. Create a company first."}
            </div>
          )}
          <TablePagination
            page={contactsPage}
            pageSize={contactsPageSize}
            totalItems={totalContacts}
            onPageChange={setContactsPage}
            onPageSizeChange={setContactsPageSize}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="two-panel two-panel-left">
        <Sidebar sections={contactSidebarSections} />

        <div className="form-shell">
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <div className="toolbar-left">
              <h3>Customers</h3>
            </div>
            <div className="toolbar-right">
              <button
                className={viewMode === "list" ? "tab active" : "tab"}
                onClick={() => setViewMode("list")}
                type="button"
                title="List view"
                aria-label="List view"
              >
                <List size={16} aria-hidden="true" />
              </button>
              <button
                className={viewMode === "kanban" ? "tab active" : "tab"}
                onClick={() => setViewMode("kanban")}
                type="button"
                title="Kanban view"
                aria-label="Kanban view"
              >
                <LayoutGrid size={16} aria-hidden="true" />
              </button>
              <button className="primary" onClick={startNew}>
                New
              </button>
            </div>
          </div>

          {/* Batch action bar */}
          {someSelected && (
            <div className="batch-action-bar">
              <span className="batch-count">{selectedIds.size} selected</span>
              <button
                className="batch-btn export-btn"
                onClick={handleExportCSV}
                disabled={exporting}
              >
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
                {exporting ? "Exporting..." : "Export CSV"}
              </button>
              <button
                className="batch-btn delete-btn"
                onClick={handleBatchDelete}
                disabled={deleting}
              >
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
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
                {deleting ? "Deleting..." : `Delete (${selectedIds.size})`}
              </button>
              <button
                className="batch-btn clear-btn"
                onClick={() => setSelectedIds(new Set())}
              >
                ✕ Clear
              </button>
            </div>
          )}

          {viewMode === "list" ? (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="batch-checkbox"
                    />
                  </th>
                  <th>Name</th>
                  {contactTypeFilter !== "personal" && <th>VAT</th>}
                  {contactTypeFilter !== "personal" && <th>TIN</th>}
                  <th>Phone</th>
                  <th>Email</th>
                  <th style={{ textAlign: "right" }}>Deposit</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((c) => (
                  <tr
                    key={c.id}
                    className={selectedIds.has(c.id) ? "row-selected" : ""}
                  >
                    <td
                      style={{ width: 40 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="batch-checkbox"
                      />
                    </td>
                    <td
                      onClick={() => openContact(c)}
                      style={{ cursor: "pointer" }}
                    >
                      {c.name}
                    </td>
                    {contactTypeFilter !== "personal" && (
                      <td
                        onClick={() => openContact(c)}
                        style={{ cursor: "pointer" }}
                      >
                        {c.vat}
                      </td>
                    )}
                    {contactTypeFilter !== "personal" && (
                      <td
                        onClick={() => openContact(c)}
                        style={{ cursor: "pointer" }}
                      >
                        {c.tin}
                      </td>
                    )}
                    <td
                      onClick={() => openContact(c)}
                      style={{ cursor: "pointer" }}
                    >
                      {c.phone}
                    </td>
                    <td
                      onClick={() => openContact(c)}
                      style={{ cursor: "pointer" }}
                    >
                      {c.email}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="o-stat-button"
                        style={{
                          padding: "6px 10px",
                          borderLeft: "1px solid var(--color-border-soft)",
                          borderRadius: 6,
                          minWidth: 120,
                          alignItems: "flex-end",
                        }}
                        onClick={() => openDepositPayments(c.id)}
                        title="Open customer deposit payments"
                      >
                        <span className="o-stat-button-value" style={{ fontSize: 14 }}>
                          {depositLoading && depositByContactId[c.id] === undefined
                            ? "..."
                            : formatMoney(depositByContactId[c.id] || 0)}
                        </span>
                        <span className="o-stat-button-label" style={{ fontSize: 10 }}>
                          Deposit
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="card-grid">
              {filteredContacts.map((c) => (
                <div
                  key={c.id}
                  className={`card ${selectedIds.has(c.id) ? "card-selected" : ""}`}
                  style={{ cursor: "pointer", position: "relative" }}
                >
                  <div
                    style={{ position: "absolute", top: 10, left: 10 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(c.id);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      className="batch-checkbox"
                    />
                  </div>
                  <div
                    onClick={() => openContact(c)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      paddingLeft: 28,
                    }}
                  >
                    <div className="user-avatar-small">
                      {(c.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {c.email || c.phone}
                      </div>
                      <button
                        type="button"
                        className="o-stat-button"
                        style={{
                          marginTop: 8,
                          padding: "6px 10px",
                          borderLeft: "1px solid var(--color-border-soft)",
                          borderRadius: 6,
                          alignItems: "flex-start",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDepositPayments(c.id);
                        }}
                        title="Open customer deposit payments"
                      >
                        <span className="o-stat-button-value" style={{ fontSize: 14 }}>
                          {depositLoading && depositByContactId[c.id] === undefined
                            ? "..."
                            : formatMoney(depositByContactId[c.id] || 0)}
                        </span>
                        <span className="o-stat-button-label" style={{ fontSize: 10 }}>
                          Deposit
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
