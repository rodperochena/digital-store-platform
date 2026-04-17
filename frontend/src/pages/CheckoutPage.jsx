"use strict";
// DEMO: temporary checkout page — will be replaced with Stripe Checkout later.
// This page collects email + optional discount code, then POSTs to /checkout/demo
// which creates a paid order directly (no Stripe involved).

import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useBuyer } from "../context/BuyerContext";
import { useCart } from "../context/CartContext";
import styles from "./CheckoutPage.module.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

function formatPrice(cents, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "usd",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CheckoutPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn, buyer } = useBuyer() || {};
  const { items, subtotalCents, clearCart, itemCount, hydrated } = useCart() || {};

  const safeItems    = items    || [];
  const safeSubtotal = subtotalCents || 0;
  const primaryCurrency = safeItems[0]?.currency || "usd";

  // Store meta (for header + accent color)
  const [store, setStore] = useState(null);

  // Contact info
  const [email, setEmail] = useState("");

  // Discount code
  const [discountCode, setDiscountCode]       = useState("");
  const [discountResult, setDiscountResult]   = useState(null);
  const [discountError, setDiscountError]     = useState(null);
  const [discountLoading, setDiscountLoading] = useState(false);

  // Payment
  const [paying, setPaying]   = useState(false);
  const [payError, setPayError] = useState(null);

  // Fetch store meta
  useEffect(() => {
    if (!slug) return;
    fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/meta`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.store) setStore(data.store); })
      .catch(() => {});
  }, [slug]);

  // Pre-fill email from buyer session
  useEffect(() => {
    if (isLoggedIn && buyer?.email) setEmail(buyer.email);
  }, [isLoggedIn, buyer]);

  // Redirect to store if cart is empty (wait until hydrated)
  useEffect(() => {
    if (hydrated && safeItems.length === 0) {
      navigate(`/store/${encodeURIComponent(slug)}`, { replace: true });
    }
  }, [hydrated, safeItems.length, slug, navigate]);

  const accentColor = store?.primary_color || "#111827";
  const emailValid  = EMAIL_RE.test(email.trim());

  // Total after discount
  const discountCents  = discountResult?.discount_amount_cents ?? 0;
  const totalCents     = Math.max(0, safeSubtotal - discountCents);

  // ── Discount code ──────────────────────────────────────────────────────────

  async function handleApplyDiscount() {
    const code = discountCode.trim();
    if (!code) return;
    setDiscountError(null);
    setDiscountLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/store/${encodeURIComponent(slug)}/validate-discount`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, subtotal_cents: safeSubtotal }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.valid) {
        setDiscountError(data.reason || "Invalid or expired code");
        setDiscountResult(null);
      } else {
        setDiscountResult(data);
      }
    } catch {
      setDiscountError("Could not validate discount code. Please try again.");
    } finally {
      setDiscountLoading(false);
    }
  }

  function handleRemoveDiscount() {
    setDiscountResult(null);
    setDiscountCode("");
    setDiscountError(null);
  }

  // ── Payment ────────────────────────────────────────────────────────────────

  async function handlePay() {
    if (!emailValid || safeItems.length === 0) return;
    setPayError(null);
    setPaying(true);
    try {
      // DEMO: POST to demo endpoint — bypasses Stripe
      const res = await fetch(
        `${API_BASE}/api/store/${encodeURIComponent(slug)}/checkout/demo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items:         safeItems.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
            email:         email.trim(),
            discount_code: discountResult ? discountCode.trim() : undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Payment failed. Please try again.");
      clearCart();
      navigate(`/checkout/success?order_id=${data.order_id}&slug=${encodeURIComponent(slug)}`);
    } catch (e) {
      setPayError(e.message);
      setPaying(false);
    }
  }

  // ── Loading state (waiting for cart to hydrate) ────────────────────────────

  if (!hydrated) {
    return (
      <div className={styles.shell}>
        <div className={styles.loadingPage}>
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.shell}>

      {/* Combined header */}
      <header className={styles.topHeader}>
        <div className={styles.topHeaderInner}>
          <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.storeLink}>
            {store?.logo_url && (
              <img src={String(store.logo_url)} alt="" className={styles.storeLogo} />
            )}
            <span className={styles.storeName}>{String(store?.name || slug)}</span>
          </Link>
          <div className={styles.headerRight}>
            <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.backLink}>
              ← Back to store
            </Link>
            {isLoggedIn && (
              <span className={styles.loggedInBadge}>
                {String(buyer?.display_name || buyer?.email?.split("@")[0] || "")}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Checkout</h1>

        <div className={styles.layout}>

          {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
          <div className={styles.leftCol}>

            {/* Contact information */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Contact information</h2>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="checkout-email">
                  Email address
                </label>
                {isLoggedIn && buyer?.email ? (
                  <>
                    <input
                      id="checkout-email"
                      type="email"
                      className={styles.input}
                      value={email}
                      readOnly
                    />
                    <p className={styles.hint}>Logged in as {String(buyer.email)}</p>
                  </>
                ) : (
                  <>
                    <input
                      id="checkout-email"
                      type="email"
                      className={styles.input}
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                    <p className={styles.hint}>We'll send your download links to this email</p>
                  </>
                )}
              </div>
            </div>

            {/* Discount code */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Discount code</h2>
              {discountResult ? (
                <div className={styles.discountApplied}>
                  <span className={styles.discountSuccess}>
                    ✓ {String(discountResult.code)} applied
                    {" ("}
                    {discountResult.discount_type === "percentage"
                      ? `${discountResult.discount_value}% off`
                      : `${formatPrice(discountResult.discount_amount_cents, primaryCurrency)} off`}
                    {")"}
                  </span>
                  <button
                    type="button"
                    className={styles.removeDiscountBtn}
                    onClick={handleRemoveDiscount}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.discountRow}>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="Enter code"
                      value={discountCode}
                      onChange={(e) => { setDiscountCode(e.target.value); setDiscountError(null); }}
                      onKeyDown={(e) => e.key === "Enter" && handleApplyDiscount()}
                    />
                    <button
                      type="button"
                      className={styles.applyBtn}
                      onClick={handleApplyDiscount}
                      disabled={!discountCode.trim() || discountLoading}
                    >
                      {discountLoading ? "…" : "Apply"}
                    </button>
                  </div>
                  {discountError && (
                    <p className={styles.discountError}>{String(discountError)}</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
          <div className={styles.rightCol}>
            <div className={styles.summaryCard}>
              <h2 className={styles.cardTitle}>Order summary</h2>

              {/* Item list */}
              <div className={styles.summaryItems}>
                {safeItems.map((item) => (
                  <div key={item.productId} className={styles.summaryItem}>
                    <div className={styles.summaryItemImg}>
                      {item.image_url ? (
                        <img
                          src={String(item.image_url)}
                          alt={String(item.title)}
                          className={styles.summaryImg}
                        />
                      ) : (
                        <div className={styles.summaryImgPlaceholder}>📦</div>
                      )}
                    </div>
                    <div className={styles.summaryItemInfo}>
                      <p className={styles.summaryItemTitle}>{String(item.title)}</p>
                      {item.quantity > 1 && (
                        <p className={styles.summaryItemQty}>× {item.quantity}</p>
                      )}
                    </div>
                    <p className={styles.summaryItemPrice}>
                      {formatPrice(item.price_cents * item.quantity, item.currency)}
                    </p>
                  </div>
                ))}
              </div>

              <div className={styles.divider} />

              {/* Subtotal */}
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Subtotal</span>
                <span className={styles.totalValue}>
                  {formatPrice(safeSubtotal, primaryCurrency)}
                </span>
              </div>

              {/* Discount row */}
              {discountResult && discountCents > 0 && (
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>Discount</span>
                  <span className={styles.discountValue}>
                    −{formatPrice(discountCents, primaryCurrency)}
                  </span>
                </div>
              )}

              <div className={styles.divider} />

              {/* Total */}
              <div className={styles.grandTotalRow}>
                <span className={styles.grandTotalLabel}>Total</span>
                <span className={styles.grandTotalValue} style={{ color: accentColor }}>
                  {formatPrice(totalCents, primaryCurrency)}
                </span>
              </div>

              {/* Pay button */}
              {payError && (
                <p className={styles.payError}>{String(payError)}</p>
              )}

              <button
                type="button"
                className={styles.payBtn}
                style={{ background: accentColor }}
                onClick={handlePay}
                disabled={!emailValid || paying || safeItems.length === 0}
              >
                {paying ? "Processing…" : `Pay ${formatPrice(totalCents, primaryCurrency)}`}
              </button>

              <p className={styles.legalNote}>
                By completing this purchase, you agree to receive your digital products via email.
              </p>

              {/* DEMO notice */}
              <p className={styles.demoNote}>
                Demo mode — payment is simulated
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
