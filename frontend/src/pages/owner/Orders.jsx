import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import Alert from "../../components/Alert";
import {
  listOwnerOrders,
  getOrdersSummary,
  getOwnerOrder,
  devMarkOrderPaid,
  resendDelivery,
  exportOrdersCsv,
  listOwnerProducts,
} from "../../api/owner";
import styles from "./Orders.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(cents, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days  = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatDateShort(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function getFlag(code) {
  if (!code || code.length !== 2) return "";
  const offset = 0x1F1E6 - 65;
  return String.fromCodePoint(
    code.toUpperCase().charCodeAt(0) + offset,
    code.toUpperCase().charCodeAt(1) + offset
  );
}

const COUNTRY_NAMES = {
  US: "United States", GB: "United Kingdom", CA: "Canada", DE: "Germany",
  FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands", AU: "Australia",
  BR: "Brazil", MX: "Mexico", PE: "Peru", CO: "Colombia", CL: "Chile",
  AR: "Argentina", JP: "Japan", KR: "South Korea", IN: "India", CN: "China",
  SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", PL: "Poland",
  PT: "Portugal", ZA: "South Africa", SG: "Singapore", IE: "Ireland",
  AT: "Austria", CH: "Switzerland", NZ: "New Zealand", AE: "UAE",
};

function getCountryName(code) {
  if (!code) return "";
  return COUNTRY_NAMES[code.toUpperCase()] || code.toUpperCase();
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cls = {
    pending:  styles.statusPending,
    paid:     styles.statusPaid,
    failed:   styles.statusFailed,
    refunded: styles.statusRefunded,
  }[status] || styles.statusPending;
  return <span className={`${styles.statusBadge} ${cls}`}>{status}</span>;
}

// ── DeliveryIndicator — compact badge for list rows ───────────────────────────

function DeliveryIndicator({ order }) {
  // Only relevant for paid orders
  if (order.status !== "paid") return null;

  const { fulfillment_status, fulfillment_opened_at, delivery_expires_at } = order;

  // No fulfillment record yet
  if (!fulfillment_status) {
    return <span className={`${styles.delivBadge} ${styles.delivPending}`}>⏳ Awaiting</span>;
  }

  const now       = Date.now();
  const expired   = delivery_expires_at && now > new Date(delivery_expires_at).getTime();
  const wasOpened = Boolean(fulfillment_opened_at) || fulfillment_status === "opened";

  if (fulfillment_status === "failed") {
    return <span className={`${styles.delivBadge} ${styles.delivFailed}`}>❌ Failed</span>;
  }
  if (wasOpened) {
    return <span className={`${styles.delivBadge} ${styles.delivOpened}`}>✅ Delivered</span>;
  }
  if (expired) {
    return <span className={`${styles.delivBadge} ${styles.delivExpired}`}>⚠️ Expired</span>;
  }
  if (fulfillment_status === "sent") {
    return <span className={`${styles.delivBadge} ${styles.delivSent}`}>📧 Sent</span>;
  }
  return <span className={`${styles.delivBadge} ${styles.delivPending}`}>⏳ Awaiting</span>;
}

// ── StatCards ─────────────────────────────────────────────────────────────────

