import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  big, companyLocale, expenseTotals, localClock, isBehind, paths, rankAlerts, recipientsFor, siteAlerts, todayKey, weekStart, weeklyDigestText,
  isSample, type Company, type Expense, type Site, type SiteFinance,
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
export async function remindMissingReports(company: Company, today = todayKey(new Date(), companyLocale(company).timeZone)) {
  const db = getFirestore();
  const sites = await db.collection(paths.sites(company.id)).where('status', '==', 'active').get();
  const members = await companyMembers(company.id);
  for (const sDoc of sites.docs) {
    const site = { id: sDoc.id, ...sDoc.data() } as Site;
    if (site.lastReportDate === today || isSample(site)) continue; // sample projects are never chased
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

// Scheduled jobs go through every company: up to 9 minutes (the default is 1), and one retry if
// the whole run fails. Messages have fixed ids, so a retried run never sends anything twice.
// Runs every hour; each company is reminded at 6pm Monday to Saturday in its own time zone.
export const missingReportReminder = onSchedule({ timeoutSeconds: 540, retryCount: 1, schedule: '0 * * * *', timeZone: 'UTC', secrets: SECRETS }, async () => {
  const now = new Date();
  await eachCompany(getFirestore(), 'missingReportReminder', async (c) => {
    const tz = companyLocale(c).timeZone;
    const { hour, weekday } = localClock(now, tz);
    if (hour === 18 && weekday >= 1 && weekday <= 6) await remindMissingReports(c, todayKey(now, tz));
  });
});

// One company's weekly summary
export async function sendWeeklySummary(company: Company, now = new Date()) {
  const db = getFirestore();
  const loc = companyLocale(company);
  const sites = (await db.collection(paths.sites(company.id)).where('status', '==', 'active').get())
    .docs.map((d) => ({ id: d.id, ...d.data() }) as Site).filter((s) => !isSample(s)); // sample projects stay out of the summary
  if (!sites.length) return;
  const finance = new Map<string, SiteFinance>();
  const monday = weekStart(now, loc.timeZone);
  let spentThisWeek = 0;
  for (const s of sites) {
    const f = await db.doc(paths.finance(company.id, s.id)).get();
    if (f.exists) finance.set(s.id, f.data() as SiteFinance);
    const week = await db.collection(paths.sub(company.id, s.id, 'expenses')).where('date', '>=', monday).get();
    spentThisWeek += expenseTotals(week.docs.map((d) => d.data() as Expense)).spent;
  }
  const topAlerts = rankAlerts(sites.flatMap((s) => siteAlerts(s, [], {}, { company, finance: finance.get(s.id), now, timeZone: loc.timeZone }).map((a) => ({ ...a, siteName: s.name, site: s }))))
    .filter((a) => a.kind !== 'report');
  const behind = sites.filter((s) => isBehind(s, now)).length;
  const weekEnding = new Date(`${todayKey(now, loc.timeZone)}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const emailText = weeklyDigestText({
    companyName: company.name, weekEnding, totalBudget: sites.reduce((x, s) => x + (finance.get(s.id)?.budget || 0), 0), spentThisWeek,
    sites: sites.map((s) => ({ name: s.name, progress: s.progress || 0, behind: isBehind(s, now) })), topAlerts, link: APP_URL, currency: loc.currency,
  });
  const members = await companyMembers(company.id);
  await deliver({
    cid: company.id, kind: 'weekly_digest', key: `weekly_${monday}`,
    values: {
      company: company.name, sites: sites.length, behind, spent: big(spentThisWeek, loc.currency),
      attention: topAlerts.length ? topAlerts.slice(0, 3).map((a) => `${a.title} (${a.siteName})`).join('; ') : 'nothing urgent', link: APP_URL,
    },
    subject: `Your week: ${sites.length} site${sites.length === 1 ? '' : 's'}`, emailText,
    recipients: recipientsFor('weekly_digest', members),
  });
}

// Runs every hour; each company gets its summary at 5pm on Friday in its own time zone
export const weeklyDigest = onSchedule({ timeoutSeconds: 540, retryCount: 1, schedule: '0 * * * *', timeZone: 'UTC', secrets: SECRETS }, async () => {
  const now = new Date();
  await eachCompany(getFirestore(), 'weeklyDigest', async (c) => {
    const { hour, weekday } = localClock(now, companyLocale(c).timeZone);
    if (hour === 17 && weekday === 5) await sendWeeklySummary(c, now);
  });
});
