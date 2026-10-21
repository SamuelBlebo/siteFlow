// Reading a project's programme from a file the contractor already has: an Excel or CSV sheet
// (columns such as Task, Start, Finish) or an MS Project XML export. The tasks become the
// project's stages (milestones) with their planned dates. Pure functions; the app reads the file.

export const MAX_PROGRAMME_STAGES = 30;
export interface ProgrammeStage { name: string; plannedStart: string | null; plannedEnd: string | null }
export interface Programme { stages: ProgrammeStage[]; start: string | null; end: string | null; note?: string; error?: string }

const NAME_COLS = /^(task( name)?|name|activity( name)?|description|stage|item|work( item)?|phase)$/;
const START_COLS = /^(start( date)?|begin|from|planned start|baseline start)$/;
const END_COLS = /^(finish( date)?|end( date)?|to|planned (finish|end)|baseline finish|completion( date)?)$/;
const OUTLINE_COLS = /^(outline( level)?|level|wbs level)$/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const z2 = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${z2(m)}-${z2(d)}` : null;
};
const year = (y: number) => (y < 100 ? 2000 + y : y);
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const head = (v: unknown) => clean(v).toLowerCase().replace(/[_.]/g, ' ').replace(/\s*\(.*\)$/, '');

// One cell as a date (YYYY-MM-DD). monthFirst decides 05/06/2026; it is worked out from the whole file.
function toDate(v: unknown, monthFirst: boolean): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : key(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === 'number') return v > 20000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10) : null;
  const s = clean(v).toLowerCase().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/, '');
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return key(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(s);
  if (m) return monthFirst ? key(year(+m[3]), +m[1], +m[2]) : key(year(+m[3]), +m[2], +m[1]);
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3})[a-z]*\.?[\s,-]+(\d{2,4})\b/.exec(s);
  if (m && MONTHS.includes(m[2])) return key(year(+m[3]), MONTHS.indexOf(m[2]) + 1, +m[1]);
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})\b/.exec(s);
  if (m && MONTHS.includes(m[1])) return key(year(+m[3]), MONTHS.indexOf(m[1]) + 1, +m[2]);
  return null;
}

// Month first only when the file can only mean that: a "day" above 12 in second place and never in first
function monthFirstIn(cells: unknown[]) {
  let dayFirst = false; let monthFirst = false;
  for (const c of cells) {
    const m = typeof c === 'string' ? /(?:^|\s)(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(c) : null;
    if (!m) continue;
    if (+m[1] > 12) dayFirst = true;
    if (+m[2] > 12) monthFirst = true;
  }
  return monthFirst && !dayFirst;
}

function finish(list: (ProgrammeStage & { level?: number })[], total = list.length): Programme {
  let stages = list;
  let note: string | undefined;
  if (stages.length > MAX_PROGRAMME_STAGES) {
    // Too many tasks: the top level of the outline if there is one, else the first ones
    const top = Math.min(...stages.map((s) => s.level ?? Infinity));
    const outline = Number.isFinite(top) ? stages.filter((s) => s.level === top) : [];
    if (outline.length > 1 && outline.length <= MAX_PROGRAMME_STAGES) stages = outline;
    else {
      stages = stages.slice(0, MAX_PROGRAMME_STAGES);
      note = `The file has ${total} tasks. The first ${MAX_PROGRAMME_STAGES} are used as stages; a programme with summary tasks (phases) works best.`;
    }
  }
  const out = stages.map(({ name, plannedStart, plannedEnd }) => (plannedStart && plannedEnd && plannedEnd < plannedStart
    ? { name, plannedStart: plannedEnd, plannedEnd: plannedStart } : { name, plannedStart, plannedEnd }));
  const dates = out.flatMap((s) => [s.plannedStart, s.plannedEnd]).filter((d): d is string => !!d).sort();
  return { stages: out, start: dates[0] ?? null, end: dates[dates.length - 1] ?? null, ...(note ? { note } : {}) };
}

const NO_TASKS = 'No tasks found. The sheet needs a column named Task (or Activity or Name), ideally with Start and Finish columns.';

export function programmeFromRows(rows: unknown[][]): Programme {
  // The header row: the first of the top rows with a task column
  const at = rows.slice(0, 15).findIndex((r) => (r || []).some((c) => NAME_COLS.test(head(c))));
  if (at < 0) return { stages: [], start: null, end: null, error: NO_TASKS };
  const cols = rows[at].map(head);
  const col = (re: RegExp) => cols.findIndex((c) => re.test(c));
  const [ni, si, ei, oi] = [col(NAME_COLS), col(START_COLS), col(END_COLS), col(OUTLINE_COLS)];
  const body = rows.slice(at + 1).filter((r) => r && clean(r[ni]));
  const monthFirst = monthFirstIn(body.flatMap((r) => [r[si], r[ei]]));
  const list = body.map((r) => ({
    name: clean(r[ni]).slice(0, 100),
    plannedStart: si >= 0 ? toDate(r[si], monthFirst) : null,
    plannedEnd: ei >= 0 ? toDate(r[ei], monthFirst) : null,
    ...(oi >= 0 && Number.isFinite(Number(r[oi])) && clean(r[oi]) ? { level: Number(r[oi]) } : {}),
  }));
  if (!list.length) return { stages: [], start: null, end: null, error: NO_TASKS };
  return finish(list);
}

// A CSV file's rows. Commas or semicolons (whichever the header uses), quotes, line breaks in quotes.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (block: string, name: string) => { const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block); return m ? unescape(m[1].trim()) : ''; };

// An MS Project XML export (File > Save As > XML). The project summary (outline level 0) and
// milestones (zero-length events) are left out.
export function programmeFromProjectXml(xml: string): Programme {
  if (!/<Project[\s>]/.test(xml) || !/<Tasks>/.test(xml)) return { stages: [], start: null, end: null, error: 'This is not an MS Project XML file. In MS Project use File, Save As, and choose XML.' };
  const tasks = [...xml.matchAll(/<Task>([\s\S]*?)<\/Task>/g)].map((m) => m[1]);
  const list = tasks
    .filter((t) => tag(t, 'OutlineLevel') !== '0' && tag(t, 'Milestone') !== '1' && tag(t, 'Name'))
    .map((t) => ({
      name: tag(t, 'Name').slice(0, 100),
      plannedStart: tag(t, 'Start').slice(0, 10) || null,
      plannedEnd: tag(t, 'Finish').slice(0, 10) || null,
      level: Number(tag(t, 'OutlineLevel')) || 1,
    }));
  if (!list.length) return { stages: [], start: null, end: null, error: 'The project file has no tasks.' };
  return finish(list);
}
