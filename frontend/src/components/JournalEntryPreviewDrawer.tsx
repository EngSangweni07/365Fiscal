import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { apiFetch } from "../api";

type SourceType = "invoice" | "payment" | "expense" | "purchase" | "stock" | "pos";

type PreviewLine = {
  account_id: number | null;
  account_code: string;
  account_name: string;
  label: string;
  debit: number;
  credit: number;
  currency_code: string;
  resolution: string;
};

type PreviewEntry = {
  entry_id: number | null;
  reference: string;
  entry_date: string | null;
  status: string;
  narration: string;
  journal_name: string | null;
  journal_code: string | null;
  persisted: boolean;
  lines: PreviewLine[];
};

type PreviewPayload = {
  company_id: number;
  source_type: string;
  source_id: number;
  source_reference: string;
  exists: boolean;
  entries: PreviewEntry[];
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.28)",
  zIndex: 1400,
  display: "flex",
  justifyContent: "flex-end",
};

const drawerStyle: React.CSSProperties = {
  width: "min(560px, 100vw)",
  height: "100%",
  background: "#fff",
  boxShadow: "-24px 0 48px rgba(15, 23, 42, 0.18)",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: React.CSSProperties = {
  padding: "20px 24px 16px",
  borderBottom: "1px solid #e2e8f0",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const bodyStyle: React.CSSProperties = {
  padding: 24,
  overflowY: "auto",
  display: "grid",
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 16,
  display: "grid",
  gap: 12,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#64748b",
  borderBottom: "1px solid #e2e8f0",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
  fontSize: 13,
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const badgeStyle = (tone: "preview" | "posted" | "cancelled") => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase" as const,
  background:
    tone === "posted"
      ? "#dcfce7"
      : tone === "cancelled"
        ? "#fee2e2"
        : "#dbeafe",
  color:
    tone === "posted"
      ? "#166534"
      : tone === "cancelled"
        ? "#991b1b"
        : "#1d4ed8",
});

const fmtMoney = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(value || 0);
  } catch {
    return `${currency || "USD"} ${(value || 0).toFixed(2)}`;
  }
};

const fmtDate = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

export default function JournalEntryPreviewDrawer({
  open,
  onClose,
  sourceType,
  sourceId,
}: {
  open: boolean;
  onClose: () => void;
  sourceType: SourceType;
  sourceId: number | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);

  useEffect(() => {
    if (!open || !sourceId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<PreviewPayload>(
      `/accounting/source-entry-preview?source_type=${encodeURIComponent(sourceType)}&source_id=${sourceId}`,
    )
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Failed to load journal preview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sourceId, sourceType]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const totals = useMemo(() => {
    const entries = preview?.entries || [];
    return entries.map((entry) => {
      const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      return { debit, credit };
    });
  }, [preview]);

  if (!open || !sourceId) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <aside style={drawerStyle} onClick={(event) => event.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Journal Preview
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginTop: 4 }}>
              {preview?.source_reference || `Document #${sourceId}`}
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>
              {preview?.exists
                ? "Persisted journal entries linked to this document"
                : "Projected journal entry based on the current document state"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "transparent", color: "#475569", cursor: "pointer" }}
            aria-label="Close journal preview"
          >
            <X size={20} />
          </button>
        </div>
        <div style={bodyStyle}>
          {loading && <div style={{ color: "#475569", fontSize: 14 }}>Loading journal preview...</div>}
          {error && <div style={{ color: "#b91c1c", fontSize: 14 }}>{error}</div>}
          {!loading && !error && preview?.entries.length === 0 && (
            <div style={{ color: "#475569", fontSize: 14 }}>No journal data available for this document.</div>
          )}
          {!loading && !error &&
            preview?.entries.map((entry, index) => {
              const total = totals[index] || { debit: 0, credit: 0 };
              const tone =
                entry.status === "cancelled"
                  ? "cancelled"
                  : entry.persisted && entry.status === "posted"
                    ? "posted"
                    : "preview";
              return (
                <section key={`${entry.reference}-${index}`} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{entry.reference}</div>
                      <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                        {entry.journal_name ? `${entry.journal_name}${entry.journal_code ? ` (${entry.journal_code})` : ""}` : "Journal pending resolution"}
                      </div>
                    </div>
                    <span style={badgeStyle(tone)}>{entry.persisted ? entry.status : "preview"}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13, color: "#334155" }}>
                    <div>
                      <strong>Date:</strong> {fmtDate(entry.entry_date)}
                    </div>
                    <div>
                      <strong>Lines:</strong> {entry.lines.length}
                    </div>
                  </div>
                  {entry.narration && (
                    <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{entry.narration}</div>
                  )}
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Account</th>
                        <th style={thStyle}>Label</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Debit</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines.map((line, lineIndex) => (
                        <tr key={`${entry.reference}-${lineIndex}`}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>
                              {line.account_code || "-"}
                            </div>
                            <div style={{ color: "#64748b", fontSize: 12 }}>{line.account_name || "Unresolved account"}</div>
                          </td>
                          <td style={tdStyle}>
                            <div style={{ color: "#334155" }}>{line.label || "-"}</div>
                            {line.resolution !== "posted" && line.resolution !== "mapped" && (
                              <div style={{ color: line.resolution === "unresolved" ? "#b45309" : "#64748b", fontSize: 11, marginTop: 4 }}>
                                {line.resolution}
                              </div>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {line.debit ? fmtMoney(line.debit, line.currency_code) : "-"}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {line.credit ? fmtMoney(line.credit, line.currency_code) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} style={{ ...tdStyle, fontWeight: 700 }}>Totals</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                          {fmtMoney(total.debit, entry.lines[0]?.currency_code || "USD")}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                          {fmtMoney(total.credit, entry.lines[0]?.currency_code || "USD")}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </section>
              );
            })}
        </div>
      </aside>
    </div>
  );
}