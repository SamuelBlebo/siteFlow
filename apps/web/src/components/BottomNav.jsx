import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icons';
import NewMenu from './NewMenu';

// Phones and small tablets: the menu as a bar of icons at the bottom, like a phone app (hidden on
// wider screens, where the sidebar shows). The main pages are on the bar; "More" slides up the rest:
// the other pages, your projects, the company switcher and your account.
// siteIds: a site team's projects (null for roles that see every project).
export default function BottomNav({ items, lit, projects, companyPick, siteIds }) {
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  useEffect(() => { setMore(false); }, [pathname]);
  useEffect(() => {
    if (!more) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setMore(false); };
    document.addEventListener('keydown', esc);
    document.body.classList.add('sheet-open');
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('sheet-open'); };
  }, [more]);

  const bar = items.filter((i) => i.bar);
  const rest = items.filter((i) => !i.bar);
  // The round + sits in the middle of the bar (it hides itself when the person can't add anything)
  const links = [
    ...bar.map((i) => <NavLink key={i.key} to={i.to} className={lit(i.key)}><Icon name={i.barIcon || i.icon} /><span>{i.short || i.label}</span></NavLink>),
    ...(siteIds ? [<NavLink key="account" to="/account"><Icon name="account" /><span>Account</span></NavLink>] : []),
  ];
  const middle = Math.ceil(links.length / 2);

  return (
    <>
      <nav className="bnav" aria-label="Main">
        {links.slice(0, middle)}
        <NewMenu variant="bar" />
        {links.slice(middle)}
        <button type="button" aria-expanded={more} aria-controls="bnav-more" className={more ? 'on' : ''} onClick={() => setMore(!more)}>
          <Icon name="more" /><span>More</span>
        </button>
      </nav>
      {more && (
        <div className="bsheet-bg" onClick={() => setMore(false)}>
          <div id="bnav-more" className="bsheet" role="dialog" aria-modal="true" aria-label="More" onClick={(e) => e.stopPropagation()}>
            <div className="bsheet-h"><b>More</b><button type="button" className="iconbtn" aria-label="Close" onClick={() => setMore(false)}><Icon name="close" /></button></div>
            {companyPick && <div className="field bsheet-pick"><label htmlFor="org-pick-m">Company</label>{companyPick}</div>}
            {rest.length > 0 && <div className="bsheet-grid">{rest.map((i) => <NavLink key={i.key} to={i.to} className={lit(i.key)}><Icon name={i.icon} /><span>{i.label}</span></NavLink>)}
              {!siteIds && <NavLink to="/account"><Icon name="account" /><span>Account</span></NavLink>}</div>}
            {!rest.length && !siteIds && <div className="bsheet-grid"><NavLink to="/account"><Icon name="account" /><span>Account</span></NavLink></div>}
            {projects?.length > 0 && <><p className="bsheet-lbl">Projects</p><div className="bsheet-list">{projects}</div></>}
          </div>
        </div>
      )}
    </>
  );
}
