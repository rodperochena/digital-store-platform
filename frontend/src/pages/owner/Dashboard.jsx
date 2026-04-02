import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import { fetchOwnerStats, listOwnerOrders, getOwnerAccount } from "../../api/owner";
import styles from "./Dashboard.module.css";

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

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function OwnerDashboard() {
  const { ownerStore, ownerCtx } = useOwner();
  const slug          = ownerStore?.slug ?? "";
  const storefrontUrl = slug ? `/store/${slug}` : null;
  const accentColor   = ownerStore?.primary_color || "#0d6efd";

  const [stats, setStats]               = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [firstName, setFirstName]       = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsData, ordersData, accountData] = await Promise.all([
          fetchOwnerStats(ownerCtx),
          listOwnerOrders(ownerCtx).catch(() => ({ orders: [] })),
          getOwnerAccount(ownerCtx).catch(() => ({ account: {} })),
        ]);
        if (!cancelled) {
          setStats(statsData.stats);
          setRecentOrders(
            (ordersData.orders ?? [])
              .filter((o) => o.status === "paid")
              .slice(0, 5)
          );
          setFirstName(accountData.account?.first_name ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingRow}><Spinner size={20} /> Loading…</div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>{ownerStore?.name}</h1>
        <p className={styles.errorMsg}>Could not load dashboard: {error}</p>
        <Link to="/owner/products" className={styles.linkBtn}>Go to Products</Link>
      </div>
    );
  }

  const hasProducts   = stats.total_products > 0;
  const inactiveCount = stats.total_products - stats.active_products;

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!hasProducts) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>{ownerStore?.name}</h1>
        <p className={styles.subtitle}>Your store is ready. Add a product to start selling.</p>

        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>No products yet</h2>
          <p className={styles.emptyDesc}>
            Create your first digital product — ebook, course, template, or anything downloadable.
          </p>
          <div className={styles.emptyCtas}>
            <Link to="/owner/products" className={styles.ctaPrimary}>
              + Add your first product
            </Link>
            {storefrontUrl && (
              <a href={storefrontUrl} target="_blank" rel="noreferrer" className={styles.ctaSecondary}>
                Preview storefront ↗
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Active state ──────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>
            {firstName ? `Hey, ${firstName}!` : ownerStore?.name}
          </h1>
          <p className={styles.subtitle}>Here's how your store is doing.</p>
        </div>
        {storefrontUrl && (
          <a href={storefrontUrl} target="_blank" rel="noreferrer" className={styles.previewLink}>
            View storefront ↗
          </a>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Revenue</span>
          <span className={styles.statValue} style={{ color: accentColor }}>
            {formatRevenue(stats.total_revenue, stats.currency)}
          </span>
          {stats.latest_order_at && (
            <span className={styles.statNote}>Last order {timeAgo(stats.latest_order_at)}</span>
          )}
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Paid Orders</span>
          <span className={styles.statValue}>{stats.paid_orders_count}</span>
          {stats.pending_orders_count > 0 && (
            <span className={styles.statNote}>{stats.pending_orders_count} pending</span>
          )}
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active Products</span>
          <span className={styles.statValue}>{stats.active_products}</span>
          {inactiveCount > 0 && (
            <span className={styles.statNote}>{inactiveCount} inactive</span>
          )}
        </div>
      </div>

      {/* ── Recent orders ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionHeading}>Recent Orders</h2>
          <Link to="/owner/orders" className={styles.viewAll}>View all →</Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className={styles.emptySection}>
            <p>
              No paid orders yet —{" "}
              {storefrontUrl ? (
                <a href={storefrontUrl} target="_blank" rel="noreferrer" className={styles.inlineLink}>
                  share your storefront
                </a>
              ) : (
                "share your storefront"
              )}{" "}
              to get started.
            </p>
          </div>
        ) : (
          <div className={styles.orderList}>
            {recentOrders.map((o) => (
              <div key={o.id} className={styles.orderRow}>
                <span className={styles.orderId}>#{o.id.slice(0, 8)}</span>
                <span className={styles.orderEmail}>{o.buyer_email ?? "—"}</span>
                <span className={styles.orderAmount}>
                  {formatRevenue(o.total_cents, o.currency)}
                </span>
                <span className={styles.orderDate}>{timeAgo(o.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick links ── */}
      <div className={styles.section}>
        <h2 className={styles.sectionHeading}>Quick Links</h2>
        <div className={styles.quickLinks}>
          <Link to="/owner/products" className={styles.quickLink}>Manage Products</Link>
          <Link to="/owner/settings" className={styles.quickLink}>Store Settings</Link>
          {storefrontUrl && (
            <a href={storefrontUrl} target="_blank" rel="noreferrer" className={styles.quickLink}>
              View Storefront ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
