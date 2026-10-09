import { COUNTRIES, countryOf } from '@siteflow/shared';

const byName = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));
const CURRENCIES = [...new Map(COUNTRIES.map((c) => [c.currency, c])).values()].sort((a, b) => a.currency.localeCompare(b.currency));
const ZONES = [...new Set(COUNTRIES.map((c) => c.timeZone))].sort();

// Country select. Picking a country also suggests its currency and time zone (onCountry gets all three).
export function CountrySelect({ id, value, onChange }) {
  return (
    <select id={id} value={value} onChange={(e) => { const c = countryOf(e.target.value); onChange({ country: c.code, currency: c.currency, timeZone: c.timeZone }); }}>
      {byName.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
    </select>
  );
}

// Country, currency and time zone together (Company page and setup steps)
export default function CountryFields({ value, onChange, idPrefix = 'loc' }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const zones = ZONES.includes(value.timeZone) ? ZONES : [value.timeZone, ...ZONES];
  return (
    <div className="grid3">
      <div className="field"><label htmlFor={`${idPrefix}-c`}>Country</label><CountrySelect id={`${idPrefix}-c`} value={value.country} onChange={(v) => onChange({ ...value, ...v })} /></div>
      <div className="field"><label htmlFor={`${idPrefix}-m`}>Currency</label>
        <select id={`${idPrefix}-m`} value={value.currency} onChange={set('currency')}>
          {CURRENCIES.map((c) => <option key={c.currency} value={c.currency}>{c.currency} ({c.symbol})</option>)}
        </select></div>
      <div className="field"><label htmlFor={`${idPrefix}-z`}>Time zone</label>
        <select id={`${idPrefix}-z`} value={value.timeZone} onChange={set('timeZone')}>
          {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </select></div>
    </div>
  );
}
