import { useState } from 'react';

// The project image, or (until one is added, or if it can't load) a blueprint-style panel with the
// project's initials. Always 16:9 unless the parent sets a size.
const initials = (name = '') => name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'P';

export default function ProjectCover({ site, className = '', label = true }) {
  const [broken, setBroken] = useState(false);
  const show = site.cover && !broken;
  return (
    <div className={`cover ${show ? '' : 'none'} ${className}`}>
      {show
        ? <img src={site.cover} alt={label ? `${site.name}` : ''} loading="lazy" onError={() => setBroken(true)} />
        : <span className="cover-mark" aria-hidden="true">{initials(site.name)}</span>}
    </div>
  );
}
