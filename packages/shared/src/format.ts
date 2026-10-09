import { getLocale, symbolOf } from './locale';

// Money in the company's currency, whole units. Negative amounts put the sign first: -GH₵5,000, -KSh 5,000.
// currency: an ISO code (the server passes each company's); the apps use the signed-in company's.
const sym = (currency?: string) => (currency ? symbolOf(currency) : getLocale().symbol);
const join = (s: string, n: string) => (/[A-Za-z]$/.test(s) ? `${s} ${n}` : `${s}${n}`); // KSh 500, ₦500
export const money = (n?: number | null, currency?: string) => {
  const v = Math.round(n || 0);
  return `${v < 0 ? '-' : ''}${join(sym(currency), Math.abs(v).toLocaleString('en-US'))}`;
};
/** @deprecated use money(); kept so older call sites read the same */
export const cedi = money;
// Short form for summaries: GH₵850, GH₵12k, GH₵1.25m (999,600 is GH₵1.00m, not GH₵1000k)
export const big = (n: number, currency?: string) => {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 999_500_000) return `${sign}${join(sym(currency), `${(a / 1e9).toFixed(2)}bn`)}`;
  if (a >= 999_500) return `${sign}${join(sym(currency), `${(a / 1e6).toFixed(2)}m`)}`;
  if (a >= 1e3) return `${sign}${join(sym(currency), `${Math.round(a / 1e3)}k`)}`;
  return money(n, currency);
};
export const pct = (a?: number | null, b?: number | null) => (b ? Math.round(((a || 0) / b) * 100) : 0);
// Phone numbers for wa.me links and the WhatsApp API: international digits, no plus.
// Local numbers get the country's dialling code: in Ghana 024 123 4567 -> 233241234567, in Kenya
// 0712 345 678 -> 254712345678. Numbers typed with + or 00 keep their own code.
export const waPhone = (p = '', dial = getLocale().dial) => {
  const intl = /^\s*(\+|00)/.test(p);
  const d = p.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) return d.slice(2);
  if (intl) return d;
  if (d.startsWith('0')) return dial + d.replace(/^0+/, '');
  if (d.length <= 10 && !d.startsWith(dial)) return dial + d; // local number typed without the 0
  return d;
};
