import { useState } from "react";
import styles from "./WorldMap.module.css";

// Approximate center coordinates for major countries (lat, lng)
const COORDS = {
  US:{lat:37.1,lng:-95.7,name:"United States"},
  CA:{lat:56.1,lng:-106.3,name:"Canada"},
  MX:{lat:23.6,lng:-102.6,name:"Mexico"},
  BR:{lat:-14.2,lng:-51.9,name:"Brazil"},
  AR:{lat:-38.4,lng:-63.6,name:"Argentina"},
  CL:{lat:-35.7,lng:-71.5,name:"Chile"},
  CO:{lat:4.6,lng:-74.1,name:"Colombia"},
  PE:{lat:-9.2,lng:-75.0,name:"Peru"},
  GB:{lat:55.4,lng:-3.4,name:"United Kingdom"},
  IE:{lat:53.1,lng:-8.2,name:"Ireland"},
  FR:{lat:46.2,lng:2.2,name:"France"},
  DE:{lat:51.2,lng:10.4,name:"Germany"},
  ES:{lat:40.5,lng:-3.7,name:"Spain"},
  IT:{lat:41.9,lng:12.6,name:"Italy"},
  NL:{lat:52.1,lng:5.3,name:"Netherlands"},
  BE:{lat:50.5,lng:4.5,name:"Belgium"},
  PT:{lat:39.4,lng:-8.2,name:"Portugal"},
  SE:{lat:60.1,lng:18.6,name:"Sweden"},
  NO:{lat:60.5,lng:8.5,name:"Norway"},
  DK:{lat:56.3,lng:9.5,name:"Denmark"},
  FI:{lat:61.9,lng:25.7,name:"Finland"},
  PL:{lat:51.9,lng:19.1,name:"Poland"},
  CH:{lat:46.8,lng:8.2,name:"Switzerland"},
  AT:{lat:47.5,lng:14.6,name:"Austria"},
  CZ:{lat:49.8,lng:15.5,name:"Czech Republic"},
  RO:{lat:45.9,lng:24.9,name:"Romania"},
  HU:{lat:47.2,lng:19.5,name:"Hungary"},
  GR:{lat:39.1,lng:21.8,name:"Greece"},
  UA:{lat:48.4,lng:31.2,name:"Ukraine"},
  RU:{lat:61.5,lng:105.3,name:"Russia"},
  TR:{lat:38.9,lng:35.2,name:"Turkey"},
  SA:{lat:23.9,lng:45.1,name:"Saudi Arabia"},
  AE:{lat:23.4,lng:53.8,name:"UAE"},
  IL:{lat:31.0,lng:34.9,name:"Israel"},
  EG:{lat:26.8,lng:30.8,name:"Egypt"},
  NG:{lat:9.1,lng:8.7,name:"Nigeria"},
  ZA:{lat:-30.6,lng:22.9,name:"South Africa"},
  KE:{lat:-0.0,lng:37.9,name:"Kenya"},
  IN:{lat:20.6,lng:78.9,name:"India"},
  PK:{lat:30.4,lng:69.3,name:"Pakistan"},
  BD:{lat:23.7,lng:90.4,name:"Bangladesh"},
  CN:{lat:35.9,lng:104.2,name:"China"},
  JP:{lat:36.2,lng:138.3,name:"Japan"},
  KR:{lat:35.9,lng:127.8,name:"South Korea"},
  TW:{lat:23.7,lng:121.0,name:"Taiwan"},
  HK:{lat:22.4,lng:114.1,name:"Hong Kong"},
  SG:{lat:1.4,lng:103.8,name:"Singapore"},
  MY:{lat:4.2,lng:108.0,name:"Malaysia"},
  ID:{lat:-0.8,lng:113.9,name:"Indonesia"},
  TH:{lat:15.9,lng:100.9,name:"Thailand"},
  VN:{lat:14.1,lng:108.3,name:"Vietnam"},
  PH:{lat:12.9,lng:121.8,name:"Philippines"},
  AU:{lat:-25.3,lng:133.8,name:"Australia"},
  NZ:{lat:-40.9,lng:174.9,name:"New Zealand"},
};

