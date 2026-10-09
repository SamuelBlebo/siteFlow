import { describe, expect, it } from 'vitest';
import { filterReports, materialsUsed, reportAuthor, missingReportDays, recentWorkDays, reportDoc, reportId } from '../src';

describe('report ids', () => {
  it('one per person per day, so a resend overwrites instead of duplicating', () => {
    expect(reportId('2026-06-15', 'u1')).toBe('2026-06-15_u1');
  });
});

describe('materials used', () => {
  it('sums usage per material and ignores deliveries', () => {
    expect(materialsUsed([
      { type: 'usage', materialId: 'c', materialName: 'Cement', unit: 'bags', qty: 4 },
      { type: 'usage', materialId: 'c', materialName: 'Cement', unit: 'bags', qty: 2.5 },
      { type: 'delivery', materialId: 'c', materialName: 'Cement', unit: 'bags', qty: 50 },
      { type: 'usage', materialId: 'b', materialName: 'Blocks', unit: 'pcs', qty: 300 },
    ])).toEqual([
      { materialId: 'b', name: 'Blocks', unit: 'pcs', qty: 300 },
      { materialId: 'c', name: 'Cement', unit: 'bags', qty: 6.5 },
    ]);
  });
});

describe('report document', () => {
  it('has the same shape everywhere', () => {
    const d = reportDoc(
      { text: 'Blockwork', stage: 'Blockwork', progress: 30, workersPresent: 7 },
      { companyId: 'c1', siteId: 's1', siteName: 'Adenta', date: '2026-06-15', time: '17:05', uid: 'u1', name: 'Kofi', photos: ['p1'], source: 'app' },
    );
    expect(d).toEqual({
      companyId: 'c1', siteId: 's1', siteName: 'Adenta', date: '2026-06-15', time: '17:05',
      text: 'Blockwork', notes: '', issues: '', weather: '', stage: 'Blockwork', progress: 30, workersPresent: 7,
      materialsUsed: [], photos: ['p1'], thumbs: [], photoCount: 1, createdBy: 'u1', createdByName: 'Kofi', source: 'app',
    });
  });
});

describe('filtering', () => {
  const reports = [
    { id: '1', date: '2026-06-15', siteId: 'a', siteName: 'Adenta', createdBy: 'u1', createdByName: 'Kofi', text: 'Cast lintels', issues: '', photos: ['x'] },
    { id: '2', date: '2026-06-14', siteId: 'b', siteName: 'Tema', createdBy: 'u2', createdByName: 'Ama', text: 'Blockwork', issues: 'No cement delivered', photos: [] },
    { id: '3', date: '2026-06-10', siteId: 'a', siteName: 'Adenta', createdBy: 'u1', createdByName: 'Kofi', text: 'Roofing started', issues: '', photos: [], weather: 'Heavy rain' },
  ];
  const ids = (f: Parameters<typeof filterReports>[1]) => filterReports(reports, f).map((r) => r.id);
  it('by text across fields, every word must match', () => {
    expect(ids({ q: 'cement' })).toEqual(['2']);
    expect(ids({ q: 'kofi roofing' })).toEqual(['3']);
    expect(ids({ q: 'heavy rain' })).toEqual(['3']);
    expect(ids({ q: 'adenta' })).toEqual(['1', '3']);
  });
  it('by dates, site, author, issues and photos', () => {
    expect(ids({ from: '2026-06-14' })).toEqual(['1', '2']);
    expect(ids({ to: '2026-06-14' })).toEqual(['2', '3']);
    expect(ids({ siteId: 'a' })).toEqual(['1', '3']);
    expect(ids({ author: 'u2' })).toEqual(['2']);
    expect(ids({ withIssues: true })).toEqual(['2']);
    expect(ids({ withPhotos: true })).toEqual(['1']);
    expect(ids({})).toEqual(['1', '2', '3']);
  });
});

describe('report history', () => {
  it('recent work days skip Sundays, newest first', () => {
    // 2026-06-15 is a Monday
    expect(recentWorkDays(3, new Date('2026-06-15T10:00:00'))).toEqual(['2026-06-15', '2026-06-13', '2026-06-12']);
  });
  it('finds days without a report', () => {
    expect(missingReportDays(['2026-06-15', '2026-06-12'], ['2026-06-15', '2026-06-13', '2026-06-12'])).toEqual(['2026-06-13']);
  });
});

describe('photo thumbnails', () => {
  it('names the small copy next to the photo', async () => {
    const { thumbName } = await import('../src');
    expect(thumbName('1.jpg')).toBe('1-thumb.jpg');
    expect(thumbName('companies/c/sites/s/reports/r/2-1700.jpg')).toBe('companies/c/sites/s/reports/r/2-1700-thumb.jpg');
    expect(thumbName('photo')).toBe('photo-thumb');
  });
  it('uses the small copy when there is one, else the photo', async () => {
    const { photoThumb } = await import('../src');
    expect(photoThumb({ photos: ['a', 'b'], thumbs: ['ta', ''] }, 0)).toBe('ta');
    expect(photoThumb({ photos: ['a', 'b'], thumbs: ['ta', ''] }, 1)).toBe('b');
    expect(photoThumb({ photos: ['a'] }, 0)).toBe('a');
    expect(photoThumb(null, 0)).toBe('');
  });
});

describe('who sent a report', () => {
  it('shows the name with the role when the report has one', () => {
    expect(reportAuthor({ createdByName: 'Yaw Boateng', createdByRole: 'manager' })).toBe('Yaw Boateng, Project manager');
    expect(reportAuthor({ createdByName: 'Kwame Mensah' })).toBe('Kwame Mensah');
  });
});
