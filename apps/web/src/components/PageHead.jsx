// The white bar at the top of a page: title with a line under it, then the page's controls
export default function PageHead({ title, sub, children }) {
  return (
    <header className="dtop">
      <h1>{title}{sub && <span className="sub">{sub}</span>}</h1>
      {children}
    </header>
  );
}
