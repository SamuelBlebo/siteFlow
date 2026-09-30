import { big } from '../format';
import type { Alert, Site } from '../types';

// Message text lives here so WhatsApp, email and in-app previews always match.
export const reportReminderText = (site: Pick<Site, 'name' | 'foremanName'>) =>
  `Hi ${(site.foremanName || 'there').split(' ')[0]}, today's daily report for ${site.name} hasn't come in yet. Please send it from the SiteFlow app or reply here with a voice note before 7pm. Thank you.`;

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
