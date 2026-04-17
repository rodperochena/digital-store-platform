import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import {
  backfillCustomers,
  getCustomersSummary,
  listCustomers,
  listOwnerOrders,
  exportCustomersCsv,
} from "../../api/owner";
import styles from "./Customers.module.css";

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
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateMed(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function formatDateTime(dateStr) {
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

// ── Contact type config ───────────────────────────────────────────────────────

// Single label used everywhere — list badge and detail panel are identical.
// subscriber status on member types is shown via the separate email consent section.
const CONTACT_TYPES = {
  guest: {
    label:    "Guest",
    icon:     "🛒",
    cssClass: "badgeGuest",
    canEmail: false,
  },
  guest_subscriber: {
    label:    "Subscriber",
    icon:     "📧",
    cssClass: "badgeGuestSub",
    canEmail: true,
  },
  member: {
    label:    "Member",
    icon:     "👤",
    cssClass: "badgeMember",
    canEmail: false,
  },
  member_subscriber: {
    label:    "Member",
    icon:     "👤",
    cssClass: "badgeMember",
    canEmail: true,
  },
  subscriber_only: {
    label:    "Subscriber",
    icon:     "📧",
    cssClass: "badgeSubOnly",
    canEmail: true,
  },
};

// ── Shared badge component ────────────────────────────────────────────────────

function TypeBadge({ contactType, large = false }) {
  const typeInfo = CONTACT_TYPES[contactType] ?? CONTACT_TYPES.guest;
  return (
    <span className={`${styles.typeBadge} ${large ? styles.typeBadgeLarge : ""} ${styles[typeInfo.cssClass]}`}>
      {typeInfo.label}
    </span>
  );
}

// ── Client-side filter & sort ─────────────────────────────────────────────────

function filterCustomers(customers, filter) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  switch (filter) {
    case "members":         return customers.filter((c) => c.buyer_account_id != null);
    case "guests":          return customers.filter((c) => c.buyer_account_id == null && c.order_count > 0);
    case "subscriber_only": return customers.filter((c) => c.contact_type === "subscriber_only");
    case "buyers":          return customers.filter((c) => c.order_count > 0);
    case "one_time":        return customers.filter((c) => c.order_count === 1);
    case "repeat":          return customers.filter((c) => c.order_count > 1);
    case "high_value":      return customers.filter((c) => c.total_spent_cents >= 5000);
    case "dormant":         return customers.filter((c) => c.order_count > 0 && c.last_seen_at && new Date(c.last_seen_at) < thirtyDaysAgo);
    case "opted_in":        return customers.filter((c) => c.marketing_opt_in === true);
    case "no_consent":      return customers.filter((c) => c.marketing_opt_in === false && c.order_count > 0);
    default:                return customers;
  }
}

function sortCustomers(customers, sort) {
  return [...customers].sort((a, b) => {
    switch (sort) {
      case "recent_desc": return new Date(b.last_seen_at) - new Date(a.last_seen_at);
      case "recent_asc":  return new Date(a.last_seen_at) - new Date(b.last_seen_at);
      case "spent_desc":  return b.total_spent_cents - a.total_spent_cents;
      case "spent_asc":   return a.total_spent_cents - b.total_spent_cents;
      case "orders_desc": return b.order_count - a.order_count;
      case "orders_asc":  return a.order_count - b.order_count;
      case "alpha_asc":   return a.email.localeCompare(b.email);
      case "alpha_desc":  return b.email.localeCompare(a.email);
      default:            return new Date(b.last_seen_at) - new Date(a.last_seen_at);
    }
  });
}

// ── StatCards ─────────────────────────────────────────────────────────────────

function StatCards({ summary, currency, loading }) {
  const fmt  = (v) => (loading ? "…" : summary ? v : "—");

  const totalBuyers      = summary?.totalBuyers      ?? 0;
  const totalContacts    = summary?.totalContacts     ?? 0;
  const registeredCount  = summary?.registeredCount   ?? 0;
  const registrationRate = summary?.registrationRate  ?? 0;
  const marketingOptedIn = summary?.marketingOptedIn  ?? 0;
  const repeatBuyers     = summary?.repeatBuyers      ?? 0;
  const repeatRate       = summary?.repeatRate        ?? 0;
  const avgSpend         = summary?.avgSpend          ?? summary?.avgCustomerValue ?? 0;
  const totalRevenue     = summary?.totalLifetimeValue ?? 0;

  const optInRate = totalContacts > 0
    ? Math.round((marketingOptedIn / totalContacts) * 100)
    : 0;

  return (
    <div className={styles.statCards}>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Total Buyers</span>
        <span className={styles.statValue}>{fmt(totalBuyers.toLocaleString())}</span>
        <span className={styles.statSub}>have purchased</span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Members</span>
        <span className={`${styles.statValue} ${registeredCount > 0 ? styles.statValueBlue : ""}`}>
          {fmt(registeredCount.toLocaleString())}
        </span>
        <span className={styles.statSub}>
          {totalBuyers > 0 ? `${registrationRate}% of buyers registered` : "have accounts"}
        </span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Subscribers</span>
        <span className={`${styles.statValue} ${marketingOptedIn > 0 ? styles.statValueGreen : ""}`}>
          {fmt(marketingOptedIn.toLocaleString())}
        </span>
        <span className={styles.statSub}>
          {totalContacts > 0 ? `${optInRate}% opted in to emails` : "no opt-ins yet"}
        </span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Repeat Buyers</span>
        <span className={`${styles.statValue} ${repeatBuyers > 0 ? styles.statValueGreen : ""}`}>
          {fmt(repeatBuyers.toLocaleString())}
        </span>
        <span className={styles.statSub}>
          {totalBuyers > 0 ? `${repeatRate}% bought again` : "no repeat buyers yet"}
        </span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Avg Spend</span>
        <span className={styles.statValue}>{fmt(formatCurrency(avgSpend, currency))}</span>
        <span className={styles.statSub}>per buyer</span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Total Revenue</span>
        <span className={`${styles.statValue} ${totalRevenue > 0 ? styles.statValueGold : ""}`}>
          {fmt(formatCurrency(totalRevenue, currency))}
        </span>
        <span className={styles.statSub}>lifetime value</span>
      </div>
    </div>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

function FilterBar({ search, onSearch, filter, onFilter, sortBy, onSort }) {
  return (
    <div className={styles.filterBar}>
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Search by email…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <select className={styles.filterSelect} value={filter} onChange={(e) => onFilter(e.target.value)}>
        <option value="">All customers</option>
        <optgroup label="By type">
          <option value="members">Members</option>
          <option value="guests">Guests</option>
          <option value="subscriber_only">Subscribers only (never purchased)</option>
        </optgroup>
        <optgroup label="By purchases">
          <option value="buyers">All buyers</option>
          <option value="one_time">One-time buyers</option>
          <option value="repeat">Repeat buyers</option>
          <option value="high_value">High value ($50+)</option>
          <option value="dormant">Dormant (30+ days)</option>
        </optgroup>
        <optgroup label="By email">
          <option value="opted_in">Opted in to emails</option>
          <option value="no_consent">No email consent</option>
        </optgroup>
      </select>
      <select className={styles.filterSelect} value={sortBy} onChange={(e) => onSort(e.target.value)}>
        <option value="recent_desc">Most recent</option>
        <option value="recent_asc">Oldest first</option>
        <option value="spent_desc">Most spent</option>
        <option value="spent_asc">Least spent</option>
        <option value="orders_desc">Most purchases</option>
        <option value="orders_asc">Fewest purchases</option>
        <option value="alpha_asc">A → Z</option>
        <option value="alpha_desc">Z → A</option>
      </select>
    </div>
  );
}

// ── CustomerRow ───────────────────────────────────────────────────────────────

function CustomerRow({ customer, selected, onClick, currency }) {
  const flag = getFlag(customer.country);

  return (
    <button
      type="button"
      className={`${styles.customerRow} ${selected ? styles.customerRowSelected : ""}`}
      onClick={onClick}
    >
      <div className={styles.customerEmailLine}>
        <span className={styles.customerEmail}>
          {flag && <span className={styles.countryFlag}>{flag}</span>}
          {customer.email}
        </span>
        <TypeBadge contactType={customer.contact_type} />
      </div>
      <div className={styles.customerStats}>
        {customer.order_count} {customer.order_count === 1 ? "purchase" : "purchases"} · {formatCurrency(customer.total_spent_cents, currency)}
      </div>
      {customer.last_product_name && (
        <div className={styles.customerLastProduct}>
          Last: {customer.last_product_name}
        </div>
      )}
      <div className={styles.customerDateRow}>
        <span className={styles.customerDate}>
          {customer.last_order_at ? timeAgo(customer.last_order_at) : timeAgo(customer.last_seen_at)}
        </span>
      </div>
    </button>
  );
}

// ── CustomerDetail ────────────────────────────────────────────────────────────

function CustomerDetail({ customer, orders, ordersLoading, currency, onOrderClick }) {
  const [copyOk, setCopyOk] = useState(false);

  const typeInfo    = CONTACT_TYPES[customer.contact_type] ?? CONTACT_TYPES.guest;
  const canEmail    = typeInfo.canEmail || !!customer.marketing_opt_in;
  const flag        = getFlag(customer.country);
  const avg         = customer.order_count > 0
    ? Math.round(customer.total_spent_cents / customer.order_count)
    : 0;
  const isHighValue = customer.total_spent_cents >= 5000;

  function copyEmail() {
    navigator.clipboard.writeText(customer.email).then(() => {
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    });
  }

  const firstPurchaseDate = customer.contact_type === "subscriber_only"
    ? null
    : customer.first_seen_at;

  return (
    <div className={styles.detail}>

      {/* Header */}
      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderLeft}>
          <div className={styles.detailEmailRow}>
            {flag && <span className={styles.countryFlagLarge}>{flag}</span>}
            <div className={styles.detailEmail}>{customer.email}</div>
          </div>
          <div className={styles.detailSince}>
            {customer.contact_type === "subscriber_only"
              ? `Subscribed ${formatDateMed(customer.first_seen_at)}`
              : firstPurchaseDate
              ? `First purchase: ${formatDateMed(firstPurchaseDate)}`
              : "No purchases yet"}
          </div>
          <div className={styles.customerBadges}>
            <TypeBadge contactType={customer.contact_type} large />
            {isHighValue && (
              <span className={styles.badgeHighValue}>High value</span>
            )}
          </div>
        </div>
        <button type="button" className={styles.copyBtn} onClick={copyEmail}>
          {copyOk ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Purchase stats */}
      <div className={styles.detailSection}>
        <h3 className={styles.detailSectionLabel}>Purchase Stats</h3>
        <div className={styles.detailStatGrid}>
          <div className={styles.detailStatCell}>
            <span className={styles.detailStatVal}>{customer.order_count}</span>
            <span className={styles.detailStatLbl}>Purchases</span>
          </div>
          <div className={styles.detailStatCell}>
            <span className={styles.detailStatVal}>{formatCurrency(customer.total_spent_cents, currency)}</span>
            <span className={styles.detailStatLbl}>Spent</span>
          </div>
          <div className={styles.detailStatCell}>
            <span className={styles.detailStatVal}>{formatCurrency(avg, currency)}</span>
            <span className={styles.detailStatLbl}>Avg</span>
          </div>
        </div>
      </div>

      {/* Purchase history */}
      <div className={styles.detailSection}>
        <h3 className={styles.detailSectionLabel}>Purchase History</h3>
        {ordersLoading ? (
          <div className={styles.detailLoading}><Spinner size={14} /> Loading…</div>
        ) : orders.length === 0 ? (
          <p className={styles.noOrders}>No purchases found.</p>
        ) : (
          <div className={styles.orderHistory}>
            {orders.map((o) => {
              const flag = getFlag(o.buyer_country);
              return (
                <button
                  key={o.id}
                  type="button"
                  className={styles.orderHistoryRow}
                  onClick={() => onOrderClick(o.id)}
                  title={`View order ${o.id.slice(0, 8)}`}
                >
                  <span className={styles.historyFlag}>{flag || ""}</span>
                  <span className={styles.historyDate}>{formatDateTime(o.created_at)}</span>
                  <span className={styles.historyProduct}>
                    {o.primary_product_name || o.product_names?.[0] || "Order"}
                  </span>
                  <span className={styles.historyQty}>×{o.item_count || 1}</span>
                  <span className={styles.historyAmount}>{formatCurrency(o.total_cents, currency)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Email consent section */}
      <div className={styles.detailSection}>
        <h3 className={styles.detailSectionLabel}>Email Consent</h3>
        {canEmail ? (
          <div className={styles.consentOk}>
            <span className={styles.consentOkBadge}>✅ Email subscriber</span>
            <p className={styles.consentHint}>
              Subscribed to email updates. You can include them in campaigns.
              {customer.contact_type === "subscriber_only" && " This contact has not made a purchase yet."}
            </p>
          </div>
        ) : (
          <div>
            <div className={styles.consentWarning}>
              <span className={styles.consentWarningIcon}>⚠️</span>
              <div>
                <p className={styles.consentWarningTitle}>No email consent</p>
                <p className={styles.consentWarningText}>
                  This customer has not subscribed to email updates. You may only contact them
                  about their purchase (delivery issues, order updates). Sending marketing emails
                  without consent may violate anti-spam laws.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={styles.detailSection}>
        <h3 className={styles.detailSectionLabel}>Actions</h3>
        <div className={styles.detailActions}>
          {canEmail ? (
            <button
              type="button"
              className={styles.actionBtnPrimary}
              onClick={() => window.open(`mailto:${customer.email}`)}
            >
              📧 Send Email
            </button>
          ) : (
            <button
              type="button"
              className={styles.actionBtnOutlined}
              onClick={() => window.open(`mailto:${customer.email}`)}
            >
              📧 Contact About Order
            </button>
          )}
          <button type="button" className={styles.actionBtnSecondary} onClick={copyEmail}>
            🔗 Copy Email
          </button>
        </div>
      </div>

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Customers() {
  const { ownerCtx, ownerStore } = useOwner();
  const navigate = useNavigate();
  const currency = (ownerStore?.currency || "usd").toUpperCase();
  const slug     = ownerStore?.slug ?? "";
  const storeUrl = slug ? `${window.location.origin}/store/${slug}` : "";

  // Raw data from backend
  const [customers,   setCustomers]   = useState(null); // null = loading
  const [summary,     setSummary]     = useState(null);
  const [summaryLoad, setSummaryLoad] = useState(false);
  const [listError,   setListError]   = useState(null);
  const [exporting,   setExporting]   = useState(false);
  const [copiedUrl,   setCopiedUrl]   = useState(false);

  // Selection
  const [selectedEmail,    setSelectedEmail]    = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOrders,   setCustomerOrders]   = useState([]);
  const [ordersLoading,    setOrdersLoading]    = useState(false);
  const [mobileDetail,     setMobileDetail]     = useState(false);

  const [searchParams] = useSearchParams();

  // Filters — search hits the API; filter+sort are client-side
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("recent_desc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize,    setPageSize]    = useState(20);

  const debounceRef = useRef(null);

  // ── Derived: apply client-side filter + sort ──────────────────────────────

  const displayedCustomers = useMemo(() => {
    if (!customers) return [];
    return sortCustomers(filterCustomers(customers, filter), sortBy);
  }, [customers, filter, sortBy]);

  // ── Pagination derived values ─────────────────────────────────────────────

  const totalFiltered     = displayedCustomers.length;
  const totalPages        = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const paginatedCustomers = displayedCustomers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Reset to page 1 when filters / sort / search change
  useEffect(() => { setCurrentPage(1); }, [filter, sortBy, search]);

  // ── Auto-deselect when customer no longer in displayed list ──────────────

  useEffect(() => {
    if (selectedEmail && displayedCustomers.length >= 0) {
      const still = displayedCustomers.some((c) => c.email === selectedEmail);
      if (!still && selectedEmail) {
        setSelectedEmail(null);
        setSelectedCustomer(null);
        setMobileDetail(false);
      }
    }
  }, [displayedCustomers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Init: backfill then load ──────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try { await backfillCustomers(ownerCtx); } catch { /* non-critical */ }
      fetchCustomers(search);
      fetchSummary();
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchCustomers = useCallback(async (searchVal) => {
    setListError(null);
    try {
      const data = await listCustomers(ownerCtx, { search: searchVal || undefined });
      setCustomers(data.customers ?? []);
    } catch (err) {
      setListError(err.message);
      setCustomers([]);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line

  const fetchSummary = useCallback(async () => {
    setSummaryLoad(true);
    try {
      const data = await getCustomersSummary(ownerCtx);
      setSummary(data);
    } catch { /* non-critical */ }
    finally { setSummaryLoad(false); }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line

  function handleSearch(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCustomers(val), 300);
  }
  function handleFilter(val) { setFilter(val); }
  function handleSort(val)   { setSortBy(val); }

  // ── Select customer ───────────────────────────────────────────────────────

  async function selectCustomer(customer) {
    setSelectedEmail(customer.email);
    setSelectedCustomer(customer);
    setMobileDetail(true);
    setOrdersLoading(true);
    setCustomerOrders([]);
    try {
      const data = await listOwnerOrders(ownerCtx, {
        search: customer.email,
        status: "paid",
        sortBy: "newest",
      });
      setCustomerOrders(data.orders ?? []);
    } catch {
      setCustomerOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }

  function handleOrderClick(orderId) {
    navigate(`/owner/orders?selected=${orderId}`);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportCustomersCsv(ownerCtx);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "customers.csv";
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

  // ── Derived ───────────────────────────────────────────────────────────────

  const hasFilters = Boolean(search || filter);
  const isZero     = (summary?.totalContacts ?? summary?.totalCustomers ?? 0) === 0 && !hasFilters && customers !== null;
  const totalCount = summary?.totalContacts ?? summary?.totalCustomers ?? customers?.length ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Customers</h1>
          <p className={styles.subtitle}>
            {totalCount === null
              ? "Loading…"
              : displayedCustomers.length === 0 && hasFilters
              ? "No customers match filters"
              : `${totalCount.toLocaleString()} customer${totalCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          className={styles.exportBtn}
          onClick={handleExport}
          disabled={exporting || !customers?.length}
        >
          {exporting ? <Spinner size={14} /> : "📥"}
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {listError && <div className={styles.errorBar}>{listError}</div>}

      {isZero ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyEmoji}>👥</span>
          <h2 className={styles.emptyTitle}>No contacts yet</h2>
          <p className={styles.emptyDesc}>
            Contacts appear here after their first paid order or email subscription.
            Share your store to start getting sales.
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
            search={search} onSearch={handleSearch}
            filter={filter} onFilter={handleFilter}
            sortBy={sortBy} onSort={handleSort}
          />

          <div className={styles.layout}>

            <div className={`${styles.listPane} ${mobileDetail ? styles.listPaneHidden : ""}`}>
              {customers === null ? (
                <div className={styles.loadingRow}><Spinner size={16} /> Loading…</div>
              ) : displayedCustomers.length === 0 ? (
                <div className={styles.empty}>
                  <p>No customers found.</p>
                  {hasFilters && <p className={styles.emptyHint}>Try clearing filters.</p>}
                </div>
              ) : (
                <>
                  {/* Pagination header */}
                  <div className={styles.paginationHeader}>
                    <span className={styles.paginationInfo}>
                      {totalFiltered > pageSize
                        ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalFiltered)} of ${totalFiltered}`
                        : `${totalFiltered} customer${totalFiltered === 1 ? "" : "s"}`}
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

                  {/* Customer rows */}
                  {paginatedCustomers.map((c) => (
                    <CustomerRow
                      key={c.email}
                      customer={c}
                      selected={selectedEmail === c.email}
                      onClick={() => selectCustomer(c)}
                      currency={currency}
                    />
                  ))}

                  {/* Pagination controls */}
                  {totalPages > 1 && (
                    <div className={styles.pagination}>
                      <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >‹‹</button>
                      <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={() => setCurrentPage((p) => p - 1)}
                        disabled={currentPage === 1}
                      >‹</button>
                      <span className={styles.pageInfo}>Page {currentPage} of {totalPages}</span>
                      <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={() => setCurrentPage((p) => p + 1)}
                        disabled={currentPage === totalPages}
                      >›</button>
                      <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                      >››</button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className={styles.detailPane}>
              {mobileDetail && (
                <button type="button" className={styles.backToList} onClick={() => setMobileDetail(false)}>
                  ← Back to customers
                </button>
              )}
              {!selectedCustomer ? (
                <div className={styles.detailEmpty}>
                  <span className={styles.detailEmptyIcon}>👤</span>
                  <p>Select a customer to view details</p>
                </div>
              ) : (
                <CustomerDetail
                  customer={selectedCustomer}
                  orders={customerOrders}
                  ordersLoading={ordersLoading}
                  currency={currency}
                  onOrderClick={handleOrderClick}
                />
              )}
            </div>

          </div>
        </>
      )}
    </div>
  );
}
