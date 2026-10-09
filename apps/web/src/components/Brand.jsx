import { Link } from 'react-router-dom';

// The SiteFlow mark (yellow-and-black hazard tape) and the wordmark
export function Mark() {
  return <span className="mark" aria-hidden="true" />;
}

// home: the logo links to the SiteFlow front page (sign-in and sign-up screens)
export default function Brand({ big, home }) {
  const cls = `brand${big ? ' big' : ''}`;
  if (home) return <Link to="/" className={cls} aria-label="SiteFlow home"><Mark />SiteFlow</Link>;
  return <div className={cls}><Mark />SiteFlow</div>;
}
