import { deleteDoc as fsDeleteDoc, setDoc as fsSetDoc, updateDoc as fsUpdateDoc, writeBatch as fsWriteBatch } from 'firebase/firestore';
import { toast } from './save';

// View as: an owner or admin sees the app as another role or person. It is a preview only, so
// every write to company data is refused here while it is on. The person's own settings
// (users/{uid}: pins, skin, email settings, account) still save. The security rules are untouched.

let who = null; // e.g. "Site supervisor" or "Kofi Mensah (Site supervisor)" while previewing

export const setPreview = (label) => { who = label || null; };
export const previewing = () => who;

const ownDoc = (ref) => /^users\/[^/]+$/.test(ref?.path || '');

export function previewError() {
  const message = `You're viewing as ${who}. Go back to your view to make changes.`;
  toast(message, 'warn');
  return Object.assign(new Error(message), { code: 'preview' });
}

// Throws (and shows the toast) while previewing; for Storage uploads and callables that write
export function guardWrite() {
  if (who) throw previewError();
}
const refuse = () => Promise.reject(previewError());

// Drop-in replacements for the Firestore writes used in lib/
export const updateDoc = (ref, ...rest) => (who && !ownDoc(ref) ? refuse() : fsUpdateDoc(ref, ...rest));
export const setDoc = (ref, ...rest) => (who && !ownDoc(ref) ? refuse() : fsSetDoc(ref, ...rest));
export const deleteDoc = (ref) => (who && !ownDoc(ref) ? refuse() : fsDeleteDoc(ref));
export function writeBatch(db) {
  const b = fsWriteBatch(db);
  let company = false;
  const mark = (fn) => (ref, ...rest) => { if (!ownDoc(ref)) company = true; fn.call(b, ref, ...rest); return wrapped; };
  const wrapped = {
    set: mark(b.set), update: mark(b.update), delete: mark(b.delete),
    commit: () => (who && company ? refuse() : b.commit()),
  };
  return wrapped;
}

// Callables that keep working in a preview: the ones that only read, and the person's own
// account and email settings. Every other callable writes company data.
const ALLOWED = new Set(['inviteInfo', 'emailSettings', 'aiOverview', 'saveEmailSettings', 'migrateAccount']);
export const callAllowed = (name) => !who || ALLOWED.has(name);
