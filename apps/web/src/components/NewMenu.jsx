import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { newChoiceHref, newChoices, pickProject } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useDocsByIds, useQuery } from '../lib/hooks';
import { companyDoc, siteDoc, sitesCol } from '../lib/db';
import { usePins } from './PinButton';
import Icon from './Icons';

// "+ New": add a daily report, issue, attendance, delivery, expense or project from anywhere.
// Only what the person can add is listed. The project is the one you're on, your only open one,
// or picked from a short list. top: a button and menu in the top bar; bar: the round + in the
// phone's bottom bar, with a sheet that slides up.
export default function NewMenu({ variant = 'top' }) {
  const { cid, role, can, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(null); // waiting for a project to be picked
  const box = useRef(null);
  const button = useRef(null);
  const sheet = useRef(null); // the phone sheet lives outside the bar (createPortal), so outside clicks check it too
  const all = can('sites.all');
  const { data: company } = useDoc(() => cid && companyDoc(cid), [cid]);
  const { data: allSites, loading: allLoading } = useQuery(() => all && cid && sitesCol(cid), [cid, all]);
  const mine = useDocsByIds((sid) => siteDoc(cid, sid), all || !cid ? [] : profile?.siteIds || [], [cid]);
  const sites = all ? allSites : mine.data;
  const loadingSites = all ? allLoading : mine.loading;
  const pinned = usePins();
  const choices = newChoices({ role, company });

  const close = (refocus = true) => {
    setOpen(false);
    setChoice(null);
    if (refocus) button.current?.focus();
  };
  useEffect(() => { setOpen(false); setChoice(null); }, [pathname]);
  // The phone sheet holds the page still behind it, like the More sheet
  useEffect(() => {
    if (!open || variant !== 'bar') return undefined;
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, [open, variant]);
  // Keyboard: the first choice (or project) gets focus when the menu opens or moves to the project list
  useEffect(() => {
    if (open) (sheet.current || box.current)?.querySelector('.uitem')?.focus();
  }, [open, choice]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target) && !sheet.current?.contains(e.target)) close(false); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentSiteId = pathname.match(/^\/sites\/([^/]+)$/)?.[1] ?? null;
  const go = (to) => { close(false); navigate(to); };
  const here = currentSiteId === 'new' ? null : currentSiteId;
  // A choice made while projects were still loading: pick the project as soon as they arrive
  useEffect(() => {
    if (!choice || loadingSites) return;
    const picked = pickProject(sites, { currentSiteId: here, pinned });
    if ('siteId' in picked) go(newChoiceHref(choice.key, picked.siteId));
  }, [loadingSites]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!choices.length) return null;

  function choose(c) {
    if (!c.needsProject) return go(newChoiceHref(c.key));
    setChoice(c);
    if (loadingSites) return; // the effect above picks once the projects are in
    const picked = pickProject(sites, { currentSiteId: here, pinned });
    if ('siteId' in picked) go(newChoiceHref(c.key, picked.siteId));
  }
  const byId = Object.fromEntries(sites.map((s) => [s.id, s]));
  const picking = choice && pickProject(sites, { pinned });
  const list = choice ? (
    <>
      <p className="new-step">{choice.label}: which project?</p>
      {loadingSites ? <p className="hint">Loading your projects…</p> : 'choose' in picking && picking.choose.length
        ? picking.choose.map((id) => <button key={id} type="button" className="uitem" onClick={() => go(newChoiceHref(choice.key, id))}><Icon name="projects" />{byId[id]?.name}</button>)
        : <p className="hint">You have no open projects to add this to.</p>}
      <button type="button" className="uitem muted" onClick={() => setChoice(null)}>← Back</button>
    </>
  ) : choices.map((c) => <button key={c.key} type="button" className="uitem" onClick={() => choose(c)}><Icon name={ICONS[c.key]} />{c.label}</button>);

  if (variant === 'bar') {
    return (
      <div className="new-fab-wrap" ref={box}>
        <button type="button" ref={button} className="new-fab" aria-label="New" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
          <Icon name="plus" />
        </button>
        {open && createPortal(
          <div className="bsheet-bg">
            <div className="bsheet new-sheet" role="dialog" aria-modal="true" aria-label="Add new" ref={sheet}>
              <div className="bsheet-h"><b>Add new</b><button type="button" className="iconbtn" aria-label="Close" onClick={() => close()}><Icon name="close" /></button></div>
              {list}
            </div>
          </div>,
          document.body,
        )}
      </div>
    );
  }
  return (
    <div className="umenu new-top" ref={box}>
      <button type="button" ref={button} className="btn gold new-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <Icon name="plus" />New
      </button>
      {open && (
        // Closes when keyboard focus moves on past it
        <div className="upanel new-panel" role="dialog" aria-label="Add new" onBlur={(e) => { if (!box.current?.contains(e.relatedTarget)) close(false); }}>{list}</div>
      )}
    </div>
  );
}

const ICONS = { report: 'write', issue: 'issues', attendance: 'team', delivery: 'projects', expense: 'finance', project: 'projects' };
