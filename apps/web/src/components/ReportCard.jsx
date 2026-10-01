import { Link } from 'react-router-dom';
import { prettyDate } from '@siteflow/shared';
import PhotoViewer from './PhotoViewer';

// A report in a list: the essentials, linking to the full report
export function ReportRow({ r, showSite }) {
  return (
    <li>
      <Link className="it report-row" to={`/reports/${r.siteId}/${r.id}`}>
        <span className="grow">
          <b>{showSite ? `${r.siteName}, ` : ''}{prettyDate(r.date)}</b>
          <small>{r.createdByName}, sent {r.time}. {r.workersPresent} workers, {r.stage} {r.progress}%{r.weather ? `, ${r.weather.toLowerCase()}` : ''}</small>
          <span className="excerpt">{r.text}</span>
        </span>
        <span className="tags">
          {(r.issues || '').trim() && <span className="pill bad">Issue</span>}
          {!!r.photos?.length && <span className="pill">{r.photos.length} photo{r.photos.length === 1 ? '' : 's'}</span>}
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
        By {r.createdByName}{r.source === 'app' ? ' (phone)' : ''}. {r.workersPresent} workers on site. Stage: {r.stage}, {r.progress}% complete.
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
      <PhotoViewer photos={r.photos || []} label={`${r.siteName || 'Site'} photo`} />
      {pending > 0 && <p className="hint">{pending} more photo{pending === 1 ? ' is' : 's are'} still uploading from the phone.</p>}
    </article>
  );
}
