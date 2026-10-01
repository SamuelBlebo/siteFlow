import { REPORT_PHOTO_MAX_PX, REPORT_PHOTO_QUALITY } from '@siteflow/shared';

// Shrinks a photo before upload (phone cameras produce 3-8 MB files; this gives ~200-500 KB).
// Falls back to the original file if the browser can't decode it.
export async function resizePhoto(file) {
  if (typeof document === 'undefined' || !file.type?.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, REPORT_PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', REPORT_PHOTO_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    console.warn('Could not resize photo, uploading the original', e);
    return file;
  }
}
