import { Link } from 'react-router-dom';
import { prettyDate, reportAuthor } from '@siteflow/shared';
import PhotoViewer from './PhotoViewer';
import Icon from './Icons';

// A report in a list: the essentials, linking to the full report
export function ReportRow({ r, showSite }) {
  return (
    <li>
      <Link className="it report-row" to={`/reports/${r.siteId}/${r.id}`}>
        <span className="grow">
          <small>{showSite ? `${r.siteName}, ` : ''}{prettyDate(r.date)} · {reportAuthor(r)}, sent {r.time}</small>
          <b className="excerpt">{r.text}</b>
          <span className="rfacts">
            <span><Icon name="team" />{r.workersPresent} workers</span>
            <span>{r.stage} {r.progress}%</span>
            {r.weather && <span>{r.weather}</span>}
          </span>
        </span>
        {!!(r.thumbs?.length || r.photos?.length) && (
          <span className="rthumbs" aria-label={`${r.photos?.length || r.thumbs.length} photos`}>
            {(r.thumbs?.length ? r.thumbs : r.photos).slice(0, 3).map((u) => <img key={u} src={u} alt="" loading="lazy" />)}
            {(r.photos?.length || 0) > 3 && <span className="more">+{r.photos.length - 3}</span>}
          </span>
        )}
        <span className="tags">
          {r.review?.status === 'changes_requested' && <span className="pill warn">Changes requested</span>}
          {r.review?.status === 'updated' && <span className="pill ok">Updated</span>}
          {(r.issues || '').trim() && <span className="pill bad">Issue</span>}
          {(r.photoCount || 0) > (r.photos?.length || 0) && <span className="pill warn">Photos uploading</span>}
        </span>
      </Link>
    </li>
  );
}

// The full report
export default function ReportCard({ r, showSite }) {
  const pending = (r.photoCount || 0) - (r.photos?.length || 0);
  return (
    <article className="report">
      <h3>{showSite ? <><Link to={`/sites/${r.siteId}`}>{r.siteName}</Link>, </> : ''}{prettyDate(r.date)}, sent {r.time}</h3>
      <p className="muted small">
        {r.editedAt && <span className="pill ok edited">Updated after a request</span>} By <b>{reportAuthor(r)}</b>{r.createdByEmail ? <> (<a href={`mailto:${r.createdByEmail}`}>{r.createdByEmail}</a>)</> : null}{r.source === 'app' ? ', from the phone' : ''}. {r.workersPresent} workers on site. Stage: {r.stage}, {r.progress}% complete.
        {r.weather ? ` Weather: ${r.weather}.` : ''}
      </p>
      <h4>Work done</h4>
      <p className="prewrap">{r.text}</p>
      {(r.issues || '').trim() && <><h4>Issues or delays</h4><p className="issue prewrap">{r.issues}</p></>}
      {(r.notes || '').trim() && <><h4>Notes</h4><p className="prewrap">{r.notes}</p></>}
      {!!r.materialsUsed?.length && (
        <>
          <h4>Materials used</h4>
          <ul className="inline-list">{r.materialsUsed.map((m) => <li key={m.materialId}>{m.name}: {m.qty} {m.unit}</li>)}</ul>
        </>
      )}
      {(!!r.photos?.length || pending > 0) && <h4>Photos</h4>}
      <PhotoViewer photos={r.photos || []} thumbs={r.thumbs} label={`${r.siteName || 'Site'} photo`} />
      {pending > 0 && <p className="hint">{pending} more photo{pending === 1 ? ' is' : 's are'} still uploading from the phone.</p>}
    </article>
  );
}
