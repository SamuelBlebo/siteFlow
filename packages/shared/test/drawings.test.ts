import { describe, expect, it } from 'vitest';
import {
  drawingInput, fitSize, issueDoc, overviewDrawing, pinAt, validate, zoneRect, zoneState, zoneSummary, type Milestone,
} from '../src';

const ms = (id: string, percentDone: number, extra: Partial<Milestone> = {}): Milestone =>
  ({ id, name: `Stage ${id}`, order: 1, status: 'in_progress', percentDone, ...extra }) as Milestone;
const today = '2026-06-15';

describe('drawing areas', () => {
  it('a dragged rectangle in any direction, kept inside the sheet', () => {
    expect(zoneRect({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, w: 0.4, h: 0.4 });
    expect(zoneRect({ x: -0.2, y: 0.9 }, { x: 0.3, y: 1.4 })).toEqual({ x: 0, y: 0.9, w: 0.3, h: 0.1 });
  });
  it('a click (no real drag) is not an area', () => {
    expect(zoneRect({ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.6 })).toBeNull();
  });
  it('colour comes from the linked stage', () => {
    const all = [ms('a', 100), ms('b', 40), ms('c', 0), ms('d', 60, { plannedEnd: '2026-06-01' }), ms('e', 0, { plannedStart: '2026-06-10' })];
    expect(zoneState({ milestoneId: 'a' }, all, today)).toMatchObject({ state: 'done', pct: 100, stage: 'Stage a' });
    expect(zoneState({ milestoneId: 'b' }, all, today).state).toBe('progress');
    expect(zoneState({ milestoneId: 'c' }, all, today).state).toBe('todo');
    expect(zoneState({ milestoneId: 'd' }, all, today).state).toBe('behind');
    expect(zoneState({ milestoneId: 'e' }, all, today).state).toBe('behind'); // should have started
    expect(zoneState({ milestoneId: null }, all, today)).toMatchObject({ state: 'none', pct: null });
    expect(zoneState({ milestoneId: 'deleted' }, all, today).state).toBe('none');
  });
  it('summary counts every area once', () => {
    const z = (id: string, m: string | null) => ({ id, name: id, x: 0, y: 0, w: 0.1, h: 0.1, milestoneId: m });
    expect(zoneSummary([z('1', 'a'), z('2', 'a'), z('3', null)], [ms('a', 100)], today)).toEqual({ done: 2, progress: 0, behind: 0, todo: 0, none: 1 });
  });
});

describe('drawings', () => {
  it('the overview is the chosen drawing, else the first architectural sheet, else the first', () => {
    const d = [{ id: 's1', discipline: 'structural' }, { id: 'a1', discipline: 'architectural' }, { id: 'a2', discipline: 'architectural' }];
    expect(overviewDrawing(d, 'a2')?.id).toBe('a2');
    expect(overviewDrawing(d, 'gone')?.id).toBe('a1');
    expect(overviewDrawing([d[0]], null)?.id).toBe('s1');
    expect(overviewDrawing([], null)).toBeUndefined();
  });
  it('images are scaled down to at most 4096 pixels on the longest side, never up', () => {
    expect(fitSize(8192, 4096)).toEqual({ width: 4096, height: 2048 });
    expect(fitSize(1200, 800)).toEqual({ width: 1200, height: 800 });
  });
  it('a title is needed; sheet number and type are optional', () => {
    expect(validate(drawingInput, { title: ' ' }).ok).toBe(false);
    expect(validate(drawingInput, { title: 'Ground floor plan' })).toMatchObject({ ok: true, data: { sheet: '', discipline: 'architectural' } });
  });
  it('issues carry their pin, rounded and inside the sheet', () => {
    const pin = pinAt('d1', { x: 0.123456, y: 1.2 });
    expect(pin).toEqual({ drawingId: 'd1', x: 0.1235, y: 1 });
    const meta = { companyId: 'c', siteId: 's', siteName: 'S', uid: 'u', name: 'N', date: today };
    const input = { title: 'Crack in wall', priority: 'high' as const, category: 'Quality' };
    expect(issueDoc(input, { ...meta, pin }).pin).toEqual(pin);
    expect('pin' in issueDoc(input, meta)).toBe(false);
  });
});
