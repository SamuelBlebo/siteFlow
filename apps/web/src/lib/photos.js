import { PHOTO_THUMB_PX, PHOTO_THUMB_QUALITY, REPORT_PHOTO_MAX_PX, REPORT_PHOTO_QUALITY } from '@siteflow/shared';

// Shrinks a photo so its long edge is at most maxPx. Returns null if the browser can't decode it.
async function shrink(file, maxPx, quality) {
  if (typeof document === 'undefined' || !file.type?.startsWith('image/')) return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : null;
  } catch (e) {
    console.warn('Could not resize photo', e);
    return null;
  }
}

// Phone cameras produce 3-8 MB files; this gives ~200-500 KB. Falls back to the original file.
export async function resizePhoto(file) {
  const small = await shrink(file, REPORT_PHOTO_MAX_PX, REPORT_PHOTO_QUALITY);
  return small && small.size < file.size ? small : file;
}

// A ~20-40 KB copy for lists and thumbnails (null if the browser can't make one)
export const thumbnail = (file) => shrink(file, PHOTO_THUMB_PX, PHOTO_THUMB_QUALITY);
