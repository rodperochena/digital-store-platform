import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import {
  listOwnerProducts,
  getOwnerAccount,
  fetchDashboardStats,
  updateOwnerStore,
} from "../../api/owner";
import styles from "./Home.module.css";

// ── Helpers ──────────────────────────────────────────────────────────────────

function nameToSlug(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "my-store"
  );
}

function greeting(firstName) {
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return firstName ? `Good ${part}, ${firstName}!` : `Good ${part}!`;
}

function formatRevenue(cents, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${(currency || "USD").toUpperCase()}`;
  }
}

function formatRevenueShort(cents, currency) {
  const val = cents / 100;
  try {
    if (val >= 10000) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: (currency || "USD").toUpperCase(),
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(val);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
      minimumFractionDigits: 2,
    }).format(val);
  } catch {
    return `${val.toFixed(2)} ${(currency || "USD").toUpperCase()}`;
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_DOT = {
  paid:     styles.dotPaid,
  pending:  styles.dotPending,
  failed:   styles.dotFailed,
  refunded: styles.dotRefunded,
};

const BANNER_KEY = "home_setup_banner_dismissed";

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { ownerStore, setOwnerStore, ownerCtx } = useOwner();
  const navigate = useNavigate();

  const [products, setProducts]     = useState(null);
  const [firstName, setFirstName]   = useState(null);
  const [dashData, setDashData]     = useState(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [dashLoading, setDashLoading]   = useState(false);
  const [error, setError]           = useState(null);

  // Card 1 — store name
  const [nameInput, setNameInput]   = useState(
    () => (!ownerStore?.name || ownerStore.name === "My Store") ? "" : ownerStore.name
  );
  const [nameEditing, setNameEditing] = useState(false);
  const [nameSaving, setNameSaving]   = useState(false);
  const [nameError, setNameError]     = useState(null);

  // Post-setup banner
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem(BANNER_KEY) === "1"
  );

  // URL copy feedback
  const [copied, setCopied] = useState(false);

  // Store status toggle (local only)
  const [storeActive, setStoreActive] = useState(true);

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setSetupLoading(true);

    async function load() {
      try {
        const [productsData, accountData] = await Promise.all([
          listOwnerProducts(ownerCtx),
          getOwnerAccount(ownerCtx).catch(() => ({ account: {} })),
        ]);
        if (cancelled) return;

        const prods = productsData.products || [];
        setProducts(prods);
        setFirstName(accountData.account?.first_name ?? null);

        // If all steps complete, also load dashboard stats
        const s1 = Boolean(ownerStore?.name && ownerStore.name !== "My Store");
        const s3 = prods.length > 0;
        const s4 = Boolean(ownerStore?.tagline);
        if (s1 && s3 && s4) {
          setDashLoading(true);
          fetchDashboardStats(ownerCtx)
            .then((d) => { if (!cancelled) setDashData(d); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setDashLoading(false); });
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step completion (derived, recalculates on every render) ───────────────

  const step1Done = Boolean(ownerStore?.name && ownerStore.name !== "My Store");
  const step2Done = true; // Stripe is always configured
  const step3Done = products !== null && products.length > 0;
  const step4Done = Boolean(ownerStore?.tagline);
  const doneCount = [step1Done, step2Done, step3Done, step4Done].filter(Boolean).length;
  const allDone   = doneCount === 4;

  const accentColor   = ownerStore?.primary_color || "var(--color-accent)";
  const storefrontUrl = ownerStore?.slug ? `/store/${ownerStore.slug}` : null;
  const previewSlug   = nameInput.trim() ? nameToSlug(nameInput) : "my-store";

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setNameSaving(true);
    setNameError(null);
    try {
      const newSlug = nameToSlug(trimmed);
      await updateOwnerStore({ name: trimmed, slug: newSlug }, ownerCtx);
      setOwnerStore((prev) => ({ ...prev, name: trimmed, slug: newSlug }));
      setNameEditing(false);
    } catch (err) {
      setNameError(err.message || "Could not save store name");
    } finally {
      setNameSaving(false);
    }
  }

  function dismissBanner() {
    localStorage.setItem(BANNER_KEY, "1");
    setBannerDismissed(true);
  }

  function handleCopy() {
    if (!storefrontUrl) return;
    try {
      navigator.clipboard.writeText(window.location.origin + storefrontUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (setupLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.skeletonHeading} aria-hidden="true" />
        <div className={styles.skeletonSub}     aria-hidden="true" />
        <div className={styles.stepGrid} style={{ marginTop: "2rem" }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className={styles.skeletonCard} aria-hidden="true" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>Home</h1>
        <p className={styles.errorMsg}>Could not load store data: {error}</p>
      </div>
    );
  }

  // ── STATE A: Onboarding ───────────────────────────────────────────────────

  if (!allDone) {
    const latestProduct = step3Done ? products[0] : null;

    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.heading}>Welcome to {ownerStore?.name || "your store"}!</h1>
            <p className={styles.subtitle}>Complete these steps to launch your store</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className={styles.progressWrap}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${(doneCount / 4) * 100}%`, background: accentColor }}
            />
          </div>
          <span className={styles.progressLabel}>{doneCount} of 4 complete</span>
        </div>

        {/* 2×2 grid of step cards */}
        <div className={styles.stepGrid}>

          {/* ── Card 1: Name your store ── */}
          <div className={`${styles.stepCard} ${step1Done ? styles.stepCardDone : ""}`}>
            <div className={styles.stepTop}>
              <span className={styles.stepNum}>Step 1</span>
              <span className={step1Done ? styles.stepCheckDone : styles.stepCheckPending}>
                {step1Done ? "✓" : "○"}
              </span>
            </div>
            <h3 className={styles.stepTitle}>Name your store</h3>

            {step1Done && !nameEditing ? (
              /* Done, not editing */
              <>
                <p className={styles.stepDoneText}>{ownerStore.name}</p>
                <p className={styles.urlPreview}>/store/{ownerStore.slug}</p>
                <button
                  type="button"
                  className={styles.btnOutline}
                  onClick={() => { setNameEditing(true); setNameInput(ownerStore.name); }}
                >
                  Edit
                </button>
              </>
            ) : (
              /* Input form (initial or editing) */
              <>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  placeholder="e.g. Jane's Digital Shop"
                  className={styles.nameInput}
                  autoFocus={nameEditing}
                />
                <p className={styles.urlPreview}>
                  Your store URL:{" "}
                  <span className={styles.urlValue}>
                    {window.location.origin}/store/{previewSlug}
                  </span>
                </p>
                {nameError && <p className={styles.stepError}>{nameError}</p>}
                <div className={styles.btnRow}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleSaveName}
                    disabled={!nameInput.trim() || nameSaving}
                    style={{ background: accentColor }}
                  >
                    {nameSaving ? "Saving…" : "Save"}
                  </button>
                  {step1Done && (
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => setNameEditing(false)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Card 2: Set up payments (always done) ── */}
          <div className={`${styles.stepCard} ${styles.stepCardDone}`}>
            <div className={styles.stepTop}>
              <span className={styles.stepNum}>Step 2</span>
              <span className={styles.stepCheckDone}>✓</span>
            </div>
            <h3 className={styles.stepTitle}>Set up payments</h3>
            <p className={styles.stepDoneText}>
              Payments are handled securely through Stripe.
            </p>
            <span className={styles.stripeBadge}>Stripe</span>
          </div>

          {/* ── Card 3: Add your first product ── */}
          <div className={`${styles.stepCard} ${step3Done ? styles.stepCardDone : ""}`}>
            <div className={styles.stepTop}>
              <span className={styles.stepNum}>Step 3</span>
              <span className={step3Done ? styles.stepCheckDone : styles.stepCheckPending}>
                {step3Done ? "✓" : "○"}
              </span>
            </div>
            <h3 className={styles.stepTitle}>Add your first product</h3>

            {step3Done && latestProduct ? (
              <>
                <div className={styles.productPreviewRow}>
                  {latestProduct.image_url ? (
                    <img
                      src={latestProduct.image_url}
                      alt={latestProduct.title}
                      className={styles.productThumb}
                    />
                  ) : (
                    <div className={styles.productThumbPlaceholder}>📦</div>
                  )}
                  <div className={styles.productPreviewInfo}>
                    <span className={styles.productPreviewTitle}>{latestProduct.title}</span>
                    <span className={styles.productPreviewPrice}>
                      {formatRevenue(latestProduct.price_cents, latestProduct.currency)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.btnOutline}
                  onClick={() => navigate("/owner/products/new")}
                >
                  Add more
                </button>
              </>
            ) : (
              <>
                <div className={styles.iconPlaceholder}>📦</div>
                <p className={styles.stepHint}>
                  Start by adding a product and a few key details.
                </p>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => navigate("/owner/products/new")}
                  style={{ background: accentColor }}
                >
                  Add product
                </button>
              </>
            )}
          </div>

          {/* ── Card 4: Customize your store ── */}
          <div className={`${styles.stepCard} ${step4Done ? styles.stepCardDone : ""}`}>
            <div className={styles.stepTop}>
              <span className={styles.stepNum}>Step 4</span>
              <span className={step4Done ? styles.stepCheckDone : styles.stepCheckPending}>
                {step4Done ? "✓" : "○"}
              </span>
            </div>
            <h3 className={styles.stepTitle}>Customize your store</h3>

            {step4Done ? (
              <>
                <p className={styles.taglinePreview}>"{ownerStore.tagline}"</p>
                <button
                  type="button"
                  className={styles.btnOutline}
                  onClick={() => navigate("/owner/settings")}
                >
                  Edit
                </button>
              </>
            ) : (
              <>
                <div className={styles.iconPlaceholder}>🎨</div>
                <p className={styles.stepHint}>
                  Add your logo, tagline, and brand colors to make your store unique.
                </p>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => navigate("/owner/settings")}
                  style={{ background: accentColor }}
                >
                  Customize
                </button>
              </>
            )}
          </div>

        </div>
      </div>
    );
  }

  // ── STATE B: Post-setup ───────────────────────────────────────────────────

  const stats        = dashData?.stats ?? null;
  const recentOrders = dashData?.recentOrders ?? [];
  const latestProduct = products?.[0] ?? null;

  return (
    <div className={styles.page}>

      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>{greeting(firstName)}</h1>
          <p className={styles.subtitle}>
            Here's how {ownerStore?.name || "your store"} is doing.
          </p>
        </div>
        {storefrontUrl && (
          <a
            href={storefrontUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.previewLink}
          >
            Live Preview ↗
          </a>
        )}
      </div>

      {/* Setup complete banner (dismissable) */}
      {!bannerDismissed && (
        <div className={styles.setupBanner}>
          <span>🎉 Your store is live! All setup steps are complete.</span>
          <button
            type="button"
            className={styles.bannerClose}
            onClick={dismissBanner}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Two-column preview ───────────────────────────── */}
      <div className={styles.previewRow}>

        {/* Product column */}
        <div className={styles.previewCol}>
          <div className={styles.productCard}>
            <div className={styles.productImgArea}>
              {latestProduct?.image_url ? (
                <img
                  src={latestProduct.image_url}
                  alt={latestProduct.title}
                  className={styles.productCardImg}
                />
              ) : (
                <div className={styles.productImgPlaceholder}>📦</div>
              )}
            </div>
            <div className={styles.productCardBody}>
              <span className={styles.productCardName}>
                {latestProduct ? latestProduct.title : "No products yet"}
              </span>
              {latestProduct && (
                <span className={styles.productCardPrice}>
                  {formatRevenue(latestProduct.price_cents, latestProduct.currency)}
                </span>
              )}
            </div>
          </div>
          <div className={styles.cardCheckRow}>
            <span className={styles.checkLabel}>
              <span className={styles.checkGreen}>✅</span> Products added
            </span>
            <Link to="/owner/products/new" className={styles.cardActionBtn}>Add more</Link>
          </div>
        </div>

        {/* Storefront column */}
        <div className={styles.previewCol}>
          <div className={styles.storefrontMockCard}>
            <div className={styles.mockHeader}>
              <span className={styles.mockHeaderName}>{ownerStore?.name || "Your Store"}</span>
            </div>
            <div className={styles.mockBody}>
              <p className={styles.mockBodyText}>Browse our latest products</p>
              <div className={styles.mockShopBtn}>Shop now</div>
            </div>
          </div>
          <p className={styles.mockCaption}>This is how your store looks right now!</p>
          <div className={styles.storeStatusRow}>
            <span className={styles.storeStatusLabel}>Store status</span>
            <button
              type="button"
              role="switch"
              aria-checked={storeActive}
              className={`${styles.togglePill} ${storeActive ? styles.togglePillOn : ""}`}
              onClick={() => setStoreActive((v) => !v)}
            >
              <span className={styles.toggleKnob} />
            </button>
            <span className={storeActive ? styles.storeStatusOn : styles.storeStatusOff}>
              {storeActive ? "Active" : "Inactive"}
            </span>
          </div>
          <div className={styles.cardCheckRow}>
            <span className={styles.checkLabel}>
              <span className={styles.checkGreen}>✅</span> Store customized
            </span>
            <div className={styles.cardCheckActions}>
              {storefrontUrl && (
                <a
                  href={storefrontUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.viewStoreInlineLink}
                >
                  View store ↗
                </a>
              )}
              <Link to="/owner/settings" className={styles.cardActionBtn}>Edit</Link>
            </div>
          </div>
        </div>

      </div>

      {/* ── Info row: 3 smaller cards ────────────────────── */}
      <div className={styles.infoRow}>

        {/* Payments */}
        <div className={styles.infoCard}>
          <p className={styles.infoCardTitle}>Payments</p>
          <div className={styles.infoCardBody}>
            <span className={styles.stripeBadgeInfo}>Stripe</span>
            <span className={styles.infoGray}>and more</span>
          </div>
          <span className={styles.activeGreen}>Active ✓</span>
        </div>

        {/* Store URL */}
        <div className={styles.infoCard}>
          <p className={styles.infoCardTitle}>Your store link</p>
          <div className={styles.urlRow}>
            <code className={styles.urlCode}>
              {storefrontUrl ? window.location.origin + storefrontUrl : "/store/..."}
            </code>
            {storefrontUrl && (
              <button
                type="button"
                className={`${styles.copyBtn} ${copied ? styles.copyBtnCopied : ""}`}
                onClick={handleCopy}
                aria-label="Copy store URL"
              >
                {copied ? "✓" : "📋"}
              </button>
            )}
          </div>
          <span className={styles.infoGray}>Share with customers</span>
        </div>

        {/* Quick actions */}
        <div className={styles.infoCard}>
          <p className={styles.infoCardTitle}>Quick actions</p>
          <div className={styles.quickActions}>
            <Link to="/owner/products/new" className={styles.quickActionBtn}>Create product</Link>
            <Link to="/owner/orders" className={styles.quickActionBtn}>View orders</Link>
          </div>
        </div>

      </div>

      {/* Quick stat cards */}
      <div className={styles.statGrid}>
        {dashLoading || !stats ? (
          [0, 1, 2, 3].map((i) => <div key={i} className={styles.skeletonCard} aria-hidden="true" />)
        ) : (
          <>
            <div className={`${styles.statCard} ${styles.statCardRevenue}`}>
              <span className={styles.statLabel}>Total Revenue</span>
              <span className={styles.statValue}>
                {formatRevenueShort(stats.total_revenue, stats.currency)}
              </span>
              <span className={styles.statNote}>
                {formatRevenue(stats.revenue_30d, stats.currency)} last 30d
              </span>
            </div>

            <div className={`${styles.statCard} ${styles.statCardOrders}`}>
              <span className={styles.statLabel}>Paid Orders</span>
              <span className={styles.statValue}>{stats.paid_orders_count}</span>
              <span className={styles.statNote}>
                {stats.pending_orders_count > 0
                  ? `${stats.pending_orders_count} pending`
                  : "none pending"}
              </span>
            </div>

            <div className={`${styles.statCard} ${styles.statCardProducts}`}>
              <span className={styles.statLabel}>Active Products</span>
              <span className={styles.statValue}>{stats.active_products}</span>
              <span className={styles.statNote}>
                {(stats.total_products - stats.active_products) > 0
                  ? `${stats.total_products - stats.active_products} inactive`
                  : "all active"}
              </span>
            </div>

            <div className={`${styles.statCard} ${styles.statCardAvg}`}>
              <span className={styles.statLabel}>Avg. Order Value</span>
              <span className={styles.statValue}>
                {stats.paid_orders_count > 0
                  ? formatRevenueShort(
                      Math.round(stats.total_revenue / stats.paid_orders_count),
                      stats.currency
                    )
                  : "—"}
              </span>
              {stats.latest_order_at ? (
                <span className={styles.statNote}>Last {timeAgo(stats.latest_order_at)}</span>
              ) : (
                <span className={styles.statNote}>no orders yet</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Recent orders */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.sectionHeading}>Recent Orders</h2>
          <Link to="/owner/orders" className={styles.viewAll}>View all →</Link>
        </div>

        {dashLoading ? (
          <div className={styles.skeletonRow} aria-hidden="true" />
        ) : recentOrders.length === 0 ? (
          <div className={styles.emptyState}>
            No paid orders yet —{" "}
            {storefrontUrl ? (
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noreferrer"
                className={styles.inlineLink}
              >
                share your storefront
              </a>
            ) : (
              "share your storefront"
            )}{" "}
            to get started.
          </div>
        ) : (
          <div className={styles.orderList}>
            {recentOrders.slice(0, 5).map((o) => (
              <div
                key={o.id}
                className={styles.orderRow}
                role="button"
                tabIndex={0}
                onClick={() => navigate("/owner/orders")}
                onKeyDown={(e) => e.key === "Enter" && navigate("/owner/orders")}
              >
                <span
                  className={`${styles.statusDot} ${STATUS_DOT[o.status] || styles.dotPending}`}
                />
                <div className={styles.orderInfo}>
                  <span className={styles.orderEmail}>{o.buyer_email ?? "—"}</span>
                  {o.product_titles && (
                    <span className={styles.orderProducts}>{o.product_titles}</span>
                  )}
                </div>
                <div className={styles.orderMeta}>
                  <span className={styles.orderAmount}>
                    {formatRevenue(o.total_cents, o.currency)}
                  </span>
                  <span className={styles.orderDate}>{timeAgo(o.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
