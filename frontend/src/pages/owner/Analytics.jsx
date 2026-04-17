import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import SimpleChart from "../../components/SimpleChart";
import { getAnalyticsOverview, listOwnerProducts } from "../../api/owner";
import styles from "./Analytics.module.css";

// ── Country maps ───────────────────────────────────────────────────────────────

const COUNTRY_NAMES = {
  US:"United States",GB:"United Kingdom",CA:"Canada",DE:"Germany",FR:"France",
  ES:"Spain",IT:"Italy",NL:"Netherlands",AU:"Australia",BR:"Brazil",MX:"Mexico",
  JP:"Japan",KR:"South Korea",IN:"India",CN:"China",RU:"Russia",SE:"Sweden",
  NO:"Norway",DK:"Denmark",FI:"Finland",PL:"Poland",PT:"Portugal",AR:"Argentina",
  CO:"Colombia",CL:"Chile",ZA:"South Africa",NG:"Nigeria",EG:"Egypt",IL:"Israel",
  AE:"UAE",SG:"Singapore",TH:"Thailand",PH:"Philippines",ID:"Indonesia",
  IE:"Ireland",AT:"Austria",CH:"Switzerland",BE:"Belgium",NZ:"New Zealand",
  PE:"Peru",VE:"Venezuela",EC:"Ecuador",BO:"Bolivia",PY:"Paraguay",
  UY:"Uruguay",CR:"Costa Rica",PA:"Panama",DO:"Dominican Republic",
  GT:"Guatemala",HN:"Honduras",SV:"El Salvador",NI:"Nicaragua",
  UA:"Ukraine",TR:"Turkey",SA:"Saudi Arabia",MY:"Malaysia",VN:"Vietnam",PK:"Pakistan",
};

const COUNTRY_FLAGS = {
  US:"🇺🇸",GB:"🇬🇧",CA:"🇨🇦",DE:"🇩🇪",FR:"🇫🇷",ES:"🇪🇸",IT:"🇮🇹",NL:"🇳🇱",
  AU:"🇦🇺",BR:"🇧🇷",MX:"🇲🇽",JP:"🇯🇵",KR:"🇰🇷",IN:"🇮🇳",CN:"🇨🇳",RU:"🇷🇺",
  SE:"🇸🇪",NO:"🇳🇴",DK:"🇩🇰",FI:"🇫🇮",PL:"🇵🇱",PT:"🇵🇹",AR:"🇦🇷",CO:"🇨🇴",
  CL:"🇨🇱",ZA:"🇿🇦",NG:"🇳🇬",EG:"🇪🇬",IL:"🇮🇱",AE:"🇦🇪",SG:"🇸🇬",TH:"🇹🇭",
  PH:"🇵🇭",ID:"🇮🇩",IE:"🇮🇪",AT:"🇦🇹",CH:"🇨🇭",BE:"🇧🇪",NZ:"🇳🇿",PE:"🇵🇪",
  VE:"🇻🇪",EC:"🇪🇨",BO:"🇧🇴",PY:"🇵🇾",UY:"🇺🇾",CR:"🇨🇷",PA:"🇵🇦",DO:"🇩🇴",
  GT:"🇬🇹",HN:"🇭🇳",SV:"🇸🇻",NI:"🇳🇮",UA:"🇺🇦",TR:"🇹🇷",SA:"🇸🇦",MY:"🇲🇾",
  VN:"🇻🇳",PK:"🇵🇰",
};