function StatCards({ summary, currency, loading }) {
  const avgStr = summary && summary.paidCount > 0
    ? formatCurrency(summary.averageOrderValue, currency)
    : "—";

  return (
    <div className={styles.statCards}>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Total Revenue</span>
        <span className={`${styles.statValue} ${summary?.totalRevenue > 0 ? styles.statValueGreen : ""}`}>
          {loading ? "…" : summary ? formatCurrency(summary.totalRevenue, currency) : "—"}
        </span>
        <span className={styles.statSub}>from paid orders</span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Orders</span>
        <span className={styles.statValue}>
          {loading ? "…" : summary ? summary.orderCount.toLocaleString() : "—"}
        </span>
        {summary && (
          <span className={styles.statSub}>
            {summary.paidCount} paid · {summary.pendingCount} pending
          </span>
        )}
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Avg Order</span>
        <span className={styles.statValue}>
          {loading ? "…" : avgStr}
        </span>
        <span className={styles.statSub}>per paid order</span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Delivery Rate</span>
        <span className={`${styles.statValue} ${summary?.deliveryRate === 100 && summary?.paidCount > 0 ? styles.statValueGreen : ""}`}>
          {loading ? "…" : summary ? `${summary.deliveryRate}%` : "—"}
        </span>
        <span className={styles.statSub}>
          {summary ? `${summary.deliveredCount} of ${summary.paidCount} delivered` : ""}
        </span>
      </div>
    </div>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

function FilterBar({
  search, onSearch,
  statusFilter, onStatus,
  productFilter, onProduct, products,
  dateFrom, onDateFrom,
  dateTo, onDateTo,
  sortBy, onSort,
}) {
  return (
    <div className={styles.filterBar}>
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Search by email or order ID…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <select className={styles.filterSelect} value={statusFilter} onChange={(e) => onStatus(e.target.value)}>
        <option value="">All statuses</option>
        <option value="paid">Paid</option>
        <option value="pending">Pending</option>
        <option value="failed">Failed</option>
        <option value="refunded">Refunded</option>
      </select>
      <select className={styles.filterSelect} value={productFilter} onChange={(e) => onProduct(e.target.value)}>
        <option value="">All products</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>{p.title}</option>
        ))}
      </select>
      <div className={styles.dateRange}>
        <input type="date" className={styles.dateInput} value={dateFrom} onChange={(e) => onDateFrom(e.target.value)} />
        <span className={styles.dateSep}>→</span>
        <input type="date" className={styles.dateInput} value={dateTo} onChange={(e) => onDateTo(e.target.value)} />
      </div>
      <select className={styles.filterSelect} value={sortBy} onChange={(e) => onSort(e.target.value)}>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="highest">Highest amount</option>
        <option value="lowest">Lowest amount</option>
      </select>
    </div>
  );
}

// ── OrderRow ──────────────────────────────────────────────────────────────────

function OrderRow({ order, selected, onClick }) {
  const extras = order.item_count > 1 ? ` +${order.item_count - 1} more` : "";
  const flag   = getFlag(order.buyer_country);

  return (
    <button
      type="button"
      className={`${styles.orderRow} ${selected ? styles.orderRowSelected : ""}`}
      onClick={onClick}
    >
      {/* Line 1: flag + email | status badge + time */}
      <div className={styles.orderLine1}>
        <div className={styles.orderIdentity}>
          {flag && <span className={styles.orderFlag}>{flag}</span>}
          <span className={styles.orderEmail}>{order.buyer_email || "—"}</span>
        </div>
        <div className={styles.orderStatusGroup}>
          <StatusBadge status={order.status} />
          <span className={styles.orderTime}>{timeAgo(order.created_at)}</span>
        </div>
      </div>

      {/* Line 2: product · amount | delivery */}
      <div className={styles.orderLine2}>
        <span className={styles.orderProductLine}>
          {order.primary_product_name
            ? <>{order.primary_product_name}{extras}<span className={styles.orderAmountInline}> · {formatCurrency(order.total_cents, order.currency)}</span></>
            : formatCurrency(order.total_cents, order.currency)
          }
        </span>
        <DeliveryIndicator order={order} />
      </div>

      {/* Line 3: order ID · buyer type badge */}
      <div className={styles.orderLine3}>
        <span className={styles.orderIdRef}>#{order.id.slice(0, 8)}</span>
        <span className={styles.orderLine3Dot}>·</span>
        <span
          className={styles.buyerTypeBadgeSmall}
          style={{
            color:      order.buyer_type === "member" ? "#2563eb" : "#6b7280",
            background: order.buyer_type === "member" ? "#eff6ff" : "#f3f4f6",
          }}
        >
          {order.buyer_type === "member" ? "MEMBER" : "GUEST"}
        </span>
      </div>
    </button>
  );
}

// ── DeliveryTimeline ──────────────────────────────────────────────────────────

