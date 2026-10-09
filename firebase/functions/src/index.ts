// Entry point. Each export becomes a deployed Cloud Function.
import './setup'; // must stay first: region and Admin SDK setup
export { createCompany, inviteMember, updateMember, setMemberActive, resetMemberPassword, removeMember, assignToSite, setModule } from './team';
export { missingReportReminder, weeklyDigest } from './reminders';
export { recalcSiteSpending } from './finance';
export { onReportSent, onIssueChanged, onStockChanged } from './alerts';
export { retryNotifications } from './deliver';
export { loadDemo, removeDemo } from './demo';
export { inviteInfo, acceptInvite } from './invites';
export { requestReport, cancelReportRequest } from './requests';
