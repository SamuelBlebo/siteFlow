import { z } from 'zod';
import { CO_REASONS, INCIDENT_TYPES } from './constants';
import { ROLES } from './permissions';
import { REPORT_PHOTO_LIMIT, WEATHER } from './logic/reports';

// Validation used by the forms (web and mobile) and again in Cloud Functions.
const money = z.coerce.number({ invalid_type_error: 'Enter an amount.' }).nonnegative('Amount cannot be negative.');
const positive = (label: string) => z.coerce.number().positive(`Enter a ${label} above zero.`);
// Ghana mobile numbers: 024 000 0000, 0240000000, +233 24 000 0000. Empty is allowed.
const phone = z.string().transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^((\+?233)\d{9}|0\d{9})?$/, 'Enter a Ghana number, e.g. 024 000 0000.'))
  .optional().default('');
const personName = z.string().trim().min(2, 'Enter a name.').max(100, 'Keep the name under 100 characters.');

const dateKey = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date.').optional().default('');
const email = z.string().trim().toLowerCase().pipe(z.string().email('Enter a valid email.').or(z.literal(''))).optional().default('');
const siteBase = z.object({
  name: z.string().trim().min(2, 'Enter the project name.').max(120),
  location: z.string().trim().min(2, 'Enter the location.').max(200),
  stage: z.string().min(1),
  foremanName: z.string().trim().max(100).optional().default(''),
  foremanPhone: phone,
  foremanEmail: email,
  planStart: dateKey,
  planEnd: dateKey,
  clientName: z.string().trim().max(120).optional().default(''),
  clientPhone: phone,
  clientEmail: email,
});
const datesInOrder = (v: { planStart?: string; planEnd?: string }) => !v.planStart || !v.planEnd || v.planEnd >= v.planStart;
const datesMsg = { message: 'The planned finish must be after the start.', path: ['planEnd'] };
// Editing a site's details (site managers)
export const siteDetailsInput = siteBase.refine(datesInOrder, datesMsg);
// Creating a site: details plus the starting budget (kept in the finance document)
export const siteInput = siteBase.extend({ budget: positive('budget') }).refine(datesInOrder, datesMsg);
export const siteStatusInput = z.enum(['active', 'on_hold', 'closed']);
export const budgetInput = z.object({ budget: positive('budget') });
// Assigning a site-scoped member (supervisor, viewer) to a site: assignToSite function
export const siteAssignInput = z.object({ sid: z.string().min(1), uid: z.string().min(1), assigned: z.boolean() });

export const materialInput = z.object({
  name: z.string().trim().min(1, 'Enter the material name.').max(120),
  unit: z.string().min(1, 'Choose a unit.').max(20),
  stock: money.default(0),
  reorderLevel: money.default(0),
  avgDaily: money.default(0),
});
// Editing a material. Stock is not here: it only changes through entries and stock counts.
export const materialEditInput = materialInput.omit({ stock: true });

// Received or used. Supplier and waybill only matter for deliveries; cost is for finance roles.
export const materialLogInput = z.object({
  materialId: z.string().min(1, 'Choose a material.'),
  type: z.enum(['usage', 'delivery']),
  qty: positive('quantity'),
  cost: money.default(0),
  supplier: z.string().trim().max(120).default(''),
  ref: z.string().trim().max(60).default(''),
  note: z.string().trim().max(500).default(''),
});
// A stock count: what is actually on site, and why it differs (site managers)
export const stockCountInput = z.object({
  counted: z.coerce.number({ invalid_type_error: 'Enter the quantity counted.' }).min(0, 'The count cannot be below zero.'),
  note: z.string().trim().min(3, 'Say why the count differs, e.g. "Monthly count" or "Bags damaged by rain".').max(500),
});

export const workerInput = z.object({
  name: z.string().trim().min(2, 'Enter the worker’s name.').max(100),
  trade: z.string().min(1, 'Choose a trade.').max(60),
  phone,
});
export const attendanceStatusInput = z.enum(['present', 'late', 'absent', 'leave']);
// Pay is stored separately (workerPay) and only finance roles can set it
export const workerPayInput = z.object({ dailyRate: positive('daily rate') });

