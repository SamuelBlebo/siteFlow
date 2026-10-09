import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, signOut, updatePassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';
import { clearMustChangePassword } from './db';

// Firebase needs a recent sign-in to change a password, so we confirm the current one first
export async function changePassword(currentPassword, newPassword) {
  const u = auth.currentUser;
  if (!u?.email) throw Object.assign(new Error('Not signed in'), { code: 'unauthenticated' });
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, currentPassword));
  await updatePassword(u, newPassword);
  await clearMustChangePassword(u.uid);
}

export const resetPasswordEmail = (email) => sendPasswordResetEmail(auth, email);
export const logOut = () => signOut(auth);

// Team management goes through Cloud Functions: they check the role rules and log every change
export const call = (name) => (data) => httpsCallable(functions, name)(data).then((r) => r.data);
export const team = {
  invite: call('inviteMember'),
  update: call('updateMember'),
  setActive: call('setMemberActive'),
  resetPassword: call('resetMemberPassword'),
  remove: call('removeMember'),
  assignToSite: call('assignToSite'),
};

// Owner switches a module on or off (the server checks the role and recalculates the plan)
export const setModule = call('setModule');

// Sample projects (owner): add them, or remove them and everything under them
export const loadDemo = call('loadDemo');
export const removeDemo = call('removeDemo');

// Invitation links (no sign-in needed): what the link is for, and setting a password from it
export const inviteInfo = call('inviteInfo');
export const acceptInvite = call('acceptInvite');
