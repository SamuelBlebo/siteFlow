// The search field in a page's header (PageHead): a magnifier and the input. children: results under it.
export default function SearchBox({ value, onChange, placeholder, label = 'Search', onKeyDown, children }) {
  return (
    <div className="search" role="search">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="m11 11 3.5 3.5" /></svg>
      <input type="search" placeholder={placeholder} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />
      {children}
    </div>
  );
}
