import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// The full-screen photo viewer: arrow keys or a swipe to move, Esc to close.
// items: [{ url, alt?, caption?, link?: { to, label } }]
export default function Lightbox({ items, index, onIndex, onClose }) {
  const n = items.length;
  const go = (step) => onIndex((index + step + n) % n);
  const startX = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((i) => (i + 1) % n);
      if (e.key === 'ArrowLeft') onIndex((i) => (i - 1 + n) % n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, onIndex, onClose]);
  const item = items[index];
  if (!item) return null;
  const stop = (e) => e.stopPropagation();

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Photo ${index + 1} of ${n}`} onClick={onClose}>
      <img src={item.url} alt={item.alt || `Photo ${index + 1}`} onClick={stop}
        onPointerDown={(e) => { startX.current = e.clientX; }}
        onPointerUp={(e) => {
          const dx = startX.current === null ? 0 : e.clientX - startX.current;
          startX.current = null;
          if (n > 1 && Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }} />
      {item.caption && <p className="viewer-cap" onClick={stop}>{item.caption}</p>}
      <div className="viewer-bar" onClick={stop}>
        {n > 1 && <button type="button" className="btn sm ghost" onClick={() => go(-1)}>Previous</button>}
        <span>{index + 1} of {n}</span>
        {n > 1 && <button type="button" className="btn sm ghost" onClick={() => go(1)}>Next</button>}
        {item.link && <Link className="btn sm ghost" to={item.link.to}>{item.link.label}</Link>}
        <a className="btn sm ghost" href={item.url} target="_blank" rel="noreferrer">Full size</a>
        <button type="button" className="btn sm" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
