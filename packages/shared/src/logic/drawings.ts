import { z } from 'zod';
import type { Milestone } from '../types';

// Project drawings: the architect's sheets (PDF or image) uploaded to a project. One of them is the
// project's overview drawing. Managers mark areas on it and link each to a programme stage, so the
// area is coloured by that stage's progress; issues can be pinned where they are.
// Positions are fractions of the sheet (0 to 1), so they hold at any zoom or screen size.

export const DISCIPLINES = ['architectural', 'structural', 'services', 'site', 'other'] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  architectural: 'Architectural', structural: 'Structural', services: 'Services (MEP)', site: 'Site plan', other: 'Other',
};

export const MAX_ZONES = 60;
export const DRAWING_MAX_MB = 30;
export const DRAWING_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export interface DrawingZone { id: string; name: string; x: number; y: number; w: number; h: number; milestoneId: string | null }
export interface Drawing {
  id?: string; title: string; sheet: string; discipline: Discipline;
  file: string; fileType: string;          // the original upload (PDF or image)
  image: string; width: number; height: number; // what is shown: the image, or page 1 of a PDF
  zones: DrawingZone[];
  createdBy: string; createdByName: string; createdAt?: unknown; updatedAt?: unknown;
}
// On an issue: where it is on which drawing
export interface IssuePin { drawingId: string; x: number; y: number }

const frac = z.number().min(0).max(1);
export const drawingInput = z.object({
  title: z.string().trim().min(1, 'Give the drawing a title, e.g. Ground floor plan.').max(120),
  sheet: z.string().trim().max(30).default(''),
  discipline: z.enum(DISCIPLINES).default('architectural'),
});
export const zoneInput = z.object({
  name: z.string().trim().min(1, 'Name the area, e.g. Kitchen or Ground floor walls.').max(60),
  milestoneId: z.string().min(1).nullable().default(null),
});
export const pinInput = z.object({ drawingId: z.string().min(1), x: frac, y: frac });

const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 10000) / 10000));

// A rectangle dragged between two points, as fractions, kept inside the sheet. Too small: null.
export function zoneRect(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = clamp(Math.min(a.x, b.x)); const y = clamp(Math.min(a.y, b.y));
  const w = clamp(Math.max(a.x, b.x)) - x; const h = clamp(Math.max(a.y, b.y)) - y;
  return w < 0.01 || h < 0.01 ? null : { x, y, w: clamp(w), h: clamp(h) };
}
export const pinAt = (drawingId: string, p: { x: number; y: number }): IssuePin => ({ drawingId, x: clamp(p.x), y: clamp(p.y) });

export type ZoneState = 'done' | 'progress' | 'behind' | 'todo' | 'none';
export const ZONE_LABELS: Record<ZoneState, string> = {
  done: 'Done', progress: 'In progress', behind: 'Behind plan', todo: 'Not started', none: 'Not linked to a stage',
};

// How an area looks: from the stage it is linked to. Behind plan: its planned end has passed
// (or it should have started) and it isn't finished.
export function zoneState(zone: Pick<DrawingZone, 'milestoneId'>, milestones: Milestone[], today: string) {
  const m = zone.milestoneId ? milestones.find((x) => x.id === zone.milestoneId) : undefined;
  if (!m) return { state: 'none' as ZoneState, pct: null as number | null, stage: '' };
  const pct = Math.round(m.percentDone || 0);
  const late = (!!m.plannedEnd && m.plannedEnd < today) || (pct === 0 && !!m.plannedStart && m.plannedStart < today);
  const state: ZoneState = pct >= 100 ? 'done' : late ? 'behind' : pct > 0 ? 'progress' : 'todo';
  return { state, pct, stage: m.name };
}

// The counts under the drawing: how many areas are done, going, behind and not started
export function zoneSummary(zones: DrawingZone[], milestones: Milestone[], today: string) {
  const out: Record<ZoneState, number> = { done: 0, progress: 0, behind: 0, todo: 0, none: 0 };
  for (const z of zones) out[zoneState(z, milestones, today).state]++;
  return out;
}

// The drawing shown on the overview: the one chosen for the project, else the first architectural
// sheet, else the first uploaded
export function overviewDrawing<T extends { id?: string; discipline?: string }>(drawings: T[], chosen?: string | null): T | undefined {
  return drawings.find((d) => d.id === chosen) ?? drawings.find((d) => d.discipline === 'architectural') ?? drawings[0];
}

// Size a drawing image to show and upload: longest side at most max pixels
export function fitSize(width: number, height: number, max = 4096) {
  const s = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

export const newZoneId = () => `z${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
