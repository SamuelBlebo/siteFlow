// Entry point. Each export becomes a deployed Cloud Function.
import './setup'; // must stay first: region and Admin SDK setup
export { createCompany, inviteMember } from './team';
export { missingReportReminder, weeklyDigest } from './reminders';
