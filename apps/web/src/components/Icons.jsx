// Line icons for the menu and top bar (16 x 16, drawn with currentColor)
const P = {
  dashboard: <><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>,
  projects: <><path d="M2 5.5h12v8H2z" /><path d="M5.5 5.5V3h5v2.5" /></>,
  reports: <><path d="M4 2h5.5L12.5 5v9H4z" /><path d="M6 8h4.5M6 11h3.5" /></>,
  issues: <><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5M8 11v.01" /></>,
  finance: <><rect x="2" y="4" width="12" height="9" rx="1.5" /><circle cx="8" cy="8.5" r="1.8" /></>,
  team: <><circle cx="6" cy="6" r="2.5" /><path d="M1.5 14c.5-3 2.3-4.5 4.5-4.5s4 1.5 4.5 4.5M11 3.6a2.2 2.2 0 0 1 0 4.3M12.2 9.8c1.3.5 2 1.8 2.3 4.2" /></>,
  modules: <><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /><path d="M11.5 2v5M9 4.5h5M2 11.5h5" /></>,
  reminders: <><path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 2h-11z" /><path d="M6.5 14.5a1.6 1.6 0 0 0 3 0" /></>,
  company: <><path d="M2.5 14V3.5h7V14M9.5 7h4v7M1.5 14h13" /><path d="M5 6h2M5 8.5h2M5 11h2" /></>,
  clock: <><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></>,
  calendar: <><rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6.5h12M5 1.5v3M11 1.5v3" /></>,
  account: <><circle cx="8" cy="5.5" r="2.8" /><path d="M2.5 14c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" /></>,
  mail: <><rect x="2" y="3.5" width="12" height="9" rx="1.5" /><path d="m2.5 4.5 5.5 4.5 5.5-4.5" /></>,
  signout: <><path d="M6 2.5H3v11h3M10.5 5l3 3-3 3M13.5 8H6" /></>,
  chevron: <path d="m4 6 4 4 4-4" />,
};

export default function Icon({ name, className = 'ico' }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[name]}</svg>
  );
}
