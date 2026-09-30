import { prettyDate } from '@siteflow/shared';

export default function ReportCard({ r }) {
  return (
    <article className="report">
      <h3>{prettyDate(r.date)}, sent {r.time}</h3>
      <p className="muted small">By {r.createdByName}, {r.workersPresent} workers on site, stage: {r.stage} ({r.progress}%)</p>
      <p style={{ marginTop: 8 }}>{r.text}</p>
      {r.issues && <p className="issue"><b>Issue:</b> {r.issues}</p>}
      {!!r.photos?.length && (
        <div className="thumbs">
          {r.photos.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Site photo" /></a>)}
        </div>
      )}
    </article>
  );
}
