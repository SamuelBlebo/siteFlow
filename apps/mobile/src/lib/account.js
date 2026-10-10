import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { paths } from '@siteflow/shared';
import { journaled, registerChecks, registerOps } from './sync';

// Firebase needs a recent sign-in to change a password, so we confirm the current one first
export async function changePassword(currentPassword, newPassword) {
  const u = auth().currentUser;
  if (!u?.email) throw Object.assign(new Error('Not signed in'), { code: 'unauthenticated' });
  await u.reauthenticateWithCredential(auth.EmailAuthProvider.credential(u.email, currentPassword));
  await u.updatePassword(newPassword);
  await firestore().doc(paths.user(u.uid)).update({ mustChangePassword: false, updatedAt: firestore.FieldValue.serverTimestamp() });
}

export const resetPasswordEmail = (email) => auth().sendPasswordResetEmail(email);

// Works offline like other writes; a rejection is kept and shown by the sync banner
export function updateMyProfile(uid, input) {
  const { name, phone } = input;
  return journaled({ label: 'Your details', op: 'updateMyProfile', args: [uid, input] },
    () => firestore().doc(paths.user(uid)).update({ name, phone, updatedAt: firestore.FieldValue.serverTimestamp() }));
}

// Report and issue emails (logic/mail in shared). Saved straight away; offline it waits in Firestore's queue.
export const saveEmailPrefs = (uid, prefs) => firestore().doc(paths.user(uid)).update({ emailPrefs: prefs, updatedAt: firestore.FieldValue.serverTimestamp() });

registerOps({ updateMyProfile });
registerChecks({
  updateMyProfile: async (uid, { name, phone }) => {
    const d = await firestore().doc(paths.user(uid)).get({ source: 'server' });
    const p = d.data();
    return !!p && p.name === name && (p.phone || '') === (phone || '');
  },
});
