import { big } from '@siteflow/shared';

// Small SVG charts in the prototype's style. Colours are CSS variables, so light and dark mode each
// use their own steps. Every chart has a text alternative and numbers beside it, so colour is
// never the only way to read it.

// Trend line under a KPI tile (decorative: the tile states the number)
export function Spark({ data, color = 'var(--brass)' }) {
  if (!data || data.length < 2) return null;
  const mx = Math.max(...data), mn = Math.min(...data);
  const x = (i) => i * (110 / (data.length - 1));
  const y = (v) => 30 - ((v - mn) / ((mx - mn) || 1)) * 26;
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="tspark" viewBox="0 0 110 34" aria-hidden="true">
      <polygon points={`0,34 ${pts} 110,34`} fill={color} opacity=".12" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Progress ring with the percentage in the middle
export function Ring({ pct = 0, size = 58 }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 36 36" role="img" aria-label={`${p}% complete`}>
      <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--line)" strokeWidth="3" />
      {p > 0 && <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--brass)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${p} 100`} transform="rotate(-90 18 18)" />}
      <text x="18" y="21" textAnchor="middle">{p}%</text>
    </svg>
  );
}

// Weekly spend: one bar per week, a dashed line for the planned weekly spend (when there is a plan).
// Weeks more than 10% over plan are red.
export function SpendChart({ weeks, plan }) {
  const W = 640, H = 230, L = 48, B = 28, T = 14;
  const top = niceTop(Math.max(1, plan || 0, ...weeks.map((w) => w.total)) * 1.1);
  const ticks = [0, top / 4, top / 2, (top * 3) / 4, top];
  const cw = (W - L - 10) / weeks.length;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const over = (v) => plan && v > plan * 1.1;
  return (
    <svg className="chart2" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Spend per week for the last ${weeks.length} weeks${plan ? `, against a planned ${big(plan)} per week` : ''}: ${weeks.map((w) => `week of ${w.label} ${big(w.total)}`).join(', ')}`}>
      {ticks.map((v) => (
        <g key={v}><line x1={L} x2={W - 6} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 8} y={y(v) + 3.5} textAnchor="end">{short(v)}</text></g>
      ))}
      {weeks.map((w, i) => {
        const x = L + i * cw + cw * 0.22;
        const h = y(0) - y(w.total);
        return (
          <g key={w.start}>
            {w.total > 0 && <path d={bar(x, y(w.total), cw * 0.56, h)} fill={over(w.total) ? 'var(--bad)' : 'var(--c-done)'} opacity={i === weeks.length - 1 ? 1 : 0.85}>
              <title>{`Week of ${w.label}: ${big(w.total)}${over(w.total) ? ' (above plan)' : ''}`}</title>
            </path>}
            <text x={x + cw * 0.28} y={H - 10} textAnchor="middle">{w.label}</text>
          </g>
        );
      })}
      {plan ? (
        <>
          <line x1={L} x2={W - 6} y1={y(plan)} y2={y(plan)} stroke="var(--brass)" strokeWidth="2" strokeDasharray="5 4" />
          <rect x={L + 4} y={y(plan) - 19} width="118" height="16" rx="4" fill="var(--surface)" />
          <text x={L + 8} y={y(plan) - 7} style={{ fill: 'var(--brass)', fontWeight: 600 }}>Plan {big(plan)}/week</text>
        </>
      ) : null}
    </svg>
  );
}

// Where the money goes: ring of spending by category with the total in the middle, and the list beside it
const CAT_COLORS = ['var(--c-done)', 'var(--brass)', '#6F8594', '#C9B48C', 'var(--muted)', 'var(--line)'];
export function CostDonut({ parts }) {
  const total = parts.reduce((n, p) => n + p.amount, 0);
  // Five biggest, the rest folded into "Other"
  const shown = parts.length > 5 ? [...parts.slice(0, 5), { category: 'Other', amount: parts.slice(5).reduce((n, p) => n + p.amount, 0) }] : parts;
  let acc = 0;
  return (
    <div className="donutwrap">
      <svg width="150" height="150" viewBox="0 0 42 42" role="img" aria-label={`Spending by category: ${shown.map((p) => `${p.category} ${big(p.amount)}`).join(', ')}`}>
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--sunk)" strokeWidth="5.5" />
        {total > 0 && shown.map((p, i) => {
          const f = (p.amount / total) * 100;
          const seg = <circle key={p.category} cx="21" cy="21" r="15.9155" fill="none" stroke={CAT_COLORS[i]} strokeWidth="5.5"
            strokeDasharray={`${Math.max(f - (shown.length > 1 ? 0.8 : 0), 0.1)} ${100 - f + (shown.length > 1 ? 0.8 : 0)}`} strokeDashoffset={25 - acc}><title>{`${p.category}: ${big(p.amount)}`}</title></circle>;
          acc += f;
          return seg;
        })}
        <text x="21" y="20" textAnchor="middle" style={{ fontSize: 3.2, fill: 'var(--muted)' }}>Spent</text>
        <text x="21" y="25" textAnchor="middle" style={{ fontSize: 4.2, fontWeight: 700, fill: 'var(--ink)' }}>{big(total)}</text>
      </svg>
      <ul className="dlist">
        {shown.map((p, i) => <li key={p.category}><i style={{ background: CAT_COLORS[i] }} />{p.category}<b>{big(p.amount)}</b></li>)}
      </ul>
    </div>
  );
}

// Round the axis top up to 1, 2 or 5 times a power of ten
function niceTop(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v) || 10 * p;
}
const short = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}m` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${Math.round(v)}`);

// Bar with 4px rounded top corners, flat on the baseline
function bar(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
