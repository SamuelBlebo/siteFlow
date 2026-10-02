// Unsent form text kept on the phone
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
let broken = false;
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => { if (broken) throw new Error('disk full'); store.set(k, v); },
    removeItem: async (k) => { store.delete(k); },
  },
}));

const { clearDraft, readDraft, writeDraft } = await import('../src/lib/drafts');

beforeEach(() => { store.clear(); broken = false; });

describe('drafts', () => {
  it('keeps text until it is cleared', async () => {
    await writeDraft('report:s1:u1:2026-06-15', { text: 'Blockwork' });
    expect(await readDraft('report:s1:u1:2026-06-15')).toEqual({ text: 'Blockwork' });
    await clearDraft('report:s1:u1:2026-06-15');
    expect(await readDraft('report:s1:u1:2026-06-15')).toBeNull();
  });
  it('a missing or damaged draft reads as none, and a full disk never breaks the form', async () => {
    expect(await readDraft('nothing')).toBeNull();
    store.set('siteflow:draft:bad', '{not json');
    expect(await readDraft('bad')).toBeNull();
    broken = true;
    await expect(writeDraft('x', { a: 1 })).resolves.toBeUndefined();
  });
});
