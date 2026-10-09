// Draws the sample projects' drawings (architect-style SVG sheets) and writes where their marked
// areas and issue pins go, so the pictures and the sample data always match.
//   node scripts/demo-drawings.mjs   then   node scripts/demo-drawings-png.mjs  (PNG copies via Chrome)
// Output: apps/web/public/demo/plans/*.svg and packages/shared/src/demoDrawings.ts (generated).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'apps/web/public/demo/plans');
mkdirSync(OUT, { recursive: true });

const W = 1680; const H = 1188; // A3 landscape proportions
const INK = '#1b1f23';
const f2 = (n) => Math.round(n * 100) / 100;
const fr = (n, of) => Math.round((n / of) * 10000) / 10000;

function sheet({ body, number, title, scale, project, client, discipline }) {
  // Border, title block (bottom right), revision box, notes
  const tb = { x: W - 520, y: H - 210, w: 480, h: 170 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, Helvetica, sans-serif">
<defs>
  <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#e9ecef"/><line x1="0" y1="0" x2="0" y2="8" stroke="${INK}" stroke-width="1.4"/></pattern>
  <pattern id="slab" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="14" stroke="#9aa5ae" stroke-width="0.7"/></pattern>
  <marker id="tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto"><line x1="1" y1="9" x2="9" y2="1" stroke="${INK}" stroke-width="1.3"/></marker>
</defs>
<rect width="${W}" height="${H}" fill="#fff"/>
<rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${INK}" stroke-width="3"/>
<rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${INK}" stroke-width="0.8"/>
${body}
<g font-size="13" fill="${INK}">
  <rect x="${tb.x}" y="${tb.y}" width="${tb.w}" height="${tb.h}" fill="#fff" stroke="${INK}" stroke-width="2"/>
  <line x1="${tb.x}" y1="${tb.y + 44}" x2="${tb.x + tb.w}" y2="${tb.y + 44}" stroke="${INK}"/>
  <line x1="${tb.x}" y1="${tb.y + 96}" x2="${tb.x + tb.w}" y2="${tb.y + 96}" stroke="${INK}"/>
  <line x1="${tb.x}" y1="${tb.y + 133}" x2="${tb.x + tb.w}" y2="${tb.y + 133}" stroke="${INK}"/>
  <line x1="${tb.x + 160}" y1="${tb.y + 133}" x2="${tb.x + 160}" y2="${tb.y + tb.h}" stroke="${INK}"/>
  <line x1="${tb.x + 320}" y1="${tb.y + 133}" x2="${tb.x + 320}" y2="${tb.y + tb.h}" stroke="${INK}"/>
  <text x="${tb.x + 12}" y="${tb.y + 18}" font-size="10" fill="#555">PROJECT</text>
  <text x="${tb.x + 12}" y="${tb.y + 36}" font-size="16" font-weight="700">${project}</text>
  <text x="${tb.x + 12}" y="${tb.y + 62}" font-size="10" fill="#555">DRAWING</text>
  <text x="${tb.x + 12}" y="${tb.y + 86}" font-size="20" font-weight="700">${title}</text>
  <text x="${tb.x + 12}" y="${tb.y + 112}" font-size="10" fill="#555">CLIENT</text>
  <text x="${tb.x + 12}" y="${tb.y + 127}" font-size="13">${client}</text>
  <text x="${tb.x + 300}" y="${tb.y + 112}" font-size="10" fill="#555">DISCIPLINE</text>
  <text x="${tb.x + 300}" y="${tb.y + 127}" font-size="13">${discipline}</text>
  <text x="${tb.x + 12}" y="${tb.y + 148}" font-size="10" fill="#555">SCALE</text>
  <text x="${tb.x + 12}" y="${tb.y + 164}">${scale}</text>
  <text x="${tb.x + 172}" y="${tb.y + 148}" font-size="10" fill="#555">STATUS</text>
  <text x="${tb.x + 172}" y="${tb.y + 164}" font-weight="700">FOR CONSTRUCTION</text>
  <text x="${tb.x + 332}" y="${tb.y + 148}" font-size="10" fill="#555">SHEET / REV</text>
  <text x="${tb.x + 332}" y="${tb.y + 165}" font-size="17" font-weight="700">${number}  C</text>
  <text x="${tb.x}" y="${tb.y - 10}" font-size="11" fill="#666">Sample drawing made for SiteFlow. Not for construction.</text>
</g>
</svg>`;
}

function northArrow(x, y) {
  return `<g transform="translate(${x},${y})" fill="${INK}" stroke="${INK}"><circle r="34" fill="none" stroke-width="1.5"/><path d="M0 -30 L12 18 L0 8 L-12 18 Z"/><text y="-40" text-anchor="middle" font-size="16" font-weight="700" stroke="none">N</text></g>`;
}
function scaleBar(x, y, px, label) {
  const seg = px / 5;
  let s = `<g transform="translate(${x},${y})" font-size="11" fill="${INK}">`;
  for (let i = 0; i < 5; i++) s += `<rect x="${i * seg}" y="0" width="${seg}" height="8" fill="${i % 2 ? '#fff' : INK}" stroke="${INK}"/>`;
  return `${s}<text x="0" y="24">0</text><text x="${px}" y="24" text-anchor="end">${label}</text></g>`;
}
function dimH(x1, x2, y, label, ext = 0) {
  return `<g stroke="${INK}" stroke-width="0.9" fill="${INK}" font-size="12"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-start="url(#tick)" marker-end="url(#tick)"/>`
    + (ext ? `<line x1="${x1}" y1="${y - 6}" x2="${x1}" y2="${y + ext}" stroke-width="0.5"/><line x1="${x2}" y1="${y - 6}" x2="${x2}" y2="${y + ext}" stroke-width="0.5"/>` : '')
    + `<text x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="middle" stroke="none">${label}</text></g>`;
}
function dimV(y1, y2, x, label, ext = 0) {
  return `<g stroke="${INK}" stroke-width="0.9" fill="${INK}" font-size="12"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" marker-start="url(#tick)" marker-end="url(#tick)"/>`
    + (ext ? `<line x1="${x - 6}" y1="${y1}" x2="${x + ext}" y2="${y1}" stroke-width="0.5"/><line x1="${x - 6}" y1="${y2}" x2="${x + ext}" y2="${y2}" stroke-width="0.5"/>` : '')
    + `<text transform="translate(${x - 8},${(y1 + y2) / 2}) rotate(-90)" text-anchor="middle" stroke="none">${label}</text></g>`;
}
const bubble = (x, y, t) => `<g><circle cx="${x}" cy="${y}" r="15" fill="#fff" stroke="${INK}" stroke-width="1.3"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${INK}">${t}</text></g>`;

// ---------- 1. Adenta residence: ground floor plan ----------
function adenta() {
  const S = 58; const ox = 250; const oy = 200; // 1 m = 58 px
  const X = (m) => ox + m * S; const Y = (m) => oy + m * S;
  const L = 16; const D = 11; const t = 0.22; const ti = 0.15;
  let b = '';
  // outer walls (hatched ring)
  b += `<path d="M${X(0)} ${Y(0)}H${X(L)}V${Y(D)}H${X(0)}Z M${X(t)} ${Y(t)}V${Y(D - t)}H${X(L - t)}V${Y(t)}Z" fill="url(#hatch)" fill-rule="evenodd" stroke="${INK}" stroke-width="2"/>`;
  const wallV = (x, y1, y2) => `<rect x="${X(x - ti / 2)}" y="${Y(y1)}" width="${ti * S}" height="${(y2 - y1) * S}" fill="url(#hatch)" stroke="${INK}" stroke-width="1.2"/>`;
  const wallH = (y, x1, x2) => `<rect x="${X(x1)}" y="${Y(y - ti / 2)}" width="${(x2 - x1) * S}" height="${ti * S}" fill="url(#hatch)" stroke="${INK}" stroke-width="1.2"/>`;
  b += wallV(4, t, D - t) + wallV(9, t, D - t) + wallV(12.5, t, D - t);
  b += wallH(4.5, t, 4) + wallH(6.5, t, 4) + wallH(2.6 === 0 ? 0 : 7, 4, 9) + wallH(7, 9, L - t) + wallH(5, 12.5, L - t);
  b += `<rect x="${X(2.6 - ti / 2)}" y="${Y(4.5)}" width="${ti * S}" height="${2 * S}" fill="url(#hatch)" stroke="${INK}" stroke-width="1.2"/>`;
  // doors: opening (white) + leaf + swing
  const doorV = (x, y, w, dir = 1) => `<rect x="${X(x) - 8}" y="${Y(y)}" width="16" height="${w * S}" fill="#fff"/><line x1="${X(x)}" y1="${Y(y)}" x2="${X(x) + dir * w * S}" y2="${Y(y)}" stroke="${INK}" stroke-width="1.6"/><path d="M${X(x) + dir * w * S} ${Y(y)} A${w * S} ${w * S} 0 0 ${dir > 0 ? 1 : 0} ${X(x)} ${Y(y + w)}" fill="none" stroke="${INK}" stroke-width="0.8" stroke-dasharray="4 3"/>`;
  const doorH = (x, y, w, dir = 1) => `<rect x="${X(x)}" y="${Y(y) - 8}" width="${w * S}" height="16" fill="#fff"/><line x1="${X(x)}" y1="${Y(y)}" x2="${X(x)}" y2="${Y(y) + dir * w * S}" stroke="${INK}" stroke-width="1.6"/><path d="M${X(x)} ${Y(y) + dir * w * S} A${w * S} ${w * S} 0 0 ${dir > 0 ? 0 : 1} ${X(x + w)} ${Y(y)}" fill="none" stroke="${INK}" stroke-width="0.8" stroke-dasharray="4 3"/>`;
  b += doorV(4, 1.4, 0.9, -1) + doorV(4, 7.6, 0.9, -1) + doorH(2.7, 6.5, 0.8, -1) + doorV(12.5, 1.6, 0.9, 1) + doorH(13, 5, 0.8, 1) + doorV(9, 8.2, 0.9, -1) + doorV(12.5, 8.4, 0.9, 1);
  b += `<rect x="${X(10.2)}" y="${Y(D) - 12}" width="${1.4 * S}" height="24" fill="#fff"/><line x1="${X(10.2)}" y1="${Y(D)}" x2="${X(10.2)}" y2="${Y(D) - 1.4 * S}" stroke="${INK}" stroke-width="1.8"/><path d="M${X(10.2)} ${Y(D) - 1.4 * S} A${1.4 * S} ${1.4 * S} 0 0 1 ${X(11.6)} ${Y(D)}" fill="none" stroke="${INK}" stroke-width="0.8" stroke-dasharray="4 3"/>`;
  // windows on outer walls: opening + three lines
  const winH = (x, y, w) => `<rect x="${X(x)}" y="${Y(y) - (y === 0 ? 0 : t * S)}" width="${w * S}" height="${t * S}" fill="#fff" stroke="${INK}" stroke-width="1"/><line x1="${X(x)}" y1="${Y(y) + (y === 0 ? t * S / 2 : -t * S / 2)}" x2="${X(x + w)}" y2="${Y(y) + (y === 0 ? t * S / 2 : -t * S / 2)}" stroke="${INK}" stroke-width="1"/>`;
  const winV = (x, y, h) => `<rect x="${X(x) - (x === 0 ? 0 : t * S)}" y="${Y(y)}" width="${t * S}" height="${h * S}" fill="#fff" stroke="${INK}" stroke-width="1"/><line x1="${X(x) + (x === 0 ? t * S / 2 : -t * S / 2)}" y1="${Y(y)}" x2="${X(x) + (x === 0 ? t * S / 2 : -t * S / 2)}" y2="${Y(y + h)}" stroke="${INK}" stroke-width="1"/>`;
  b += winH(1, 0, 1.8) + winH(5.3, 0, 2.4) + winH(13.3, 0, 1.8) + winH(1, D, 1.8) + winH(5.3, D, 2.4) + winH(13.3, D, 1.8);
  b += winV(0, 1.6, 1.4) + winV(0, 7.8, 1.4) + winV(L, 1.6, 1.4) + winV(L, 8.2, 1.4) + winV(0, 5, 0.8);
  // stairs in the hall
  for (let i = 0; i < 12; i++) b += `<line x1="${X(9.4)}" y1="${Y(0.6 + i * 0.3)}" x2="${X(10.6)}" y2="${Y(0.6 + i * 0.3)}" stroke="${INK}" stroke-width="0.8"/>`;
  b += `<rect x="${X(9.4)}" y="${Y(0.6)}" width="${1.2 * S}" height="${3.6 * S}" fill="none" stroke="${INK}" stroke-width="1.2"/><line x1="${X(10)}" y1="${Y(4)}" x2="${X(10)}" y2="${Y(0.8)}" stroke="${INK}" stroke-width="1"/><path d="M${X(9.85)} ${Y(1.05)} L${X(10)} ${Y(0.75)} L${X(10.15)} ${Y(1.05)}" fill="none" stroke="${INK}"/><text x="${X(10)}" y="${Y(4.45)}" font-size="11" text-anchor="middle" fill="${INK}">UP</text>`;
  // kitchen worktop and sanitary
  b += `<path d="M${X(9.2)} ${Y(10.78)} V${Y(10.2)} H${X(12.3)} V${Y(10.78)}" fill="none" stroke="${INK}" stroke-width="1.2"/><rect x="${X(10.6)}" y="${Y(10.25)}" width="${0.8 * S}" height="${0.45 * S}" rx="6" fill="none" stroke="${INK}"/>`;
  b += `<rect x="${X(0.35)}" y="${Y(4.7)}" width="${0.7 * S}" height="${1.6 * S}" rx="8" fill="none" stroke="${INK}"/><ellipse cx="${X(2.1)}" cy="${Y(5)}" rx="14" ry="18" fill="none" stroke="${INK}"/>`;
  b += `<rect x="${X(14.9)}" y="${Y(5.2)}" width="${0.9 * S}" height="${1.6 * S}" rx="8" fill="none" stroke="${INK}"/>`;
  // room labels
  const room = (x, y, name, area) => `<text x="${X(x)}" y="${Y(y)}" text-anchor="middle" font-size="15" font-weight="700" fill="${INK}" letter-spacing="1">${name}</text><text x="${X(x)}" y="${Y(y) + 18}" text-anchor="middle" font-size="12" fill="#444">${area} m²</text>`;
  b += room(2, 2.3, 'BEDROOM 1', '17.5') + room(2, 8.9, 'BEDROOM 3', '17.5') + room(1.55, 5.85, 'BATH', '4.8') + room(6.5, 3.6, 'LIVING', '33.8') + room(6.5, 9.1, 'DINING', '19.4')
    + room(10.8, 5.6, 'HALL', '22.6') + room(10.8, 8.9, 'KITCHEN', '13.3') + room(14.25, 2.6, 'BEDROOM 2', '16.8') + room(14.25, 6.3, 'BATH 2', '6.3') + room(14.25, 9.1, 'STORE', '13.3');
  // grid, dimensions
  const gx = [0, 4, 9, 12.5, 16]; const gy = [0, 4.5, 7, 11];
  gx.forEach((g, i) => { b += `<line x1="${X(g)}" y1="${Y(-1.6)}" x2="${X(g)}" y2="${Y(-0.3)}" stroke="${INK}" stroke-width="0.6" stroke-dasharray="10 4 2 4"/>${bubble(X(g), Y(-1.85), 'ABCDE'[i])}`; });
  gy.forEach((g, i) => { b += `<line x1="${X(-1.6)}" y1="${Y(g)}" x2="${X(-0.3)}" y2="${Y(g)}" stroke="${INK}" stroke-width="0.6" stroke-dasharray="10 4 2 4"/>${bubble(X(-1.85), Y(g), i + 1)}`; });
  for (let i = 0; i < gx.length - 1; i++) b += dimH(X(gx[i]), X(gx[i + 1]), Y(D + 0.9), (gx[i + 1] - gx[i]).toFixed(2), 0);
  b += dimH(X(0), X(L), Y(D + 1.7), '16.00', 0);
  for (let i = 0; i < gy.length - 1; i++) b += dimV(Y(gy[i]), Y(gy[i + 1]), X(L + 0.9), (gy[i + 1] - gy[i]).toFixed(2), 0);
  b += dimV(Y(0), Y(D), X(L + 1.7), '11.00', 0);
  b += `<text x="${X(8)}" y="${Y(D + 3.1)}" text-anchor="middle" font-size="22" font-weight="700" fill="${INK}" letter-spacing="2">GROUND FLOOR PLAN</text><text x="${X(8)}" y="${Y(D + 3.1) + 20}" text-anchor="middle" font-size="13" fill="${INK}">SCALE 1:100 · ALL DIMENSIONS IN METRES</text>`;
  b += northArrow(W - 140, 140) + scaleBar(70, H - 70, 5 * S, '5 m');
  const zone = (name, stage, x1, y1, x2, y2) => ({ name, stage, x: fr(X(x1), W), y: fr(Y(y1), H), w: fr((x2 - x1) * S, W), h: fr((y2 - y1) * S, H) });
  return {
    svg: sheet({ body: b, number: 'A-101', title: 'GROUND FLOOR PLAN', scale: '1:100 @ A3', project: 'ADENTA 4-BEDROOM RESIDENCE', client: 'Mr and Mrs Addo', discipline: 'Architectural' }),
    meta: {
      key: 'adenta', file: 'adenta-a101', title: 'Ground floor plan', sheet: 'A-101', discipline: 'architectural', width: W, height: H,
      zones: [
        zone('West wing', 'Blockwork', 0, 0, 4, 11),
        zone('Living and dining', 'Lintel level', 4, 0, 9, 11),
        zone('Hall and stairs', 'Lintel level', 9, 0, 12.5, 7),
        zone('East wing', 'Lintel level', 12.5, 0, 16, 7),
        zone('Kitchen and store', 'First floor slab', 9, 7, 16, 11),
      ],
      pins: [{ issue: 0, x: fr(X(15.55), W), y: fr(Y(2.3), H) }],
    },
  };
}

// ---------- 2. East Legon offices: first floor structural layout ----------
function legon() {
  const S = 27; const ox = 210; const oy = 250; // 1 m = 27 px
  const X = (m) => ox + m * S; const Y = (m) => oy + m * S;
  const gx = [0, 7.5, 15, 22.5, 30, 37.5, 45]; const gy = [0, 6, 12, 18];
  const L = 45; const D = 18;
  let b = `<rect x="${X(0)}" y="${Y(0)}" width="${L * S}" height="${D * S}" fill="url(#slab)" stroke="${INK}" stroke-width="2.2"/>`;
  // beams (double lines) on every grid line
  for (const g of gx) b += `<rect x="${X(g) - 4}" y="${Y(0)}" width="8" height="${D * S}" fill="#fff" stroke="${INK}" stroke-width="1"/>`;
  for (const g of gy) b += `<rect x="${X(0)}" y="${Y(g) - 4}" width="${L * S}" height="8" fill="#fff" stroke="${INK}" stroke-width="1"/>`;
  for (const x of gx) for (const y of gy) b += `<rect x="${X(x) - 8}" y="${Y(y) - 8}" width="16" height="16" fill="${INK}"/>`;
  // stair and lift core between grids F-G, 2-3
  b += `<rect x="${X(37.7)}" y="${Y(6.2)}" width="${7.1 * S}" height="${5.6 * S}" fill="#fff" stroke="${INK}" stroke-width="3"/>`;
  for (let i = 0; i < 11; i++) b += `<line x1="${X(38.1 + i * 0.3)}" y1="${Y(6.6)}" x2="${X(38.1 + i * 0.3)}" y2="${Y(11.4)}" stroke="${INK}" stroke-width="0.8"/>`;
  b += `<rect x="${X(41.8)}" y="${Y(6.6)}" width="${2.6 * S}" height="${2.4 * S}" fill="none" stroke="${INK}" stroke-width="1.2"/><line x1="${X(41.8)}" y1="${Y(6.6)}" x2="${X(44.4)}" y2="${Y(9)}" stroke="${INK}"/><line x1="${X(44.4)}" y1="${Y(6.6)}" x2="${X(41.8)}" y2="${Y(9)}" stroke="${INK}"/>`;
  b += `<g text-anchor="middle" fill="${INK}"><text x="${X(43.15)}" y="${Y(10.05)}" font-size="11" font-weight="700">STAIR / LIFT</text><text x="${X(43.15)}" y="${Y(10.05) + 13}" font-size="11" font-weight="700">CORE</text><text x="${X(43.15)}" y="${Y(10.05) + 27}" font-size="10" fill="#444">200 THK, NOTE 4</text></g>`;
  // slab marks
  const mark = (x, y, t) => `<g><ellipse cx="${X(x)}" cy="${Y(y)}" rx="34" ry="16" fill="#fff" stroke="${INK}"/><text x="${X(x)}" y="${Y(y) + 5}" text-anchor="middle" font-size="12" font-weight="700" fill="${INK}">${t}</text></g>`;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) if (!(i === 5)) b += mark(gx[i] + 3.75, gy[j] + 3, `S${j + 1}${String.fromCharCode(65 + i)}`);
  for (let j = 0; j < 3; j++) if (j !== 1) b += mark(41.25, gy[j] + 3, `S${j + 1}F`);
  gx.forEach((g, i) => { b += `<line x1="${X(g)}" y1="${Y(-2.6)}" x2="${X(g)}" y2="${Y(-0.4)}" stroke="${INK}" stroke-width="0.6" stroke-dasharray="10 4 2 4"/>${bubble(X(g), Y(-3.2), 'ABCDEFG'[i])}`; });
  gy.forEach((g, i) => { b += `<line x1="${X(-2.6)}" y1="${Y(g)}" x2="${X(-0.4)}" y2="${Y(g)}" stroke="${INK}" stroke-width="0.6" stroke-dasharray="10 4 2 4"/>${bubble(X(-3.2), Y(g), i + 1)}`; });
  for (let i = 0; i < gx.length - 1; i++) b += dimH(X(gx[i]), X(gx[i + 1]), Y(D + 2), '7500');
  b += dimH(X(0), X(L), Y(D + 4), '45000');
  for (let i = 0; i < gy.length - 1; i++) b += dimV(Y(gy[i]), Y(gy[i + 1]), X(L + 2), '6000');
  b += `<text x="${X(22.5)}" y="${Y(D + 7)}" text-anchor="middle" font-size="22" font-weight="700" fill="${INK}" letter-spacing="2">FIRST FLOOR SLAB, GENERAL ARRANGEMENT</text><text x="${X(22.5)}" y="${Y(D + 7) + 20}" text-anchor="middle" font-size="13" fill="${INK}">SCALE 1:200 · DIMENSIONS IN MILLIMETRES</text>`;
  b += `<g font-size="12" fill="${INK}"><text x="70" y="${H - 190}" font-weight="700">NOTES</text><text x="70" y="${H - 170}">1. Concrete grade C30, cover 25 mm to slabs.</text><text x="70" y="${H - 152}">2. Slab 150 mm thick unless noted.</text><text x="70" y="${H - 134}">3. Columns 400 x 400, see C-schedule.</text><text x="70" y="${H - 116}">4. Stair core slab thickness to be confirmed by engineer.</text></g>`;
  b += northArrow(W - 140, 140) + scaleBar(70, H - 70, 10 * S, '10 m');
  const zone = (name, stage, x1, y1, x2, y2) => ({ name, stage, x: fr(X(x1), W), y: fr(Y(y1), H), w: fr((x2 - x1) * S, W), h: fr((y2 - y1) * S, H) });
  return {
    svg: sheet({ body: b, number: 'S-201', title: 'FIRST FLOOR SLAB GA', scale: '1:200 @ A3', project: 'EAST LEGON OFFICE COMPLEX', client: 'Northgate Properties Ltd', discipline: 'Structural' }),
    meta: {
      key: 'legon', file: 'legon-s201', title: 'First floor slab, general arrangement', sheet: 'S-201', discipline: 'structural', width: W, height: H,
      zones: [
        zone('Bays A to C', 'First floor slab', 0, 0, 15, 18),
        zone('Bays C to E', 'First floor slab', 15, 0, 30, 18),
        zone('Bays E to F', 'Roof level', 30, 0, 37.5, 18),
        zone('Stair and lift core', 'Lintel level', 37.5, 6, 45, 12),
      ],
      pins: [{ issue: 1, x: fr(X(39.4), W), y: fr(Y(8.6), H) }],
    },
  };
}

// ---------- 3. Kasoa–Winneba road: drainage layout (strip plan) ----------
function road() {
  const x0 = 140; const x1 = W - 140; const len = 600; // chainage 2+000 to 2+600
  const X = (ch) => x0 + ((ch - 2000) / len) * (x1 - x0);
  const cy = 520; // centre line
  const lane = 70; const shoulder = 26; const drain = 30; const verge = 30;
  const yTop = cy - lane - shoulder - verge - drain; const yBot = cy + lane + shoulder + verge + drain;
  let b = `<rect x="${x0}" y="${cy - lane}" width="${x1 - x0}" height="${lane * 2}" fill="#eef0f2" stroke="${INK}" stroke-width="2"/>`;
  b += `<line x1="${x0}" y1="${cy}" x2="${x1}" y2="${cy}" stroke="${INK}" stroke-width="1.2" stroke-dasharray="24 16"/>`;
  b += `<rect x="${x0}" y="${cy - lane - shoulder}" width="${x1 - x0}" height="${shoulder}" fill="url(#slab)" stroke="${INK}"/><rect x="${x0}" y="${cy + lane}" width="${x1 - x0}" height="${shoulder}" fill="url(#slab)" stroke="${INK}"/>`;
  // kerbs and drains (U-drains, hatched walls)
  for (const [y, h] of [[yTop, drain], [yBot - drain, drain]]) {
    b += `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="2"/><rect x="${x0}" y="${y}" width="${x1 - x0}" height="6" fill="url(#hatch)"/><rect x="${x0}" y="${y + h - 6}" width="${x1 - x0}" height="6" fill="url(#hatch)"/>`;
    for (let ch = 2010; ch < 2600; ch += 20) b += `<path d="M${X(ch)} ${y + h / 2} l10 0 l-4 -4 m4 4 l-4 4" stroke="${INK}" fill="none" stroke-width="0.9"/>`;
  }
  // culverts crossing the road
  for (const [ch, name] of [[2150, 'C3'], [2480, 'C4']]) {
    b += `<rect x="${X(ch) - 22}" y="${yTop - 40}" width="44" height="${yBot - yTop + 80}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-dasharray="14 6"/>`;
    b += `<path d="M${X(ch) - 22} ${yTop - 40} l-26 -26 M${X(ch) + 22} ${yTop - 40} l26 -26 M${X(ch) - 22} ${yBot + 40} l-26 26 M${X(ch) + 22} ${yBot + 40} l26 26" stroke="${INK}" stroke-width="2"/>`;
    b += `<text x="${X(ch)}" y="${yBot + 92}" text-anchor="middle" font-size="13" font-weight="700" fill="${INK}">CULVERT ${name}</text><text x="${X(ch)}" y="${yBot + 108}" text-anchor="middle" font-size="11" fill="#444">2 x 1.5 x 1.2 BOX</text>`;
  }
  // existing water main
  b += `<path d="M${X(2395)} ${yTop - 90} C ${X(2405)} ${cy - 40}, ${X(2415)} ${cy + 40}, ${X(2425)} ${yBot + 70}" stroke="#2457a6" stroke-width="2.4" fill="none" stroke-dasharray="16 6 3 6"/><text x="${X(2418) - 12}" y="${yBot + 62}" text-anchor="end" font-size="12" fill="#2457a6" font-weight="700">EXISTING 300 WATER MAIN (POSITION APPROX.)</text>`;
  // chainage ticks
  for (let ch = 2000; ch <= 2600; ch += 50) {
    const big = ch % 100 === 0;
    b += `<line x1="${X(ch)}" y1="${cy - 10}" x2="${X(ch)}" y2="${cy + 10}" stroke="${INK}" stroke-width="${big ? 2 : 1}"/>`;
    if (big) b += `<text x="${X(ch)}" y="${yTop - 120}" text-anchor="middle" font-size="14" font-weight="700" fill="${INK}">${Math.floor(ch / 1000)}+${String(ch % 1000).padStart(3, '0')}</text><line x1="${X(ch)}" y1="${yTop - 112}" x2="${X(ch)}" y2="${yTop - 100}" stroke="${INK}"/>`;
  }
  b += `<g font-size="12" fill="${INK}"><text x="${x0}" y="${yTop - 14}">LEFT U-DRAIN 600 x 600, FALL TO CULVERTS</text><text x="${x0}" y="${yBot + 22}">RIGHT U-DRAIN 600 x 600</text><text x="${x0 + 8}" y="${cy - 16}">CARRIAGEWAY 7.3 m, DBST ON 150 BASE</text><text x="${x0 + 8}" y="${cy + 40}">TO WINNEBA →</text></g>`;
  b += `<text x="${W / 2}" y="${yBot + 170}" text-anchor="middle" font-size="22" font-weight="700" fill="${INK}" letter-spacing="2">DRAINAGE LAYOUT, CH 2+000 TO 2+600</text><text x="${W / 2}" y="${yBot + 190}" text-anchor="middle" font-size="13" fill="${INK}">HORIZONTAL SCALE 1:1000 · WIDTHS NOT TO SCALE</text>`;
  b += northArrow(W - 140, 140) + scaleBar(70, H - 70, ((x1 - x0) / len) * 100, '100 m');
  const zone = (name, stage, ch1, ch2, ya, yb) => ({ name, stage, x: fr(X(ch1), W), y: fr(ya, H), w: fr(X(ch2) - X(ch1), W), h: fr(yb - ya, H) });
  return {
    svg: sheet({ body: b, number: 'C-301', title: 'DRAINAGE LAYOUT', scale: '1:1000 @ A3', project: 'KASOA–WINNEBA ROAD, PHASE 2', client: 'Department of Urban Roads', discipline: 'Civil' }),
    meta: {
      key: 'road', file: 'road-c301', title: 'Drainage layout, CH 2+000 to 2+600', sheet: 'C-301', discipline: 'site', width: W, height: H,
      zones: [
        zone('Left drain 2+000 to 2+300', 'Drains and culverts', 2000, 2300, yTop - 4, yTop + drain + 4),
        zone('Right drain 2+300 to 2+600', 'Drains and culverts', 2300, 2600, yBot - drain - 4, yBot + 4),
        zone('Culvert C3', 'Drains and culverts', 2135, 2165, yTop - 44, yBot + 44),
        zone('Base course', 'Base course', 2000, 2600, cy - lane, cy + lane),
        zone('Shoulders', 'Surfacing', 2000, 2600, cy + lane, cy + lane + shoulder),
      ],
      pins: [{ issue: 0, x: fr(X(2410), W), y: fr(yTop + drain / 2, H) }],
    },
  };
}

const sheets = [adenta(), legon(), road()];
for (const s of sheets) writeFileSync(resolve(OUT, `${s.meta.file}.svg`), s.svg);
const ts = `// Generated by scripts/demo-drawings.mjs. Do not edit: change the script and run it again.
// The sample projects' drawings: where each marked area and issue pin goes (fractions of the sheet).
export interface DemoDrawingSpec {
  key: string; file: string; title: string; sheet: string; discipline: 'architectural' | 'structural' | 'services' | 'site' | 'other';
  width: number; height: number;
  zones: { name: string; stage: string; x: number; y: number; w: number; h: number }[];
  pins: { issue: number; x: number; y: number }[];
}
export const DEMO_DRAWINGS: DemoDrawingSpec[] = ${JSON.stringify(sheets.map((s) => s.meta), null, 2).replace(/"([a-zA-Z]+)":/g, '$1:').replace(/"/g, "'")};
`;
writeFileSync(resolve(root, 'packages/shared/src/demoDrawings.ts'), ts);
console.log(`Wrote ${sheets.length} drawings and packages/shared/src/demoDrawings.ts`);
void f2;
