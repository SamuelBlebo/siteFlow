import ProjectCover from './ProjectCover';

// Sign-in, sign-up and invitation screens: the form on a white card, and on wide screens a
// glimpse of the dashboard beside it (the sample projects' cards, with their photos).
const SHOW = [
  { id: 'a', name: 'Adenta 4-bedroom residence', cover: '/demo/adenta-cover.jpg', stage: 'Lintel level', pct: 36, note: '8 weeks behind' },
  { id: 'l', name: 'East Legon office complex', cover: '/demo/legon-cover.jpg', stage: 'First floor slab', pct: 46 },
  { id: 'r', name: 'Kasoa–Winneba road drainage', cover: '/demo/road-cover.jpg', stage: 'Drains and culverts', pct: 62 },
];
const code = (name) => name.split(/[\s–-]+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 3).map((w) => w[0].toUpperCase()).join('');

export default function AuthFrame({ children }) {
  return (
    <div className="authpage">
      <div className="auth">{children}</div>
      <aside className="auth-show" aria-hidden="true">
        <div>
          <p className="auth-kicker">Construction project management</p>
          <h2>Every site, every day, in one place.</h2>
          <p className="auth-lead">Daily reports with photos, issues, materials, workers and spending from all your projects, and the ones that need you, first.</p>
        </div>
        <ul className="bays">
          {SHOW.map((s) => (
            <li key={s.id}>
              <span className={`bay${s.note ? ' hot' : ''}`}>
                <ProjectCover site={s} className="bay-img" label={false} />
                <span className="bay-t"><span className="bay-code">{code(s.name)}</span><span className="bay-pct">{s.pct}%</span></span>
                <b>{s.name}</b>
                <small>{s.stage}{s.note ? <> · <span className="late">{s.note}</span></> : ''}</small>
                <span className="bay-bar"><span style={{ width: `${s.pct}%` }} /></span>
              </span>
            </li>
          ))}
        </ul>
        <p className="auth-credit">Sample photos from Wikimedia Commons: Remy Mboku (CC BY 2.0), Matti Blume and Kwaku Berko (CC BY-SA 4.0).</p>
      </aside>
    </div>
  );
}
