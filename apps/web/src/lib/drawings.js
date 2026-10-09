import { collection, deleteDoc, doc, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { DRAWING_TYPES, fitSize, paths } from '@siteflow/shared';
import { db, getStorage } from '../firebase';

// Project drawings: files in Storage (paths.drawingFile), one document per sheet with its marked areas

export const drawingsQuery = (cid, sid) => query(collection(db, paths.sub(cid, sid, 'drawings')), orderBy('createdAt', 'asc'));
const drawingRef = (cid, sid, id) => doc(db, paths.subDoc(cid, sid, 'drawings', id));

// Page 1 of a PDF as a picture. pdf.js is loaded only when a PDF is chosen (it is large).
async function pdfPage(file) {
  // pdf.js 4 uses Promise.withResolvers, missing on older Safari
  if (!Promise.withResolvers) {
    Promise.withResolvers = function withResolvers() { let resolve; let reject; const promise = new this((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
  }
  const pdfjs = await import('pdfjs-dist');
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  // No eval (pdf.js's safe mode for fonts); the drawing is only drawn, never run
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const { width } = fitSize(base.width * 4, base.height * 4, 4096); // sharp enough to zoom into
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { canvas, pages: pdf.numPages };
  } finally {
    pdf.destroy();
  }
}

async function imageCanvas(file) {
  const bmp = await createImageBitmap(file);
  const { width, height } = fitSize(bmp.width, bmp.height, 4096);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  return { canvas, pages: 1 };
}

const toBlob = (canvas, type, q) => new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Could not read the drawing.'))), type, q));

// Reads a chosen file into what is shown: a PNG for line drawings (PDF or PNG), JPEG for photos and scans
export async function prepareDrawing(file) {
  if (!DRAWING_TYPES.includes(file.type)) throw Object.assign(new Error('Choose a PDF or an image (PNG or JPG).'), { code: 'invalid-argument' });
  const { canvas, pages } = file.type === 'application/pdf' ? await pdfPage(file) : await imageCanvas(file);
  const png = file.type === 'application/pdf' || file.type === 'image/png';
  const image = await toBlob(canvas, png ? 'image/png' : 'image/jpeg', 0.9);
  return { image, imageType: png ? 'image/png' : 'image/jpeg', width: canvas.width, height: canvas.height, pages };
}

async function upload(path, blob, contentType) {
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
  const r = ref(await getStorage(), path);
  await uploadBytes(r, blob, { contentType });
  return getDownloadURL(r);
}

// Uploads the original and the picture, then saves the sheet. Returns its id.
export async function addDrawing(cid, sid, input, file, prepared, { uid, name }) {
  const ref = doc(collection(db, paths.sub(cid, sid, 'drawings')));
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg');
  const fileUrl = await upload(paths.drawingFile(cid, sid, ref.id, `original.${ext}`), file, file.type);
  // The picture is always stored: page 1 of a PDF, or the image scaled and turned the right way up
  const imageUrl = await upload(paths.drawingFile(cid, sid, ref.id, `sheet.${prepared.imageType === 'image/png' ? 'png' : 'jpg'}`), prepared.image, prepared.imageType);
  await setDoc(ref, {
    title: input.title, sheet: input.sheet, discipline: input.discipline,
    file: fileUrl, fileType: file.type, image: imageUrl, width: prepared.width, height: prepared.height, zones: [],
    createdBy: uid, createdByName: name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export const saveZones = (cid, sid, id, zones) => updateDoc(drawingRef(cid, sid, id), { zones, updatedAt: serverTimestamp() });
export const renameDrawing = (cid, sid, id, { title, sheet, discipline }) => updateDoc(drawingRef(cid, sid, id), { title, sheet, discipline, updatedAt: serverTimestamp() });
export const setOverviewDrawing = (cid, sid, drawingId) => updateDoc(doc(db, paths.site(cid, sid)), { overviewDrawingId: drawingId, updatedAt: serverTimestamp() });

// Deletes the sheet and its files. Pins on issues stay but no longer show (the drawing is gone).
export async function deleteDrawing(cid, sid, id) {
  await deleteDoc(drawingRef(cid, sid, id));
  const { ref, listAll, deleteObject } = await import('firebase/storage');
  const folder = ref(await getStorage(), paths.drawingFile(cid, sid, id, '').replace(/\/$/, ''));
  const { items } = await listAll(folder).catch(() => ({ items: [] }));
  await Promise.all(items.map((i) => deleteObject(i).catch(() => {})));
}
