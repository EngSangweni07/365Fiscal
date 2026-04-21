import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import JournalEntryPreviewDrawer from "../components/JournalEntryPreviewDrawer";
import { TablePagination } from "../components/TablePagination";
import { useMe } from "../hooks/useMe";

interface Payment {
  id: number;
  invoice_id: number;
  invoice_reference: string;
  company_id: number;
  amount: number;
  currency: string;
  payment_method: string;
  payment_date: string;
  reference: string;
  notes: string;
  is_reconciled: boolean;
  created_at: string;
  created_by_id: number | null;
  created_by_email: string;
}

interface PaymentSummary {
  total_payments: number;
  total_amount: number;
  reconciled_count: number;
  pending_count: number;
  by_method: Record<string, { count: number; amount: number }>;
}

const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

const formatCurrency = (value: number, currency: string = "USD") => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(2)}`;
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString();
};

// Icons
const PaymentIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

export default function PaymentsPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  const companyId = me?.company_ids?.[0];

  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [methodFilter, setMethodFilter] = useState("");
  const [reconciledFilter, setReconciledFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exportingSelected, setExportingSelected] = useState(false);
  const [previewPaymentId, setPreviewPaymentId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, [companyId, methodFilter, reconciledFilter, searchFilter]);

  const loadData = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append("company_id", String(companyId));
      if (methodFilter) params.append("payment_method", methodFilter);
      if (reconciledFilter) params.append("is_reconciled", reconciledFilter);
      if (searchFilter) params.append("search", searchFilter);

      const [paymentsData, summaryData] = await Promise.all([
        apiFetch<Payment[]>(`/payments?${params.toString()}`),
        apiFetch<PaymentSummary>(`/payments/summary?company_id=${companyId}`).catch(() => null),
      ]);

      setPayments(paymentsData);
      setSummary(summaryData);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  const reconcilePayment = async (paymentId: number) => {
    try {
      await apiFetch(`/payments/${paymentId}/reconcile`, { method: "POST" });
      loadData();
    } catch (err: any) {
      setError(err.message || "Failed to reconcile payment");
    }
  };

  const getMethodBadgeColor = (method: string) => {
    const colors: Record<string, string> = {
      cash: "var(--green-600)",
      bank_transfer: "var(--blue-600)",
      mobile_money: "var(--violet-600)",
      card: "var(--red-600)",
      cheque: "var(--orange-600)",
      other: "var(--slate-500)",
    };
    return colors[method] || "var(--slate-500)";
  };

  const totalPages = Math.max(1, Math.ceil(payments.length / pageSize));
  const pagedPayments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return payments.slice(start, start + pageSize);
  }, [payments, page, pageSize]);
  const visiblePaymentIds = pagedPayments.map((payment) => payment.id);
  const allVisibleSelected =
    visiblePaymentIds.length > 0 &&
    visiblePaymentIds.every((id) => selectedIds.has(id));
  const selectedPayments = payments.filter((payment) => selectedIds.has(payment.id));

  const toggleSelect = (paymentId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visiblePaymentIds.forEach((id) => next.delete(id));
      } else {
        visiblePaymentIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleExportSelected = () => {
    if (!selectedPayments.length) return;
    setExportingSelected(true);
    try {
      const rows = selectedPayments.map((payment) => ({
        Date: formatDate(payment.payment_date),
        Invoice: payment.invoice_reference || "",
        Reference: payment.reference || "",
        Method:
          paymentMethods.find((m) => m.value === payment.payment_method)?.label ||
          payment.payment_method,
        Amount: formatCurrency(payment.amount, payment.currency),
        Status: payment.is_reconciled ? "Reconciled" : "Pending",
      }));
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((header) =>
              `"${String(row[header as keyof typeof row] ?? "").replace(/"/g, '""')}"`,
            )
            .join(","),
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "payments-selected.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExportingSelected(false);
    }
  };

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [methodFilter, reconciledFilter, searchFilter, companyId, pageSize]);

  return (
    <div className="content-area">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">Track all payment transactions</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8 }}>×</button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--slate-800)" }}>
              {summary.total_payments}
            </div>
            <div style={{ fontSize: 13, color: "var(--slate-500)" }}>Total Payments</div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--green-600)" }}>
              {formatCurrency(summary.total_amount)}
            </div>
            <div style={{ fontSize: 13, color: "var(--slate-500)" }}>Total Amount</div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--blue-600)" }}>
              {summary.reconciled_count}
            </div>
            <div style={{ fontSize: 13, color: "var(--slate-500)" }}>Reconciled</div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--amber-500)" }}>
              {summary.pending_count}
            </div>
            <div style={{ fontSize: 13, color: "var(--slate-500)" }}>Pending</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ flex: 2, minWidth: 200 }}>
            <label>Search</label>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search by reference..."
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
            <label>Payment Method</label>
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
              <option value="">All Methods</option>
              {paymentMethods.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
            <label>Status</label>
            <select value={reconciledFilter} onChange={(e) => setReconciledFilter(e.target.value)}>
              <option value="">All</option>
              <option value="true">Reconciled</option>
              <option value="false">Pending</option>
            </select>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--slate-500)" }}>
          Loading payments...
        </div>
      ) : (
        <div className="table-container">
          {selectedIds.size > 0 && (
            <div className="batch-action-bar">
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
                onClick={handleExportSelected}
                disabled={exportingSelected}
              >
                {exportingSelected ? "Exporting..." : "Export Selected"}
              </button>
              <button
                className="batch-btn clear-btn"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </button>
            </div>
          )}
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
                <th>Date</th>
                <th>Invoice</th>
                <th>Reference</th>
                <th>Method</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 40, color: "var(--slate-500)" }}>
                    No payments found
                  </td>
                </tr>
              ) : (
                pagedPayments.map((payment) => (
                  <tr key={payment.id} className={selectedIds.has(payment.id) ? "row-selected" : ""}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(payment.id)}
                        onChange={() => toggleSelect(payment.id)}
                        className="batch-checkbox"
                        aria-label={`Select payment ${payment.reference || payment.invoice_reference}`}
                      />
                    </td>
                    <td style={{ fontSize: 13 }}>{formatDate(payment.payment_date)}</td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{payment.invoice_reference}</span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--slate-500)" }}>{payment.reference || "-"}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          background: getMethodBadgeColor(payment.payment_method) + "15",
                          color: getMethodBadgeColor(payment.payment_method),
                        }}
                      >
                        <PaymentIcon />
                        {paymentMethods.find((m) => m.value === payment.payment_method)?.label || payment.payment_method}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>
                      {formatCurrency(payment.amount, payment.currency)}
                    </td>
                    <td>
                      {payment.is_reconciled ? (
                        <span style={{ color: "var(--green-600)", display: "flex", alignItems: "center", gap: 4 }}>
                          <CheckIcon /> Reconciled
                        </span>
                      ) : (
                        <span style={{ color: "var(--amber-500)", display: "flex", alignItems: "center", gap: 4 }}>
                          <ClockIcon /> Pending
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-light"
                        onClick={() => setPreviewPaymentId(payment.id)}
                        style={{ marginRight: 6 }}
                      >
                        Preview
                      </button>
                      <button
                        className="btn btn-sm btn-light"
                        onClick={() =>
                          navigate(`/accounting?section=journal_entries&reference=${encodeURIComponent(`PAY/${payment.reference}`)}`)
                        }
                        style={{ marginRight: 6 }}
                      >
                        Journal
                      </button>
                      {!payment.is_reconciled && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => reconcilePayment(payment.id)}
                        >
                          Reconcile
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalItems={payments.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <JournalEntryPreviewDrawer
        open={previewPaymentId !== null}
        onClose={() => setPreviewPaymentId(null)}
        sourceType="payment"
        sourceId={previewPaymentId}
      />

      <style>{`
        .alert-error {
          background: var(--red-100);
          color: var(--red-600);
          padding: 12px 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .btn-sm {
          padding: 6px 12px;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
