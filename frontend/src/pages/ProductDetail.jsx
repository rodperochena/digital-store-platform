import { useEffect, useRef, useState } from "react";
import { trackPageView } from "../api/tracking";
import { useParams, Link } from "react-router-dom";
import { useBuyer } from "../context/BuyerContext";
import styles from "./ProductDetail.module.css";

function StarDisplay({ rating, max = 5 }) {
  return (
    <span className={styles.stars}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{ color: i < Math.round(rating) ? "#f59e0b" : "#d1d5db" }}>★</span>
      ))}
    </span>
  );
}

const TAG_GROUP_COLORS = {
  tool:     { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  format:   { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  audience: { bg: "#faf5ff", color: "#7e22ce", border: "#e9d5ff" },
};

function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

function formatPrice(cents, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "usd",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default function ProductDetail() {
  const { slug, productId } = useParams();
  const { isLoggedIn, buyer, logout } = useBuyer() || {};

  const [store, setStore] = useState(null);
  const [product, setProduct] = useState(null);
  const [activeSale, setActiveSale] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeMsg, setSubscribeMsg] = useState(null);

  // Checkout modal state
  const [showCheckout, setShowCheckout] = useState(false);
  const [email, setEmail] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [alreadyOptedIn, setAlreadyOptedIn] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [discountResult, setDiscountResult] = useState(null);
  const [discountError, setDiscountError] = useState(null);
  const [validatingDiscount, setValidatingDiscount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);

  // Fire-and-forget tracking — once per mount
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current || !slug || !productId) return;
    trackedRef.current = true;
    trackPageView(slug, { pageType: "product", productId });
  }, [slug, productId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      try {
        const [storeRes, productRes] = await Promise.all([
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/meta`),
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`),
        ]);

        if (!storeRes.ok) throw new Error("Store not found");
        if (!productRes.ok) throw new Error("Product not found");

        const storeData = await storeRes.json();
        const productData = await productRes.json();

        setStore(storeData.store);
        setProduct(productData.product);

        // Load sale + reviews in parallel (non-blocking)
        Promise.all([
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/active-sale`)
            .then((r) => r.json()).catch(() => ({})),
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}/reviews`)
            .then((r) => r.json()).catch(() => ({})),
        ]).then(([saleData, reviewData]) => {
          setActiveSale(saleData.sale ?? null);
          setReviews(reviewData.reviews ?? []);
        }).catch(() => {});

        // SEO meta
        if (productData.product) {
          document.title = `${productData.product.title} — ${storeData.store?.name || slug}`;
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug, productId]);

  async function applyDiscount() {
    if (!discountCode.trim()) return;
    setDiscountError(null);
    setValidatingDiscount(true);
    try {
      const res = await fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/validate-discount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: discountCode.trim(),
          subtotal_cents: product.price_cents,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setDiscountError(data.reason || "Invalid discount code");
        setDiscountResult(null);
      } else {
        setDiscountResult(data);
      }
    } catch {
      setDiscountError("Could not validate discount code");
    } finally {
      setValidatingDiscount(false);
    }
  }

  async function handleEmailBlur() {
    const val = email.trim();
    if (!val.includes("@")) return;
    try {
      const res = await fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/check-email-optin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: val }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.opted_in) {
          setAlreadyOptedIn(true);
          setMarketingOptIn(true);
        }
      }
    } catch { /* non-blocking */ }
  }

  async function handleCheckout(e) {
    e.preventDefault();
    const checkoutEmail = isLoggedIn && buyer?.email ? buyer.email : email.trim();
    if (!checkoutEmail) return;
    setCheckoutError(null);
    setSubmitting(true);
    try {
      const body = {
        items: [{ product_id: product.id, quantity: 1 }],
        buyer_email: checkoutEmail,
        marketing_opt_in: alreadyOptedIn || marketingOptIn,
      };
      if (discountResult?.discount_code_id) {
        body.discount_code = discountResult.code;
      }

      const checkoutHeaders = { "Content-Type": "application/json" };
      if (import.meta.env.DEV) checkoutHeaders["X-Test-Country"] = "US";
      const res = await fetch(
        `${API_BASE}/api/store/${encodeURIComponent(slug)}/checkout/session`,
        {
          method: "POST",
          headers: checkoutHeaders,
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Checkout failed");
      window.location.href = data.checkout_url;
    } catch (e) {
      setCheckoutError(e.message);
      setSubmitting(false);
    }
  }

  const accentColor = store?.primary_color || "#0d6efd";

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingInner}>
          <div className={styles.skeleton} style={{ height: 24, width: 180, marginBottom: 16 }} />
          <div className={styles.skeleton} style={{ height: 40, width: "60%", marginBottom: 12 }} />
          <div className={styles.skeleton} style={{ height: 16, width: "80%" }} />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className={styles.page}>
        <div className={styles.errorCard}>
          <p>{error || "Product not found"}</p>
          <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.backLink}>
            ← Back to store
          </Link>
        </div>
      </div>
    );
  }

  // Compute sale price
  function computeSalePrice(priceCents) {
    if (!activeSale) return null;
    if (activeSale.apply_to === "selected") {
      const ids = activeSale.product_ids || [];
      if (!ids.includes(product.id)) return null;
    }
    if (activeSale.discount_type === "percentage") {
      const pct = parseFloat(activeSale.discount_value);
      return Math.max(0, Math.floor(priceCents * (1 - pct / 100)));
    }
    if (activeSale.discount_type === "fixed") {
      const off = Math.round(parseFloat(activeSale.discount_value) * 100);
      return Math.max(0, priceCents - off);
    }
    return null;
  }

  const salePrice = product ? computeSalePrice(product.price_cents) : null;
  const basePrice = salePrice ?? product?.price_cents ?? 0;
  const finalPrice = discountResult
    ? basePrice - discountResult.discount_amount_cents
    : basePrice;

  async function handleSubscribe(e) {
    e.preventDefault();
    if (!subscribeEmail.trim()) return;
    setSubscribing(true);
    setSubscribeMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subscribeEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Subscription failed");
      setSubscribeMsg(data.already_subscribed ? "You're already subscribed!" : "You're subscribed!");
      setSubscribeEmail("");
    } catch (err) {
      setSubscribeMsg("Error: " + err.message);
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <div className={styles.page}>
      {/* Account header */}
      <div className={styles.accountHeader}>
        {isLoggedIn ? (
          <div className={styles.accountHeaderInner}>
            <span className={styles.accountGreeting}>
              Hi, {buyer?.display_name || buyer?.email?.split("@")[0]}
            </span>
            <Link to={`/store/${slug}/account`} className={styles.accountLink}>
              My Purchases
            </Link>
            <button
              type="button"
              className={styles.accountLogoutBtn}
              onClick={() => logout && logout()}
            >
              Log out
            </button>
          </div>
        ) : (
          <div className={styles.accountHeaderInner}>
            <Link to={`/store/${slug}/login`} className={styles.accountLink}>
              Log in
            </Link>
            <Link
              to={`/store/${slug}/register`}
              className={styles.accountRegisterBtn}
              style={{ background: accentColor }}
            >
              Create Account
            </Link>
          </div>
        )}
      </div>

      {/* Store header */}
      <header className={styles.storeBar} style={{ borderTopColor: accentColor }}>
        <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.storeLink}>
          {store?.logo_url && (
            <img src={store.logo_url} alt="" className={styles.storeLogo} />
          )}
          <span className={styles.storeName}>{store?.name || slug}</span>
        </Link>
        <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.backBtn}>
          ← All products
        </Link>
      </header>

      <main className={styles.main}>
        <div className={styles.layout}>
          {/* Product image */}
          <div className={styles.imageCol}>
            {product.image_url ? (
              <img src={product.image_url} alt={product.title} className={styles.productImg} />
            ) : (
              <div className={styles.imagePlaceholder} style={{ background: `${accentColor}22` }}>
                <span style={{ color: accentColor, fontSize: "3rem" }}>📦</span>
              </div>
            )}
          </div>

          {/* Product info */}
          <div className={styles.infoCol}>
            <h1 className={styles.productTitle}>{product.title}</h1>

            <div className={styles.priceRow}>
              <span className={styles.price} style={{ color: accentColor }}>
                {formatPrice(finalPrice, product.currency || store?.currency)}
              </span>
              {(salePrice !== null || discountResult) && (
                <span className={styles.originalPrice}>
                  {formatPrice(product.price_cents, product.currency || store?.currency)}
                </span>
              )}
              {salePrice !== null && !discountResult && activeSale && (
                <span className={styles.discountBadge} style={{ background: "#fef9c3", color: "#854d0e" }}>
                  🏷️ {activeSale.discount_type === "percentage"
                    ? `${activeSale.discount_value}% off`
                    : `$${parseFloat(activeSale.discount_value).toFixed(2)} off`} — {activeSale.name}
                </span>
              )}
              {discountResult && (
                <span className={styles.discountBadge}>
                  -{formatPrice(discountResult.discount_amount_cents, product.currency || store?.currency)} off
                </span>
              )}
            </div>
            {product.average_rating > 0 && product.review_count > 0 && (
              <div className={styles.ratingRow}>
                <StarDisplay rating={product.average_rating} />
                <span className={styles.ratingText}>
                  {Number(product.average_rating).toFixed(1)} ({product.review_count} review{product.review_count !== 1 ? "s" : ""})
                </span>
              </div>
            )}

            {(product.sales_count > 0 || product.file_size_display) && (
              <div className={styles.metaRow}>
                {product.sales_count > 0 && (
                  <span className={styles.salesCount}>🔥 {product.sales_count} sold</span>
                )}
                {product.file_size_display && (
                  <span className={styles.fileSizeInfo}>📁 {product.file_size_display}</span>
                )}
              </div>
            )}

            {/* YouTube video embed */}
            {extractYoutubeId(product.video_url) && (
              <div className={styles.videoWrap}>
                <iframe
                  src={`https://www.youtube.com/embed/${extractYoutubeId(product.video_url)}`}
                  title="Product video"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className={styles.videoFrame}
                />
              </div>
            )}

            {product.description && (
              <p className={styles.description}>{product.description}</p>
            )}

            {/* Tags */}
            {product.product_tags?.length > 0 && (
              <div className={styles.tagsRow}>
                {product.product_tags.map((slug) => {
                  const c = TAG_GROUP_COLORS.tool;
                  return (
                    <span
                      key={slug}
                      className={styles.tagPill}
                      style={{ background: c.bg, color: c.color, borderColor: c.border }}
                    >
                      {slug}
                    </span>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              className={styles.buyBtn}
              style={{ background: accentColor }}
              onClick={() => setShowCheckout(true)}
            >
              Buy now — {formatPrice(finalPrice, product.currency || store?.currency)}
            </button>

            <p className={styles.secureNote}>Secure checkout via Stripe</p>
          </div>
        </div>

        {/* Reviews section */}
        {reviews.length > 0 && (
          <section className={styles.reviewsSection}>
            <h2 className={styles.reviewsHeading}>Customer reviews</h2>
            <div className={styles.reviewsList}>
              {reviews.map((r) => (
                <div key={r.id} className={styles.reviewItem}>
                  <div className={styles.reviewHeader}>
                    <StarDisplay rating={r.rating} />
                    <span className={styles.reviewEmail}>{r.buyer_email}</span>
                    <span className={styles.reviewDate}>
                      {new Date(r.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                  </div>
                  {r.body && <p className={styles.reviewBody}>{r.body}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Subscribe section */}
        <section className={styles.subscribeSection}>
          <h2 className={styles.subscribeHeading}>Stay updated</h2>
          <p className={styles.subscribeDesc}>Get notified about new products and special offers.</p>
          {subscribeMsg ? (
            <p className={styles.subscribeSuccess}>{subscribeMsg}</p>
          ) : (
            <form className={styles.subscribeForm} onSubmit={handleSubscribe}>
              <input
                className={styles.subscribeInput}
                type="email"
                placeholder="your@email.com"
                value={subscribeEmail}
                onChange={(e) => setSubscribeEmail(e.target.value)}
                required
              />
              <button
                type="submit"
                className={styles.subscribeBtn}
                style={{ background: accentColor }}
                disabled={subscribing}
              >
                {subscribing ? "…" : "Subscribe"}
              </button>
            </form>
          )}
        </section>
      </main>

      {/* ── Checkout modal ── */}
      {showCheckout && (
        <div className={styles.modalOverlay} onClick={() => setShowCheckout(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Complete your purchase</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setShowCheckout(false)}>✕</button>
            </div>

            <div className={styles.modalProduct}>
              <span className={styles.modalProductName}>{product.title}</span>
              <span className={styles.modalProductPrice}>
                {formatPrice(finalPrice, product.currency || store?.currency)}
              </span>
            </div>

            {checkoutError && <p className={styles.formError}>{checkoutError}</p>}

            <form className={styles.checkoutForm} onSubmit={handleCheckout}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Your email</label>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="you@example.com"
                  value={isLoggedIn && buyer?.email ? buyer.email : email}
                  onChange={(e) => !isLoggedIn && setEmail(e.target.value)}
                  onBlur={!isLoggedIn ? handleEmailBlur : undefined}
                  readOnly={isLoggedIn && !!buyer?.email}
                  required
                />
                <span className={styles.fieldHint}>Download link will be sent here</span>
              </div>

              {/* Discount code */}
              <div className={styles.discountSection}>
                <button
                  type="button"
                  className={styles.discountToggle}
                  style={{ color: accentColor }}
                >
                  Have a discount code?
                </button>
                <div className={styles.discountRow}>
                  <input
                    className={styles.input}
                    placeholder="CODE"
                    value={discountCode}
                    onChange={(e) => {
                      setDiscountCode(e.target.value.toUpperCase());
                      setDiscountResult(null);
                      setDiscountError(null);
                    }}
                  />
                  <button
                    type="button"
                    className={styles.applyBtn}
                    onClick={applyDiscount}
                    disabled={!discountCode.trim() || validatingDiscount}
                  >
                    {validatingDiscount ? "…" : "Apply"}
                  </button>
                </div>
                {discountError && <p className={styles.discountError}>{discountError}</p>}
                {discountResult && (
                  <p className={styles.discountSuccess}>
                    ✓ {discountResult.discount_type === "percentage"
                      ? `${discountResult.discount_value}% off`
                      : formatPrice(discountResult.discount_amount_cents, product.currency || store?.currency) + " off"
                    } applied!
                  </p>
                )}
              </div>

              {!(isLoggedIn && buyer?.marketing_opt_in) && !alreadyOptedIn && (
                <label className={styles.marketingCheckbox}>
                  <input
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={(e) => setMarketingOptIn(e.target.checked)}
                    disabled={submitting}
                  />
                  <span>Keep me updated on new products and offers</span>
                </label>
              )}

              <button
                type="submit"
                className={styles.submitBtn}
                style={{ background: accentColor }}
                disabled={submitting}
              >
                {submitting ? "Redirecting to checkout…" : `Pay ${formatPrice(finalPrice, product.currency || store?.currency)}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
