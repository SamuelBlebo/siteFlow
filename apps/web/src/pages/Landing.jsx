import { Link } from 'react-router-dom';
import { MODULES, TIER_LABELS } from '@siteflow/shared';
import { useTitle } from '../lib/hooks';
import Brand from '../components/Brand';

const SHOTS = '/landing';
const TIERS = ['starter', 'professional', 'enterprise'];
const TIER_LINES = {
  starter: 'For a builder with a few sites who wants daily reports, attendance and materials under control.',
  professional: 'For contractors running several projects who need budgets, programmes and approvals.',
  enterprise: 'For larger firms: equipment, client portal, audit trail and links to your accounts system.',
};

// Product areas, grouped the way construction platforms usually are
const PILLARS = [
  { title: 'Project management', text: 'Plan the work, track progress and keep everyone on the latest information.',
    tools: [['Daily reports and photos'], ['Programme and milestones'], ['Issues and site problems'], ['Drawings and documents', true], ['RFIs', true], ['Submittals', true], ['Meetings', true]] },
  { title: 'Financial management', text: 'Know where the money goes before it runs ahead of the work.',
    tools: [['Budgets and cost tracking'], ['Spend against plan, week by week'], ['Change orders', true], ['Subcontractors and retention', true], ['Client billing', true]] },
  { title: 'Field and workforce', text: 'Simple tools for the site team, on any phone, with or without signal.',
    tools: [['Attendance and wage sheets'], ['Materials and stock alerts'], ['Offline phone app'], ['Equipment', true]] },
  { title: 'Quality and safety', text: 'Catch defects and hazards early, and keep the record.',
    tools: [['Issues with priorities and owners'], ['Inspections and checklists', true], ['Punch lists', true], ['Incidents and toolbox talks', true]] },
];
const AUDIENCE = [
  { title: 'Building contractors', text: 'Houses, estates, offices and schools. Keep several sites on programme and on budget with daily reports from every foreman.' },
  { title: 'Road and civil contractors', text: 'Roads, drainage, culverts and bridges. Track crews, plant and materials across long, spread-out sites.' },
  { title: 'Developers and project owners', text: 'See progress, photos and spending on every project you are paying for, without chasing anyone on the phone.' },
];

