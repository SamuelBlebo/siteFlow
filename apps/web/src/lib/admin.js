import { call } from './account';

// The platform admin's Cloud Functions (the person who runs SiteFlow). Each one checks the
// platformAdmin claim on the server and returns counts and dates only, never client content.

// Lookups
export const adminOverview = call('adminOverview');
export const adminCompanies = call('adminCompanies');
export const adminCompany = call('adminCompany');       // { cid }
export const adminFindUser = call('adminFindUser');     // { email }
export const adminLogList = call('adminLogList');

// Actions (each one is written to the admin log)
export const adminSendPasswordReset = call('adminSendPasswordReset');     // { uid }
export const adminResendInvite = call('adminResendInvite');               // { cid, uid }
export const adminSetLoginDisabled = call('adminSetLoginDisabled');       // { uid, disabled }
export const adminSetCompanySuspended = call('adminSetCompanySuspended'); // { cid, on }
export const adminSetCompanyInternal = call('adminSetCompanyInternal');   // { cid, on }
