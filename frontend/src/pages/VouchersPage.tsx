import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { apiFetch } from "../api";
import { useMe } from "../hooks/useMe";


type Voucher = {
  id: number;
  company_id: number;
  code: string;
  source_order_id: number | null;
  issued_to_contact_id: number | null;
  amount: number;
  remaining_amount: number;
  currency: string;
  status: string;
  issued_at: string;
  redeemed_at: string | null;
  redeemed_order_id: number | null;
  notes: string;
};

const formatMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount || 0);
  } catch {
    return `${currency} ${(amount || 0).toFixed(2)}`;
  }
};

const printVoucher = (voucher: Voucher) => {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Voucher ${voucher.code}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { font-family: 'Courier New', monospace; width: 80mm; margin: 0; padding: 5mm; color: #111; }
  .title { text-align: center; font-weight: 700; font-size: 16px; margin-bottom: 6px; }
  .sub { text-align: center; font-size: 11px; margin-bottom: 10px; }
  .row { display: flex; justify-content: space-between; font-size: 12px; margin: 4px 0; }
  .code { text-align: center; font-weight: 700; font-size: 15px; border: 1px dashed #111; padding: 8px; margin: 8px 0; }
  .note { font-size: 10px; margin-top: 8px; color: #444; }
  .foot { text-align: center; font-size: 10px; margin-top: 12px; }
</style>
</head><body>
  <div class="title">VOUCHER</div>
  <div class="sub">365Fiscal POS Change Voucher</div>
  <div class="code">${voucher.code}</div>
  <div class="row"><span>Amount</span><span>${formatMoney(voucher.amount, voucher.currency)}</span></div>
  <div class="row"><span>Remaining</span><span>${formatMoney(voucher.remaining_amount, voucher.currency)}</span></div>
  <div class="row"><span>Status</span><span>${voucher.status.toUpperCase()}</span></div>
  <div class="row"><span>Issued</span><span>${new Date(voucher.issued_at).toLocaleString()}</span></div>
  ${voucher.source_order_id ? `<div class="row"><span>POS Order</span><span>#${voucher.source_order_id}</span></div>` : ""}
  <div class="note">Present this voucher code at checkout.</div>
  <div class="foot">Thank you for shopping with us.</div>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 4000);
  }, 200);
};

export default function VouchersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { me } = useMe();

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const requestedCompany = Number(searchParams.get("company_id") || 0);
    if (requestedCompany > 0) {
      setCompanyId(requestedCompany);
      return;
    }
    if (me?.company_ids?.length) {
      setCompanyId(me.company_ids[0]);
    }
  }, [searchParams, me?.company_ids]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ company_id: String(companyId) });
      if (statusFilter) params.append("status", statusFilter);
      if (search.trim()) params.append("search", search.trim());
      const data = await apiFetch<Voucher[]>(`/vouchers?${params.toString()}`);
      setVouchers(data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load vouchers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [companyId, statusFilter, search]);

  const activeCount = useMemo(
    () => vouchers.filter((v) => v.status === "active" && v.remaining_amount > 0).length,
    [vouchers],
  );

  return (
    <div className="content">
      <div className="form-shell">
        <div className="form-header">
          <div>
            <h3>Vouchers</h3>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Track issued change vouchers and print copies.</div>
          </div>
          <div className="form-actions">
            <button className="outline" onClick={() => navigate(companyId ? `/pos?company_id=${companyId}` : "/pos")}>Open POS</button>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="input" style={{ minWidth: 160 }}>
              Status
              <select className="input-underline" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="redeemed">Redeemed</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
            </label>
            <label className="input" style={{ minWidth: 260, flex: 1 }}>
              Search code
              <input className="input-underline" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. VCH-20260430" />
            </label>
            <div className="status-pill active" style={{ alignSelf: "center" }}>{activeCount} active</div>
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Issued</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Remaining</th>
                <th>POS Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 24 }}>Loading vouchers...</td></tr>
              ) : vouchers.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 24 }}>No vouchers found.</td></tr>
              ) : (
                vouchers.map((voucher) => (
                  <tr key={voucher.id}>
                    <td style={{ fontWeight: 700 }}>{voucher.code}</td>
                    <td>{new Date(voucher.issued_at).toLocaleString()}</td>
                    <td><span className={`status-badge ${voucher.status === "active" ? "active" : "neutral"}`}>{voucher.status}</span></td>
                    <td>{formatMoney(voucher.amount, voucher.currency)}</td>
                    <td>{formatMoney(voucher.remaining_amount, voucher.currency)}</td>
                    <td>{voucher.source_order_id ? `#${voucher.source_order_id}` : "-"}</td>
                    <td>
                      <button className="btn btn-sm btn-light" onClick={() => printVoucher(voucher)}>Print</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