const W = 960, H = 460;

function lngToX(lng) { return ((lng + 180) / 360) * W; }
function latToY(lat) { return ((90 - lat) / 180) * H; }

function countToColor(count, max) {
  if (!count || !max) return "#E5E7EB";
  const t = count / max;
  if (t < 0.1) return "#DBEAFE";
  if (t < 0.3) return "#93C5FD";
  if (t < 0.6) return "#3B82F6";
  return "#1E40AF";
}

function countToRadius(count, max) {
  if (!count || !max) return 4;
  return 4 + Math.round((count / max) * 14);
}

export default function WorldMap({ data = [] }) {
  const [tooltip, setTooltip] = useState(null);

  // Build lookup: country code → { count, pct }
  const total = data.reduce((s, d) => s + d.count, 0);
  const max   = Math.max(...data.map((d) => d.count), 1);
  const lookup = new Map(data.map((d) => [d.country, d]));

  const dots = Object.entries(COORDS).map(([code, info]) => {
    const entry = lookup.get(code);
    return {
      code,
      name:  info.name,
      x:     lngToX(info.lng),
      y:     latToY(info.lat),
      count: entry?.count ?? 0,
    };
  });

  // Sort: lower counts first so high-count dots render on top
  dots.sort((a, b) => a.count - b.count);

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Ocean background */}
        <rect x={0} y={0} width={W} height={H} fill="#F0F9FF" rx="6" />

        {/* Subtle grid lines */}
        {[-60,-30,0,30,60].map((lat) => (
          <line key={lat} x1={0} y1={latToY(lat)} x2={W} y2={latToY(lat)}
            stroke="#CBD5E1" strokeWidth="0.5" strokeDasharray="4,4" />
        ))}
        {[-120,-60,0,60,120].map((lng) => (
          <line key={lng} x1={lngToX(lng)} y1={0} x2={lngToX(lng)} y2={H}
            stroke="#CBD5E1" strokeWidth="0.5" strokeDasharray="4,4" />
        ))}

        {/* Equator */}
        <line x1={0} y1={latToY(0)} x2={W} y2={latToY(0)}
          stroke="#94A3B8" strokeWidth="1" />

        {/* Country dots */}
        {dots.map(({ code, name, x, y, count }) => {
          const r     = countToRadius(count, max);
          const fill  = countToColor(count, max);
          const pct   = total ? Math.round((count / total) * 100) : 0;
          return (
            <circle
              key={code}
              cx={x} cy={y} r={r}
              fill={fill}
              stroke={count > 0 ? "#fff" : "#D1D5DB"}
              strokeWidth={count > 0 ? 1.5 : 0.5}
              opacity={count > 0 ? 0.9 : 0.4}
              style={{ cursor: count > 0 ? "pointer" : "default" }}
              onMouseEnter={(e) => {
                if (count > 0) setTooltip({ code, name, count, pct, x, y });
              }}
            />
          );
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const tx = tooltip.x > W * 0.75 ? tooltip.x - 120 : tooltip.x + 10;
          const ty = tooltip.y > H * 0.75 ? tooltip.y - 58  : tooltip.y + 10;
          return (
            <g>
              <rect x={tx} y={ty} width={114} height={52} rx="5"
                fill="var(--color-text)" opacity="0.92" />
              <text x={tx + 57} y={ty + 17} textAnchor="middle" className={styles.ttCountry}>
                {tooltip.name}
              </text>
              <text x={tx + 57} y={ty + 32} textAnchor="middle" className={styles.ttCount}>
                {tooltip.count.toLocaleString()} views
              </text>
              <text x={tx + 57} y={ty + 46} textAnchor="middle" className={styles.ttPct}>
                {tooltip.pct}% of traffic
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Legend */}
      <div className={styles.legend}>
        {["No data","Low","Medium","High"].map((label, i) => (
          <span key={label} className={styles.legendItem}>
            <span
              className={styles.legendDot}
              style={{ background: ["#E5E7EB","#93C5FD","#3B82F6","#1E40AF"][i] }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
