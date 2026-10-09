import { useState } from 'react';
import { ROLE_LABELS, can as roleCan, friendlyError, isSiteScoped, prettyDate, todayKey } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { reportRequestsQuery, myReportRequestsQuery, teamQuery } from '../lib/db';
import { cancelReportRequest, requestReport } from '../lib/account';
import { toast } from '../lib/save';

const STATUS = { open: ['warn', 'Waiting'], done: ['ok', 'Report sent'], cancelled: ['', 'Cancelled'] };

// Project page: ask people for a report (WhatsApp and/or email), and see what was asked and what came in
export default function ReportRequests({ cid, site, startOpen }) {
  const { user, can } = useAuth();
  const [open, setOpen] = useState(!!startOpen);
  const { data: requests } = useQuery(() => cid && reportRequestsQuery(cid, site.id), [cid, site.id]);
  if (!can('sites.manage')) return null;
  const live = requests.filter((r) => r.status === 'open');
  return (
    <section className="panel requests mb">
      <div className="panel-h">
        <div><h2>Report requests</h2><p>{live.length ? `${live.length} waiting` : 'Ask someone on this project for a report. They get it by WhatsApp and/or email.'}</p></div>
        {!open && site.status !== 'closed' && <button type="button" className="btn gold sm" onClick={() => setOpen(true)}>Request a report</button>}
      </div>
      {open && <RequestForm cid={cid} site={site} onDone={() => setOpen(false)} />}
      {!!requests.length && (
        <ul className="list mt-sm">
          {requests.slice(0, 8).map((r) => (
            <li key={r.id}><div className="it">
              <span className="grow"><b>{r.toName}, {ROLE_LABELS[r.toRole]}</b>
                <small>Report for {prettyDate(r.due)}. Asked by {r.byName}{r.note ? `: “${r.note}”` : ''}. {[r.channels?.whatsapp && 'WhatsApp', r.channels?.email && 'email'].filter(Boolean).join(' and ') || 'In the app only'}.</small></span>
              <span className={`pill ${STATUS[r.status][0]}`}>{STATUS[r.status][1]}</span>
              {r.status === 'open' && (r.by === user.uid || can('team.manage')) && (
                <button type="button" className="btn ghost sm" onClick={async () => {
                  try { await cancelReportRequest({ siteId: site.id, id: r.id }); toast('Request cancelled.'); } catch (e) { toast(friendlyError(e), 'err'); }
                }}>Cancel</button>
              )}
            </div></li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestForm({ cid, site, onDone }) {
  const { user } = useAuth();
  const { data: members, loading } = useQuery(() => cid && teamQuery(cid), [cid]);
  // People who can send reports on this project (not the person asking)
  const people = members.filter((m) => m.id !== user.uid && m.active !== false && roleCan(m.role, 'site.work')
    && (!isSiteScoped(m.role) || m.siteIds?.includes(site.id))).sort((a, b) => a.name.localeCompare(b.name));
  const [f, setF] = useState({ uids: [], due: todayKey(), note: '', whatsapp: true, email: true });
  const [busy, setBusy] = useState(false);
  const chosen = people.filter((p) => f.uids.includes(p.id));
  const noPhone = f.whatsapp ? chosen.filter((p) => !p.phone).map((p) => p.name.split(' ')[0]) : [];
  const toggle = (id) => setF({ ...f, uids: f.uids.includes(id) ? f.uids.filter((x) => x !== id) : [...f.uids, id] });

  async function submit(e) {
    e.preventDefault();
    if (!f.uids.length) return toast('Choose who should send the report.', 'err');
    setBusy(true);
    try {
      const r = await requestReport({ siteId: site.id, ...f });
      toast(`Asked ${r.requested} ${r.requested === 1 ? 'person' : 'people'} for the report.`);
      onDone();
    } catch (e2) { toast(friendlyError(e2), 'err'); } finally { setBusy(false); }
  }
  return (
    <form className="form inline" onSubmit={submit}>
      <fieldset className="field"><legend>Who should send it</legend>
        {loading ? <p className="muted small">Loading the team…</p> : !people.length
          ? <p className="hint">Nobody else can send reports on this project yet. Add a supervisor under Team.</p>
          : <div className="chips">{people.map((p) => (
            <label key={p.id} className={`chip ${f.uids.includes(p.id) ? 'on' : ''}`}><input type="checkbox" checked={f.uids.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name} <small className="muted">({ROLE_LABELS[p.role]})</small></label>
          ))}</div>}
      </fieldset>
      <div className="grid2">
        <div className="field"><label htmlFor="rq-d">Report for</label><input id="rq-d" type="date" value={f.due} max={todayKey()} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
        <fieldset className="field"><legend>Send by</legend>
          <div className="chips">
            <label className="chip"><input type="checkbox" checked={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.checked })} /> WhatsApp</label>
            <label className="chip"><input type="checkbox" checked={f.email} onChange={(e) => setF({ ...f, email: e.target.checked })} /> Email</label>
          </div>
          <p className="hint">They also see it in the app.{noPhone.length ? ` No WhatsApp number for ${noPhone.join(', ')}: email only.` : ''}</p>
        </fieldset>
      </div>
      <div className="field"><label htmlFor="rq-n">Note (optional)</label><input id="rq-n" maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Include photos of the slab before the pour" /></div>
      <div className="actions"><button type="submit" className="btn gold" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

// Site team: requests waiting for me on this project
export function MyRequests({ cid, site }) {
  const { user } = useAuth();
  const { data } = useQuery(() => cid && user && myReportRequestsQuery(cid, site.id, user.uid), [cid, site.id, user?.uid]);
  const open = data.filter((r) => r.status === 'open');
  if (!open.length) return null;
  return (
    <div className="notice warn request-banner" role="status">
      {open.map((r) => (
        <p key={r.id}><b>{r.byName} ({ROLE_LABELS[r.byRole]})</b> asked for your daily report for {prettyDate(r.due)}{r.note ? `: “${r.note}”` : '.'}</p>
      ))}
    </div>
  );
}
