# WhatsApp message templates

Messages that SiteFlow starts on WhatsApp must use templates that Meta has approved. Submit each template below in
Meta Business Manager (WhatsApp Manager > Message templates) exactly as written: same name, category **Utility**,
language **English**. The wording comes from `packages/shared/src/logic/notifications.ts`; a test checks that every
template's numbered variables match its parameters. If you change the wording there, submit the change to Meta too.

Until a template is approved, its messages fail with a "WhatsApp refused it" note in the Team page log (email still
goes out).

| Notification | Template name | Sent to |
|---|---|---|
| Critical issue reported | `siteflow_critical_issue` | Owner, admins, project managers and the site's supervisors |
| Issue given to someone | `siteflow_issue_assigned` | The person it is given to |
| Daily report missing | `siteflow_report_reminder` | The site's foreman and supervisors |
| Material running low | `siteflow_low_stock` | Owner, admins, project managers and the site's supervisors |
| Daily report sent | `siteflow_report_sent` | Owner, admins and project managers |
| Weekly summary | `siteflow_weekly_summary` | Owner and admins |

## siteflow_critical_issue

> SiteFlow: critical issue at {{1}}: {{2}}. Reported by {{3}}. Open SiteFlow to assign it.

Variables: {{1}} site, {{2}} issue title, {{3}} who reported it.
Sample: `SiteFlow: critical issue at Adenta house: Scaffold unsafe on level 2. Reported by Kofi Mensah. Open SiteFlow to assign it.`

## siteflow_issue_assigned

> SiteFlow: {{1}} gave you an issue at {{2}}: {{3}} ({{4}} priority).

Variables: {{1}} who gave it, {{2}} site, {{3}} issue title, {{4}} priority.
Sample: `SiteFlow: Your manager gave you an issue at Adenta house: Water pipe burst (high priority).`

## siteflow_report_reminder

> Hi {{1}}, today's daily report for {{2}} has not come in yet. Please send it from the SiteFlow app before 7pm. Thank you.

Variables: {{1}} first name, {{2}} site.
Sample: `Hi Kofi, today's daily report for Adenta house has not come in yet. Please send it from the SiteFlow app before 7pm. Thank you.`

## siteflow_low_stock

> SiteFlow: {{1}} is running low at {{2}}: {{3}} left (reorder below {{4}}).

Variables: {{1}} material, {{2}} site, {{3}} quantity left, {{4}} reorder level.
Sample: `SiteFlow: Cement is running low at Adenta house: 5 bags left (reorder below 10 bags).`

## siteflow_report_sent

> SiteFlow: {{1}} sent the daily report for {{2}}: {{3}}% done, {{4}} workers. {{5}}

Variables: {{1}} who sent it, {{2}} site, {{3}} progress, {{4}} workers on site, {{5}} issues line.
Sample: `SiteFlow: Kofi Mensah sent the daily report for Adenta house: 35% done, 8 workers. No issues reported.`

## siteflow_weekly_summary

> SiteFlow weekly summary for {{1}}: {{2}} sites, {{3}} behind. Spent this week: {{4}}. Needs attention: {{5}}. Full summary: {{6}}

Variables: {{1}} company, {{2}} number of sites, {{3}} sites behind, {{4}} spent this week, {{5}} top items, {{6}} link.
Sample: `SiteFlow weekly summary for Mensah Builders: 4 sites, 1 behind. Spent this week: GH₵48k. Needs attention: Critical issue: Scaffold unsafe (Adenta house). Full summary: https://siteflow.app`

## Setting up the WhatsApp Cloud API

1. Create a Meta Business account and a WhatsApp Business app at developers.facebook.com, and add your business phone number.
2. Create a permanent access token (a System user) with the `whatsapp_business_messaging` permission.
3. Submit the six templates above and wait for approval (usually minutes to a day).
4. Store the credentials as Firebase secrets, never in the apps:

   ```bash
   firebase functions:secrets:set WHATSAPP_TOKEN --project prod
   firebase functions:secrets:set WHATSAPP_PHONE_ID --project prod
   firebase functions:secrets:set EMAIL_API_KEY --project prod   # Resend, for email
   ```

5. Deploy the functions. Anything that can't be sent yet shows as "Not sent" with the reason in the Team page log.
