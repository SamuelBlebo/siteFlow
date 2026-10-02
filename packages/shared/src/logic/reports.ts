import type { MaterialLog, Report } from '../types';

// One report per person per site per day. A fixed id makes sending idempotent: a retry after a
// dropped connection writes the same document instead of a duplicate.
export const reportId = (date: string, uid: string) => `${date}_${uid}`;

export const WEATHER = ['Sunny', 'Cloudy', 'Light rain', 'Heavy rain', 'Windy'] as const;
export type Weather = (typeof WEATHER)[number];

// Tap-to-add phrases so a supervisor can describe the day with little typing
export const WORK_PHRASES = [
  'Site clearing', 'Setting out', 'Excavation', 'Foundation concrete', 'Blockwork', 'Column casting',
  'Lintel casting', 'Slab casting', 'Steel fixing', 'Formwork', 'Roofing', 'Plastering', 'Electrical first fix',
  'Plumbing first fix', 'Tiling', 'Painting', 'Material delivery received', 'Waiting for materials',
];

export const REPORT_PHOTO_LIMIT = 8;
export const REPORT_PHOTO_MAX_PX = 1600;   // long edge after resizing on the device
export const REPORT_PHOTO_QUALITY = 0.7;   // JPEG quality after resizing
// Small copies for lists and thumbnails, so a list of reports doesn't download every full photo
export const PHOTO_THUMB_PX = 360;
export const PHOTO_THUMB_QUALITY = 0.6;
// "1.jpg" -> "1-thumb.jpg" (stored next to the photo)
export const thumbName = (file: string) => file.replace(/(\.[a-z0-9]+)?$/i, '-thumb$1');
// The small copy of photo i if there is one (older records have none), else the photo itself
export const photoThumb = (doc: { photos?: string[]; thumbs?: string[] } | null | undefined, i: number) =>
  doc?.thumbs?.[i] || doc?.photos?.[i] || '';

export interface MaterialUsed { materialId: string; name: string; unit: string; qty: number }

// Today's material usage, as attached to the report
export function materialsUsed(logs: Pick<MaterialLog, 'type' | 'materialId' | 'materialName' | 'unit' | 'qty'>[] = []): MaterialUsed[] {
  const by = new Map<string, MaterialUsed>();
  for (const l of logs) {
    if (l.type !== 'usage') continue;
    const m = by.get(l.materialId) ?? { materialId: l.materialId, name: l.materialName, unit: l.unit, qty: 0 };
    m.qty = Math.round((m.qty + l.qty) * 1000) / 1000;
    by.set(l.materialId, m);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The stored report document (without createdAt, which each app sets as a server timestamp).
// Shared so web and mobile write exactly the same shape, which the rules check.
export function reportDoc(input: {
  text: string; notes?: string; issues?: string; weather?: string; stage: string; progress: number; workersPresent: number;
}, meta: {
  companyId: string; siteId: string; siteName: string; date: string; time: string; uid: string; name: string;
  photos?: string[]; thumbs?: string[]; materials?: MaterialUsed[]; source: 'web' | 'app';
}) {
  return {
    companyId: meta.companyId, siteId: meta.siteId, siteName: meta.siteName,
    date: meta.date, time: meta.time,
    text: input.text, notes: input.notes || '', issues: input.issues || '', weather: input.weather || '',
    stage: input.stage, progress: input.progress, workersPresent: input.workersPresent,
    materialsUsed: meta.materials || [],
    photos: meta.photos || [], thumbs: meta.thumbs || [], photoCount: (meta.photos || []).length,
    createdBy: meta.uid, createdByName: meta.name, source: meta.source,
  };
}

export interface ReportFilter { q?: string; from?: string; to?: string; siteId?: string; author?: string; withIssues?: boolean; withPhotos?: boolean }

// Filters a loaded page of reports. Date range and site are also applied in the Firestore query.
export function filterReports<T extends Partial<Report> & { siteName?: string }>(reports: T[], f: ReportFilter = {}): T[] {
  const words = (f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return reports.filter((r) => {
    if (f.from && (r.date || '') < f.from) return false;
    if (f.to && (r.date || '') > f.to) return false;
    if (f.siteId && r.siteId !== f.siteId) return false;
    if (f.author && r.createdBy !== f.author) return false;
    if (f.withIssues && !(r.issues || '').trim()) return false;
    if (f.withPhotos && !(r.photos || []).length) return false;
    if (words.length) {
      const hay = [r.text, r.notes, r.issues, r.stage, r.createdByName, r.siteName, r.weather].join(' ').toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

// Days in a range with no report, for an active site's history (newest first)
export function missingReportDays(reportDates: string[], days: string[]): string[] {
  const have = new Set(reportDates);
  return days.filter((d) => !have.has(d));
}

// The last n calendar days as YYYY-MM-DD, newest first, skipping Sundays (no site work expected)
export function recentWorkDays(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(now);
  while (out.length < n) {
    if (d.getDay() !== 0) out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() - 1);
  }
  return out;
}
