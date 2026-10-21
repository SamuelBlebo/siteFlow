// A choice of a few options: a row of buttons on wider screens, a dropdown on phones (CSS decides).
// options: [{ value, label, text? }] — label can hold an icon; text is the dropdown's wording (defaults to label).
export default function Choice({ options, value, onChange, label, className = 'seg', disabled = false }) {
  return (
    <>
      <div className={`${className} choice-buttons`} role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} disabled={disabled || o.disabled} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
      <select className="choice-select" aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.text ?? o.label}</option>)}
      </select>
    </>
  );
}
