import { big } from '../format';
import type { Alert } from '../types';

// The weekly summary email. (WhatsApp messages use the templates in notifications.ts.)
export interface DigestSite { name: string; progress: number; behind: boolean }
export function weeklyDigestText(p: { companyName: string; weekEnding: string; totalBudget: number; spentThisWeek: number; sites: DigestSite[]; topAlerts: (Alert & { siteName: string })[]; saved?: number; link: string }) {
  return [
    `*SiteFlow weekly digest*`,
    `Week ending ${p.weekEnding}, ${p.companyName}`,
    ``,
    `*Portfolio*`,
    `${p.sites.length} projects, ${big(p.totalBudget)} total. Spent this week: ${big(p.spentThisWeek)}.`,
    ``,
    `*Needs you*`,
    ...(p.topAlerts.length ? p.topAlerts.slice(0, 3).map((a, i) => `${i + 1}. ${a.title}, ${a.siteName}`) : ['Nothing urgent.']),
    ``,
    `*Progress*`,
    ...p.sites.map((s) => `${s.name}: ${s.progress}%${s.behind ? ' (behind)' : ''}`),
    ...(p.saved ? [``, `*Saved this quarter:* ${big(p.saved)}`] : []),
    ``,
    `Open the dashboard: ${p.link}`,
  ].join('\n');
}
