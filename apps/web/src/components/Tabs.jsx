import { useId, useRef } from 'react';

// Tabs with their panel. Arrow keys, Home and End move between tabs (the WAI-ARIA tabs pattern);
// only the selected tab is in the Tab order, so keyboard users reach the panel in one step.
export default function Tabs({ tabs, value, onChange, label = 'Sections', fit = false, children }) {
  const id = useId();
  const refs = useRef({});
  const keys = tabs.map(([k]) => k);
  // A page outside the tabs (the project's Team or Settings) keeps the first tab reachable by keyboard
  const shown = keys.includes(value);
  const focusKey = shown ? value : keys[0];
  function onKey(e) {
    const i = keys.indexOf(value);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const k = keys[(next + keys.length) % keys.length];
    onChange(k);
    refs.current[k]?.focus();
  }
  return (
    <>
      <div className={fit ? 'tabs fit' : 'tabs'} role="tablist" aria-label={label} onKeyDown={onKey}>
        {tabs.map(([key, text]) => (
          <button key={key} type="button" role="tab" id={`${id}-${key}`} aria-selected={value === key} aria-controls={`${id}-panel`}
            tabIndex={focusKey === key ? 0 : -1} ref={(el) => { refs.current[key] = el; }} onClick={() => onChange(key)}>{text}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} {...(shown ? { 'aria-labelledby': `${id}-${value}` } : { 'aria-label': label })}>{children}</div>
    </>
  );
}
