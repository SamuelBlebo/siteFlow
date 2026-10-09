// The SiteFlow mark (a house in a brass tile) and the wordmark
export function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.6"><path d="M2 14V7l6-4 6 4v7" /><path d="M6 14V9h4v5" /></svg>
    </span>
  );
}

export default function Brand({ big }) {
  return <div className={`brand${big ? ' big' : ''}`}><Mark />SiteFlow</div>;
}
