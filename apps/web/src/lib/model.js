import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { checkModelFile, paths } from '@siteflow/shared';
import { db, getStorage } from '../firebase';

// The architect's 3D model (IFC or GLB / glTF), one per project. A new upload replaces the old one;
// the old file is removed only once the project points at the new one.

const isOurs = (url, cid, sid) => typeof url === 'string' && url.includes(encodeURIComponent(paths.modelFile(cid, sid, '')));

export async function uploadModel(cid, sid, file, previous, { uid, name }, onProgress) {
  const check = checkModelFile(file.name, file.size);
  if ('error' in check) throw Object.assign(new Error(check.error), { code: 'invalid-argument' });
  const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
  const r = ref(await getStorage(), paths.modelFile(cid, sid, `model-${Date.now()}.${check.ext}`));
  const task = uploadBytesResumable(r, file, { contentType: check.contentType });
  if (onProgress) task.on('state_changed', (s) => onProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)));
  await task;
  const model = {
    file: await getDownloadURL(r), kind: check.kind, name: file.name.slice(0, 200),
    sizeMb: Math.round((file.size / (1024 * 1024)) * 10) / 10, uploadedBy: uid, uploadedByName: name, uploadedAt: serverTimestamp(),
  };
  try {
    await updateDoc(doc(db, paths.site(cid, sid)), { model, updatedAt: serverTimestamp() });
  } catch (e) {
    await dropFile(model.file); // not saved on the project, so the uploaded file would be left over
    throw e;
  }
  if (isOurs(previous?.file, cid, sid)) await dropFile(previous.file);
  return model;
}

export async function removeModel(cid, sid, previous) {
  await updateDoc(doc(db, paths.site(cid, sid)), { model: null, updatedAt: serverTimestamp() });
  if (isOurs(previous?.file, cid, sid)) await dropFile(previous.file);
}

async function dropFile(url) {
  const { ref, deleteObject } = await import('firebase/storage');
  await deleteObject(ref(await getStorage(), url)).catch(() => {});
}
