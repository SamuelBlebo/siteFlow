import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, signOut, updatePassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';
import { clearMustChangePassword } from './db';
import { callAllowed, previewError } from './preview';

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
// While previewing (View as) only the callables that read are allowed
export const call = (name) => (data) => (callAllowed(name) ? httpsCallable(functions, name)(data).then((r) => r.data) : Promise.reject(previewError()));
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

// Asking people for a report (owners, admins and project managers), and cancelling a request
export const requestReport = call('requestReport');
export const cancelReportRequest = call('cancelReportRequest');

// Accounts made before one login could belong to several companies are moved over on first sign-in
export const migrateAccount = call('migrateAccount');

// Owner deletes a project and everything on it (the server checks the role and the typed name)
export const deleteProject = call('deleteProject');

// Email settings from the link in an email (no sign-in: the link is signed)
export const emailSettings = call('emailSettings');
export const saveEmailSettings = call('saveEmailSettings');

// AI overview of a project or its day (SiteFlow AI module)
export const aiOverview = call('aiOverview');

// Send a daily report back to its author with what to change (owners, admins, project managers)
export const requestReportChanges = call('requestReportChanges');

// Wages for a period: worked out on the server from attendance and rates; the period is locked once paid
export const recordWages = call('recordWages');
