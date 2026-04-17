import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import SimpleChart from "../../components/SimpleChart";
import { fetchDashboardStats, getOwnerAccount } from "../../api/owner";
import styles from "./DashboardLegacy.module.css";

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
  const mins  = Math.floor(diff / 60_000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days  = Math.floor(hours / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function greeting(firstName) {
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return firstName ? `Good ${part}, ${firstName}!` : `Good ${part}!`;
}

const STATUS_DOT = {
  paid:     styles.dotPaid,
  pending:  styles.dotPending,
  failed:   styles.dotFailed,
  refunded: styles.dotRefunded,
};

function SkeletonCard() { return <div className={styles.skeletonCard} aria-hidden="true" />; }
function SkeletonRow()  { return <div className={styles.skeletonRow}  aria-hidden="true" />; }

const CHECKLIST_KEY = "dashboard_checklist_dismissed";

export default function OwnerDashboardLegacy() {
  const { ownerStore, ownerCtx } = useOwner();
  const navigate = useNavigate();
  const slug        = ownerStore?.slug ?? "";
  const storefrontUrl = slug ? `/store/${slug}` : null;
  const accentColor = ownerStore?.primary_color || "var(--color-accent)";

  const [data, setData]               = useState(null);
  const [firstName, setFirstName]     = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [chartDays, setChartDays]     = useState(30);
  const [checklistDismissed, setChecklistDismissed] = useState(
    () => localStorage.getItem(CHECKLIST_KEY) === "1"
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dashData, accountData] = await Promise.all([
          fetchDashboardStats(ownerCtx),
          getOwnerAccount(ownerCtx).catch(() => ({ account: {} })),
        ]);
        if (!cancelled) {
          setData(dashData);
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

  function dismissChecklist() {
    localStorage.setItem(CHECKLIST_KEY, "1");
    setChecklistDismissed(true);
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.skeletonHeading} aria-hidden="true" />
            <div className={styles.skeletonSub}     aria-hidden="true" />
          </div>
        </div>
        <div className={styles.statGrid}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
        <div className={styles.skeletonChart} aria-hidden="true" />
        <div className={styles.twoCol}>
          <div><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
          <div><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
        </div>
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

  const {
    stats, topProducts, dailySales, recentOrders,
    daily_views = [], total_views_today = 0, total_views_7d = 0,
  } = data;

  const hasProducts   = stats.total_products > 0;
  const inactiveCount = stats.total_products - stats.active_products;

  const hasTagline = Boolean(ownerStore?.tagline);
  const hasLogo    = Boolean(ownerStore?.logo_url);
  const hasSocial  = Boolean(ownerStore?.social_twitter || ownerStore?.social_instagram || ownerStore?.social_youtube || ownerStore?.social_website);

  const checklist = [
    { done: hasProducts,                  label: "Add your first product", link: "/owner/products" },
    { done: hasTagline,                   label: "Write a store tagline",  link: "/owner/settings" },
    { done: hasLogo,                      label: "Upload a logo",          link: "/owner/settings" },
    { done: hasSocial,                    label: "Add social links",       link: "/owner/settings" },
    { done: stats.paid_orders_count > 0,  label: "Get your first sale",   link: storefrontUrl },
  ];
  const checklistDoneCount = checklist.filter((c) => c.done).length;
  const setupDone          = checklistDoneCount === checklist.length;
  const showChecklist      = !setupDone && !checklistDismissed;

  // Slices for the period toggle
  const chartData = dailySales.slice(-chartDays).map((d) => ({ label: d.day, value: d.revenue_cents }));
  const periodRevenue = dailySales.slice(-chartDays).reduce((s, d) => s + d.revenue_cents, 0);

  const views7dData = daily_views.map((d) => ({ label: d.date, value: d.views }));
  const sales7dData = dailySales.slice(-7).map((d) => ({ label: d.day, value: d.orders_count }));
  const sales7dCount = dailySales.slice(-7).reduce((s, d) => s + d.orders_count, 0);

  // ── Empty state (no products yet) ────────────────────────────────────────
  if (!hasProducts) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.heading}>{greeting(firstName)}</h1>
            <p className={styles.subtitle}>Your store is ready — let's get you set up.</p>
          </div>
          {storefrontUrl && (
            <a href={storefrontUrl} target="_blank" rel="noreferrer" className={styles.previewLink}>
              Preview storefront ↗
            </a>
          )}
        </div>

        <div className={styles.checklistCard}>
          <div className={styles.checklistCardHeader}>
            <div>
              <h2 className={styles.checklistTitle}>Get started</h2>
              <p className={styles.checklistSubtitle}>{checklistDoneCount} of {checklist.length} complete</p>
            </div>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round((checklistDoneCount / checklist.length) * 100)}%`, background: accentColor }}
            />
          </div>
          <ul className={styles.checklistItems}>
            {checklist.map((item) => (
              <li key={item.label} className={`${styles.checklistItem} ${item.done ? styles.checklistItemDone : ""}`}>
                <span className={`${styles.checkIcon} ${item.done ? styles.checkIconDone : ""}`}>
                  {item.done ? "✓" : "○"}
                </span>
                {item.link?.startsWith("/") ? (
                  <Link to={item.link} className={styles.checklistLink}>{item.label}</Link>
                ) : item.link ? (
                  <a href={item.link} target="_blank" rel="noreferrer" className={styles.checklistLink}>{item.label}</a>
                ) : (
                  <span>{item.label}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>{greeting(firstName)}</h1>
          <p className={styles.subtitle}>Here's how {ownerStore?.name || "your store"} is doing.</p>
        </div>
        {storefrontUrl && (
          <a href={storefrontUrl} target="_blank" rel="noreferrer" className={styles.previewLink}>
            View storefront ↗
          </a>
        )}
      </div>

      {/* ── Section A: Setup checklist (dismissible) ─────────────────────── */}
      {showChecklist && (
        <div className={styles.checklistCard}>
          <div className={styles.checklistCardHeader}>
            <div>
              <h2 className={styles.checklistTitle}>Finish setting up your store</h2>
              <p className={styles.checklistSubtitle}>{checklistDoneCount} of {checklist.length} complete</p>
            </div>
            <button
              type="button"
              className={styles.checklistDismiss}
              onClick={dismissChecklist}
              aria-label="Dismiss checklist"
            >
              ×
            </button>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round((checklistDoneCount / checklist.length) * 100)}%`, background: accentColor }}
            />
          </div>
          <ul className={styles.checklistItems}>
            {checklist.map((item) => (
              <li key={item.label} className={`${styles.checklistItem} ${item.done ? styles.checklistItemDone : ""}`}>
                <span className={`${styles.checkIcon} ${item.done ? styles.checkIconDone : ""}`}>
                  {item.done ? "✓" : "○"}
                </span>
                {item.link?.startsWith("/") ? (
                  <Link to={item.link} className={styles.checklistLink}>{item.label}</Link>
                ) : item.link ? (
                  <a href={item.link} target="_blank" rel="noreferrer" className={styles.checklistLink}>{item.label}</a>
                ) : (
                  <span>{item.label}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Section B: 4 stat cards ──────────────────────────────────────── */}
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Revenue</span>
          <span className={styles.statValue}>
            {formatRevenueShort(stats.total_revenue, stats.currency)}
          </span>
          <span className={styles.statNote}>{formatRevenue(stats.revenue_30d, stats.currency)} last 30d</span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Paid Orders</span>
          <span className={styles.statValue}>{stats.paid_orders_count}</span>
          <span className={styles.statNote}>
            {stats.pending_orders_count > 0 ? `${stats.pending_orders_count} pending` : "none pending"}
          </span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active Products</span>
          <span className={styles.statValue}>{stats.active_products}</span>
          <span className={styles.statNote}>
            {inactiveCount > 0 ? `${inactiveCount} inactive` : "all active"}
          </span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Avg. Order Value</span>
          <span className={styles.statValue}>
            {stats.paid_orders_count > 0
              ? formatRevenueShort(Math.round(stats.total_revenue / stats.paid_orders_count), stats.currency)
              : "—"}
          </span>
          {stats.latest_order_at ? (
            <span className={styles.statNote}>Last {timeAgo(stats.latest_order_at)}</span>
          ) : (
            <span className={styles.statNote}>no orders yet</span>
          )}
        </div>
      </div>

      {/* ── Buyer insights bar ───────────────────────────────────────────── */}
      {(stats.registered_buyers > 0 || stats.marketing_opted_in > 0) && (
        <div className={styles.insightBar}>
          {stats.registered_buyers > 0 && (
            <span className={styles.insightItem}>
              <span className={styles.insightIcon}>👤</span>
              <strong>{stats.registered_buyers.toLocaleString()}</strong>
              {" "}registered {stats.registered_buyers === 1 ? "buyer" : "buyers"}
            </span>
          )}
          {stats.marketing_opted_in > 0 && (
            <span className={styles.insightItem}>
              <span className={styles.insightIcon}>📧</span>
              <strong>{stats.marketing_opted_in.toLocaleString()}</strong>
              {" "}opted in to marketing
            </span>
          )}
        </div>
      )}

      {/* ── Section C: Revenue chart ──────────────────────────────────────── */}
      <div className={styles.chartCard}>
        <div className={styles.chartCardHeader}>
          <div>
            <h2 className={styles.sectionHeading}>Revenue</h2>
            <span className={styles.chartPeriodTotal}>
              {formatRevenue(periodRevenue, stats.currency)} in the last {chartDays}d
            </span>
          </div>
          <div className={styles.chartToggle}>
            <button
              type="button"
              className={`${styles.toggleBtn} ${chartDays === 7  ? styles.toggleBtnActive : ""}`}
              style={chartDays === 7 ? { background: accentColor } : {}}
              onClick={() => setChartDays(7)}
            >7d</button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${chartDays === 30 ? styles.toggleBtnActive : ""}`}
              style={chartDays === 30 ? { background: accentColor } : {}}
              onClick={() => setChartDays(30)}
            >30d</button>
          </div>
        </div>
        <SimpleChart
          type="line"
          data={chartData}
          color={accentColor}
          showArea={true}
          fillOpacity={0}
          height={180}
          formatValue={(v) => formatRevenue(v, stats.currency)}
          emptyMsg="Your sales chart will come alive with your first order"
        />
      </div>

      {/* ── Section D: Two-column — Recent Orders + Top Products ─────────── */}
      <div className={styles.twoCol}>

        {/* Recent Orders */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.sectionHeading}>Recent Orders</h2>
            <Link to="/owner/orders" className={styles.viewAll}>View all →</Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className={styles.emptyState}>
              No paid orders yet —{" "}
              {storefrontUrl ? (
                <a href={storefrontUrl} target="_blank" rel="noreferrer" className={styles.inlineLink}>
                  share your storefront
                </a>
              ) : "share your storefront"}{" "}
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
                  <span className={`${styles.statusDot} ${STATUS_DOT[o.status] || styles.dotPending}`} />
                  <div className={styles.orderInfo}>
                    <span className={styles.orderEmail}>{o.buyer_email ?? "—"}</span>
                    {o.product_titles && (
                      <span className={styles.orderProducts}>{o.product_titles}</span>
                    )}
                  </div>
                  <div className={styles.orderMeta}>
                    <span className={styles.orderAmount}>{formatRevenue(o.total_cents, o.currency)}</span>
                    <span className={styles.orderDate}>{timeAgo(o.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Products */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.sectionHeading}>Top Products</h2>
            <Link to="/owner/products" className={styles.viewAll}>Manage →</Link>
          </div>
          {topProducts.length === 0 ? (
            <div className={styles.emptyState}>
              No sales yet.{" "}
              <Link to="/owner/products" className={styles.inlineLink}>Add products</Link>{" "}
              to start selling.
            </div>
          ) : (
            <div className={styles.topList}>
              {topProducts.slice(0, 5).map((p, i) => (
                <div key={p.id} className={styles.topRow}>
                  <span className={styles.topRank}>{i + 1}</span>
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.title} className={styles.topThumb} />
                  ) : (
                    <div className={styles.topThumbPlaceholder} style={{ background: accentColor + "22" }}>
                      <span style={{ color: accentColor }}>{p.title.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className={styles.topInfo}>
                    <span className={styles.topTitle}>{p.title}</span>
                    <span className={styles.topSales}>{p.sales_count} sold</span>
                  </div>
                  <span className={styles.topRevenue}>{formatRevenue(p.revenue_cents, p.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Section E: Sparklines ─────────────────────────────────────────── */}
      <div className={styles.sparkCard}>
        <div className={styles.sparkHalf}>
          <div className={styles.sparkHeader}>
            <span className={styles.sparkLabel}>Views (7d)</span>
            <span className={styles.sparkStat}>{total_views_7d.toLocaleString()} total</span>
          </div>
          <SimpleChart
            type="line"
            data={views7dData}
            color={accentColor}
            height={80}
            fillOpacity={0.08}
            showLabels={false}
            formatValue={(v) => `${v.toLocaleString()} views`}
            emptyMsg="No views yet"
          />
          <p className={styles.sparkNote}>Today: {total_views_today.toLocaleString()} views</p>
        </div>
        <div className={styles.sparkDivider} />
        <div className={styles.sparkHalf}>
          <div className={styles.sparkHeader}>
            <span className={styles.sparkLabel}>Sales (7d)</span>
            <span className={styles.sparkStat}>{sales7dCount} orders</span>
          </div>
          <SimpleChart
            type="line"
            data={sales7dData}
            color="#22c55e"
            height={80}
            fillOpacity={0.08}
            showLabels={false}
            formatValue={(v) => `${v} order${v !== 1 ? "s" : ""}`}
            emptyMsg="No sales yet"
          />
          <p className={styles.sparkNote}>
            {formatRevenue(dailySales.slice(-7).reduce((s, d) => s + d.revenue_cents, 0), stats.currency)} revenue
          </p>
        </div>
      </div>

    </div>
  );
}