export const reportInput = z.object({
  text: z.string().trim().min(3, 'Describe the work done today before sending.').max(5000, 'Keep the work description under 5000 characters.'),
  notes: z.string().trim().max(5000).optional().default(''),
  issues: z.string().trim().max(5000).optional().default(''),
  weather: z.enum(['', ...WEATHER]).optional().default(''),
  stage: z.string().min(1, 'Choose the current stage.'),
  progress: z.coerce.number({ invalid_type_error: 'Enter the progress as a number.' }).min(0, 'Progress must be between 0 and 100.').max(100, 'Progress must be between 0 and 100.'),
  workersPresent: z.coerce.number({ invalid_type_error: 'Enter how many workers were on site.' }).int('Enter a whole number of workers.').min(0).max(2000),
  photos: z.array(z.string()).max(REPORT_PHOTO_LIMIT, `Add up to ${REPORT_PHOTO_LIMIT} photos.`).default([]),
});

export const expenseInput = z.object({ category: z.string().min(1), note: z.string().trim().default(''), amount: positive('amount') });
export const changeOrderInput = z.object({ title: z.string().trim().min(3, 'Describe the change.'), reason: z.enum(CO_REASONS as [string, ...string[]]), amount: positive('cost'), extraDays: z.coerce.number().int().min(0).default(0) });
export const rfiInput = z.object({ question: z.string().trim().min(5, 'Enter the question.'), sentTo: z.string().trim().min(2, 'Who is it going to?'), dueDate: z.string().min(1, 'Pick a due date.') });
export const incidentInput = z.object({ type: z.enum(INCIDENT_TYPES as [string, ...string[]]), severity: z.enum(['Low', 'Medium', 'High']), description: z.string().trim().min(5, 'Describe what happened.') });
const roleEnum = z.enum(ROLES as [string, ...string[]]);
export const inviteInput = z.object({
  name: personName,
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  phone,
  role: roleEnum.refine((r) => r !== 'owner', 'Choose a role.'),
  siteIds: z.array(z.string().min(1)).max(200).default([]),
});
// First sign-up: creates the company and the owner's profile (createCompany function)
export const companySetupInput = z.object({
  companyName: z.string().trim().min(2, 'Enter your company name.').max(100),
  name: personName,
});

// Account and organisation
export const profileInput = z.object({ name: personName, phone });
export const companySettingsInput = z.object({
  name: z.string().trim().min(2, 'Enter the company name.').max(100),
  phone,
  location: z.string().trim().max(200).optional().default(''),
});
export const passwordInput = z.object({
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ['confirm'] });

// Team changes, done through Cloud Functions so they are checked and logged
const memberId = z.string().min(1, 'Choose a team member.');
export const memberUpdateInput = z.object({
  uid: memberId,
  role: roleEnum.refine((r) => r !== 'owner', 'Choose a role.'),
  siteIds: z.array(z.string().min(1)).max(200).default([]),
});
export const memberActiveInput = z.object({ uid: memberId, active: z.boolean() });
export const memberRefInput = z.object({ uid: memberId });

// Milestones (set up by site managers; progress updated by the site team)
const optDateKey = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date.').optional().default('');
export const milestoneInput = z.object({
  name: z.string().trim().min(1, 'Name the milestone.').max(100),
  weight: z.coerce.number({ invalid_type_error: 'Enter a number.' }).positive('Weight must be above zero.').max(1000).default(1),
  plannedStart: optDateKey,
  plannedEnd: optDateKey,
}).refine((v) => !v.plannedStart || !v.plannedEnd || v.plannedEnd >= v.plannedStart, { message: 'The planned finish must be after the start.', path: ['plannedEnd'] });
export const milestoneProgressInput = z.object({
  percentDone: z.coerce.number({ invalid_type_error: 'Enter a percentage.' }).min(0, 'Between 0 and 100.').max(100, 'Between 0 and 100.'),
  note: z.string().trim().max(500).optional().default(''),
});

// Issues
export const issueInput = z.object({
  title: z.string().trim().min(3, 'Say what the problem is in a few words.').max(120, 'Keep the title under 120 characters.'),
  description: z.string().trim().max(5000).optional().default(''),
  priority: z.enum(['critical', 'high', 'medium', 'low'], { errorMap: () => ({ message: 'Choose how urgent it is.' }) }),
  category: z.string().min(1, 'Choose what it is about.').max(60),
  location: z.string().trim().max(120).optional().default(''),
  dueDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date.').optional().default(''),
  photos: z.array(z.string()).max(8, 'Add up to 8 photos.').default([]),
});
export const resolveInput = z.object({ resolution: z.string().trim().min(3, 'Say how it was fixed.').max(2000) });
export const commentInput = z.object({ text: z.string().trim().min(1, 'Write a comment first.').max(2000, 'Keep comments under 2000 characters.') });

// Small helper so forms get one friendly message instead of a zod error object
export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown):
  { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const r = schema.safeParse(data);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.issues[0]?.message ?? 'Check the form.' };
}
