import { useMemo, useState } from 'react';
import { galleryPhotos, galleryWeeks, prettyDate, thenAndNow } from '@siteflow/shared';
import { useQuery } from '../lib/hooks';
import { Empty } from './States';
import Lightbox from './Lightbox';

// Every photo from the daily reports, newest first and grouped by week, with the stage and progress
// of the week, so scrolling down shows how the project has moved along. Issue photos on request.
// reports: loaded page by page by the caller (hasMore / onMore). issuesQuery: made only when asked;
// siteId and from keep issues to the page's project and period.
export default function PhotoGallery({ reports, hasMore, loadingMore, onMore, issuesQuery, siteId = '', from = '', showSite = false }) {
  const [withIssues, setWithIssues] = useState(false);
  const { data: issues } = useQuery(() => withIssues && issuesQuery(), [withIssues, siteId]);
  const photos = useMemo(() => galleryPhotos(reports, withIssues ? issues : [], { siteId, from }), [reports, issues, withIssues, siteId, from]);
  const weeks = useMemo(() => galleryWeeks(photos), [photos]);
  // Then and now only makes sense for one project
  const story = useMemo(() => (showSite ? [] : thenAndNow(photos)), [photos, showSite]);
  const [open, setOpen] = useState(null); // { list, index }

  const items = (list) => list.map((p) => ({
    url: p.url, alt: `${p.siteName} photo, ${prettyDate(p.date)}`,
    caption: [showSite && p.siteName, prettyDate(p.date), p.by, p.stage].filter(Boolean).join(' · '),
    link: p.source === 'report' ? { to: `/reports/${p.siteId}/${p.refId}`, label: 'View report' } : { to: `/issues/${p.siteId}/${p.refId}`, label: 'View issue' },
  }));
  const tile = (list, p, i) => (
    <button key={`${p.refId}/${p.url}`} type="button" className="gal-tile" onClick={() => setOpen({ list, index: i })} aria-label={`Open photo from ${prettyDate(p.date)}`}>
      <img src={p.thumb} alt="" loading="lazy" decoding="async" />
      {p.source === 'issue' && <span className="pill warn">Issue</span>}
    </button>
  );
  const shown = weeks.flatMap((w) => w.photos);

  return (
    <div className="gallery">
      <div className="toolbar">
        <div className="chips">
          <label className="chip"><input type="checkbox" checked={withIssues} onChange={(e) => setWithIssues(e.target.checked)} /> Show issue photos</label>
        </div>
      </div>
      {!photos.length ? (
        <Empty title="No photos yet.">Photos added to daily reports will show here.</Empty>
      ) : (
        <>
          {story.length > 0 && (
            <section className="gal-story" aria-labelledby="gal-story-h">
              <h3 id="gal-story-h" className="sub">Then and now</h3>
              <div className="gal-strip">
                {story.map((p, i) => (
                  <figure key={`${p.refId}/${p.url}`}>
                    {tile(story, p, i)}
                    <figcaption>{prettyDate(p.date)}{p.progress != null ? ` · ${p.progress}%` : ''}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
          {weeks.map((w) => (
            <section key={w.week} className="gal-week" aria-label={w.label}>
              <h3 className="sub">{[w.label, w.stage, w.progress != null && `${w.progress}%`].filter(Boolean).join(' · ')}</h3>
              <div className="gal-grid">{w.photos.map((p) => tile(shown, p, shown.indexOf(p)))}</div>
            </section>
          ))}
        </>
      )}
      {hasMore && <button type="button" className="btn ghost mt-sm" disabled={loadingMore} onClick={onMore}>{loadingMore ? 'Loading…' : 'Load earlier photos'}</button>}
      {open && <Lightbox items={items(open.list)} index={open.index} onIndex={(i) => setOpen((o) => ({ ...o, index: typeof i === 'function' ? i(o.index) : i }))} onClose={() => setOpen(null)} />}
    </div>
  );
}
