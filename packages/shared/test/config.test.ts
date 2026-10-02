import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Production configuration that no emulator checks: hosting headers (the hosting emulator ignores
// them) and Firestore indexes (the Firestore emulator never asks for one). A missing index only
// shows up in production, as a failing page or job.
const root = new URL('../../../', import.meta.url);
const json = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

describe('web hosting', () => {
  const hosting = json('firebase.json').hosting;
  const all = hosting.headers.find((h: { source?: string }) => h.source === '**').headers as { key: string; value: string }[];
  const header = (k: string) => all.find((h) => h.key === k)?.value || '';

  it('sends the security headers on every response', () => {
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('Permissions-Policy')).toContain('geolocation=()');
  });
  it('the content security policy only runs the app’s own scripts and lets Firebase work', () => {
    const csp = Object.fromEntries(header('Content-Security-Policy').split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
    // the app's own files, plus reCAPTCHA for App Check; never inline or eval
    expect(csp['script-src']).toEqual(["'self'", 'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/']);
    expect(csp['script-src']).not.toContain("'unsafe-inline'");
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['connect-src']).toEqual(expect.arrayContaining(['https://*.googleapis.com', 'https://*.cloudfunctions.net']));
    expect(csp['img-src']).toContain('https://firebasestorage.googleapis.com');
    expect(header('Content-Security-Policy')).not.toContain('unsafe-eval');
  });
  it('built files are cached for a year; every app address always gets the current app', () => {
    const cache = (path: string) => hosting.headers
      .filter((h: { source?: string; regex?: string }) => (h.regex ? new RegExp(h.regex).test(path) : h.source === '/assets/**' && path.startsWith('/assets/')))
      .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers).filter((h: { key: string }) => h.key === 'Cache-Control').map((h: { value: string }) => h.value);
    expect(cache('/assets/index-abc.js')).toEqual(['public,max-age=31536000,immutable']);
    for (const p of ['/', '/index.html', '/sites', '/work/s1']) expect(cache(p)).toEqual(['no-cache']);
  });
});

describe('Firestore indexes', () => {
  const { indexes, fieldOverrides } = json('firebase/firestore.indexes.json');
  const has = (group: string, scope: string, ...fields: string[]) => indexes.some((i: { collectionGroup: string; queryScope: string; fields: { fieldPath: string }[] }) =>
    i.collectionGroup === group && i.queryScope === scope && i.fields.map((f) => f.fieldPath).join(',') === fields.join(','));

  // Every query with more than one field, and every collection-group query (apps/*/lib/db.js, functions)
  it.each([
    ['reports page and dashboard', 'reports', 'COLLECTION_GROUP', 'companyId', 'date'],
    ['reports page filtered by site', 'reports', 'COLLECTION_GROUP', 'companyId', 'siteId', 'date'],
    ['reports by author', 'reports', 'COLLECTION_GROUP', 'companyId', 'createdBy', 'date'],
    ['open issues across sites', 'issues', 'COLLECTION_GROUP', 'companyId', 'status'],
    ['all issues across sites', 'issues', 'COLLECTION_GROUP', 'companyId', 'date'],
    ['material entries for one material', 'materialLogs', 'COLLECTION', 'materialId', 'date'],
    ['message retries', 'notifications', 'COLLECTION_GROUP', 'status', 'retry'],
  ])('%s', (_what, group, scope, ...fields) => {
    expect(has(group, scope, ...fields)).toBe(true);
  });
  it('long text is not indexed', () => {
    expect(fieldOverrides).toEqual(expect.arrayContaining([{ collectionGroup: 'reports', fieldPath: 'text', indexes: [] }]));
  });
});
