// Entry point. Each export becomes a deployed Cloud Function.
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 }); // nearest region to Ghana

export { inviteMember } from './team';
export { missingReportReminder, weeklyDigest } from './reminders';
