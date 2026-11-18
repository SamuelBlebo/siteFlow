import { NavLink, Outlet } from 'react-router-dom';
import { activityTabs, settingsTabs } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';

// A row of tabs above pages that share one menu item. Each tab is its own address (/reports and
// /issues, /company, /modules and /reminders), so old links and bookmarks still open the right one.
export default function SectionTabs({ tabs, label }) {
  return (
    <>
      {tabs.length > 1 && (
        <nav className="tabs section-tabs" aria-label={label}>
          {tabs.map((t) => <NavLink key={t.key} to={t.to}>{t.label}</NavLink>)}
        </nav>
      )}
      <Outlet />
    </>
  );
}

// Site activity: daily reports and issues across every project
export function ActivityTabs() {
  const { role } = useAuth();
  return <SectionTabs tabs={activityTabs({ role, company: null })} label="Site activity" />;
}

// Settings: company details, modules and reminders
export function SettingsTabs() {
  const { role } = useAuth();
  return <SectionTabs tabs={settingsTabs({ role, company: null })} label="Settings" />;
}
