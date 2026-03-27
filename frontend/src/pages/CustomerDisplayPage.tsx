import { useState, useEffect, useRef } from "react";

type DisplayCartLine = {
  name: string;
  qty: number;
  price: number;
  discount: number;
  vat_rate: number;
  image_url: string;
  subtotal: number;
  total: number;
};

type DisplayData = {
  type: "pos-cart-update";
  cart: DisplayCartLine[];
  subtotal: number;
  tax: number;
  total: number;
  currency_code?: string;
  currency_symbol?: string;
  companyName: string;
  companyLogo: string;
  company?: {
    name: string;
    address: string;
    phone: string;
    email: string;
    tin: string;
    vat: string;
    logo_data: string;
  } | null;
  show_receipt?: boolean;
  last_order?: {
    reference: string;
    order_date: string;
    cashier_name: string;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    payment_method: string;
    cash_amount: number;
    card_amount: number;
    mobile_amount: number;
    change_amount: number;
    zimra_verification_code: string;
    zimra_verification_url: string;
    lines: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>;
  } | null;
  selected_customer?: { name: string; tin: string } | null;
  session?: { name: string } | null;
  active_device?: {
    model: string;
    serial_number: string;
    device_id: string;
  } | null;
};

const fmt = (n: number) => n.toFixed(2);

