// Password change and profile updates on mobile, with React Native Firebase mocked
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = [];
const user = {
  uid: 'u1', email: 'kofi@example.com',
  reauthenticateWithCredential: vi.fn(async (cred) => { calls.push(['reauth', cred]); if (cred.password !== 'right-pass') throw { code: 'auth/invalid-credential' }; }),
  updatePassword: vi.fn(async (p) => { calls.push(['update', p]); }),
};
vi.mock('@react-native-firebase/auth', () => ({
  default: Object.assign(() => ({ currentUser: user, sendPasswordResetEmail: async () => {} }), {
    EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
  }),
}));
let failProfile = null;
vi.mock('@react-native-firebase/firestore', () => {
  const fs = () => ({ doc: (p) => ({ update: async (d) => { calls.push(['doc', p, d]); if (failProfile && 'name' in d) throw failProfile; } }) });
  fs.FieldValue = { serverTimestamp: () => 'ts' };
  return { default: fs };
});
const store = new Map();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); } },
}));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: async () => ({ isConnected: true }), addEventListener: () => () => {} } }));

const { changePassword, updateMyProfile } = await import('../src/lib/account');
const sync = await import('../src/lib/sync');

beforeEach(() => { calls.length = 0; failProfile = null; for (const f of sync.getSyncState().failed) sync.dismiss(f.id); });

describe('change password', () => {
  it('confirms the current password, sets the new one, then clears the first-sign-in flag', async () => {
    await changePassword('right-pass', 'new-pass-123');
    expect(calls.map((c) => c[0])).toEqual(['reauth', 'update', 'doc']);
    expect(calls[1][1]).toBe('new-pass-123');
    expect(calls[2]).toEqual(['doc', 'users/u1', { mustChangePassword: false, updatedAt: 'ts' }]);
  });
  it('a wrong current password changes nothing', async () => {
    await expect(changePassword('wrong', 'new-pass-123')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(calls.map((c) => c[0])).toEqual(['reauth']);
  });
});

describe('profile update', () => {
  it('writes name and phone to the user profile path', async () => {
    await updateMyProfile('u1', { name: 'Kofi Asante', phone: '0241234567' });
    expect(calls[0]).toEqual(['doc', 'users/u1', { name: 'Kofi Asante', phone: '0241234567', updatedAt: 'ts' }]);
  });
  it('a rejected update is kept for retry, not lost', async () => {
    failProfile = { code: 'firestore/permission-denied' };
    await updateMyProfile('u1', { name: 'Kofi Asante', phone: '' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(sync.getSyncState().failed[0]).toMatchObject({ label: 'Your details', op: 'updateMyProfile', args: ['u1', { name: 'Kofi Asante', phone: '' }] });
  });
});
