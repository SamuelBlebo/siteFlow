// Dates as YYYY-MM-DD keys and HH:MM times, in the company's time zone. The apps set the zone once
// the company is known; the server passes each company's zone. Without one, the device's clock is used.
let zone: string | undefined;
export const setTimeZone = (tz?: string) => { zone = tz || undefined; };
export const getTimeZone = () => zone;

const z = (n: number) => String(n).padStart(2, '0');
function parts(d: Date, tz?: string) {
  const t = tz ?? zone;
  if (t) {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: t, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
        .formatToParts(d).map((x) => [x.type, x.value]));
      return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
    } catch { /* time zones not supported here: use the device clock */ }
  }
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes(), wd: d.getDay() };
}
export const todayKey = (d: Date = new Date(), tz?: string) => { const p = parts(d, tz); return `${p.y}-${z(p.m)}-${z(p.d)}`; };
export const timeHM = (d: Date = new Date(), tz?: string) => { const p = parts(d, tz); return `${z(p.h)}:${z(p.min)}`; };
// Hour (0-23) and weekday (0 = Sunday) in a time zone, for scheduled jobs that run at local times
export const localClock = (d: Date = new Date(), tz?: string) => { const p = parts(d, tz); return { hour: p.h, weekday: p.wd }; };
export const prettyDate = (key: string) =>
  new Date(`${key}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const longToday = (d: Date = new Date(), tz?: string) =>
  new Date(`${todayKey(d, tz)}T00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
