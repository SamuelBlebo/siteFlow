import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import {
  TIMEZONE, isBehind, paths, reportReminderText, siteAlerts, todayKey, weeklyDigestText,
  type Company, type Site, type UserProfile,
} from '@siteflow/shared';
import { EMAIL_KEY, WA_PHONE_ID, WA_TOKEN, sendEmail, sendWhatsApp } from './notify';

const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';
const rule = (c: Company, k: keyof NonNullable<Company['notifications']>) => c.notifications?.[k] ?? { whatsapp: true, email: true };

// 6pm Monday to Saturday: remind foremen whose daily report is missing.
// Ghana is on UTC all year, so server dates match local dates.
export const missingReportReminder = onSchedule(
  { schedule: '0 18 * * 1-6', timeZone: TIMEZONE, secrets: [WA_TOKEN, WA_PHONE_ID, EMAIL_KEY] },
  async () => {
    const db = getFirestore();
    const today = todayKey();
    const companies = await db.collection('companies').get();
    for (const cDoc of companies.docs) {
      const company = { id: cDoc.id, ...cDoc.data() } as Company;
      const r = rule(company, 'report');
      const sites = await db.collection(paths.sites(company.id)).where('status', '==', 'active').get();
      for (const sDoc of sites.docs) {
        const site = { id: sDoc.id, ...sDoc.data() } as Site;
        if (site.lastReportDate === today) continue;
        const text = reportReminderText(site);
        if (r.whatsapp && site.foremanPhone) await sendWhatsApp(site.foremanPhone, text);
        if (r.email && site.foremanEmail) await sendEmail(site.foremanEmail, `Daily report due: ${site.name}`, text);
      }
    }
  }
);

// Friday 5pm: weekly digest to owners.
export const weeklyDigest = onSchedule(
  { schedule: '0 17 * * 5', timeZone: TIMEZONE, secrets: [WA_TOKEN, WA_PHONE_ID, EMAIL_KEY] },
  async () => {
    const db = getFirestore();
    const companies = await db.collection('companies').get();
    for (const cDoc of companies.docs) {
      const company = { id: cDoc.id, ...cDoc.data() } as Company;
      const r = rule(company, 'weekly');
      const sites = (await db.collection(paths.sites(company.id)).where('status', '==', 'active').get())
        .docs.map((d) => ({ id: d.id, ...d.data() }) as Site);
      if (!sites.length) continue;

      const topAlerts = sites.flatMap((s) => siteAlerts(s, [], {}, { company }).map((a) => ({ ...a, siteName: s.name })))
        .filter((a) => a.kind !== 'report');
      const text = weeklyDigestText({
        companyName: company.name,
        weekEnding: new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
        totalBudget: sites.reduce((x, s) => x + (s.budget || 0), 0),
        spentThisWeek: 0, // TODO: sum this week's expenses per site
        sites: sites.map((s) => ({ name: s.name, progress: s.progress || 0, behind: isBehind(s) })),
        topAlerts,
        link: APP_URL,
      });

      const owners = (await db.collection('users').where('companyId', '==', company.id).where('role', '==', 'owner').get())
        .docs.map((d) => d.data() as UserProfile);
      for (const o of owners) {
        if (r.whatsapp && o.phone) await sendWhatsApp(o.phone, text);
        if (r.email && o.email) await sendEmail(o.email, `Your week: ${sites.length} projects`, text);
      }
    }
  }
);