const SEGMENT_COLORS = ["#3b82f6", "#10b981", "#94a3b8"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function periodToDateRangeFE(period) {
  const end   = new Date();
  const start = new Date();
  if      (period === "7d")  start.setDate(start.getDate()  -  6);
  else if (period === "30d") start.setDate(start.getDate()  - 29);
  else if (period === "60d") start.setDate(start.getDate()  - 59);
  else if (period === "90d") start.setDate(start.getDate()  - 89);
  else                       start.setFullYear(2020);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
  };
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

// Format a date string from the time-series query into a short x-axis label.
// SimpleChart does slice(-5) on labels, so all formats must be ≤5 chars.
function formatChartDate(dateStr, grp) {
  if (!dateStr) return "";
  if (grp === "yearly")  return String(dateStr).slice(0, 4);           // "2026" (4)
  if (grp === "monthly") {
    const [y, m] = String(dateStr).split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" }); // "Apr" (3)
  }
  if (grp === "quarterly") {
    const [, m] = String(dateStr).split("-").map(Number);
    return `Q${Math.ceil(m / 3)}`;                                     // "Q2" (2)
  }
  // daily / weekly — use M/D which is always 3-5 chars (fits slice(-5))
  const parts = String(dateStr).split("-").map(Number);
  const dt = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;                       // "4/4" (3-5)
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days  = Math.floor(hours / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function calcChange(current, previous) {
  if (current === 0 && previous === 0) return { kind: "none" };
  if (previous === 0 && current > 0)  return { kind: "new" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return { kind: "none" };
  return { kind: pct > 0 ? "up" : "down", pct: Math.abs(pct).toFixed(1) };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CompareChip({ current, previous }) {
  const c = calcChange(current, previous);
  const chipClass = {
    up:   styles.chipUp,
    down: styles.chipDown,
    new:  styles.chipNew,
    none: styles.chipNone,
  }[c.kind] || styles.chipNone;

  const label =
    c.kind === "up"   ? `↑ ${c.pct}%` :
    c.kind === "down" ? `↓ ${c.pct}%` :
    c.kind === "new"  ? "New"          : "—";

  return <span className={`${styles.chip} ${chipClass}`}>{label}</span>;
}

// Semicircle gauge with two-segment visual and hover tooltips
function SalesGauge({ current, previous, topProducts = [] }) {
  const [hovered, setHovered] = useState(null); // "cur" | "prev" | null

  const R = 90, cx = 120, cy = 120, SW = 20;
  const noData    = current === 0 && previous === 0;
  const maxOrders = Math.max(current, previous, 1);
  const curRatio  = noData ? 0 : current  / maxOrders;
  const prevRatio = noData ? 0 : previous / maxOrders;
  const isGrowth  = current >= previous;

  // Returns an SVG arc path from ratio `from` (0=left) to `to` (1=right)
  function arcSeg(from, to) {
    const cTo = Math.min(to, 0.9999);
    if (cTo - from < 0.002) return null;
    const pt = (r) => {
      const t = Math.PI * (1 - r);
      return `${(cx + R * Math.cos(t)).toFixed(2)} ${(cy - R * Math.sin(t)).toFixed(2)}`;
    };
    return `M ${pt(from)} A ${R} ${R} 0 0 1 ${pt(cTo)}`;
  }

  const bgPath = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;

  // Visual layers
  const solidPath  = (!noData && current > 0) ? arcSeg(0, curRatio)  : null;
  const gapPath    = (!isGrowth && !noData && current > 0) ? arcSeg(curRatio, prevRatio || 0.9999) : null;
  const overlapPath = (isGrowth && !noData && previous > 0 && prevRatio > 0.02)
    ? arcSeg(0, prevRatio) : null;

  // Hit areas for hover (wider transparent stroke)
  let hitCur = null, hitPrev = null;
  if (!noData) {
    if (isGrowth) {
      if (previous > 0 && prevRatio > 0.02) {
        hitPrev = arcSeg(0, prevRatio);
        hitCur  = arcSeg(prevRatio, 0.9999);
      } else {
        hitCur = arcSeg(0, 0.9999);
      }
    } else {
      hitCur  = arcSeg(0, Math.max(curRatio, 0.02));
      hitPrev = arcSeg(Math.max(curRatio, 0.02), 0.9999);
    }
  }

  const change = calcChange(current, previous);
  const changeTxt =
    change.kind === "up"   ? `↑ ${change.pct}% vs prev period` :
    change.kind === "down" ? `↓ ${change.pct}% vs prev period` :
    (previous > 0 && current === previous) ? "Same as previous" :
    (previous === 0 && current > 0) ? "First period tracked" : null;

  const tooltipTxt = (() => {
    if (!hovered) return null;
    if (hovered === "cur") {
      if (isGrowth && previous > 0) {
        const delta = current - previous;
        return `+${delta.toLocaleString()} vs previous (↑${((delta / previous) * 100).toFixed(0)}%)`;
      }
      return `This period: ${current.toLocaleString()} orders`;
    }
    if (hovered === "prev") {
      if (isGrowth) return `Previous period: ${previous.toLocaleString()} orders`;
      const delta = previous - current;
      return `Gap: ${delta.toLocaleString()} fewer than previous (↓${((delta / previous) * 100).toFixed(0)}%)`;
    }
    return null;
  })();

  // Product boxes
  const sorted = [...topProducts].sort((a, b) => b.orders - a.orders);
  let boxes = [];
  if (sorted.length > 0 && sorted.length <= 3) {
    boxes = sorted.map((p) => ({ name: p.productName, count: p.orders }));
  } else if (sorted.length > 3) {
    const top2   = sorted.slice(0, 2);
    const others = sorted.slice(2).reduce((s, p) => s + p.orders, 0);
    boxes = [
      ...top2.map((p) => ({ name: p.productName, count: p.orders })),
      { name: "Others", count: others },
    ];
  }

  return (
    <div className={styles.gauge}>
      <svg viewBox="0 0 240 135" className={styles.gaugeSvg}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>

        {/* Gray background arc */}
        <path d={bgPath} fill="none" stroke="#e5e7eb" strokeWidth={SW} strokeLinecap="round" />

        {/* Current period fill (gradient blue) */}
        {solidPath && (
          <path d={solidPath} fill="none" stroke="url(#gaugeGrad)" strokeWidth={SW}
            strokeLinecap="round" style={{ pointerEvents: "none" }} />
        )}

        {/* Decline: gap arc (darker gray shows previous vs current difference) */}
        {gapPath && (
          <path d={gapPath} fill="none" stroke="#d1d5db" strokeWidth={SW}
            strokeLinecap="round" style={{ pointerEvents: "none" }} />
        )}

        {/* Growth: lighter blue overlay on the previous-period portion */}
        {overlapPath && (
          <path d={overlapPath} fill="none" stroke="#bfdbfe" strokeWidth={SW}
            strokeLinecap="round" style={{ pointerEvents: "none" }} />
        )}

        {/* Invisible hit areas (wider stroke, near-zero opacity) */}
        {hitCur && (
          <path d={hitCur} fill="none" stroke="white" strokeWidth="30"
            strokeOpacity="0.01" style={{ cursor: "pointer" }}
            onMouseEnter={() => setHovered("cur")}
            onMouseLeave={() => setHovered(null)} />
        )}
        {hitPrev && (
          <path d={hitPrev} fill="none" stroke="white" strokeWidth="30"
            strokeOpacity="0.01" style={{ cursor: "pointer" }}
            onMouseEnter={() => setHovered("prev")}
            onMouseLeave={() => setHovered(null)} />
        )}

        {/* Center text */}
        {noData ? (
          <text x="120" y="108" textAnchor="middle" className={styles.gaugeNoData}>No sales yet</text>
        ) : (
          <>
            <text x="120" y="100" textAnchor="middle" className={styles.gaugeValue}>
              {current.toLocaleString()}
            </text>
            <text x="120" y="116" textAnchor="middle" className={styles.gaugeLabel}>ORDERS</text>
          </>
        )}
      </svg>

      {tooltipTxt ? (
        <p className={styles.gaugePct}>{tooltipTxt}</p>
      ) : changeTxt ? (
        <p className={`${styles.gaugePct} ${change.kind === "down" ? styles.gaugePctDown : ""}`}>
          {changeTxt}
        </p>
      ) : (
        <p className={styles.gaugePct}>&nbsp;</p>
      )}

      {boxes.length > 0 && (
        <div className={styles.gaugeBoxes}>
          {boxes.map((b) => (
            <div key={b.name} className={styles.gaugeBox}>
              <span className={styles.gaugeBoxCount}>{b.count}</span>
              <span className={styles.gaugeBoxName} title={b.name}>{b.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Funnel-shaped conversion visualization
function ConversionFunnel({ visitors, buyers, convRate, lowSample, dataQualityIssue }) {
  const buyerBarPct = Math.max(15, Math.min(100, Math.round(convRate)));
  return (
    <div className={styles.funnel}>
      {/* Visitors — full width gray bar */}
      <div className={styles.funnelStep}>
        <div className={styles.funnelVisitorBar}>
          <span className={styles.funnelBarLabel}>👁 Visitors</span>
          <span className={styles.funnelBarValue}>{visitors.toLocaleString()}</span>
        </div>
      </div>

      <div className={styles.funnelArrow}>↓</div>

      {/* Buyers — centered narrower bar */}
      <div className={styles.funnelStep}>
        <div
          className={styles.funnelBuyerBar}
          style={{ width: `${buyerBarPct}%` }}
        >
          <span className={styles.funnelBarLabel}>🛒 Buyers</span>
          <span className={styles.funnelBarValue}>{buyers.toLocaleString()}</span>
        </div>
      </div>

      <p className={styles.funnelRate}>
        {convRate.toFixed(1)}% conversion
        {lowSample && <span className={styles.funnelLowSample}> (low sample)</span>}
      </p>
      {dataQualityIssue && (
        <p className={styles.dataNotice}>
          ⚠️ More buyers than tracked visitors — page view tracking may be incomplete.
        </p>
      )}
    </div>
  );
}

// SVG donut for customer breakdown
function CustomerDonut({ firstTimeBuyers, repeatBuyers }) {
  const total = firstTimeBuyers + repeatBuyers;
  if (total === 0) {
    return <p className={styles.donutEmpty}>No customer data yet</p>;
  }

  const cx           = 70;
  const cy           = 70;
  const r            = 52;
  const stroke       = 18;
  const circumference = 2 * Math.PI * r;

  const firstRatio  = firstTimeBuyers / total;
  const firstDash   = firstRatio * circumference;
  const firstGap    = circumference - firstDash;

  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 140 140" className={styles.donutSvg}>
        {/* repeat (green) — full circle background */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#10b981" strokeWidth={stroke} />
        {/* first-time (blue) — overlay */}
        {firstTimeBuyers > 0 && (
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={stroke}
            strokeDasharray={`${firstDash.toFixed(2)} ${firstGap.toFixed(2)}`}
            strokeDashoffset="0"
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" className={styles.donutValue}>{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" className={styles.donutLabel}>CUSTOMERS</text>
      </svg>
      <div className={styles.donutLegend}>
        <div className={styles.donutLegendItem}>
          <span className={styles.donutDot} style={{ background: "#3b82f6" }} />
          <span className={styles.donutLegendLabel}>One-time buyers</span>
          <span className={styles.donutLegendCount}>{firstTimeBuyers}</span>
        </div>
        <div className={styles.donutLegendItem}>
          <span className={styles.donutDot} style={{ background: "#10b981" }} />
          <span className={styles.donutLegendLabel}>Repeat buyers</span>
          <span className={styles.donutLegendCount}>{repeatBuyers}</span>
        </div>
      </div>
    </div>
  );
}

// ── PurchaseMethodBar ──────────────────────────────────────────────────────────

function PurchaseMethodBar({ registeredBuyers = 0, guestBuyers = 0 }) {
  const total = registeredBuyers + guestBuyers;
  if (total === 0) return null;
  const regPct   = Math.round((registeredBuyers / total) * 100);
  const guestPct = 100 - regPct;
  return (
    <div className={styles.pmWrap}>
      {/* Single stacked bar */}
      <div className={styles.pmStackedBar}>
        <div className={styles.pmSegMembers} style={{ width: `${regPct}%` }}
          title={`Members: ${registeredBuyers} (${regPct}%)`} />
        <div className={styles.pmSegGuest} style={{ width: `${guestPct}%` }}
          title={`Guest: ${guestBuyers} (${guestPct}%)`} />
      </div>
      {/* Legend */}
      <div className={styles.pmLegend}>
        <span className={styles.pmLegendItem}>
          <span className={styles.pmDot} style={{ background: "#3b82f6" }} />
          Members <strong>{registeredBuyers}</strong> ({regPct}%)
        </span>
        <span className={styles.pmLegendItem}>
          <span className={styles.pmDot} style={{ background: "#94a3b8" }} />
          Guest <strong>{guestBuyers}</strong> ({guestPct}%)
        </span>
      </div>
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS  = [
  { label: "7d",  value: "7d"  },
  { label: "30d", value: "30d" },
  { label: "60d", value: "60d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
];

const GROUPBY_OPTIONS = [
  { label: "Daily",   value: "daily"     },
  { label: "Weekly",  value: "weekly"    },
  { label: "Monthly", value: "monthly"   },
  { label: "Quarterly", value: "quarterly" },
  { label: "Yearly",  value: "yearly"    },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function Analytics() {
  const { ownerCtx, ownerStore } = useOwner();
  const currency    = ownerStore?.currency ?? "usd";
  const accentColor = ownerStore?.primary_color || "var(--color-accent)";

  // ── Filter state ──────────────────────────────────────────────────────────
  const [period,      setPeriod]      = useState("30d");
  const [groupBy,     setGroupBy]     = useState("daily");
  const [productId,   setProductId]   = useState("");
  const [customStart, setCustomStart] = useState(null); // YYYY-MM-DD or null
  const [customEnd,   setCustomEnd]   = useState(null); // YYYY-MM-DD or null

  // Effective date range: custom dates override period
  const effectiveDates = useMemo(() => {
    if (customStart && customEnd) return { startDate: customStart, endDate: customEnd };
    return periodToDateRangeFE(period || "30d");
  }, [period, customStart, customEnd]);

  const displayStart = customStart || effectiveDates.startDate;
  const displayEnd   = customEnd   || effectiveDates.endDate;

  // ── Data state ────────────────────────────────────────────────────────────
  const [data,     setData]     = useState(null);
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    listOwnerProducts(ownerCtx)
      .then((d) => setProducts(d.products ?? []))
      .catch(() => {});
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = effectiveDates;
      const d = await getAnalyticsOverview(ownerCtx, {
        period: period || "30d",
        productId: productId || undefined,
        startDate,
        endDate,
        groupBy,
      });
      setData(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [effectiveDates, period, productId, groupBy, ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filter handlers ───────────────────────────────────────────────────────

  function handlePeriodClick(p) {
    setPeriod(p);
    setCustomStart(null);
    setCustomEnd(null);
  }

  function handleDateChange(which, val) {
    setPeriod(null);
    if (which === "start") setCustomStart(val || null);
    else                   setCustomEnd(val   || null);
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Overview</h1>
        </div>
        <div className={styles.skeletonFilterBar} />
        <div className={styles.statRow}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
        <div className={styles.skeletonChart} />
        <div className={styles.skeletonChart} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>Overview</h1>
        <p className={styles.errorMsg}>Could not load analytics: {error}</p>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const summary           = data?.summary;
  const curPeriod         = summary?.currentPeriod  ?? {};
  const prevPeriod        = summary?.previousPeriod ?? {};
  const revenueTimeSeries = data?.revenueTimeSeries ?? [];
  const topProducts       = data?.topProducts       ?? [];
  const geography         = data?.geography ?? [];
  const customerBreakdown = data?.customerBreakdown ?? { firstTimeBuyers: 0, repeatBuyers: 0, totalCustomers: 0 };
  const recentTx          = data?.recentTransactions ?? [];

  // Fall-back totals from old response shape
  const totalViews      = curPeriod.totalViews     ?? data?.views?.total        ?? 0;
  const uniqueVisitors  = curPeriod.uniqueVisitors ?? data?.views?.unique       ?? 0;
  const totalOrders     = curPeriod.totalOrders    ?? data?.sales?.count        ?? 0;
  const totalRevenue    = curPeriod.totalRevenue   ?? data?.sales?.total_cents  ?? 0;
  const uniqueBuyers    = curPeriod.uniqueBuyers   ?? 0;
  const prevOrders      = prevPeriod.totalOrders   ?? 0;
  const prevRevenue     = prevPeriod.totalRevenue  ?? 0;
  const prevViews       = prevPeriod.totalViews    ?? 0;
  const prevUnique      = prevPeriod.uniqueVisitors ?? 0;
  const prevUniqueBuyers = prevPeriod.uniqueBuyers ?? 0;

  // Conversion rate = unique buyers / unique visitors (capped at 100%)
  const convRate        = uniqueVisitors > 0 ? (uniqueBuyers / uniqueVisitors) * 100 : 0;
  const displayConvRate = Math.min(convRate, 100);
  const prevConvRate    = (prevPeriod.uniqueVisitors ?? 0) > 0
    ? (prevUniqueBuyers / (prevPeriod.uniqueVisitors ?? 1)) * 100
    : 0;
  const prevDisplayConvRate = Math.min(prevConvRate, 100);
  const lowSample = uniqueVisitors < 5;

  // Revenue chart data: prefer revenueTimeSeries, fall back to sales.daily
  // Labels are formatted to ≤5 chars so SimpleChart's slice(-5) doesn't truncate them
  const chartData = revenueTimeSeries.length > 0
    ? revenueTimeSeries.map((d) => ({ label: formatChartDate(d.date, groupBy), value: d.revenue }))
    : (data?.sales?.daily ?? []).map((d) => ({ label: formatChartDate(d.date, "daily"), value: d.sales_cents ?? 0 }));

  // Show every Nth label to avoid crowding
  const xLabelInterval = chartData.length > 20 ? 5 : chartData.length > 10 ? 3 : 1;

  // Product percentage bar segments
  const barSegments = (() => {
    if (topProducts.length === 0) return [];
    if (topProducts.length <= 2) return topProducts.map((p, i) => ({ ...p, color: SEGMENT_COLORS[i] }));
    const top2  = topProducts.slice(0, 2).map((p, i) => ({ ...p, color: SEGMENT_COLORS[i] }));
    const rest  = topProducts.slice(2);
    const restPct = rest.reduce((s, p) => s + p.percentage, 0);
    return [...top2, { productName: "Others", percentage: restPct, color: SEGMENT_COLORS[2] }];
  })();

  const singleProduct    = productId !== "";
  // "All time" has no meaningful previous period — hide comparison badges
  const showComparison   = period !== "all";
  // If every card would show "New" (no previous data at all), show no badges — they add no info
  const allNew = showComparison && [prevRevenue, prevOrders, prevViews].every((v) => v === 0)
    && [totalRevenue, totalOrders, totalViews].some((v) => v > 0);
  const dataQualityIssue = uniqueBuyers > uniqueVisitors && uniqueVisitors > 0;

  return (
    <div className={styles.page}>

      {/* ── ROW 1: Header + Filters ─────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Overview</h1>
        {loading && <Spinner size={14} />}
      </div>

      <div className={styles.filterBar}>
        {/* Product dropdown */}
        <select
          className={styles.productSelect}
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">All Products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>

        {/* Date range picker */}
        <div className={styles.dateRange}>
          <input
            type="date"
            className={styles.dateInput}
            value={displayStart}
            onChange={(e) => handleDateChange("start", e.target.value)}
          />
          <span className={styles.dateSep}>–</span>
          <input
            type="date"
            className={styles.dateInput}
            value={displayEnd}
            onChange={(e) => handleDateChange("end", e.target.value)}
          />
        </div>

        {/* Period pills */}
        <div className={styles.pillGroup}>
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`${styles.pill} ${!customStart && period === p.value ? styles.pillActive : ""}`}
              onClick={() => handlePeriodClick(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── ROW 2: 35% gauge+tx / 65% chart ────────────────────────────── */}
      <div className={styles.row2} key={totalRevenue}>

        {/* LEFT: Sales gauge + Recent transactions stacked */}
        <div className={styles.row2Left}>

          <div className={`${styles.gaugeCard} ${styles.chartFadeIn}`}>
            <div className={styles.gaugeCardHeader}>
              <h2 className={styles.sectionHeading}>Sales vs Previous Period</h2>
            </div>
            <SalesGauge
              current={totalOrders}
              previous={prevOrders}
              topProducts={topProducts}
            />
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.sectionHeading}>Recent Transactions</h2>
              <Link to="/owner/orders" className={styles.viewAll}>View all →</Link>
            </div>
            {recentTx.length === 0 ? (
              <div className={styles.emptyState}>No transactions for this period.</div>
            ) : (
              <div className={styles.txList}>
                {recentTx.map((tx) => (
                  <div key={tx.orderId} className={styles.txRow}>
                    {tx.buyerCountry && (
                      <span className={styles.txFlag}>{COUNTRY_FLAGS[tx.buyerCountry] || "🌍"}</span>
                    )}
                    <div className={styles.txLeft}>
                      <span className={styles.txProduct}>{tx.productName}</span>
                      <span className={styles.txEmail}>{tx.buyerEmail ?? "—"}</span>
                    </div>
                    <div className={styles.txRight}>
                      <span className={styles.txAmount}>{formatRevenue(tx.revenue, currency)}</span>
                      <span className={styles.txTime}>{timeAgo(tx.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT: Revenue chart with groupBy pills in header */}
        <div className={`${styles.chartCard} ${styles.chartFadeIn}`}>
          <div className={styles.chartCardHeader}>
            <div className={styles.chartCardHeaderLeft}>
              <h2 className={styles.sectionHeading}>Revenue</h2>
              <span className={styles.chartHeaderStat}>{formatRevenue(totalRevenue, currency)}</span>
            </div>
            <div className={styles.pillGroup}>
              {GROUPBY_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  className={`${styles.pill} ${styles.pillSm} ${groupBy === g.value ? styles.pillActive : ""}`}
                  onClick={() => setGroupBy(g.value)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <SimpleChart
            type="line"
            data={chartData}
            color="#3b82f6"
            showArea={true}
            fillOpacity={0}
            height={220}
            xLabelInterval={xLabelInterval}
            dotRadius={3}
            formatValue={(v) => formatRevenue(v, currency)}
            emptyMsg="No revenue data for this period"
          />

          {/* Product breakdown */}
          {!singleProduct && barSegments.length > 0 && (
            <div className={styles.productBar}>
              <div className={styles.productBarTrack}>
                {barSegments.map((seg) => (
                  <div
                    key={seg.productName}
                    className={styles.productBarSeg}
                    style={{ width: `${seg.percentage}%`, background: seg.color }}
                    title={`${seg.productName}: ${seg.percentage}%`}
                  />
                ))}
              </div>
              <div className={styles.productBarLegend}>
                {barSegments.map((seg) => (
                  <div key={seg.productName} className={styles.productBarLegendItem}>
                    <span className={styles.productBarDot} style={{ background: seg.color }} />
                    <span className={styles.productBarName}>{seg.productName}</span>
                    {seg.revenue != null && (
                      <span className={styles.productBarRevenue}>{formatRevenue(seg.revenue, currency)}</span>
                    )}
                    <span className={styles.productBarPct}>{seg.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 3: Four stat cards ──────────────────────────────────────── */}
      <div className={styles.statRow}>

        <div className={styles.statCard}>
          <div className={styles.statCardTop}>
            <span className={styles.statLabel}>Total Revenue</span>
            {showComparison && !allNew && <CompareChip current={totalRevenue} previous={prevRevenue} />}
          </div>
          <span className={styles.statValue}>{formatRevenue(totalRevenue, currency)}</span>
          <span className={styles.statNote}>Paid orders</span>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardTop}>
            <span className={styles.statLabel}>Orders</span>
            {showComparison && !allNew && <CompareChip current={totalOrders} previous={prevOrders} />}
          </div>
          <span className={styles.statValue}>{totalOrders.toLocaleString()}</span>
          <span className={styles.statNote}>Paid orders</span>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardTop}>
            <span className={styles.statLabel}>Page Views</span>
            {showComparison && !allNew && <CompareChip current={totalViews} previous={prevViews} />}
          </div>
          <span className={styles.statValue}>{totalViews.toLocaleString()}</span>
          <span className={styles.statNote}>{uniqueVisitors.toLocaleString()} unique</span>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardTop}>
            <span className={styles.statLabel}>Conversion Rate</span>
            {showComparison && !allNew && <CompareChip current={displayConvRate} previous={prevDisplayConvRate} />}
          </div>
          <span className={styles.statValue}>{displayConvRate.toFixed(1)}%</span>
          <span className={styles.statNote}>
            {uniqueBuyers.toLocaleString()} buyer{uniqueBuyers !== 1 ? "s" : ""}
            {lowSample ? " (low sample)" : ""}
          </span>
        </div>

      </div>

      {/* ── ROW 4: Countries + Customer Insights ───────────────────────── */}
      <div className={styles.twoCol}>

        {/* Left: Top Countries */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.sectionHeading}>Top Countries</h2>
            {geography.length > 0 && (
              <span className={styles.cardHeaderSub}>
                {geography.length} countr{geography.length === 1 ? "y" : "ies"}
              </span>
            )}
          </div>
          {geography.length === 0 ? (
            <div className={styles.emptyState}>No visitor location data yet.</div>
          ) : (
            <table className={styles.geoTable}>
              <thead>
                <tr>
                  <th className={styles.geoTh} colSpan={2}>Country</th>
                  <th className={`${styles.geoTh} ${styles.geoThNum}`}>Views</th>
                  <th className={`${styles.geoTh} ${styles.geoThNum}`}>Orders</th>
                  <th className={`${styles.geoTh} ${styles.geoThNum}`}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {geography.slice(0, 10).map((c) => (
                  <tr key={c.country} className={styles.geoRow}>
                    <td className={styles.geoFlag}>{COUNTRY_FLAGS[c.country] || "🌍"}</td>
                    <td className={styles.geoName}>{COUNTRY_NAMES[c.country] || c.country}</td>
                    <td className={`${styles.geoNum} ${styles.geoMuted}`}>{(c.views || 0).toLocaleString()}</td>
                    <td className={styles.geoNum}>{(c.orders || 0).toLocaleString()}</td>
                    <td className={styles.geoNum}>{formatRevenue(c.revenue || 0, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right: Customer Insights (conversion funnel + customer types) */}
        <div className={styles.card}>

          <h2 className={styles.sectionHeading}>Conversion Rate</h2>
          {uniqueBuyers > uniqueVisitors ? (
            <div className={styles.convNoData}>
              <p className={styles.convNoDataMain}>Not enough data yet</p>
              <p className={styles.convNoDataSub}>Conversion tracking will appear once you have more visitor data</p>
            </div>
          ) : (
            <>
              <p className={styles.convVisitors}>
                {uniqueVisitors.toLocaleString()} visitors · {uniqueBuyers.toLocaleString()} buyer{uniqueBuyers !== 1 ? "s" : ""}
              </p>
              <ConversionFunnel
                visitors={uniqueVisitors}
                buyers={uniqueBuyers}
                convRate={displayConvRate}
                lowSample={lowSample}
                dataQualityIssue={false}
              />
            </>
          )}

          <div className={styles.cardDivider} />

          <h2 className={styles.sectionHeading}>Customer Types</h2>
          <CustomerDonut
            firstTimeBuyers={customerBreakdown.firstTimeBuyers}
            repeatBuyers={customerBreakdown.repeatBuyers}
          />

          {(customerBreakdown.registeredBuyers > 0 || customerBreakdown.guestBuyers > 0) && (
            <>
              <div className={styles.cardDivider} />
              <h2 className={styles.sectionHeading}>Purchase Method</h2>
              <PurchaseMethodBar
                registeredBuyers={customerBreakdown.registeredBuyers}
                guestBuyers={customerBreakdown.guestBuyers}
              />
            </>
          )}

        </div>

      </div>

    </div>
  );
}
