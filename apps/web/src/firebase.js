import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Offline cache: reads work offline and writes queue until the connection returns
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
// Storage is only needed to upload photos, so it is downloaded the first time a photo is sent
let storage = null;
export async function getStorage() {
  if (!storage) {
    const s = await import('firebase/storage');
    storage = s.getStorage(app);
    if (import.meta.env.VITE_USE_EMULATORS === 'true') s.connectStorageEmulator(storage, '127.0.0.1', port('STORAGE', 9199));
  }
  return storage;
}
export const functions = getFunctions(app, 'europe-west1');

// Emulator ports from firebase.json; the automated tests use firebase.test.json's ports instead
function port(name, fallback) { return Number(import.meta.env[`VITE_EMULATOR_${name}_PORT`] || fallback); }
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, `http://127.0.0.1:${port('AUTH', 9099)}`, { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', port('FIRESTORE', 8080));
  connectFunctionsEmulator(functions, '127.0.0.1', port('FUNCTIONS', 5001));
}
