import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import styles from "./CheckoutSuccess.module.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

function formatCurrency(cents, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "usd",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const orderId   = params.get("order_id");
  const slug      = params.get("slug");

  const isLoggedIn = slug ? !!localStorage.getItem(`buyer_session_${slug}`) : false;

  const [store, setStore]             = useState(null);
  const [orderSummary, setOrderSummary] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/meta`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.store) setStore(data.store); })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (!orderId || !slug) return;
    setOrderLoading(true);
    fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}/summary`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setOrderSummary(data); })
      .catch(() => {})
      .finally(() => setOrderLoading(false));
  }, [orderId, slug]);

  const accentColor = store?.primary_color || "#111827";
  const storeName   = store?.name;
  const logoUrl     = store?.logo_url;

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Store branding */}
        {storeName && (
          <div className={styles.brandArea}>
            {logoUrl ? (
              <img src={logoUrl} alt={storeName} className={styles.brandLogo} />
            ) : (
              <span
                className={styles.brandInitial}
                style={{ background: accentColor }}
              >
                {storeName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className={styles.brandName}>{storeName}</span>
          </div>
        )}

        {/* Check icon */}
        <div className={styles.iconWrap}>
          <div className={styles.icon} aria-hidden="true">✓</div>
        </div>

        {/* Heading */}
        <h1 className={styles.heading}>Order Confirmed!</h1>
        <p className={styles.subheading}>
          {storeName
            ? `Thank you for your purchase from ${storeName}!`
            : "Your payment was successful. Here's what happens next:"}
        </p>

        {/* Order details card */}
        {orderId && (
          <div className={styles.card}>
            <p className={styles.cardTitle}>Order details</p>
            {orderLoading ? (
              <p className={styles.loadingText}>Loading order details…</p>
            ) : orderSummary ? (
              <div className={styles.metaRows}>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Order ID</span>
                  <span className={styles.metaValue}>{orderSummary.order.id.slice(0, 8)}…</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Email</span>
                  <span className={styles.metaValue}>{orderSummary.order.buyer_email}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Total</span>
                  <span className={styles.metaValue} style={{ color: accentColor, fontWeight: 600 }}>
                    {formatCurrency(orderSummary.order.total_cents, orderSummary.order.currency)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Items purchased card */}
        {orderSummary?.items?.length > 0 && (
          <div className={styles.card}>
            <p className={styles.cardTitle}>Items purchased</p>
            <div className={styles.itemList}>
              {orderSummary.items.map((item, idx) => (
                <div key={idx} className={styles.item}>
                  <div className={styles.itemImgWrap}>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.title} className={styles.itemImg} />
                    ) : (
                      <div className={styles.itemImgPlaceholder}>📦</div>
                    )}
                  </div>
                  <div className={styles.itemInfo}>
                    <p className={styles.itemTitle}>
                      {item.title}{item.quantity > 1 && ` × ${item.quantity}`}
                    </p>
                    <p className={styles.itemPrice}>
                      {formatCurrency(item.unit_price_cents * item.quantity, orderSummary.order.currency)}
                    </p>
                  </div>
                  <div className={styles.itemAction}>
                    {item.download_token ? (
                      <a
                        href={`${API_BASE}/api/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}/download/${item.download_token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.downloadBtn}
                        style={{ background: accentColor }}
                      >
                        Download
                      </a>
                    ) : (
                      <span className={styles.pendingBtn}>Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Steps */}
        <ol className={styles.steps}>
          <li className={styles.step}>
            <span className={styles.stepNum} style={{ background: accentColor }}>1</span>
            <span className={styles.stepText}>
              Check your inbox — a download link has been sent to your email.
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepNum} style={{ background: accentColor }}>2</span>
            <span className={styles.stepText}>
              Click the link to access your digital product immediately.
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepNum} style={{ background: accentColor }}>3</span>
            <span className={styles.stepText}>
              Can't find it? Check your spam folder or contact the store.
            </span>
          </li>
        </ol>

        {/* Stripe session reference (unchanged) */}
        {sessionId && (
          <p className={styles.ref}>
            Reference:{" "}
            <span className={styles.mono}>{sessionId.slice(0, 20)}…</span>
          </p>
        )}

        {slug && (
          <Link
            to={`/store/${encodeURIComponent(slug)}`}
            className={styles.returnLink}
            style={{ color: accentColor }}
          >
            ← Continue shopping
          </Link>
        )}

        {/* Prompt guest buyers to create an account */}
        {slug && !isLoggedIn && (
          <>
            <div className={styles.divider} />
            <div className={styles.createAccountPrompt}>
              <h3 className={styles.createAccountTitle}>Save your purchases</h3>
              <p className={styles.createAccountBody}>
                Create a free account to access your downloads anytime and get
                notified about new products.
              </p>
              <Link
                to={`/store/${encodeURIComponent(slug)}/register`}
                className={styles.createAccountBtn}
                style={{ background: accentColor }}
              >
                Create Account
              </Link>
              <p className={styles.createAccountHint}>
                Your purchase is already saved — creating an account just makes
                it easier to find later.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
