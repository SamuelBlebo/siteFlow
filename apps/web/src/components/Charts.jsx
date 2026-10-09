import { useState } from 'react';

// Small SVG charts for the dashboard. Colours come from CSS variables (--c-*) so light and dark
// mode each use their own steps. Every chart has a legend or labels with the numbers, so colour
// is never the only way to read it.

const R = 52, STROKE = 16, C = 2 * Math.PI * R, GAP = 2.5;

// Part of a whole (≤ 5 parts): ring with the total in the middle; hovering a part shows it there
export function Donut({ title, parts, total, totalLabel, empty = 'Nothing yet.' }) {
  const [on, setOn] = useState(null);
  const sum = parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  let at = 0;
  const active = on != null ? parts[on] : null;
  return (
    <figure className="donut">
      <h3>{title}</h3>
      <div className="donut-plot">
        <svg viewBox="0 0 140 140" role="img" aria-label={`${title}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
          <circle cx="70" cy="70" r={R} className="donut-track" strokeWidth={STROKE} />
          {sum > 0 && shown.map((p) => {
            const i = parts.indexOf(p);
            const len = (p.value / sum) * C;
            const dash = shown.length > 1 ? Math.max(len - GAP, 0.5) : len;
            const seg = (
              <circle key={p.label} cx="70" cy="70" r={R} fill="none" strokeWidth={on === i ? STROKE + 4 : STROKE}
                style={{ stroke: p.color }} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-at}
                transform="rotate(-90 70 70)" className="donut-seg" tabIndex={0}
                onMouseEnter={() => setOn(i)} onMouseLeave={() => setOn(null)} onFocus={() => setOn(i)} onBlur={() => setOn(null)}>
                <title>{`${p.label}: ${p.value} (${Math.round((p.value / sum) * 100)}%)`}</title>
              </circle>
            );
            at += len;
            return seg;
          })}
        </svg>
        <div className="donut-center" aria-hidden="true">
          <b>{active ? active.value : (total ?? sum)}</b>
          <span>{active ? active.label : totalLabel}</span>
        </div>
      </div>
      <figcaption>
        {sum === 0 ? <p className="muted small">{empty}</p> : (
          <ul className="legend">
            {parts.map((p, i) => (
              <li key={p.label} className={on === i ? 'on' : ''} onMouseEnter={() => setOn(i)} onMouseLeave={() => setOn(null)}>
                <i style={{ background: p.color }} />{p.label}<b>{p.value}</b><small className="muted">{Math.round((p.value / sum) * 100)}%</small>
              </li>
            ))}
          </ul>
        )}
      </figcaption>
    </figure>
  );
}

// One ratio against a whole (budget used, reports sent): a ring meter, same hue on its track
export function Gauge({ title, pct, value, note, hot }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const len = (p / 100) * C;
  return (
    <figure className="donut gauge">
      <h3>{title}</h3>
      <div className="donut-plot">
        <svg viewBox="0 0 140 140" role="img" aria-label={`${title}: ${value}`}>
          <circle cx="70" cy="70" r={R} className="donut-track" strokeWidth={STROKE} />
          {p > 0 && <circle cx="70" cy="70" r={R} fill="none" strokeWidth={STROKE} strokeLinecap="round" className={hot ? 'gauge-hot' : 'gauge-fill'}
            strokeDasharray={`${len} ${C - len}`} transform="rotate(-90 70 70)" />}
        </svg>
        <div className="donut-center" aria-hidden="true"><b>{value}</b></div>
      </div>
      {note && <figcaption><p className="muted small">{note}</p></figcaption>}
    </figure>
  );
}

// Columns over time with a recessive grid, sparse date labels and a hover tooltip per column
export function Columns({ title, data, unit, label = (d) => d.label }) {
  const [on, setOn] = useState(null);
  const W = 560, H = 180, L = 30, B = 22, T = 10;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const ticks = [0, top / 2, top];
  const bw = (W - L) / data.length;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const every = Math.ceil(data.length / 7);
  const d = on != null ? data[on] : null;
  return (
    <figure className="columns">
      <h3>{title}</h3>
      <div className="columns-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${data.map((x) => `${label(x)} ${x.value}`).join(', ')}`}>
          {ticks.map((t) => <g key={t}><line x1={L} x2={W} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 6} y={y(t) + 4} textAnchor="end">{Math.round(t)}</text></g>)}
          {data.map((x, i) => {
            const h = y(0) - y(x.value);
            const cx = L + i * bw;
            return (
              <g key={x.key} onMouseEnter={() => setOn(i)} onMouseLeave={() => setOn(null)}>
                <rect x={cx} y={T} width={bw} height={H - T - B} fill="transparent" />
                {x.value > 0 && <path className={`col ${on === i ? 'on' : ''}`} d={bar(cx + bw * 0.2, y(x.value), bw * 0.6, h)} />}
                {i % every === (data.length - 1) % every && <text x={cx + bw / 2} y={H - 6} textAnchor="middle">{label(x)}</text>}
              </g>
            );
          })}
        </svg>
        {d && (
          <div className="tip" style={{ left: `${((L + (on + 0.5) * bw) / W) * 100}%` }}>
            <b>{d.value} {unit}</b><span>{d.tip}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

// Column with a 4px rounded top, flat on the baseline
function bar(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
