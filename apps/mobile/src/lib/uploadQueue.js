import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import storage from '@react-native-firebase/storage';
import firestore from '@react-native-firebase/firestore';

const KEY = 'siteflow:photoQueue';
let running = false;

async function readQueue() {
  try { return JSON.parse(await AsyncStorage.getItem(KEY)) || []; } catch { return []; }
}
const writeQueue = (q) => AsyncStorage.setItem(KEY, JSON.stringify(q));

export async function enqueuePhotos(items) {
  if (!items.length) return;
  const q = await readQueue();
  await writeQueue([...q, ...items]);
  processQueue();
}

export async function pendingCount() {
  return (await readQueue()).length;
}

// Uploads queued photos one by one; stops at the first failure and retries later.
export async function processQueue() {
  if (running) return;
  running = true;
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;
    let q = await readQueue();
    for (const item of [...q]) {
      try {
        const path = `companies/${item.cid}/sites/${item.sid}/reports/${item.reportId}/${Date.now()}.jpg`;
        const ref = storage().ref(path);
        await ref.putFile(item.uri, { contentType: 'image/jpeg' });
        const url = await ref.getDownloadURL();
        await firestore().collection('companies').doc(item.cid).collection('sites').doc(item.sid)
          .collection('reports').doc(item.reportId)
          .update({ photos: firestore.FieldValue.arrayUnion(url) });
        q = q.filter((x) => x !== item);
        await writeQueue(q);
      } catch (e) {
        console.warn('Photo upload failed, will retry', e);
        break;
      }
    }
  } finally {
    running = false;
  }
}

// Call once at app start. Returns an unsubscribe function.
export function startUploadQueue() {
  processQueue();
  return NetInfo.addEventListener((s) => { if (s.isConnected) processQueue(); });
}
