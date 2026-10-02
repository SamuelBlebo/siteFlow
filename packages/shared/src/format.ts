// Money in Ghana cedis, whole cedis. Negative amounts put the sign first: -GH₵5,000
export const cedi = (n?: number | null) => {
  const v = Math.round(n || 0);
  return `${v < 0 ? '-' : ''}GH₵${Math.abs(v).toLocaleString('en-US')}`;
};
// Short form for summaries: GH₵850, GH₵12k, GH₵1.25m (999,600 is GH₵1.00m, not GH₵1000k)
export const big = (n: number) => {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 999_500) return `${sign}GH₵${(a / 1e6).toFixed(2)}m`;
  if (a >= 1e3) return `${sign}GH₵${Math.round(a / 1e3)}k`;
  return cedi(n);
};
export const pct = (a?: number | null, b?: number | null) => (b ? Math.round(((a || 0) / b) * 100) : 0);
// Phone numbers for wa.me links and the WhatsApp API: international digits, no plus.
// Ghana local numbers get 233: 024 123 4567 or 24 123 4567 -> 233241234567. +233... and 00233... keep theirs.
export const waPhone = (p = '') => {
  let d = p.replace(/\D/g, '');
  if (d.startsWith('00')) return d.slice(2);  // international prefix
  if (d.startsWith('0')) return '233' + d.slice(1);
  if (d.length === 9) return '233' + d;       // local number typed without the 0
  return d;
};