// The public front page for people who are not signed in: what SiteFlow does, how it looks, and how to start
export default function Landing() {
  useTitle('Construction project management');
  const core = MODULES.filter((m) => m.tier === 'core');
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-in">
          <Brand />
          <nav aria-label="Page">
            <a href="#products">Products</a>
            <a href="#who">Who it's for</a>
            <a href="#features">See it</a>
            <a href="#how">How it works</a>
            <a href="#plans">Plans</a>
          </nav>
          <div className="lp-actions">
            <Link to="/login" className="btn ghost">Sign in</Link>
            <Link to="/signup" className="btn gold">Get started</Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero">
          <div className="lp-in lp-hero-in">
            <div className="lp-hero-text">
              <p className="lp-kicker">Construction project management for contractors</p>
              <h1>Every project, every site, every day, on one screen.</h1>
              <p className="lp-lead">One platform for the office and the site: programmes and progress, budgets and costs, daily reports, labour,
                materials and issues. Your site team works from the phone, even without signal, and you see every project live, with problems
                flagged before they cost you money.</p>
              <div className="lp-cta">
                <Link to="/signup" className="btn gold lp-big">Create your company account</Link>
                <Link to="/login" className="btn lp-big lp-ghost-dark">Sign in</Link>
              </div>
              <p className="lp-note">Set up in minutes. Explore three sample projects before adding your own.</p>
            </div>
            <div className="lp-hero-shots" aria-hidden="true">
              <Frame src={`${SHOTS}/dashboard.jpg`} alt="" />
              <Phone src={`${SHOTS}/phone-site.jpg`} alt="" />
            </div>
          </div>
        </section>

        <section className="lp-strip" aria-label="Highlights">
          <div className="lp-in">
            {['Works without signal on site', 'WhatsApp and email reminders', 'Your currency, time zone and trades', 'Houses, roads, civil works and fit-outs'].map((t) => <span key={t}>{t}</span>)}
          </div>
        </section>

        <section id="products" className="lp-section lp-products">
          <div className="lp-in">
            <h2>One platform for the whole project</h2>
            <p className="lp-sub">Office, site and money in one place, instead of WhatsApp groups, paper reports and spreadsheets.
              Switch on the tools you need; they all share the same projects, people and data.</p>
            <div className="lp-pillars">
              {PILLARS.map((p) => (
                <div key={p.title} className="lp-pillar">
                  <h3>{p.title}</h3>
                  <p className="muted">{p.text}</p>
                  <ul>
                    {p.tools.map(([name, soon]) => <li key={name}>{name}{soon && <small> (coming soon)</small>}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="who" className="lp-section lp-who">
          <div className="lp-in">
            <h2>Built for the people who build</h2>
            <div className="lp-audience">
              {AUDIENCE.map((a) => (
                <div key={a.title} className="lp-aud">
                  <h3>{a.title}</h3>
                  <p className="muted">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="lp-section">
          <div className="lp-in">
            <Feature
              kicker="For the owner and managers"
              title="Know what happened on every site today"
              text="One dashboard for the whole portfolio: which reports are in, who is on site, what has been spent against the plan, and what needs your decision. Missing reports, high cement use, low stock and projects falling behind are flagged automatically."
              points={['Spend against plan, week by week', 'Budget against progress for each project', 'Alerts with a one-tap WhatsApp reminder']}
              shot={`${SHOTS}/dashboard.jpg`} alt="The portfolio dashboard with spending, alerts and projects" />
            <Feature flip
              kicker="For the site team"
              title="Three steps a day, from the phone"
              text="Mark attendance, log the materials used, send the daily report with photos. Everything is saved on the phone first and sent when there is signal, so nothing is lost on a site without network."
              points={['Attendance with daily rates and wage sheets', 'Materials received, used and counted', 'Photos and issues in the same report']}
              shot={`${SHOTS}/sitework.jpg`} alt="The site team's day: attendance, materials, report and stock" phone={`${SHOTS}/phone-site.jpg`} />
            <Feature
              kicker="Every project"
              title="Money, progress and people in one place"
              text="Each project has its budget and spending, milestones and programme, daily reports, issues, materials, labour and team. Site teams only see the projects they are given; finance figures stay with finance roles."
              points={['Progress against the planned dates', 'Expenses by category, kept up to date', 'Clear roles: owner, managers, finance, supervisors']}
              shot={`${SHOTS}/project.jpg`} alt="A project page with budget, spending and progress" />
            <Feature flip
              kicker="Problems don't hide"
              title="Issues tracked until they are fixed"
              text="Anything that goes wrong on site is reported with a photo, given a priority and someone to fix it. Critical issues reach you straight away, and nothing is closed until it is resolved."
              points={['Critical, high, medium and low', 'Assigned, in progress, resolved, closed', 'A timeline of who did what']}
              shot={`${SHOTS}/issues.jpg`} alt="The issues list with a critical issue at the top" />
            <Feature
              kicker="Daily reports"
              title="A searchable record of every day on site"
              text="Every report from every project in one list, with the work done, workers, weather, issues and photos. Search it, filter it by project or date, and see at a glance which days are missing."
              points={['One report per person per site per day', 'Up to 8 photos, resized on the phone', 'Missing days highlighted']}
              shot={`${SHOTS}/reports.jpg`} alt="The list of daily reports across projects" />
          </div>
        </section>

        <section id="how" className="lp-section lp-how">
          <div className="lp-in">
            <h2>Up and running in an afternoon</h2>
            <ol className="lp-steps">
              <li><b>Create your company</b><span>Sign up, add your company details and choose the features you need. Or look around with sample projects first.</span></li>
              <li><b>Add a project and your foreman</b><span>Name, location, type of work, budget and dates. Send your foreman their login on WhatsApp.</span></li>
              <li><b>Reports start coming in</b><span>Your site team reports from the phone every day. You get reminders and alerts by WhatsApp and email.</span></li>
            </ol>
          </div>
        </section>

        <section id="plans" className="lp-section">
          <div className="lp-in">
            <h2>Start with what you need</h2>
            <p className="lp-sub">Every plan includes {core.map((m) => m.name.toLowerCase()).join(', ')}. Your plan follows the features you switch on, and you can change them at any time.</p>
            <div className="lp-plans">
              {TIERS.map((t) => (
                <div key={t} className={`lp-plan ${t === 'professional' ? 'featured' : ''}`}>
                  <span className={`tier t-${t}`}>{TIER_LABELS[t]}</span>
                  <p className="muted">{TIER_LINES[t]}</p>
                  <ul>
                    {MODULES.filter((m) => m.tier === t).map((m) => (
                      <li key={m.key}>{m.name}{!m.ready && <small> (coming soon)</small>}</li>
                    ))}
                  </ul>
                  <Link to="/signup" className={`btn ${t === 'professional' ? 'gold' : 'ghost'} block`}>{t === 'enterprise' ? 'Get started, then talk to us' : 'Get started'}</Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-final">
          <div className="lp-in">
            <h2>See it with your own projects</h2>
            <p>Create your company account in two minutes. Explore the sample projects, then add your first real site.</p>
            <Link to="/signup" className="btn gold lp-big">Create your company account</Link>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-in">
          <Brand />
          <span className="muted small">Construction project management. © {new Date().getFullYear()} Digital Prime.</span>
          <nav aria-label="Footer"><Link to="/login">Sign in</Link><Link to="/signup">Create account</Link><Link to="/photo-credits">Photo credits</Link></nav>
        </div>
      </footer>
    </div>
  );
}

function Feature({ kicker, title, text, points, shot, alt, phone, flip }) {
  return (
    <article className={`lp-feature ${flip ? 'flip' : ''}`}>
      <div className="lp-feature-text">
        <p className="lp-kicker">{kicker}</p>
        <h2>{title}</h2>
        <p>{text}</p>
        <ul>{points.map((p) => <li key={p}>{p}</li>)}</ul>
      </div>
      <div className="lp-feature-shot">
        <Frame src={shot} alt={alt} />
        {phone && <Phone src={phone} alt="The same screen on a phone" />}
      </div>
    </article>
  );
}

// A screenshot in a simple browser window
function Frame({ src, alt }) {
  return (
    <figure className="lp-frame">
      <div className="lp-frame-bar" aria-hidden="true"><i /><i /><i /></div>
      <img src={src} alt={alt} loading="lazy" width="1440" height="900" />
    </figure>
  );
}

function Phone({ src, alt }) {
  return <figure className="lp-phone"><img src={src} alt={alt} loading="lazy" width="390" height="844" /></figure>;
}
