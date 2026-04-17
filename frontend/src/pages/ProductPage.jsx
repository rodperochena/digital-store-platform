"use strict";
import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useBuyer } from "../context/BuyerContext";
import { useCart } from "../context/CartContext";
import { trackPageView } from "../api/tracking";
import Spinner from "../components/Spinner";
import CartDrawer from "../components/CartDrawer";
import styles from "./ProductPage.module.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

const PRODUCT_TYPE_LABELS = {
  "template":      "Template",
  "ebook":         "Ebook",
  "design-asset":  "Design Asset",
  "photo-video":   "Photo / Video",
  "audio-music":   "Audio / Music",
  "preset-filter": "Preset / Filter",
  "font":          "Font",
  "software-code": "Software / Code",
  "ai-prompt":     "AI Prompt",
  "printable":     "Printable",
  "spreadsheet":   "Spreadsheet",
  "other":         "Other",
};

function formatPrice(cents, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "usd",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default function ProductPage() {
  const { slug, productId } = useParams();
  const { isLoggedIn, buyer } = useBuyer() || {};
  const { addItem, itemCount } = useCart() || {};

  const [store, setStore]     = useState(null);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Cart drawer
  const [cartOpen, setCartOpen] = useState(false);

  // Add to Cart feedback
  const [addedFeedback, setAddedFeedback] = useState(false);

  // Checkout modal
  const [showCheckout, setShowCheckout]   = useState(false);
  const [email, setEmail]                 = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);

  useEffect(() => {
    if (!slug || !productId) return;
    trackPageView(slug, { pageType: "product", productId });
  }, [slug, productId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [storeRes, productRes] = await Promise.all([
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/meta`),
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`),
        ]);
        if (!storeRes.ok)   throw new Error("Store not found");
        if (!productRes.ok) throw new Error("Product not found");
        const [storeData, productData] = await Promise.all([
          storeRes.json(),
          productRes.json(),
        ]);
        if (!cancelled) {
          setStore(storeData.store);
          setProduct(productData.product);
          document.title = `${productData.product.title} — ${storeData.store?.name || slug}`;
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [slug, productId]);

  const accentColor = store?.primary_color || "#111827";

  function openCheckout() {
    setCheckoutError(null);
    setEmail(isLoggedIn && buyer?.email ? buyer.email : "");
    setShowCheckout(true);
  }

  async function handleBuyNow(e) {
    e.preventDefault();
    const buyerEmail = (isLoggedIn && buyer?.email) ? buyer.email : email.trim();
    if (!buyerEmail) return;
    setCheckoutError(null);
    setSubmitting(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (import.meta.env.DEV) headers["X-Test-Country"] = "US";
      const res = await fetch(
        `${API_BASE}/api/store/${encodeURIComponent(slug)}/checkout/session`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            items: [{ product_id: product.id, quantity: 1 }],
            buyer_email: buyerEmail,
            marketing_opt_in: false,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Checkout failed");
      window.location.href = data.checkout_url;
    } catch (e) {
      setCheckoutError(e.message);
      setSubmitting(false);
    }
  }

  const handleAddToCart = useCallback(() => {
    if (!product || !addItem) return;
    addItem(product);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1500);
  }, [product, addItem]);

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.shell}>
        <div className={styles.centerPage}>
          <Spinner size={24} />
          <span>Loading product…</span>
        </div>
      </div>
    );
  }

  // ── Error / not found ─────────────────────────────────────────────────────────
  if (error || !product) {
    return (
      <div className={styles.shell}>
        <div className={styles.centerPage}>
          <p style={{ color: "#6b7280", marginBottom: "16px" }}>{error || "Product not found"}</p>
          <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.backLink}>
            ← Back to store
          </Link>
        </div>
      </div>
    );
  }

  const typeLabel = PRODUCT_TYPE_LABELS[product.product_type] || null;

  return (
    <div className={styles.shell} style={{ "--primary-color": accentColor }}>

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
            <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.allProductsLink}>
              ← All products
            </Link>
            {/* Cart icon */}
            <button
              type="button"
              className={styles.cartBtn}
              onClick={() => setCartOpen(true)}
              aria-label="Open cart"
            >
              🛒
              {(itemCount || 0) > 0 && (
                <span className={styles.cartBadge}>
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </button>
            {isLoggedIn ? (
              <>
                <span className={styles.accountGreeting}>
                  Hi, {String(buyer?.display_name || buyer?.email?.split("@")[0] || "")}
                </span>
                <Link to={`/store/${slug}/account`} className={styles.accountLink}>My Purchases</Link>
              </>
            ) : (
              <>
                <Link to={`/store/${slug}/login`} className={styles.accountLink}>Log in</Link>
                <Link
                  to={`/store/${slug}/register`}
                  className={styles.accountRegisterBtn}
                  style={{ background: accentColor }}
                >
                  Create Account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className={styles.main}>
        <div className={styles.layout}>

          {/* LEFT: image */}
          <div className={styles.imageCol}>
            <div className={styles.imageCard}>
              {product.image_url ? (
                <img
                  src={String(product.image_url)}
                  alt={String(product.title)}
                  className={styles.productImage}
                />
              ) : (
                <div
                  className={styles.imagePlaceholder}
                  style={{ background: accentColor + "18" }}
                >
                  <span style={{ color: accentColor, fontSize: "4rem" }}>📦</span>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT: info + actions */}
          <div className={styles.infoColumn}>
            {typeLabel && (
              <span className={styles.typeBadge}>{typeLabel}</span>
            )}
            <h1 className={styles.productTitle}>{String(product.title)}</h1>

            <p className={styles.productPrice}>
              {formatPrice(product.price_cents, product.currency)}
            </p>

            <button
              type="button"
              className={styles.buyNowBtn}
              onClick={openCheckout}
            >
              Buy Now
            </button>

            <button
              type="button"
              className={styles.addToCartBtn}
              style={addedFeedback ? { color: "#22c55e", borderColor: "#22c55e" } : undefined}
              onClick={handleAddToCart}
            >
              {addedFeedback ? "✓ Added" : "Add to Cart"}
            </button>

            <ul className={styles.featureList}>
              <li className={styles.featureItem}>
                <span className={styles.featureCheck}>✓</span>
                Instant download
              </li>
              <li className={styles.featureItem}>
                <span className={styles.featureCheck}>✓</span>
                Lifetime access
              </li>
              <li className={styles.featureItem}>
                <span className={styles.featureCheck}>✓</span>
                Secure payment via Stripe
              </li>
            </ul>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Description</h2>
            <p className={styles.descriptionText}>{String(product.description)}</p>
          </section>
        )}

        {/* Tags */}
        {product.product_tags?.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Tags</h2>
            <div className={styles.tagsRow}>
              {product.product_tags.map((tag) => (
                <span key={tag} className={styles.tagChip}>{String(tag)}</span>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerText}>Powered by Digital Store Platform</span>
      </footer>

      {/* Checkout modal */}
      {showCheckout && (
        <div className={styles.modalOverlay} onClick={() => setShowCheckout(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalProductName}>{String(product.title)}</p>
                <p className={styles.modalProductPrice} style={{ color: accentColor }}>
                  {formatPrice(product.price_cents, product.currency)}
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setShowCheckout(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleBuyNow} noValidate>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="pp-email">Your email</label>
                <input
                  id="pp-email"
                  type="email"
                  className={styles.input}
                  placeholder="you@example.com"
                  value={isLoggedIn && buyer?.email ? buyer.email : email}
                  onChange={(e) => !isLoggedIn && setEmail(e.target.value)}
                  readOnly={isLoggedIn && !!buyer?.email}
                  required
                />
                <span className={styles.fieldHint}>Download link will be sent here</span>
              </div>

              {checkoutError && (
                <p className={styles.checkoutError}>{String(checkoutError)}</p>
              )}

              <button
                type="submit"
                className={styles.submitBtn}
                style={{ background: accentColor }}
                disabled={submitting}
              >
                {submitting
                  ? "Redirecting…"
                  : `Pay ${formatPrice(product.price_cents, product.currency)}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        slug={slug}
        accentColor={accentColor}
      />
    </div>
  );
}
