import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  TIMEZONE, big, expenseTotals, isBehind, paths, rankAlerts, recipientsFor, siteAlerts, todayKey, weekStart, weeklyDigestText,
  type Company, type Expense, type Site, type SiteFinance,
} from '@siteflow/shared';
import { companyMembers, deliver, type Recipient } from './deliver';
import { SECRETS } from './notify';

const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';

// Runs fn for every company. One company failing is logged and does not stop the others.
export async function eachCompany(db: Firestore, job: string, fn: (company: Company) => Promise<void>) {
  const companies = await db.collection(paths.companies()).get();
  let failed = 0;
  for (const cDoc of companies.docs) {
    try {
      await fn({ id: cDoc.id, ...cDoc.data() } as Company);
    } catch (e) {
      failed++;
      logger.error(`${job} failed for company`, { companyId: cDoc.id, error: String(e) });
    }
  }
  logger.info(`${job} finished`, { companies: companies.size, failed });
}

// One company's missing-report reminders
export async function remindMissingReports(company: Company, today = todayKey()) {
  const db = getFirestore();
  const sites = await db.collection(paths.sites(company.id)).where('status', '==', 'active').get();
  const members = await companyMembers(company.id);
  for (const sDoc of sites.docs) {
    const site = { id: sDoc.id, ...sDoc.data() } as Site;
    if (site.lastReportDate === today) continue;
    // The site's supervisors, plus the foreman on the site record (who may not have a login)
    const recipients: Recipient[] = recipientsFor('report_missing', members, { siteId: site.id });
    if (site.foremanPhone || site.foremanEmail) {
      const known = recipients.some((r) => (site.foremanPhone && r.phone === site.foremanPhone) || (site.foremanEmail && r.email === site.foremanEmail));
      if (!known) recipients.push({ id: `foreman_${site.id}`, name: site.foremanName || 'Foreman', phone: site.foremanPhone, email: site.foremanEmail });
    }
    for (const r of recipients) {
      await deliver({
        cid: company.id, kind: 'report_missing', key: `missing_${site.id}_${today}`, siteId: site.id,
        values: { name: (r.name || 'there').split(' ')[0], site: site.name },
        subject: `Daily report due: ${site.name}`, recipients: [r],
      });
    }
  }
}

// 6pm Monday to Saturday. Ghana is on UTC all year, so server dates match local dates.
export const missingReportReminder = onSchedule({ schedule: '0 18 * * 1-6', timeZone: TIMEZONE, secrets: SECRETS }, async () => {
  await eachCompany(getFirestore(), 'missingReportReminder', (c) => remindMissingReports(c));
});

// One company's weekly summary
export async function sendWeeklySummary(company: Company, now = new Date()) {
  const db = getFirestore();
  const sites = (await db.collection(paths.sites(company.id)).where('status', '==', 'active').get())
    .docs.map((d) => ({ id: d.id, ...d.data() }) as Site);
  if (!sites.length) return;
  const finance = new Map<string, SiteFinance>();
  const monday = weekStart(now);
  let spentThisWeek = 0;
  for (const s of sites) {
    const f = await db.doc(paths.finance(company.id, s.id)).get();
    if (f.exists) finance.set(s.id, f.data() as SiteFinance);
    const week = await db.collection(paths.sub(company.id, s.id, 'expenses')).where('date', '>=', monday).get();
    spentThisWeek += expenseTotals(week.docs.map((d) => d.data() as Expense)).spent;
  }
  const topAlerts = rankAlerts(sites.flatMap((s) => siteAlerts(s, [], {}, { company, finance: finance.get(s.id), now }).map((a) => ({ ...a, siteName: s.name, site: s }))))
    .filter((a) => a.kind !== 'report');
  const behind = sites.filter((s) => isBehind(s, now)).length;
  const weekEnding = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const emailText = weeklyDigestText({
    companyName: company.name, weekEnding, totalBudget: sites.reduce((x, s) => x + (finance.get(s.id)?.budget || 0), 0), spentThisWeek,
    sites: sites.map((s) => ({ name: s.name, progress: s.progress || 0, behind: isBehind(s, now) })), topAlerts, link: APP_URL,
  });
  const members = await companyMembers(company.id);
  await deliver({
    cid: company.id, kind: 'weekly_digest', key: `weekly_${monday}`,
    values: {
      company: company.name, sites: sites.length, behind, spent: big(spentThisWeek),
      attention: topAlerts.length ? topAlerts.slice(0, 3).map((a) => `${a.title} (${a.siteName})`).join('; ') : 'nothing urgent', link: APP_URL,
    },
    subject: `Your week: ${sites.length} site${sites.length === 1 ? '' : 's'}`, emailText,
    recipients: recipientsFor('weekly_digest', members),
  });
}

// Friday 5pm
export const weeklyDigest = onSchedule({ schedule: '0 17 * * 5', timeZone: TIMEZONE, secrets: SECRETS }, async () => {
  await eachCompany(getFirestore(), 'weeklyDigest', (c) => sendWeeklySummary(c));
});
