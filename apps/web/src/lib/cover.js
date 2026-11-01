import { doc, serverTimestamp } from 'firebase/firestore';
import { paths } from '@siteflow/shared';
import { db, getStorage } from '../firebase';
import { coverImage } from './photos';
import { guardWrite, updateDoc } from './preview';

// The project image: a visualization (render) or photo, shown on project cards and the project page.
// A new upload replaces the old one; the old file is removed.

const isOurs = (url, cid, sid) => typeof url === 'string' && url.includes(encodeURIComponent(paths.coverFile(cid, sid, '')));

export async function uploadCover(cid, sid, file, previous) {
  guardWrite();
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw Object.assign(new Error('Choose a JPG, PNG or WebP image.'), { code: 'invalid-argument' });
  const small = await coverImage(file);
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
  const r = ref(await getStorage(), paths.coverFile(cid, sid, `cover-${Date.now()}.jpg`));
  await uploadBytes(r, small, { contentType: small.type || 'image/jpeg' });
  const url = await getDownloadURL(r);
  await updateDoc(doc(db, paths.site(cid, sid)), { cover: url, updatedAt: serverTimestamp() });
  if (isOurs(previous, cid, sid)) await dropFile(previous);
  return url;
}

export async function removeCover(cid, sid, previous) {
  await updateDoc(doc(db, paths.site(cid, sid)), { cover: null, updatedAt: serverTimestamp() });
  if (isOurs(previous, cid, sid)) await dropFile(previous);
}

async function dropFile(url) {
  const { ref, deleteObject } = await import('firebase/storage');
  await deleteObject(ref(await getStorage(), url)).catch(() => {});
}
