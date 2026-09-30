import { z } from 'zod';
import { CO_REASONS, INCIDENT_TYPES } from './constants';
import { ROLES } from './permissions';

// Validation used by the forms (web and mobile) and again in Cloud Functions.
const money = z.coerce.number({ invalid_type_error: 'Enter an amount.' }).nonnegative('Amount cannot be negative.');
const positive = (label: string) => z.coerce.number().positive(`Enter a ${label} above zero.`);

export const siteInput = z.object({
  name: z.string().trim().min(2, 'Enter the project name.'),
  location: z.string().trim().min(2, 'Enter the location.'),
  foremanName: z.string().trim().optional().default(''),
  foremanPhone: z.string().trim().regex(/^(\+?233|0)\d{9}$/, 'Enter a Ghana number, e.g. 024 000 0000.').or(z.literal('')).optional().default(''),
  budget: positive('budget'),
  stage: z.string().min(1),
});

export const materialInput = z.object({
  name: z.string().trim().min(1, 'Enter the material name.'),
  unit: z.string().min(1),
  stock: money.default(0),
  reorderLevel: money.default(0),
  avgDaily: money.default(0),
});

export const materialLogInput = z.object({
  materialId: z.string().min(1),
  type: z.enum(['usage', 'delivery']),
  qty: positive('quantity'),
  cost: money.default(0),
  supplier: z.string().trim().default(''),
});

export const workerInput = z.object({
  name: z.string().trim().min(2, 'Enter the worker’s name.'),
  trade: z.string().min(1),
});
// Pay is stored separately (workerPay) and only finance roles can set it
export const workerPayInput = z.object({ dailyRate: positive('daily rate') });

export const reportInput = z.object({
  text: z.string().trim().min(3, 'Describe the work done today before sending.'),
  stage: z.string().min(1),
  progress: z.coerce.number().min(0).max(100, 'Progress must be between 0 and 100.'),
  issues: z.string().trim().default(''),
  photos: z.array(z.string()).max(8, 'Add up to 8 photos.').default([]),
});

export const expenseInput = z.object({ category: z.string().min(1), note: z.string().trim().default(''), amount: positive('amount') });
export const changeOrderInput = z.object({ title: z.string().trim().min(3, 'Describe the change.'), reason: z.enum(CO_REASONS as [string, ...string[]]), amount: positive('cost'), extraDays: z.coerce.number().int().min(0).default(0) });
export const rfiInput = z.object({ question: z.string().trim().min(5, 'Enter the question.'), sentTo: z.string().trim().min(2, 'Who is it going to?'), dueDate: z.string().min(1, 'Pick a due date.') });
export const incidentInput = z.object({ type: z.enum(INCIDENT_TYPES as [string, ...string[]]), severity: z.enum(['Low', 'Medium', 'High']), description: z.string().trim().min(5, 'Describe what happened.') });
const roleEnum = z.enum(ROLES as [string, ...string[]]);
export const inviteInput = z.object({
  name: z.string().trim().min(2, 'Enter their name.'),
  email: z.string().trim().email('Enter a valid email.'),
  role: roleEnum.refine((r) => r !== 'owner', 'Choose a role.'),
  siteIds: z.array(z.string().min(1)).max(200).default([]),
});
// First sign-up: creates the company and the owner's profile (createCompany function)
export const companySetupInput = z.object({
  companyName: z.string().trim().min(2, 'Enter your company name.').max(100),
  name: z.string().trim().min(2, 'Enter your name.').max(100),
});

// Small helper so forms get one friendly message instead of a zod error object
export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown):
  { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const r = schema.safeParse(data);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.issues[0]?.message ?? 'Check the form.' };
}
