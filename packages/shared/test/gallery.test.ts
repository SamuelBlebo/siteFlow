import { describe, expect, it } from 'vitest';
import { galleryPhotos, galleryWeeks, thenAndNow, weekOf, type Issue, type Report } from '../src';

const report = (id: string, date: string, extra: Partial<Report> & { thumbs?: string[] } = {}) =>
  ({ id, companyId: 'c', siteId: 's', siteName: 'Adenta house', date, time: '16:00', text: '', issues: '', stage: 'Blockwork', progress: 40,
    workersPresent: 5, photos: [`${id}.jpg`], createdBy: 'u', createdByName: 'Kofi', ...extra }) as Report;
const issue = (id: string, date: string, photos: string[]) =>
  ({ id, siteId: 's', siteName: 'Adenta house', date, photos, photoCount: photos.length, createdByName: 'Ama', title: 'Crack' }) as unknown as Issue;

describe('gallery photos', () => {
  it('one entry per uploaded photo, thumbnail or the photo itself', () => {
    const p = galleryPhotos([report('r1', '2026-10-14', { photos: ['a', 'b'], thumbs: ['ta'] })]);
    expect(p.map((x) => [x.url, x.thumb])).toEqual([['a', 'ta'], ['b', 'b']]);
    expect(p[0]).toMatchObject({ date: '2026-10-14', by: 'Kofi', stage: 'Blockwork', progress: 40, source: 'report', refId: 'r1', siteId: 's', siteName: 'Adenta house' });
  });
  it('photos still uploading are left out', () => {
    expect(galleryPhotos([report('r1', '2026-10-14', { photos: ['a'], photoCount: 3 })])).toHaveLength(1);
    expect(galleryPhotos([report('r2', '2026-10-14', { photos: undefined as unknown as string[] })])).toEqual([]);
  });
  it('issue photos are marked as such, with no progress', () => {
    const p = galleryPhotos([], [issue('i1', '2026-10-15', ['x'])]);
    expect(p[0]).toMatchObject({ url: 'x', source: 'issue', refId: 'i1', progress: null, by: 'Ama', stage: '' });
  });
  it('newest first, by date then time', () => {
    const p = galleryPhotos([report('old', '2026-10-01'), report('late', '2026-10-14', { time: '18:00' }), report('early', '2026-10-14', { time: '08:00' })]);
    expect(p.map((x) => x.refId)).toEqual(['late', 'early', 'old']);
  });
});

describe('gallery weeks', () => {
  it('weeks start on Monday; Sunday belongs to the week before', () => {
    expect(weekOf('2026-10-18')).toBe('2026-10-12');
    expect(weekOf('2026-10-12')).toBe('2026-10-12');
    expect(weekOf('2026-10-14')).toBe('2026-10-12');
  });
  it('newest week first, headed by its latest report', () => {
    const photos = galleryPhotos(
      [report('a', '2026-10-13', { stage: 'Foundation', progress: 20 }), report('b', '2026-10-16', { stage: 'Blockwork', progress: 42 }), report('c', '2026-10-05')],
      [issue('i', '2026-10-17', ['x'])],
    );
    const w = galleryWeeks(photos);
    expect(w.map((x) => x.week)).toEqual(['2026-10-12', '2026-10-05']);
    expect(w[0]).toMatchObject({ label: 'Week of 12 Oct', stage: 'Blockwork', progress: 42 });
    expect(w[0].photos).toHaveLength(3);
  });
  it('a week mixing projects has no stage or progress (it would be one project’s)', () => {
    const w = galleryWeeks(galleryPhotos([report('a', '2026-10-13'), { ...report('b', '2026-10-14'), siteId: 's2', siteName: 'Legon' } as Report]));
    expect(w[0]).toMatchObject({ stage: '', progress: null });
  });
  it('a week with only issue photos has no stage', () => {
    expect(galleryWeeks(galleryPhotos([], [issue('i', '2026-10-17', ['x'])]))[0]).toMatchObject({ stage: '', progress: null });
  });
});

describe('then and now', () => {
  it('needs at least 3 photos', () => {
    expect(thenAndNow(galleryPhotos([report('a', '2026-08-03'), report('b', '2026-09-03')]))).toEqual([]);
  });
  it('the first photo, the first of each later month and the latest, oldest first', () => {
    const p = galleryPhotos(['2026-08-03', '2026-08-20', '2026-09-02', '2026-09-15', '2026-10-10'].map((d) => report(d, d)));
    expect(thenAndNow(p).map((x) => x.date)).toEqual(['2026-08-03', '2026-09-02', '2026-10-10']);
    const q = galleryPhotos(['2026-08-03', '2026-09-02', '2026-10-01', '2026-10-20'].map((d) => report(d, d)));
    expect(thenAndNow(q).map((x) => x.date)).toEqual(['2026-08-03', '2026-09-02', '2026-10-01', '2026-10-20']);
  });
});

describe('issue photos follow the page filters', () => {
  it('only the chosen project and period', () => {
    const issues = [issue('old', '2026-09-01', ['o']), issue('new', '2026-10-15', ['n']), { ...issue('other', '2026-10-15', ['x']), siteId: 's2' } as Issue];
    expect(galleryPhotos([], issues, { from: '2026-10-01', siteId: 's' }).map((p) => p.refId)).toEqual(['new']);
    expect(galleryPhotos([], issues, { from: '2026-10-01' }).map((p) => p.refId).sort()).toEqual(['new', 'other']);
    expect(galleryPhotos([], issues)).toHaveLength(3);
  });
});

