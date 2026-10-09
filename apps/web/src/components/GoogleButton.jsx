import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { friendlyError } from '@siteflow/shared';
import { auth } from '../firebase';

// "Continue with Google". Someone already in a company (invited with that Gmail address) goes
// straight in; a new person goes on to set up their company (Finish setting up).
export default function GoogleButton({ onError }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      // Pop-ups blocked (some phones and in-app browsers): go to Google and come back instead
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, provider);
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
        console.error('Google sign-in failed', e);
        onError?.(e?.code === 'auth/operation-not-allowed' ? 'Google sign-in is not switched on yet. Use your email and password.' : friendlyError(e, 'Could not sign in with Google. Try again.'));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="btn ghost block google" onClick={go} disabled={busy}>
      <svg viewBox="0 0 18 18" aria-hidden="true" width="18" height="18">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
      </svg>
      {busy ? 'Opening Google…' : 'Continue with Google'}
    </button>
  );
}
