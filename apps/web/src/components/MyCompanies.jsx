import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDoc, getDocs } from 'firebase/firestore';
import { isSiteScoped, membershipSummary } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { companyDoc, memberDoc, siteDoc, sitesCol } from '../lib/db';
import { Loading } from './States';

// Every company this login belongs to, with the person's real role there (not a View as preview)
// and the projects that role covers. Read once when the page opens; one company failing to load
// doesn't hide the others.
async function loadOne(cid, uid) {
  try {
    // A switched-off seat can't read the company itself, so that read may fail: the row still shows the role
    const [c, m] = await Promise.all([getDoc(companyDoc(cid)).catch(() => null), getDoc(memberDoc(cid, uid))]);
    if (!m.exists()) return null;
    const company = c?.exists() ? c.data() : null;
    const member = m.data();
    let sites = [];
    // A paused company or a switched-off seat can't read its projects
    if (member.active !== false && !company?.suspended) {
      sites = isSiteScoped(member.role)
        ? (await Promise.all((member.siteIds || []).map((sid) => getDoc(siteDoc(cid, sid)).catch(() => null))))
          .filter((s) => s?.exists()).map((s) => ({ id: s.id, ...s.data() }))
        : (await getDocs(sitesCol(cid))).docs.map((s) => ({ id: s.id, ...s.data() }));
    }
    return { id: cid, name: company?.name || 'Company', ...membershipSummary(member, sites, company) };
  } catch (e) {
    console.error('Could not load company', cid, e);
    return { id: cid, name: 'Company', failed: true };
  }
}

export default function MyCompanies() {
  const { user, profile, cid, switchCompany } = useAuth();
  const navigate = useNavigate();
  const ids = (profile.companyIds || []).join(',');
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all(ids.split(',').filter(Boolean).map((id) => loadOne(id, user.uid)))
      .then((list) => live && setRows(list.filter(Boolean).sort((a, b) => (b.id === cid) - (a.id === cid) || a.name.localeCompare(b.name))));
    return () => { live = false; };
  }, [ids, user.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows) return <Loading what="your companies" />;
  return (
    <ul className="card acct-rows my-cos">
      {rows.map((r) => (
        <li key={r.id} className="acct-row">
          <div>
            <h3>{r.name}</h3>
            {r.failed ? <p className="muted small">Can't load this company right now.</p> : (
              <>
                <p className="my-co-role"><span className="pill">{r.roleLabel}</span>
                  {r.state === 'off' && <span className="pill bad">Access switched off</span>}
                  {r.state === 'paused' && <span className="pill calm">Paused</span>}</p>
                {r.state === 'ok' && <p className="muted small">{r.projects}</p>}
              </>
            )}
          </div>
          {r.id === cid
            ? <span className="muted small">You're here</span>
            : !r.failed && r.state === 'ok' && <button type="button" className="btn ghost sm" onClick={() => { navigate('/'); switchCompany(r.id); }}>Switch</button>}
        </li>
      ))}
    </ul>
  );
}
