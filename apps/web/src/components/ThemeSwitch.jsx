import { THEMES, useTheme } from '../lib/theme';

const ICONS = {
  system: <path d="M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3" />,
  light: <><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></>,
  dark: <path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z" />,
};
const Icon = ({ t }) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[t]}</svg>;

// Choose light, dark (night) or the device's setting. compact: icon-only, for the sidebar.
export default function ThemeSwitch({ compact }) {
  const [theme, setTheme] = useTheme();
  return (
    <div className={`theme-switch ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Theme">
      {THEMES.map(([k, label]) => (
        <button key={k} type="button" role="radio" aria-checked={theme === k} title={label} onClick={() => setTheme(k)}>
          <Icon t={k} />{!compact && <span>{label}</span>}
          {compact && <span className="visually-hidden">{label}</span>}
        </button>
      ))}
    </div>
  );
}
