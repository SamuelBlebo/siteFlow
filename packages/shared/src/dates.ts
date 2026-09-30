const z = (n: number) => String(n).padStart(2, '0');
export const todayKey = (d: Date = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const timeHM = (d: Date = new Date()) => `${z(d.getHours())}:${z(d.getMinutes())}`;
export const prettyDate = (key: string) =>
  new Date(`${key}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const longToday = (d: Date = new Date()) =>
  d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
