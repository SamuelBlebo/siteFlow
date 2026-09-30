export const cedi = (n?: number | null) => 'GH₵' + Math.round(n || 0).toLocaleString('en-US');
export const big = (n: number) => (n >= 1e6 ? `GH₵${(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `GH₵${Math.round(n / 1e3)}k` : cedi(n));
export const pct = (a?: number | null, b?: number | null) => (b ? Math.round(((a || 0) / b) * 100) : 0);
// Ghana numbers: 024xxxxxxx -> 23324xxxxxxx (wa.me links and the WhatsApp API)
export const waPhone = (p = '') => {
  const d = p.replace(/\D/g, '');
  return d.startsWith('0') ? '233' + d.slice(1) : d;
};
