import { useEffect, useState } from 'react';

// Thumbnails that open a full-screen viewer (arrow keys to move, Esc to close). thumbs: small
// copies shown in the row (the full photo only downloads when opened); older records have none.
export default function PhotoViewer({ photos, thumbs = [], label = 'Site photo' }) {
  const [open, setOpen] = useState(-1);
  useEffect(() => {
    if (open < 0) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(-1);
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % photos.length);
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, photos.length]);
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
      {open >= 0 && (
        <div className="viewer" role="dialog" aria-modal="true" aria-label={`Photo ${open + 1} of ${photos.length}`} onClick={() => setOpen(-1)}>
          <img src={photos[open]} alt={`${label} ${open + 1}`} onClick={(e) => e.stopPropagation()} />
          <div className="viewer-bar" onClick={(e) => e.stopPropagation()}>
            {photos.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setOpen((open - 1 + photos.length) % photos.length)}>Previous</button>}
            <span>{open + 1} of {photos.length}</span>
            {photos.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setOpen((open + 1) % photos.length)}>Next</button>}
            <a className="btn sm ghost" href={photos[open]} target="_blank" rel="noreferrer">Full size</a>
            <button type="button" className="btn sm" onClick={() => setOpen(-1)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