export default function CustomerDisplayPage() {
  const [data, setData] = useState<DisplayData | null>(null);
  const [clock, setClock] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen for messages from POS window
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "pos-cart-update") {
        setData(e.data as DisplayData);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll cart
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.cart.length]);

  const cart = data?.cart || [];
  const total = data?.total || 0;
  const subtotal = data?.subtotal || 0;
  const tax = data?.tax || 0;
  const companyName = data?.companyName || "Three65";
  const companyLogo = data?.companyLogo || "";
  const currencySymbol = data?.currency_symbol || "";
  const currencyCode = data?.currency_code || "";
  const company = data?.company || null;
  const receiptOrder = data?.last_order || null;
  const showReceipt = Boolean(data?.show_receipt && receiptOrder);

  const money = (n: number) => {
    if (currencySymbol) return `${currencySymbol}${fmt(n)}`;
    if (currencyCode) return `${currencyCode} ${fmt(n)}`;
    return fmt(n);
  };

  return (
    <div className="cd-root">
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { overflow: hidden; }
        .cd-root {
          height: 100vh;
          width: 100vw;
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 55%, #f1f5f9 100%);
          color: #0f172a;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .cd-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 32px;
          background: rgba(255,255,255,0.85);
          border-bottom: 1px solid rgba(15,23,42,0.08);
          backdrop-filter: blur(6px);
        }
        .cd-header-left { display: flex; align-items: center; gap: 16px; }
        .cd-logo { height: 48px; width: auto; border-radius: 8px; }
        .cd-company-name { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.5px; }
        .cd-clock { font-size: 1.2rem; font-weight: 500; color: #64748b; font-variant-numeric: tabular-nums; }
        .cd-body { flex: 1; display: flex; overflow: hidden; }
        .cd-cart-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 24px 32px;
          overflow: hidden;
        }
        .cd-cart-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 16px;
        }
        .cd-cart-list {
          flex: 1;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(15,23,42,0.15) transparent;
        }
        .cd-cart-list::-webkit-scrollbar { width: 6px; }
        .cd-cart-list::-webkit-scrollbar-track { background: transparent; }
        .cd-cart-list::-webkit-scrollbar-thumb { background: rgba(15,23,42,0.15); border-radius: 3px; }
        .cd-line {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 0;
          border-bottom: 1px solid rgba(15,23,42,0.08);
          animation: cd-fade-in 0.3s ease;
        }
        @keyframes cd-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cd-line-img {
          width: 52px;
          height: 52px;
          border-radius: 10px;
          overflow: hidden;
          background: rgba(15,23,42,0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .cd-line-img img { width: 100%; height: 100%; object-fit: cover; }
        .cd-line-info { flex: 1; }
        .cd-line-name { font-size: 1.15rem; font-weight: 600; margin-bottom: 2px; }
        .cd-line-meta { font-size: 0.9rem; color: #64748b; }
        .cd-line-total { font-size: 1.2rem; font-weight: 700; text-align: right; min-width: 100px; }
        .cd-totals-section {
          width: 360px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 32px;
          background: rgba(15,23,42,0.02);
          border-left: 1px solid rgba(15,23,42,0.08);
        }
        .cd-total-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 1.1rem;
          color: #64748b;
        }
        .cd-total-row span:last-child { font-weight: 600; color: #0f172a; }
        .cd-grand-total {
          display: flex;
          justify-content: space-between;
          padding: 20px 0;
          margin-top: 12px;
          border-top: 2px solid rgba(15,23,42,0.1);
          font-size: 2.2rem;
          font-weight: 800;
          color: #16a34a;
        }
        .cd-item-count {
          text-align: center;
          padding: 12px;
          margin-top: 16px;
          border-radius: 12px;
          background: rgba(15,23,42,0.04);
          font-size: 1rem;
          color: #64748b;
        }
        .cd-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #475569;
        }
        .cd-empty-icon { margin-bottom: 16px; opacity: 0.4; }
        .cd-empty p { font-size: 1.4rem; font-weight: 500; }
        .cd-empty small { font-size: 1rem; color: #64748b; margin-top: 8px; }
        .cd-footer {
          text-align: center;
          padding: 12px;
          font-size: 0.85rem;
          color: #64748b;
          border-top: 1px solid rgba(15,23,42,0.06);
        }
        .cd-receipt-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 2000;
        }
        .cd-receipt-dialog {
          width: min(720px, 100%);
          max-height: calc(100vh - 48px);
          overflow: auto;
          background: #ffffff;
          border-radius: 14px;
          padding: 22px;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.45);
        }
        .cd-receipt-header {
          text-align: center;
          margin-bottom: 12px;
        }
        .cd-receipt-header img {
          max-height: 56px;
          width: auto;
          margin-bottom: 8px;
        }
        .cd-receipt-company-name {
          font-size: 1.35rem;
          font-weight: 700;
        }
        .cd-receipt-detail {
          font-size: 0.92rem;
          color: #475569;
        }
        .cd-receipt-divider {
          border-top: 1px dashed #94a3b8;
          margin: 12px 0;
        }
        .cd-receipt-meta {
          font-size: 0.95rem;
          color: #334155;
          line-height: 1.45;
        }
        .cd-receipt-table-head,
        .cd-receipt-table-row {
          display: grid;
          grid-template-columns: 1fr 64px 110px 110px;
          gap: 10px;
          font-size: 0.93rem;
          align-items: center;
        }
        .cd-receipt-table-head {
          font-weight: 700;
          color: #334155;
          margin-bottom: 8px;
        }
        .cd-receipt-table-row {
          padding: 6px 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.25);
        }
        .cd-receipt-num {
          text-align: right;
        }
        .cd-receipt-total-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.95rem;
          padding: 3px 0;
        }
        .cd-receipt-grand {
          display: flex;
          justify-content: space-between;
          font-size: 1.25rem;
          font-weight: 800;
          color: #16a34a;
          margin-top: 6px;
        }
        .cd-receipt-fiscal {
          margin-top: 10px;
          font-size: 0.92rem;
          color: #334155;
        }
        .cd-receipt-fiscal-code {
          font-weight: 700;
          font-size: 1.05rem;
          margin-top: 4px;
        }
        .cd-receipt-fiscal a {
          color: #0f766e;
          font-weight: 600;
        }
      `}</style>

      {/* Header */}
      <div className="cd-header">
        {/* <div className="cd-header-left">
          {companyLogo && <img className="cd-logo" src={companyLogo} alt="" />}
        </div> */}
        <div className="cd-clock">
          {clock.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
          {" · "}
          {clock.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
      </div>

      {/* Body */}
      <div className="cd-body">
        {cart.length === 0 ? (
          <div className="cd-empty">
            <div className="cd-empty-icon">
              <svg
                width="80"
                height="80"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
              </svg>
            </div>
            <p>Welcome!</p>
            <small>Your items will appear here</small>
          </div>
        ) : (
          <>
            <div className="cd-cart-section">
              <div className="cd-cart-title">
                Your Items ({cart.reduce((s, l) => s + l.qty, 0)})
              </div>
              <div className="cd-cart-list" ref={scrollRef}>
                {cart.map((l, i) => (
                  <div key={i} className="cd-line">
                    <div className="cd-line-img">
                      {l.image_url ? (
                        <img src={l.image_url} alt={l.name} />
                      ) : (
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#475569"
                          strokeWidth="1.2"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      )}
                    </div>
                    <div className="cd-line-info">
                      <div className="cd-line-name">{l.name}</div>
                      <div className="cd-line-meta">
                        {l.qty} × {money(l.price)}
                        {l.discount > 0 && ` (−${l.discount}%)`}
                      </div>
                    </div>
                    <div className="cd-line-total">{money(l.total)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="cd-totals-section">
              <div className="cd-total-row">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="cd-total-row">
                <span>Tax</span>
                <span>{money(tax)}</span>
              </div>
              <div className="cd-grand-total">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
              <div className="cd-item-count">
                {cart.reduce((s, l) => s + l.qty, 0)} item
                {cart.reduce((s, l) => s + l.qty, 0) !== 1 ? "s" : ""} in cart
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="cd-footer">Powered by GeeNet</div>

      {showReceipt && receiptOrder && (
        <div className="cd-receipt-overlay">
          <div className="cd-receipt-dialog">
            <div className="cd-receipt-header">
              {(company?.logo_data || companyLogo) && (
                <img src={company?.logo_data || companyLogo} alt="Logo" />
              )}
              <div className="cd-receipt-company-name">
                {company?.name || companyName}
              </div>
              {company?.address && (
                <div className="cd-receipt-detail">{company.address}</div>
              )}
              {company?.phone && (
                <div className="cd-receipt-detail">Tel: {company.phone}</div>
              )}
              {company?.email && (
                <div className="cd-receipt-detail">{company.email}</div>
              )}
              {company?.tin && (
                <div className="cd-receipt-detail">
                  TIN: {company.tin}
                  {company?.vat ? ` | VAT: ${company.vat}` : ""}
                </div>
              )}
            </div>

            <div className="cd-receipt-divider" />
            <div className="cd-receipt-meta">
              <div><strong>{receiptOrder.reference}</strong></div>
              <div>{new Date(receiptOrder.order_date).toLocaleString()}</div>
              {data?.session?.name && <div>Session: {data.session.name}</div>}
              {receiptOrder.cashier_name && (
                <div>Cashier: {receiptOrder.cashier_name}</div>
              )}
              {data?.selected_customer && (
                <div>
                  Customer: {data.selected_customer.name}
                  {data.selected_customer.tin
                    ? ` | TIN: ${data.selected_customer.tin}`
                    : ""}
                </div>
              )}
            </div>

            <div className="cd-receipt-divider" />
            <div className="cd-receipt-table-head">
              <span>Item</span>
              <span className="cd-receipt-num">Qty</span>
              <span className="cd-receipt-num">Price</span>
              <span className="cd-receipt-num">Total</span>
            </div>
            {(receiptOrder.lines || []).map((line, idx) => (
              <div className="cd-receipt-table-row" key={idx}>
                <span>{line.description}</span>
                <span className="cd-receipt-num">{line.quantity}</span>
                <span className="cd-receipt-num">{money(line.unit_price)}</span>
                <span className="cd-receipt-num">
                  {money(line.total_price)}
                </span>
              </div>
            ))}

            <div className="cd-receipt-divider" />
            <div className="cd-receipt-total-row">
              <span>Subtotal</span>
              <span>{money(receiptOrder.subtotal)}</span>
            </div>
            {receiptOrder.discount_amount > 0 && (
              <div className="cd-receipt-total-row">
                <span>Discount</span>
                <span>-{money(receiptOrder.discount_amount)}</span>
              </div>
            )}
            <div className="cd-receipt-total-row">
              <span>Tax</span>
              <span>{money(receiptOrder.tax_amount)}</span>
            </div>
            <div className="cd-receipt-grand">
              <span>TOTAL</span>
              <span>{money(receiptOrder.total_amount)}</span>
            </div>

            <div className="cd-receipt-divider" />
            <div className="cd-receipt-total-row">
              <span>Payment</span>
              <span>
                {receiptOrder.payment_method.charAt(0).toUpperCase() +
                  receiptOrder.payment_method.slice(1)}
              </span>
            </div>
            {receiptOrder.cash_amount > 0 && (
              <div className="cd-receipt-total-row">
                <span>Cash</span>
                <span>{money(receiptOrder.cash_amount)}</span>
              </div>
            )}
            {receiptOrder.card_amount > 0 && (
              <div className="cd-receipt-total-row">
                <span>Card</span>
                <span>{money(receiptOrder.card_amount)}</span>
              </div>
            )}
            {receiptOrder.mobile_amount > 0 && (
              <div className="cd-receipt-total-row">
                <span>Mobile</span>
                <span>{money(receiptOrder.mobile_amount)}</span>
              </div>
            )}
            {receiptOrder.change_amount > 0 && (
              <div className="cd-receipt-total-row">
                <span>Change</span>
                <span>{money(receiptOrder.change_amount)}</span>
              </div>
            )}

            {receiptOrder.zimra_verification_code && (
              <div className="cd-receipt-fiscal">
                <div>ZIMRA Verification</div>
                <div className="cd-receipt-fiscal-code">
                  {receiptOrder.zimra_verification_code}
                </div>
                {receiptOrder.zimra_verification_url && (
                  <a
                    href={receiptOrder.zimra_verification_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Verify Receipt
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
