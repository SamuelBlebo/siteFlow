import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  TIMEZONE, expenseTotals, isBehind, paths, reportReminderText, siteAlerts, todayKey, weekStart, weeklyDigestText,
  type Company, type Expense, type Site, type SiteFinance, type UserProfile,
} from '@siteflow/shared';
import { EMAIL_KEY, WA_PHONE_ID, WA_TOKEN, sendEmail, sendWhatsApp } from './notify';

const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';
const rule = (c: Company, k: keyof NonNullable<Company['notifications']>) => c.notifications?.[k] ?? { whatsapp: true, email: true };

// Runs fn for every company. One company failing is logged and does not stop the others.
async function eachCompany(db: Firestore, job: string, fn: (company: Company) => Promise<void>) {
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

// 6pm Monday to Saturday: remind foremen whose daily report is missing.
// Ghana is on UTC all year, so server dates match local dates.
export const missingReportReminder = onSchedule(
  { schedule: '0 18 * * 1-6', timeZone: TIMEZONE, secrets: [WA_TOKEN, WA_PHONE_ID, EMAIL_KEY] },
  async () => {
    const db = getFirestore();
    const today = todayKey();
    await eachCompany(db, 'missingReportReminder', async (company) => {
      const r = rule(company, 'report');
      const sites = await db.collection(paths.sites(company.id)).where('status', '==', 'active').get();
      for (const sDoc of sites.docs) {
        const site = { id: sDoc.id, ...sDoc.data() } as Site;
        if (site.lastReportDate === today) continue;
        const text = reportReminderText(site);
        if (r.whatsapp && site.foremanPhone) await sendWhatsApp(site.foremanPhone, text);
        if (r.email && site.foremanEmail) await sendEmail(site.foremanEmail, `Daily report due: ${site.name}`, text);
      }
    });
  }
);

// Friday 5pm: weekly digest to owners.
export const weeklyDigest = onSchedule(
  { schedule: '0 17 * * 5', timeZone: TIMEZONE, secrets: [WA_TOKEN, WA_PHONE_ID, EMAIL_KEY] },
  async () => {
    const db = getFirestore();
    await eachCompany(db, 'weeklyDigest', async (company) => {
      const r = rule(company, 'weekly');
      const sites = (await db.collection(paths.sites(company.id)).where('status', '==', 'active').get())
        .docs.map((d) => ({ id: d.id, ...d.data() }) as Site);
      if (!sites.length) return;
      const finance = new Map<string, SiteFinance>();
      const monday = weekStart();
      let spentThisWeek = 0;
      for (const s of sites) {
        const f = await db.doc(paths.finance(company.id, s.id)).get();
        if (f.exists) finance.set(s.id, f.data() as SiteFinance);
        const week = await db.collection(paths.sub(company.id, s.id, 'expenses')).where('date', '>=', monday).get();
        spentThisWeek += expenseTotals(week.docs.map((d) => d.data() as Expense)).spent;
      }

      const topAlerts = sites.flatMap((s) => siteAlerts(s, [], {}, { company, finance: finance.get(s.id) }).map((a) => ({ ...a, siteName: s.name })))
        .filter((a) => a.kind !== 'report');
      const text = weeklyDigestText({
        companyName: company.name,
        weekEnding: new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
        totalBudget: sites.reduce((x, s) => x + (finance.get(s.id)?.budget || 0), 0),
        spentThisWeek,
        sites: sites.map((s) => ({ name: s.name, progress: s.progress || 0, behind: isBehind(s) })),
        topAlerts,
        link: APP_URL,
      });

      const owners = (await db.collection(paths.users()).where('companyId', '==', company.id).where('role', '==', 'owner').get())
        .docs.map((d) => d.data() as UserProfile);
      for (const o of owners) {
        if (r.whatsapp && o.phone) await sendWhatsApp(o.phone, text);
        if (r.email && o.email) await sendEmail(o.email, `Your week: ${sites.length} projects`, text);
      }
    });
  }
);
