import { z } from 'zod';

// Shared by the platform admin (Cloud Functions) and the web, so both count things the same way.

export type StepKey = 'details' | 'project' | 'team' | 'report' | 'budget';

// The first steps for a new company. budgetSet is null when it cannot be known, and then that step is left out.
export function gettingStartedSteps(f: {
  hasDetails: boolean; realProjects: number; members: number; reported: boolean; budgetSet: boolean | null;
}): { key: StepKey; title: string; done: boolean }[] {
  const steps: { key: StepKey; title: string; done: boolean }[] = [
    { key: 'details', title: 'Company details', done: f.hasDetails },
    { key: 'project', title: 'First project', done: f.realProjects > 0 },
    { key: 'team', title: 'Your team', done: f.members > 1 },
    { key: 'report', title: 'First daily report', done: f.reported },
  ];
  if (f.budgetSet !== null) steps.push({ key: 'budget', title: 'Project budget', done: f.budgetSet });
  return steps;
}

export type CompanyStatus = 'active' | 'quiet' | 'never';
export const QUIET_DAYS = 7;

// Never started: no real project (none, or only sample ones). Going quiet: no activity for 7 days or more.
export function companyStatus(f: { realProjects: number; lastActive: number | null }, now: number): CompanyStatus {
  if (f.realProjects < 1) return 'never';
  if (f.lastActive === null || now - f.lastActive >= QUIET_DAYS * 86_400_000) return 'quiet';
  return 'active';
}

// The only fields an admin response may carry. Counts and activity, never report, issue, finance or photo text.
export const ADMIN_FIELDS = {
  overview: ['companies', 'people', 'newCompanies7', 'newCompanies30', 'newPeople7', 'newPeople30', 'activeCompanies7', 'activePeople7', 'signupsByWeek'],
  companyRow: ['id', 'name', 'country', 'ownerName', 'ownerEmail', 'createdAt', 'people', 'projects', 'sampleOnly', 'reports7d', 'lastActive', 'status', 'suspended', 'internal'],
  companyDetail: ['id', 'name', 'country', 'ownerName', 'ownerEmail', 'createdAt', 'people', 'projects', 'sampleOnly', 'reports7d', 'lastActive', 'status', 'suspended', 'internal', 'members', 'projectList', 'steps'],
  person: ['id', 'name', 'email', 'role', 'lastActive', 'disabled', 'invitePending'],
  project: ['id', 'name', 'status', 'lastReportDate', 'sample'],
  user: ['id', 'email', 'name', 'disabled', 'createdAt', 'lastActive', 'companies'],
  logEntry: ['id', 'who', 'action', 'target', 'at'],
} as const;

const id = z.string().min(1).max(128);

export const adminCompanyInput = z.object({ cid: id });
export const adminFindUserInput = z.object({ email: z.string().trim().email('Enter a valid email.') });
export const adminUserActionInput = z.object({ uid: id });
export const adminDisableInput = z.object({ uid: id, disabled: z.boolean() });
export const adminCompanyFlagInput = z.object({ cid: id, on: z.boolean() });
export const adminInviteInput = z.object({ cid: id, uid: id });
