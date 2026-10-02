// Rate limits on the team functions and keeping contact details out of the logs
import { describe, expect, it } from 'vitest';
import '../src/setup';
import { getFirestore } from 'firebase-admin/firestore';
import { LIMITS, checkLimit } from '../src/limits';
import { scrub } from '../src/notify';

const reset = (uid: string) => getFirestore().doc(`rateLimits/${uid}`).delete();

describe('rate limits', () => {
  it('allows up to the limit in the window, then refuses with when to try again', async () => {
    const uid = 'limit-user-1';
    await reset(uid);
    const t0 = 1_800_000_000_000;
    for (let i = 0; i < LIMITS.createCompany.max; i++) await checkLimit(uid, 'createCompany', t0 + i);
    await expect(checkLimit(uid, 'createCompany', t0 + 10 * 60 * 1000)).rejects.toMatchObject({
      code: 'resource-exhausted', message: expect.stringMatching(/Try again in 50 minutes/),
    });
  });

  it('a new window starts once the old one has passed', async () => {
    const uid = 'limit-user-2';
    await reset(uid);
    const t0 = 1_800_000_000_000;
    for (let i = 0; i < LIMITS.createCompany.max; i++) await checkLimit(uid, 'createCompany', t0);
    await expect(checkLimit(uid, 'createCompany', t0 + LIMITS.createCompany.windowMs)).resolves.toBeUndefined();
  });

  it('each kind of action is counted on its own, per person', async () => {
    await reset('limit-a'); await reset('limit-b');
    const t0 = 1_800_000_000_000;
    for (let i = 0; i < LIMITS.createCompany.max; i++) await checkLimit('limit-a', 'createCompany', t0);
    await expect(checkLimit('limit-a', 'invite', t0)).resolves.toBeUndefined();
    await expect(checkLimit('limit-b', 'createCompany', t0)).resolves.toBeUndefined();
  });
});

describe('logs', () => {
  it('provider errors are logged without phone numbers or emails', () => {
    const body = '{"error":{"message":"Recipient +233 24 123 4567 not on WhatsApp","to":"kofi.mensah@example.com","code":131026}}';
    const out = scrub(body);
    expect(out).not.toMatch(/241234567|123 4567|kofi\.mensah/);
    expect(out).toContain('[number]');
    expect(out).toContain('[email]');
    expect(out).toContain('131026'); // short codes are kept: they say what went wrong
    expect(scrub('x'.repeat(2000))).toHaveLength(500);
  });
});
