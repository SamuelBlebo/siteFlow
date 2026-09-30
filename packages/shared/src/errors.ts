// Turns Firebase and network errors into messages a site team can act on.
// The raw error should still be logged by the caller; never show it to users.

const BY_CODE: Record<string, string> = {
  'permission-denied': "You don't have permission to do this. Ask your manager if you need access.",
  unauthenticated: 'Your session has ended. Sign in again.',
  unavailable: "Can't reach SiteFlow right now. Check your connection and try again.",
  'deadline-exceeded': 'This is taking too long. Check your connection and try again.',
  'not-found': 'This item no longer exists. It may have been removed.',
  'already-exists': 'This already exists.',
  'resource-exhausted': 'Too many requests. Wait a minute and try again.',
  'invalid-argument': 'Some details are missing or wrong. Check the form and try again.',
  'failed-precondition': "This can't be done right now. Refresh and try again.",
  cancelled: 'The request was cancelled. Try again.',
  'auth/invalid-credential': 'Email or password is wrong. Check them and try again.',
  'auth/wrong-password': 'Email or password is wrong. Check them and try again.',
  'auth/user-not-found': 'Email or password is wrong. Check them and try again.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/weak-password': 'Use a stronger password with at least 8 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': "Can't reach SiteFlow. Check your connection and try again.",
  'auth/requires-recent-login': 'For your security, sign out and sign in again, then retry.',
  'auth/user-disabled': 'This account has been switched off. Ask your manager.',
};

export const GENERIC_ERROR = 'Something went wrong. Try again.';

// Normalises codes from the web SDK ("permission-denied"), React Native Firebase
// ("firestore/permission-denied") and callable functions ("functions/permission-denied").
export function errorCode(e: unknown): string {
  const raw = (e as { code?: unknown } | null)?.code;
  if (typeof raw !== 'string') return '';
  return raw.startsWith('auth/') ? raw : raw.replace(/^(firestore|storage|functions)\//, '');
}

export function friendlyError(e: unknown, fallback = GENERIC_ERROR): string {
  const raw = (e as { code?: unknown } | null)?.code;
  const code = errorCode(e);
  // Our own Cloud Functions already throw user-facing messages, except for internal errors
  if (typeof raw === 'string' && raw.startsWith('functions/') && code !== 'internal' && code !== 'unknown') {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  if (code === 'unauthorized') return BY_CODE['permission-denied']; // storage/unauthorized
  return BY_CODE[code] ?? fallback;
}

// Errors worth retrying automatically (connection problems), as opposed to
// errors that will fail again until something changes (permissions, bad data).
export function isRetryable(e: unknown): boolean {
  return ['unavailable', 'deadline-exceeded', 'cancelled', 'resource-exhausted', 'auth/network-request-failed', 'retry-limit-exceeded']
    .includes(errorCode(e));
}
