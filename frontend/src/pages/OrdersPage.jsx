import { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";
import CopyButton from "../components/CopyButton";
import { listOrders, getOrder, markOrderPaid, attachPaymentIntent } from "../api/orders";
import styles from "./OrdersPage.module.css";

function formatPrice(cents, currency) {
  const amount = cents / 100;
  if (currency) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
    }
  }
  return `$${amount.toFixed(2)}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function shortId(id) {
  return id ? id.slice(0, 8) + "…" : "—";
}

function StatusBadge({ status }) {
  if (status === "paid") return <span className={styles.badgePaid}>Paid</span>;
  return <span className={styles.badgePending}>Pending</span>;
}

export default function OrdersPage() {
  const { adminKey, apiBase, activeStore } = useApp();
  const storeId = activeStore?.id;

  // ── list state ────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);

  // ── detail state ──────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null); // { order, items }
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // ── action states ─────────────────────────────────────────────────────────
  const [paidLoading, setPaidLoading] = useState(false);
  const [paidError, setPaidError] = useState(null);
  const [piValue, setPiValue] = useState("");
  const [piLoading, setPiLoading] = useState(false);
  const [piError, setPiError] = useState(null);

  // ── data fetchers (hooks must be unconditional) ───────────────────────────
  const fetchOrders = useCallback(async () => {
    if (!storeId) return;
    const ctx = { adminKey, apiBase };
    setListLoading(true);
    setListError(null);
    try {
      const data = await listOrders(storeId, ctx);
      setOrders(data.orders);
    } catch (err) {
      setListError(err.message);
    } finally {
      setListLoading(false);
    }
  }, [storeId, adminKey, apiBase]);

  const fetchDetail = useCallback(
    async (orderId) => {
      if (!storeId || !orderId) return;
      const ctx = { adminKey, apiBase };
      setDetailLoading(true);
      setDetailError(null);
      try {
        // GET response is { order, items } returned directly (not wrapped)
        const data = await getOrder(storeId, orderId, ctx);
        setDetail(data);
      } catch (err) {
        setDetailError(err.message);
      } finally {
        setDetailLoading(false);
      }
    },
    [storeId, adminKey, apiBase]
  );

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (selectedId) {
      setDetail(null);
      setPaidError(null);
      setPiError(null);
      setPiValue("");
      fetchDetail(selectedId);
    }
  }, [selectedId, fetchDetail]);

  // ── guard (after all hooks) ───────────────────────────────────────────────
  if (!activeStore) {
    return <Navigate to="/admin/store" replace />;
  }

  // ── event handlers ────────────────────────────────────────────────────────
  function handleSelectOrder(id) {
    setSelectedId((prev) => (prev === id ? null : id));
    if (selectedId === id) setDetail(null);
  }

  function handleCloseDetail() {
    setSelectedId(null);
    setDetail(null);
  }

  async function handleMarkPaid() {
    const ctx = { adminKey, apiBase };
    setPaidError(null);
    setPaidLoading(true);
    try {
      // Response: { order } — idempotent if already paid
      const data = await markOrderPaid(storeId, selectedId, ctx);
      setDetail((prev) => ({ ...prev, order: data.order }));
      setOrders((prev) =>
        prev ? prev.map((o) => (o.id === data.order.id ? { ...o, ...data.order } : o)) : prev
      );
    } catch (err) {
      setPaidError(err.message);
    } finally {
      setPaidLoading(false);
    }
  }

  async function handleAttachPi(e) {
    e.preventDefault();
    const ctx = { adminKey, apiBase };
    const trimPi = piValue.trim();
    setPiError(null);
    if (!trimPi) {
      setPiError("Payment intent ID is required.");
      return;
    }
    setPiLoading(true);
    try {
      // Response: { ok: true } — re-fetch to get updated stripe_payment_intent_id
      await attachPaymentIntent(storeId, selectedId, trimPi, ctx);
      await fetchDetail(selectedId);
      setPiValue("");
    } catch (err) {
      setPiError(err.message);
    } finally {
      setPiLoading(false);
    }
  }

  const orderIsPaid = detail?.order?.status === "paid";

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Orders</h1>
      <p className={styles.storeBadge}>
        Store: <strong>{activeStore.name}</strong> · {activeStore.slug}
      </p>

      {/* ── orders list ─────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionHeading}>
            Orders
            {orders && <span className={styles.count}>{orders.length} total</span>}
          </h2>
        </div>

        {listError && (
          <div className={styles.alertWrap}>
            <Alert type="error" onDismiss={() => setListError(null)}>
              {listError}
            </Alert>
          </div>
        )}

        {listLoading && orders === null && (
          <div className={styles.listLoading}>
            <Spinner size={20} /> Loading orders…
          </div>
        )}

        {!listLoading && orders !== null && orders.length === 0 && (
          <div className={styles.empty}>No orders yet.</div>
        )}

        {orders !== null && orders.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className={`${styles.tr} ${selectedId === o.id ? styles.trSelected : ""}`}
                  onClick={() => handleSelectOrder(o.id)}
                >
                  <td className={`${styles.td} ${styles.idCell}`}>
                    <span className={styles.mono}>{shortId(o.id)}</span>
                  </td>
                  <td className={styles.td}>
                    {o.customer_user_id ? (
                      <span className={styles.mono}>{shortId(o.customer_user_id)}</span>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td className={styles.td}>{formatPrice(o.total_cents, o.currency)}</td>
                  <td className={styles.td}>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className={`${styles.td} ${styles.muted}`}>{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── order detail panel ───────────────────────────────────────────── */}
      {selectedId && (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionHeading}>Order Detail</h2>
            <button type="button" className={styles.btnGhost} onClick={handleCloseDetail}>
              ✕ Close
            </button>
          </div>

          <div className={styles.detailCard}>
            {detailLoading && (
              <div className={styles.listLoading}>
                <Spinner size={18} /> Loading…
              </div>
            )}

            {detailError && (
              <div className={styles.alertWrap}>
                <Alert type="error" onDismiss={() => setDetailError(null)}>
                  {detailError}
                </Alert>
              </div>
            )}

            {detail && !detailLoading && (
              <>
                {/* ── order fields ───────────────────────────────────────── */}
                <dl className={styles.dl}>
                  <div className={styles.dlRow}>
                    <dt>Order ID</dt>
                    <dd>
                      <span className={styles.mono}>{detail.order.id}</span>
                      <CopyButton text={detail.order.id} />
                    </dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Customer</dt>
                    <dd>
                      {detail.order.customer_user_id ? (
                        <span className={styles.mono}>{detail.order.customer_user_id}</span>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Total</dt>
                    <dd>{formatPrice(detail.order.total_cents, detail.order.currency)}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Currency</dt>
                    <dd>{detail.order.currency?.toUpperCase()}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Status</dt>
                    <dd>
                      <StatusBadge status={detail.order.status} />
                    </dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Created</dt>
                    <dd>{formatDate(detail.order.created_at)}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Payment intent</dt>
                    <dd>
                      {detail.order.stripe_payment_intent_id ? (
                        <>
                          <span className={styles.mono}>
                            {detail.order.stripe_payment_intent_id}
                          </span>
                          <CopyButton text={detail.order.stripe_payment_intent_id} />
                        </>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {/* ── items table ────────────────────────────────────────── */}
                {detail.items && detail.items.length > 0 && (
                  <div className={styles.items}>
                    <h3 className={styles.itemsHeading}>Items</h3>
                    <table className={styles.itemsTable}>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.title}</td>
                            <td>{item.quantity}</td>
                            <td>
                              {formatPrice(item.unit_price_cents, detail.order.currency)}
                            </td>
                            <td>
                              {formatPrice(
                                item.unit_price_cents * item.quantity,
                                detail.order.currency
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── actions ────────────────────────────────────────────── */}
                <div className={styles.actions}>
                  <div className={styles.actionGroup}>
                    <h3 className={styles.actionHeading}>Mark as Paid</h3>
                    {paidError && (
                      <div className={styles.alertWrap}>
                        <Alert type="error" onDismiss={() => setPaidError(null)}>
                          {paidError}
                        </Alert>
                      </div>
                    )}
                    {orderIsPaid ? (
                      <p className={styles.actionNote}>This order is already marked as paid.</p>
                    ) : (
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={handleMarkPaid}
                        disabled={paidLoading}
                      >
                        {paidLoading && <Spinner size={14} />}
                        {paidLoading ? "Marking paid…" : "Mark as Paid"}
                      </button>
                    )}
                  </div>

                  <div className={styles.actionGroup}>
                    <h3 className={styles.actionHeading}>Attach Payment Intent</h3>
                    {piError && (
                      <div className={styles.alertWrap}>
                        <Alert type="error" onDismiss={() => setPiError(null)}>
                          {piError}
                        </Alert>
                      </div>
                    )}
                    <form onSubmit={handleAttachPi} className={styles.attachForm} noValidate>
                      <input
                        type="text"
                        className={styles.input}
                        value={piValue}
                        onChange={(e) => setPiValue(e.target.value)}
                        placeholder="pi_xxxxxxxxxxxxxxxxxxxxxxxx"
                        disabled={piLoading}
                        spellCheck={false}
                        autoComplete="off"
                      />
                      <button
                        type="submit"
                        className={styles.btnSecondary}
                        disabled={piLoading}
                      >
                        {piLoading && <Spinner size={14} />}
                        {piLoading ? "Attaching…" : "Attach"}
                      </button>
                    </form>
                    {detail.order.stripe_payment_intent_id && (
                      <p className={styles.actionNote}>
                        A payment intent is already attached. Submitting the same ID is
                        safe; a different ID will be rejected by the backend.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
