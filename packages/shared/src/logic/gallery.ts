import type { Issue, Report } from '../types';
import { weekOf } from './mail';

// The project photo gallery: every photo added to daily reports (and, when asked, to issues),
// newest first and grouped by week, so scrolling down reads as the building's story.
// It only reads what reports already store; photos still uploading are left out.

export interface GalleryPhoto {
  url: string; thumb: string; date: string; time: string; by: string;
  stage: string; progress: number | null;
  siteId: string; siteName: string; source: 'report' | 'issue'; refId: string;
}

type WithThumbs = { photos?: string[]; thumbs?: string[] };
const each = (r: WithThumbs) => (r.photos || []).map((url, i) => ({ url, thumb: r.thumbs?.[i] || url }));
const newestFirst = (a: GalleryPhoto, b: GalleryPhoto) => (b.date + b.time).localeCompare(a.date + a.time);

export function galleryPhotos(reports: Report[], issues: Issue[] = []): GalleryPhoto[] {
  const fromReports = reports.flatMap((r) => each(r as Report & WithThumbs).map((p) => ({
    ...p, date: r.date, time: r.time || '', by: r.createdByName, stage: r.stage || '', progress: r.progress ?? null,
    siteId: r.siteId, siteName: r.siteName, source: 'report' as const, refId: r.id || '',
  })));
  const fromIssues = issues.flatMap((x) => each(x as Issue & WithThumbs).map((p) => ({
    ...p, date: x.date, time: '', by: x.createdByName, stage: '', progress: null,
    siteId: x.siteId, siteName: x.siteName, source: 'issue' as const, refId: x.id || '',
  })));
  return [...fromReports, ...fromIssues].sort(newestFirst);
}

const dayMonth = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Newest week first. The heading's stage and progress come from the week's latest report photo.
export function galleryWeeks(photos: GalleryPhoto[]) {
  const weeks = new Map<string, GalleryPhoto[]>();
  for (const p of [...photos].sort(newestFirst)) {
    const w = weekOf(p.date);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w)!.push(p);
  }
  return [...weeks.entries()].map(([week, list]) => {
    const latest = list.find((p) => p.source === 'report');
    return { week, label: `Week of ${dayMonth(week)}`, stage: latest?.stage || '', progress: latest ? latest.progress : null, photos: list };
  });
}

// The first photo, the first photo of each later month and the latest, oldest first. Empty under 3 photos.
export function thenAndNow(photos: GalleryPhoto[]): GalleryPhoto[] {
  if (photos.length < 3) return [];
  const oldest = [...photos].sort(newestFirst).reverse();
  const picked: GalleryPhoto[] = [];
  const months = new Set<string>();
  for (const p of oldest) {
    const m = p.date.slice(0, 7);
    if (!months.has(m)) { months.add(m); picked.push(p); }
  }
  const latest = oldest[oldest.length - 1];
  if (!picked.includes(latest)) picked.push(latest);
  return picked;
}
