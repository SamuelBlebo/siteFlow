import { useState } from 'react';
import Lightbox from './Lightbox';

// Thumbnails that open a full-screen viewer (arrow keys to move, Esc to close). thumbs: small
// copies shown in the row (the full photo only downloads when opened); older records have none.
export default function PhotoViewer({ photos, thumbs = [], label = 'Site photo' }) {
  const [open, setOpen] = useState(-1);
  if (!photos?.length) return null;

  return (
    <>
      <div className="thumbs">
        {photos.map((u, i) => (
          <button key={u} type="button" className="thumb" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${photos.length}`}>
            <img src={thumbs[i] || u} alt={`${label} ${i + 1}`} loading="lazy" decoding="async" width="110" height="82" />
          </button>
        ))}
      </div>
      {open >= 0 && <Lightbox items={photos.map((url, i) => ({ url, alt: `${label} ${i + 1}` }))} index={open} onIndex={setOpen} onClose={() => setOpen(-1)} />}
    </>
  );
}