function DeliveryTimeline({ order, fulfillment }) {
  const now    = Date.now();
  const isPaid = order.status === "paid";

  // Build steps array
  const steps = [];

  // Step 1: Payment
  steps.push({
    label:  "Payment confirmed",
    desc:   `Order #${order.id.slice(0, 8)} created`,
    time:   order.created_at,
    status: isPaid ? "done" : order.status === "pending" ? "pending" : "failed",
  });

  // Step 2: Delivery email
  if (fulfillment) {
    if (fulfillment.status === "failed") {
      steps.push({
        label:  "Delivery email failed",
        desc:   fulfillment.error || "Email could not be sent",
        time:   null,
        status: "failed",
      });
    } else if (fulfillment.sent_at) {
      steps.push({
        label:  "Delivery email sent",
        desc:   `Sent to ${order.buyer_email || "customer"}`,
        time:   fulfillment.sent_at,
        status: "done",
      });
    } else {
      steps.push({
        label:  "Sending delivery email",
        desc:   "Processing…",
        time:   null,
        status: "pending",
      });
    }
  } else if (isPaid) {
    steps.push({
      label:  "Delivery email",
      desc:   'Not yet triggered — click "Resend Delivery Email" below',
      time:   null,
      status: "waiting",
    });
  }

  // Step 3: Customer downloaded (only if email was sent)
  if (fulfillment?.sent_at) {
    if (fulfillment.opened_at) {
      steps.push({
        label:  "Customer downloaded",
        desc:   "Download link was accessed",
        time:   fulfillment.opened_at,
        status: "done",
      });
    } else {
      const isExpired = fulfillment.delivery_expires_at
        && now > new Date(fulfillment.delivery_expires_at).getTime();
      steps.push({
        label:  isExpired ? "Customer did not download" : "Awaiting customer download",
        desc:   isExpired
          ? "Link expired without being accessed"
          : "Customer has not yet accessed the download link",
        time:   null,
        status: isExpired ? "warning" : "waiting",
      });
    }
  }

  // Step 4: Link expiry (only if email was sent)
  if (fulfillment?.delivery_expires_at) {
    const expiresAt = new Date(fulfillment.delivery_expires_at);
    const isExpired = now > expiresAt.getTime();
    steps.push({
      label:  isExpired ? "Link expired" : "Link expires",
      desc:   isExpired ? "72-hour download window ended" : "72-hour download window",
      time:   fulfillment.delivery_expires_at,
      status: isExpired ? (fulfillment.opened_at ? "done" : "warning") : "future",
    });
  }

  function iconChar(s) {
    if (s === "done")    return "✓";
    if (s === "failed")  return "✕";
    if (s === "warning") return "!";
    if (s === "pending") return "·";
    return "○"; // waiting, future
  }

  return (
    <div className={styles.timeline}>
      {steps.map((step, i) => (
        <div key={i} className={styles.timelineStep}>
          <div className={styles.timelineLeft}>
            <div className={`${styles.timelineIcon} ${styles[`timelineIcon_${step.status}`] || ""}`}>
              {iconChar(step.status)}
            </div>
            {i < steps.length - 1 && (
              <div className={`${styles.timelineLine} ${step.status === "done" ? styles.timelineLineDone : ""}`} />
            )}
          </div>
          <div className={styles.timelineRight}>
            <div className={styles.timelineHeader}>
              <span className={`${styles.timelineLabel} ${step.status === "warning" ? styles.timelineLabelWarning : ""}`}>
                {step.label}
              </span>
              {step.time && <span className={styles.timelineTime}>{formatDateShort(step.time)}</span>}
            </div>
            {step.desc && <p className={styles.timelineDesc}>{step.desc}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── OrderDetail ───────────────────────────────────────────────────────────────

function OrderDetail({
  order, items, fulfillment, customer,
  onMarkPaid, markingPaid, markPaidError, onDismissMarkPaidError,
  onResend, resending, resendError, resendOk, onDismissResendError,
}) {
  const navigate              = useNavigate();
  const [copyOk, setCopyOk]  = useState(false);
  const isPaid            = order.status === "paid";
  const subtotalCents     = items.reduce((s, it) => s + it.unit_price_cents * it.quantity, 0);
  const discountCents     = order.discount_amount_cents || 0;
  const hasFulfillment    = Boolean(fulfillment);
  const hasBeenSent       = hasFulfillment && (fulfillment.sent_at || fulfillment.status === "sent" || fulfillment.status === "opened");
  const alreadySent       = hasBeenSent && !fulfillment.opened_at;
  const isExpiredUnopened = hasFulfillment
    && fulfillment.delivery_expires_at
    && Date.now() > new Date(fulfillment.delivery_expires_at).getTime()
    && !fulfillment.opened_at;

  function copyEmail() {
    navigator.clipboard.writeText(order.buyer_email).then(() => {
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    });
  }

  return (
    <div className={styles.detail}>

      {/* ── Header ── */}
      <div className={styles.detailHeader}>
        <div>
          <h2 className={styles.detailTitle}>Order #{order.id.slice(0, 8)}</h2>
          <p className={styles.detailDate}>
            {formatDate(order.created_at)}
            <span className={styles.detailPaymentMethod}>
              {order.stripe_checkout_session_id ? " · Stripe Checkout" : " · Manual / Test"}
            </span>
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* ── Customer ── */}
      {order.buyer_email && (
        <div className={styles.detailSection}>
          <h3 className={styles.sectionLabel}>Customer</h3>
          <div className={styles.customerRow}>
            <span className={styles.customerEmail}>
              {getFlag(order.buyer_country) && (
                <span className={styles.orderFlagDetail}>{getFlag(order.buyer_country)}</span>
              )}
              <button
                type="button"
                className={styles.customerEmailLink}
                onClick={() => navigate(`/owner/customers?search=${encodeURIComponent(order.buyer_email)}`)}
                title="View in Customers"
              >
                {order.buyer_email}
              </button>
            </span>
            <button type="button" className={styles.copyBtn} onClick={copyEmail}>
              {copyOk ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className={styles.buyerTypePillRow}>
            <span
              className={styles.buyerTypeBadge}
              style={{
                color:      order.buyer_type === "member" ? "#1d4ed8" : "#6b7280",
                background: order.buyer_type === "member" ? "#eff6ff" : "#f3f4f6",
                border:     `1px solid ${order.buyer_type === "member" ? "#bfdbfe" : "#e5e7eb"}`,
              }}
            >
              {order.buyer_type === "member" ? "MEMBER" : "GUEST"}
            </span>
            {order.buyer_type === "member" && order.buyer_display_name && (
              <span className={styles.buyerDisplayName}>{order.buyer_display_name}</span>
            )}
          </div>
          {customer && (
            <p className={styles.customerSummaryLine}>
              {customer.order_count} {customer.order_count === 1 ? "purchase" : "purchases"} · {formatCurrency(customer.total_spent_cents, order.currency)} total spent
              {customer.order_count > 1 && (
                <button
                  type="button"
                  className={styles.viewAllPurchasesLink}
                  onClick={() => navigate(`/owner/customers?search=${encodeURIComponent(order.buyer_email)}`)}
                >
                  View all purchases →
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {/* ── Items ── */}
      {items.length > 0 && (
        <div className={styles.detailSection}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionLabel}>Items</h3>
            {order.buyer_country && (
              <span className={styles.itemsCountryInfo}>
                {getFlag(order.buyer_country)} Purchased from {getCountryName(order.buyer_country)}
              </span>
            )}
          </div>
          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th className={styles.itemsThProduct}>Product</th>
                <th className={styles.itemsThQty}>Qty</th>
                <th className={styles.itemsThAmount}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className={styles.itemRow}>
                  <td className={styles.itemName}>
                    <button
                      type="button"
                      className={styles.itemProductLink}
                      onClick={() => navigate(`/owner/products/${it.product_id}/edit`)}
                    >
                      {it.title || "Unknown Product"}
                    </button>
                  </td>
                  <td className={styles.itemQty}>×{it.quantity}</td>
                  <td className={styles.itemAmount}>
                    {formatCurrency(it.unit_price_cents * it.quantity, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={styles.itemsTotalRow}>
                <td colSpan={2} className={styles.itemsTotalLabel}>Subtotal</td>
                <td className={styles.itemsTotalValue}>{formatCurrency(subtotalCents, order.currency)}</td>
              </tr>
              {discountCents > 0 && (
                <tr className={styles.itemsDiscountRow}>
                  <td colSpan={2} className={styles.itemsTotalLabel}>🏷️ Discount</td>
                  <td className={styles.itemsDiscountValue}>−{formatCurrency(discountCents, order.currency)}</td>
                </tr>
              )}
              <tr className={styles.itemsGrandTotal}>
                <td colSpan={2} className={styles.itemsGrandLabel}>Total</td>
                <td className={styles.itemsGrandValue}>{formatCurrency(order.total_cents, order.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Delivery timeline (always shown for paid orders) ── */}
      {isPaid && (
        <div className={styles.detailSection}>
          <h3 className={styles.sectionLabel}>Delivery Timeline</h3>
          <DeliveryTimeline order={order} fulfillment={fulfillment} />
        </div>
      )}

      {/* ── Actions ── */}
      {isPaid && (
        <div className={styles.detailSection}>
          <h3 className={styles.sectionLabel}>Actions</h3>

          {resendOk && <p className={styles.resendSuccess}>✅ Delivery email sent successfully!</p>}
          {resendError && (
            <div className={styles.alertWrap}>
              <Alert type="error" onDismiss={onDismissResendError}>{resendError}</Alert>
            </div>
          )}

          <button
            type="button"
            className={isExpiredUnopened ? styles.btnResendUrgent : styles.btnResend}
            onClick={onResend}
            disabled={resending}
          >
            {resending ? <Spinner size={14} /> : "📧"}
            {resending ? "Sending…" : hasBeenSent ? "Resend Delivery Email" : "Send Delivery Email"}
          </button>

          {!hasBeenSent && (
            <p className={styles.actionHint}>
              No delivery email has been sent for this order yet.
            </p>
          )}
          {hasBeenSent && fulfillment?.opened_at && (
            <p className={styles.actionHint}>
              Customer already downloaded. Resending creates a fresh link if they need it again.
            </p>
          )}
          {alreadySent && !isExpiredUnopened && (
            <p className={styles.actionHint}>
              ⚠️ Resending will create a new download link and invalidate the previous one.
            </p>
          )}
          {isExpiredUnopened && (
            <p className={styles.actionHint} style={{ color: "#92400e" }}>
              Link expired before the customer downloaded. Resend to create a new link.
            </p>
          )}
        </div>
      )}

      {/* ── Reference info ── */}
      {(order.stripe_checkout_session_id) && (
        <div className={styles.detailSection}>
          <h3 className={styles.sectionLabel}>Reference</h3>
          {order.stripe_checkout_session_id && (
            <div className={styles.detailMeta}>
              <span className={styles.metaLabel}>Stripe session</span>
              <span className={styles.metaValue}>{order.stripe_checkout_session_id.slice(0, 24)}…</span>
            </div>
          )}
        </div>
      )}

      {/* ── Manual payment ── */}
      {order.status === "pending" && (
        <div className={styles.manualPaySection}>
          <hr className={styles.manualPayDivider} />
          <p className={styles.manualPayLabel}>Manual Payment</p>
          {markPaidError && (
            <div className={styles.alertWrap}>
              <Alert type="error" onDismiss={onDismissMarkPaidError}>{markPaidError}</Alert>
            </div>
          )}
          <button type="button" className={styles.confirmPayBtn} onClick={onMarkPaid} disabled={markingPaid}>
            {markingPaid && <Spinner size={14} />}
            {markingPaid ? "Processing…" : "Confirm Payment"}
          </button>
        </div>
      )}

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OwnerOrders() {
  const { ownerCtx, ownerStore } = useOwner();
  const [searchParams] = useSearchParams();
  const currency = (ownerStore?.currency || "usd").toUpperCase();

  const [orders,       setOrders]       = useState(null);
  const [summary,      setSummary]      = useState(null);
  const [summaryLoad,  setSummaryLoad]  = useState(false);
  const [listError,    setListError]    = useState(null);
  const [products,     setProducts]     = useState([]);

  const [selectedId,     setSelectedId]     = useState(null);
  const [detail,         setDetail]         = useState(null);
  const [detailLoading,  setDetailLoading]  = useState(false);
  const [detailError,    setDetailError]    = useState(null);
  const [markingPaid,    setMarkingPaid]    = useState(false);
  const [markPaidError,  setMarkPaidError]  = useState(null);
  const [resending,      setResending]      = useState(false);
  const [resendError,    setResendError]    = useState(null);
  const [resendOk,       setResendOk]       = useState(false);
  const [exporting,      setExporting]      = useState(false);

  const [mobileDetail, setMobileDetail] = useState(false);

  // Filters
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [dateFrom,      setDateFrom]      = useState("");
  const [dateTo,        setDateTo]        = useState("");
  const [sortBy,        setSortBy]        = useState("newest");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize,    setPageSize]    = useState(20);

  const debounceRef = useRef(null);

  const slug     = ownerStore?.slug ?? "";
  const storeUrl = slug ? `${window.location.origin}/store/${slug}` : "";
  const [copiedUrl, setCopiedUrl] = useState(false);

  const currentFilters = { search, status: statusFilter, dateFrom, dateTo, productId: productFilter, sortBy };

  // ── FIX 2: Deselect when selected order is no longer in the filtered list ──

  useEffect(() => {
    if (selectedId && orders !== null) {
      const stillVisible = orders.some((o) => o.id === selectedId);
      if (!stillVisible) {
        setSelectedId(null);
        setDetail(null);
        setMobileDetail(false);
      }
    }
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async (filters) => {
    setListError(null);
    try {
      const data = await listOwnerOrders(ownerCtx, filters);
      setOrders(data.orders ?? []);
    } catch (err) {
      setListError(err.message);
      setOrders([]);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line

  const fetchSummary = useCallback(async (filters) => {
    setSummaryLoad(true);
    try {
      const data = await getOrdersSummary(ownerCtx, filters);
      setSummary(data);
    } catch {
      // non-critical
    } finally {
      setSummaryLoad(false);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line

  useEffect(() => {
    fetchOrders(currentFilters);
    fetchSummary(currentFilters);
    listOwnerProducts(ownerCtx).then((d) => setProducts(d.products ?? [])).catch(() => {});
  }, []); // eslint-disable-line

  // Auto-select order from ?selected= query param (e.g. navigated from Customers page)
  const didAutoSelectRef = useRef(false);
  useEffect(() => {
    if (didAutoSelectRef.current) return;
    const preselectedId = searchParams.get("selected");
    if (preselectedId && orders && orders.length > 0) {
      didAutoSelectRef.current = true;
      selectOrder(preselectedId);
    }
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters(next) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchOrders(next);
      fetchSummary(next);
    }, next.search !== search ? 300 : 0);
  }

  function handleSearch(val) {
    setSearch(val);
    applyFilters({ ...currentFilters, search: val });
  }
  function handleStatus(val) {
    setStatusFilter(val);
    applyFilters({ ...currentFilters, status: val });
  }
  function handleProduct(val) {
    setProductFilter(val);
    applyFilters({ ...currentFilters, productId: val });
  }
  function handleDateFrom(val) {
    setDateFrom(val);
    applyFilters({ ...currentFilters, dateFrom: val });
  }
  function handleDateTo(val) {
    setDateTo(val);
    applyFilters({ ...currentFilters, dateTo: val });
  }
  function handleSort(val) {
    setSortBy(val);
    applyFilters({ ...currentFilters, sortBy: val });
  }

  // ── Select order ──────────────────────────────────────────────────────────

  async function selectOrder(orderId) {
    setSelectedId(orderId);
    setDetail(null);
    setDetailError(null);
    setMarkPaidError(null);
    setResendError(null);
    setResendOk(false);
    setDetailLoading(true);
    setMobileDetail(true);
    try {
      const data = await getOwnerOrder(orderId, ownerCtx);
      setDetail(data);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleMarkPaid() {
    if (!selectedId) return;
    setMarkPaidError(null);
    setMarkingPaid(true);
    try {
      const data = await devMarkOrderPaid(selectedId, ownerCtx);
      setDetail((prev) => prev ? { ...prev, order: data.order } : prev);
      setOrders((prev) => prev ? prev.map((o) => (o.id === selectedId ? { ...o, ...data.order } : o)) : prev);
    } catch (err) {
      setMarkPaidError(err.message);
    } finally {
      setMarkingPaid(false);
    }
  }

  async function handleResend() {
    if (!selectedId) return;
    setResendError(null);
    setResendOk(false);
    setResending(true);
    try {
      await resendDelivery(selectedId, ownerCtx);
      setResendOk(true);
      const data = await getOwnerOrder(selectedId, ownerCtx);
      setDetail(data);
    } catch (err) {
      setResendError(err.message);
    } finally {
      setResending(false);
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const blob = await exportOrdersCsv(ownerCtx, currentFilters);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "orders.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  function copyStoreUrl() {
    if (!storeUrl) return;
    navigator.clipboard.writeText(storeUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  }

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, productFilter, dateFrom, dateTo, sortBy]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalOrders    = orders?.length ?? null;
  const hasFilters     = Boolean(search || statusFilter || productFilter || dateFrom || dateTo);
  const isZero         = summary?.orderCount === 0 && !hasFilters && orders !== null;
  const totalPages     = Math.ceil((orders?.length ?? 0) / pageSize);
  const paginatedOrders = orders
    ? orders.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Orders</h1>
          <p className={styles.subtitle}>
            {totalOrders === null
              ? "Loading…"
              : totalOrders === 0 && hasFilters
              ? "No orders match current filters"
              : `${(summary?.orderCount ?? totalOrders).toLocaleString()} ${(summary?.orderCount ?? totalOrders) === 1 ? "order" : "orders"}`}
          </p>
        </div>
        <button
          type="button"
          className={styles.exportBtn}
          onClick={handleExportCsv}
          disabled={exporting || !orders?.length}
        >
          {exporting ? <Spinner size={14} /> : "📥"}
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {listError && <Alert type="error">{listError}</Alert>}

      {isZero ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyEmoji}>🎉</span>
          <h2 className={styles.emptyTitle}>Your first order is on its way</h2>
          <p className={styles.emptyDesc}>
            Once a buyer completes checkout their order will appear here.
            Share your store link to start getting sales.
          </p>
          {storeUrl && (
            <div className={styles.emptyUrlRow}>
              <span className={styles.emptyUrl}>{storeUrl}</span>
              <button type="button" className={styles.copyBtn} onClick={copyStoreUrl}>
                {copiedUrl ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <StatCards summary={summary} currency={currency} loading={summaryLoad && !summary} />

          <FilterBar
            search={search}             onSearch={handleSearch}
            statusFilter={statusFilter} onStatus={handleStatus}
            productFilter={productFilter} onProduct={handleProduct} products={products}
            dateFrom={dateFrom}         onDateFrom={handleDateFrom}
            dateTo={dateTo}             onDateTo={handleDateTo}
            sortBy={sortBy}             onSort={handleSort}
          />

          <div className={styles.layout}>

            <div className={`${styles.listPane} ${mobileDetail ? styles.listPaneHidden : ""}`}>
              {orders !== null && orders.length > 0 && (
                <div className={styles.paginationHeader}>
                  <span className={styles.paginationInfo}>
                    {orders.length} {orders.length === 1 ? "order" : "orders"}
                  </span>
                  <select
                    className={styles.pageSizeSelect}
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  >
                    <option value={10}>10 / page</option>
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                  </select>
                </div>
              )}

              {orders === null ? (
                <div className={styles.loadingRow}><Spinner size={16} /> Loading…</div>
              ) : orders.length === 0 ? (
                <div className={styles.empty}>
                  <p>No orders found.</p>
                  {hasFilters && <p className={styles.emptyHint}>Try clearing filters.</p>}
                </div>
              ) : (
                paginatedOrders.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    selected={selectedId === o.id}
                    onClick={() => selectOrder(o.id)}
                  />
                ))
              )}

              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button className={styles.pageBtn} disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>««</button>
                  <button className={styles.pageBtn} disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>‹</button>
                  <span className={styles.pageInfo}>Page {currentPage} of {totalPages}</span>
                  <button className={styles.pageBtn} disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>›</button>
                  <button className={styles.pageBtn} disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>»»</button>
                </div>
              )}
            </div>

            <div className={styles.detailPane}>
              {mobileDetail && (
                <button type="button" className={styles.backToList} onClick={() => setMobileDetail(false)}>
                  ← Back to orders
                </button>
              )}
              {!selectedId ? (
                <div className={styles.detailEmpty}>
                  <span className={styles.detailEmptyIcon}>📋</span>
                  <p>Select an order to view details</p>
                </div>
              ) : detailLoading ? (
                <div className={styles.loadingRow}><Spinner size={16} /> Loading…</div>
              ) : detailError ? (
                <Alert type="error">{detailError}</Alert>
              ) : detail ? (
                <OrderDetail
                  order={detail.order}
                  items={detail.items ?? []}
                  fulfillment={detail.fulfillment}
                  customer={detail.customer ?? null}
                  onMarkPaid={handleMarkPaid}
                  markingPaid={markingPaid}
                  markPaidError={markPaidError}
                  onDismissMarkPaidError={() => setMarkPaidError(null)}
                  onResend={handleResend}
                  resending={resending}
                  resendError={resendError}
                  resendOk={resendOk}
                  onDismissResendError={() => setResendError(null)}
                />
              ) : null}
            </div>

          </div>
        </>
      )}
    </div>
  );
}
