// The SiteFlow mark (yellow-and-black hazard tape) and the wordmark
export function Mark() {
  return <span className="mark" aria-hidden="true" />;
}

export default function Brand({ big }) {
  return <div className={`brand${big ? ' big' : ''}`}><Mark />SiteFlow</div>;
}
