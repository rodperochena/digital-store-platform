import { useState, useEffect, useCallback } from "react";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import Alert from "../../components/Alert";
import { listOwnerOrders, getOwnerOrder, devMarkOrderPaid, resendDelivery } from "../../api/owner";
import styles from "./Orders.module.css";

function formatPrice(cents, currency) {
  return `${(cents / 100).toFixed(2)} ${(currency || "usd").toUpperCase()}`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString();
}

function StatusBadge({ status }) {
  const cls = {
    pending:  styles.statusPending,
    paid:     styles.statusPaid,
    failed:   styles.statusFailed,
    refunded: styles.statusRefunded,
  }[status] || styles.statusPending;
  return <span className={`${styles.statusBadge} ${cls}`}>{status}</span>;
}

export default function OwnerOrders() {
  const { ownerCtx } = useOwner();

  const [orders, setOrders]           = useState(null);
  const [listError, setListError]     = useState(null);
  const [selectedId, setSelectedId]   = useState(null);
  const [detail, setDetail]           = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markPaidError, setMarkPaidError] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState(null);
  const [resendOk, setResendOk] = useState(false);

  const fetchOrders = useCallback(async () => {
    setListError(null);
    try {
      const data = await listOwnerOrders(ownerCtx);
      setOrders(data.orders ?? []);
    } catch (err) {
      setListError(err.message);
      setOrders([]);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  async function selectOrder(orderId) {
    setSelectedId(orderId);
    setDetail(null);
    setDetailError(null);
    setMarkPaidError(null);
    setResendError(null);
    setResendOk(false);
    setDetailLoading(true);
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
      // Update detail + list
      setDetail((prev) => prev ? { ...prev, order: data.order } : prev);
      setOrders((prev) =>
        prev ? prev.map((o) => (o.id === selectedId ? data.order : o)) : prev
      );
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
      // Refresh detail to show updated fulfillment status
      const data = await getOwnerOrder(selectedId, ownerCtx);
      setDetail(data);
    } catch (err) {
      setResendError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Orders</h1>
      <p className={styles.subtitle}>All orders for your store.</p>

      {listError && (
        <Alert type="error">{listError}</Alert>
      )}

      <div className={styles.layout}>
        {/* ── Order list ── */}
        <div className={styles.listPane}>
          {orders === null ? (
            <div className={styles.loadingRow}><Spinner size={16} /> Loading…</div>
          ) : orders.length === 0 ? (
            <div className={styles.empty}>
              <p>No orders yet.</p>
              <p className={styles.emptyHint}>
                Orders appear here after a buyer completes checkout on your storefront.
              </p>
            </div>
          ) : (
            orders.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`${styles.orderRow} ${selectedId === o.id ? styles.orderRowActive : ""}`}
                onClick={() => selectOrder(o.id)}
              >
                <div className={styles.orderRowTop}>
                  <span className={styles.orderId}>#{o.id.slice(0, 8)}</span>
                  <StatusBadge status={o.status} />
                </div>
                <div className={styles.orderRowBottom}>
                  <span className={styles.orderPrice}>{formatPrice(o.total_cents, o.currency)}</span>
                  <span className={styles.orderDate}>{formatDate(o.created_at)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* ── Order detail ── */}
        <div className={styles.detailPane}>
          {!selectedId ? (
            <div className={styles.detailEmpty}>Select an order to view details.</div>
          ) : detailLoading ? (
            <div className={styles.loadingRow}><Spinner size={16} /> Loading…</div>
          ) : detailError ? (
            <Alert type="error">{detailError}</Alert>
          ) : detail ? (
            <OrderDetail
              order={detail.order}
              items={detail.items}
              fulfillment={detail.fulfillment}
              onMarkPaid={handleMarkPaid}
              markingPaid={markingPaid}
              markPaidError={markPaidError}
              onDismissError={() => setMarkPaidError(null)}
              onResend={handleResend}
              resending={resending}
              resendError={resendError}
              resendOk={resendOk}
              onDismissResendError={() => setResendError(null)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

const FULFILLMENT_LABELS = {
  pending: "Pending",
  sent:    "Email sent",
  opened:  "Link opened",
  failed:  "Failed",
};

function FulfillmentStatus({ fulfillment, onResend, resending, resendError, resendOk, onDismissResendError }) {
  const isSent   = fulfillment.status === "sent" || fulfillment.status === "opened";
  const isOpened = fulfillment.status === "opened";
  const isFailed = fulfillment.status === "failed";

  return (
    <div>
      <div className={styles.deliveryStatus}>
        <span className={styles.deliveryIcon}>{isFailed ? "✗" : "✓"}</span>
        <div>
          <div className={styles.deliveryTitle}>{FULFILLMENT_LABELS[fulfillment.status] ?? fulfillment.status}</div>
          <div className={styles.deliveryNote}>
            {fulfillment.sent_to_email && <>Sent to: {fulfillment.sent_to_email}</>}
            {isSent && fulfillment.sent_at && (
              <> · {new Date(fulfillment.sent_at).toLocaleString()}</>
            )}
            {isOpened && fulfillment.opened_at && (
              <> · Opened {new Date(fulfillment.opened_at).toLocaleString()}</>
            )}
            {isFailed && fulfillment.error && (
              <> · Error: {fulfillment.error}</>
            )}
          </div>
        </div>
      </div>

      {resendOk && (
        <p className={styles.deliveryNote} style={{ color: "var(--color-success)", marginBottom: "0.5rem" }}>
          Delivery email re-sent.
        </p>
      )}
      {resendError && (
        <div className={styles.alertWrap}>
          <Alert type="error" onDismiss={onDismissResendError}>{resendError}</Alert>
        </div>
      )}
      <button
        type="button"
        className={styles.markPaidBtn}
        onClick={onResend}
        disabled={resending}
        style={{ background: "#6b7280" }}
      >
        {resending && <Spinner size={14} />}
        {resending ? "Sending…" : "Resend delivery email"}
      </button>
    </div>
  );
}

function OrderDetail({
  order,
  items,
  fulfillment,
  onMarkPaid,
  markingPaid,
  markPaidError,
  onDismissError,
  onResend,
  resending,
  resendError,
  resendOk,
  onDismissResendError,
}) {
  const isPaid = order.status === "paid";

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <div>
          <h2 className={styles.detailTitle}>Order #{order.id.slice(0, 8)}</h2>
          <span className={styles.detailDate}>{new Date(order.created_at).toLocaleString()}</span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Summary */}
      <div className={styles.detailSection}>
        <div className={styles.summaryRow}>
          <span>Total</span>
          <strong>{formatPrice(order.total_cents, order.currency)}</strong>
        </div>
        {order.buyer_email && (
          <div className={styles.summaryRow}>
            <span>Buyer email</span>
            <span>{order.buyer_email}</span>
          </div>
        )}
        {order.stripe_payment_intent_id && (
          <div className={styles.summaryRow}>
            <span>Payment</span>
            <span className={styles.stripeBadge}>Stripe</span>
          </div>
        )}
      </div>

      {/* Items */}
      {items && items.length > 0 && (
        <div className={styles.detailSection}>
          <h3 className={styles.sectionTitle}>Items</h3>
          {items.map((item) => (
            <div key={item.id} className={styles.itemRow}>
              <span className={styles.itemTitle}>{item.title}</span>
              <span className={styles.itemQty}>×{item.quantity}</span>
              <span className={styles.itemPrice}>{formatPrice(item.unit_price_cents * item.quantity, order.currency)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Dev: mark paid */}
      {order.status === "pending" && (
        <div className={styles.devSection}>
          <h3 className={styles.devTitle}>Dev tools</h3>
          <p className={styles.devNote}>
            Simulate a successful payment for this order.
          </p>
          {markPaidError && (
            <div className={styles.alertWrap}>
              <Alert type="error" onDismiss={onDismissError}>{markPaidError}</Alert>
            </div>
          )}
          <button
            type="button"
            className={styles.markPaidBtn}
            onClick={onMarkPaid}
            disabled={markingPaid}
          >
            {markingPaid && <Spinner size={14} />}
            {markingPaid ? "Processing…" : "Mark as Paid (dev)"}
          </button>
        </div>
      )}

      {/* Delivery status when paid */}
      {isPaid && (
        <div className={styles.deliverySection}>
          <h3 className={styles.sectionTitle}>Delivery</h3>
          {fulfillment ? (
            <FulfillmentStatus
              fulfillment={fulfillment}
              onResend={onResend}
              resending={resending}
              resendError={resendError}
              resendOk={resendOk}
              onDismissResendError={onDismissResendError}
            />
          ) : (
            <p className={styles.deliveryNote}>Delivery not yet triggered.</p>
          )}
        </div>
      )}
    </div>
  );
}
