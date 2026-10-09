import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

// Per-person limits on the team functions, so a stolen login or a script can't create hundreds
// of accounts or reset passwords in a loop. Counts live in rateLimits/{uid}, which only the
// server can read or write (no security rule opens it).
export const LIMITS = {
  createCompany: { max: 5, windowMs: 60 * 60 * 1000 },     // sign-up attempts per hour
  invite: { max: 30, windowMs: 60 * 60 * 1000 },           // new team members per hour
  resetPassword: { max: 20, windowMs: 60 * 60 * 1000 },    // temporary passwords per hour
  teamChange: { max: 200, windowMs: 60 * 60 * 1000 },      // role, site, on/off and removal changes per hour
  settings: { max: 100, windowMs: 60 * 60 * 1000 },        // module switches per hour
  demo: { max: 10, windowMs: 60 * 60 * 1000 },
  requests: { max: 60, windowMs: 60 * 60 * 1000 },         // report requests per hour             // adding or removing the sample projects per hour
} as const;
export type LimitKey = keyof typeof LIMITS;

export async function checkLimit(uid: string, key: LimitKey, now = Date.now()) {
  const { max, windowMs } = LIMITS[key];
  const ref = getFirestore().doc(`rateLimits/${uid}`);
  await getFirestore().runTransaction(async (t) => {
    const cur = (await t.get(ref)).data()?.[key] as { count: number; since: number } | undefined;
    const fresh = !cur || now - cur.since >= windowMs;
    const count = fresh ? 0 : cur.count;
    if (count >= max) {
      const mins = Math.max(1, Math.ceil((cur!.since + windowMs - now) / 60000));
      throw new HttpsError('resource-exhausted', `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
    t.set(ref, { [key]: { count: count + 1, since: fresh ? now : cur!.since } }, { merge: true });
  });
}
