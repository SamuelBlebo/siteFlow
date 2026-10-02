// The web app's save(): waits for the server when online, keeps working offline, never fails silently.
// Pure logic (no emulator needed), but it runs with the rest of the web tests.
import { afterEach, describe, expect, it } from 'vitest';
import { dismiss, getState, save, savedText, SaveError } from '../src/lib/save';

const later = (ms, fn) => new Promise((resolve, reject) => setTimeout(() => { try { resolve(fn()); } catch (e) { reject(e); } }, ms));
const setOnline = (v) => Object.defineProperty(globalThis.navigator, 'onLine', { value: v, configurable: true });
const denied = () => Object.assign(new Error('7 PERMISSION_DENIED'), { code: 'permission-denied' });

afterEach(() => { setOnline(undefined); for (const t of getState().toasts) dismiss(t.id); });

describe('save', () => {
  it('online: resolves once the server confirms', async () => {
    setOnline(true);
    await expect(save(later(5, () => 'ok'), 'Report')).resolves.toEqual({ queued: false });
    expect(getState().pending).toBe(0);
  });

  it('online: a refusal comes back to the form as a plain message', async () => {
    setOnline(true);
    const p = save(later(5, () => { throw denied(); }), 'Report');
    await expect(p).rejects.toBeInstanceOf(SaveError);
    await expect(p).rejects.toThrow(/permission/i);
    await expect(p).rejects.not.toThrow(/PERMISSION_DENIED/);
  });

  it('offline: returns straight away as saved on this device', async () => {
    setOnline(false);
    let confirm;
    const res = await save(new Promise((r) => { confirm = r; }), 'Report');
    expect(res).toEqual({ queued: true });
    expect(getState().pending).toBe(1);
    confirm();
    await later(0, () => {});
    expect(getState().pending).toBe(0);
  });

  it('a slow connection counts as queued, and a later refusal shows as a toast', async () => {
    setOnline(true);
    let refuse;
    const res = await save(new Promise((_, r) => { refuse = r; }), 'Expense', { queueAfterMs: 10 });
    expect(res).toEqual({ queued: true });
    refuse(denied());
    await later(0, () => {});
    const [t] = getState().toasts;
    expect(t).toMatchObject({ kind: 'err' });
    expect(t.message).toMatch(/^Expense could not be saved\./);
  });

  it('tells the person whether it is saved or waiting to sync', () => {
    expect(savedText({ queued: false }, 'Expense')).toBe('Expense saved.');
    expect(savedText({ queued: true }, 'Expense')).toMatch(/saved on this device/);
  });
});
