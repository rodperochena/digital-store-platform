import { useState } from "react";
import styles from "./SimpleChart.module.css";

/**
 * Reusable SVG chart component.
 * type="line"  — smooth area + line + dot sparkline
 * type="bar"   — horizontal bar chart for category data
 *
 * data: [{ label: string, value: number }]
 *
 * showArea (boolean, default false) — gradient area fill below the line
 */

// Catmull-Rom smooth line path through all points
function smoothLinePath(pts) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cur  = pts[i];
    const nxt  = pts[i + 1];
    const cpx  = (cur.x + nxt.x) / 2;
    d += ` C ${cpx} ${cur.y}, ${cpx} ${nxt.y}, ${nxt.x} ${nxt.y}`;
  }
  return d;
}

function smoothAreaPath(pts, floorY) {
  if (pts.length < 2) return "";
  const last = pts[pts.length - 1];
  return `${smoothLinePath(pts)} L ${last.x} ${floorY} L ${pts[0].x} ${floorY} Z`;
}

export default function SimpleChart({
  type = "line",
  data = [],
  width = 600,
  height = 200,
  color = "var(--color-accent)",
  fillOpacity = 0.12,
  showLabels = true,
  showArea = false,
  formatValue = (v) => String(v),
  emptyMsg = "No data for this period",
  xLabelInterval = null,
  dotRadius = null,
}) {
  const [tooltip, setTooltip] = useState(null); // { i, x, y, label, value }
  const [gradId] = useState(() => `ag${Math.random().toString(36).slice(2, 9)}`);

  const nonEmpty = data.filter((d) => d.value > 0);
  if (!data.length || !nonEmpty.length) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📊</span>
        <p>{emptyMsg}</p>
      </div>
    );
  }

  // ── Line chart ─────────────────────────────────────────────────────────────

  if (type === "line") {
    const padL = 8, padR = 8, padT = 24, padB = showLabels ? 28 : 8;
    const cW   = width  - padL - padR;
    const cH   = height - padT - padB;
    const n    = data.length;
    const max  = Math.max(...data.map((d) => d.value), 1);

    const px = (i) => padL + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
    const py = (v)  => padT + (1 - v / max) * cH;

    const points      = data.map((d, i) => ({ x: px(i), y: py(d.value), ...d }));
    const linePath    = smoothLinePath(points);
    const areaPath    = smoothAreaPath(points, padT + cH);

    const baseR       = dotRadius != null && dotRadius > 0 ? dotRadius : 3;
    const labelEvery  = xLabelInterval != null ? xLabelInterval : Math.ceil(n / 7);

    // Horizontal grid lines — 4 evenly spaced ticks
    const gridTicks = [0.25, 0.5, 0.75, 1].map((r) => padT + (1 - r) * cH);

    return (
      <div className={styles.wrap}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className={styles.svg}
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity="0.18" />
              <stop offset="85%"  stopColor={color} stopOpacity="0.04" />
              <stop offset="100%" stopColor={color} stopOpacity="0"    />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {gridTicks.map((y, i) => (
            <line
              key={i}
              x1={padL} y1={y}
              x2={width - padR} y2={y}
              stroke="#f0f0f0"
              strokeWidth="1"
            />
          ))}

          {/* Area fill */}
          {(showArea || fillOpacity > 0) && (
            <path
              d={areaPath}
              fill={`url(#${gradId})`}
              stroke="none"
            />
          )}

          {/* Smooth line */}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots + hover targets */}
          {points.map((p, i) => {
            const hovered = tooltip?.i === i;
            return (
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hovered ? baseR + 2.5 : baseR}
                  fill="#ffffff"
                  stroke={color}
                  strokeWidth="2"
                  style={{ transition: "r 0.12s ease" }}
                />
                {/* Wider invisible hit target */}
                <rect
                  x={p.x - 14}
                  y={padT}
                  width={28}
                  height={cH}
                  fill="transparent"
                  onMouseEnter={() => setTooltip({ i, x: p.x, y: p.y, label: p.label, value: p.value })}
                />
              </g>
            );
          })}

          {/* X-axis labels */}
          {showLabels && points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text
                key={i}
                x={p.x}
                y={height - 4}
                textAnchor="middle"
                className={styles.axisLabel}
              >
                {String(p.label).slice(-5)}
              </text>
            ) : null
          )}

          {/* Tooltip */}
          {tooltip && (
            <g>
              {/* Dashed vertical rule */}
              <line
                x1={tooltip.x} y1={padT}
                x2={tooltip.x} y2={padT + cH}
                stroke={color}
                strokeWidth="1"
                strokeDasharray="4,4"
                opacity="0.35"
              />
              {/* Dark card */}
              <rect
                x={tooltip.x < width / 2 ? tooltip.x + 10 : tooltip.x - 106}
                y={Math.max(padT + 2, tooltip.y - 42)}
                width={96}
                height={46}
                rx="6"
                fill="#111827"
                opacity="0.92"
              />
              {/* Date label */}
              <text
                x={tooltip.x < width / 2 ? tooltip.x + 58 : tooltip.x - 58}
                y={Math.max(padT + 2, tooltip.y - 42) + 16}
                textAnchor="middle"
                className={styles.tooltipLabel}
              >
                {String(tooltip.label).slice(-10)}
              </text>
              {/* Value */}
              <text
                x={tooltip.x < width / 2 ? tooltip.x + 58 : tooltip.x - 58}
                y={Math.max(padT + 2, tooltip.y - 42) + 34}
                textAnchor="middle"
                className={styles.tooltipValue}
              >
                {formatValue(tooltip.value)}
              </text>
            </g>
          )}
        </svg>
      </div>
    );
  }

  // ── Horizontal bar chart ───────────────────────────────────────────────────

  if (type === "bar") {
    const barH   = Math.min(28, Math.floor((height - 8) / data.length));
    const totalH = data.length * barH;
    const labelW = 110;
    const valueW = 60;
    const barW   = width - labelW - valueW - 16;
    const max    = Math.max(...data.map((d) => d.value), 1);

    return (
      <div className={styles.wrap}>
        <svg
          viewBox={`0 0 ${width} ${totalH}`}
          className={styles.svg}
          style={{ height: `${Math.min(totalH, height)}px` }}
        >
          {data.map((d, i) => {
            const fill = Math.round((d.value / max) * barW);
            const y    = i * barH;
            const mid  = y + barH / 2;
            return (
              <g key={i}>
                <text x={labelW - 8} y={mid + 5} textAnchor="end" className={styles.barLabel}>
                  {String(d.label).length > 14 ? String(d.label).slice(0, 13) + "…" : d.label}
                </text>
                <rect x={labelW} y={y + 3} width={Math.max(fill, 2)} height={barH - 8} rx="3" fill={color} opacity="0.75" />
                <text x={labelW + fill + 6} y={mid + 5} className={styles.barValue}>
                  {formatValue(d.value)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  return null;
}
