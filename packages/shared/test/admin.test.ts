import { describe, expect, it } from 'vitest';
import {
  ADMIN_FIELDS, adminCompanyFlagInput, adminCompanyInput, adminDisableInput, adminFindUserInput, adminInviteInput,
  adminUserActionInput, companyStatus, gettingStartedSteps, validate,
} from '../src';

const now = Date.parse('2026-10-22T12:00:00Z');
const day = 86_400_000;

describe('company status', () => {
  it('never started without a real project, whatever the activity', () => {
    expect(companyStatus({ realProjects: 0, lastActive: now }, now)).toBe('never');
  });
  it('going quiet after 7 days without activity', () => {
    expect(companyStatus({ realProjects: 1, lastActive: now - 7 * day }, now)).toBe('quiet');
    expect(companyStatus({ realProjects: 1, lastActive: now - 7 * day + 1 }, now)).toBe('active');
    expect(companyStatus({ realProjects: 1, lastActive: null }, now)).toBe('quiet');
  });
});

describe('getting-started steps', () => {
  it('match the web checklist', () => {
    const s = gettingStartedSteps({ hasDetails: true, realProjects: 1, members: 1, reported: false, budgetSet: null });
    expect(s.map((x) => [x.key, x.done])).toEqual([['details', true], ['project', true], ['team', false], ['report', false]]);
  });
  it('includes the budget step when it is known', () => {
    const s = gettingStartedSteps({ hasDetails: false, realProjects: 0, members: 2, reported: false, budgetSet: false });
    expect(s.map((x) => [x.title, x.done])).toEqual([
      ['Company details', false], ['First project', false], ['Your team', true], ['First daily report', false], ['Project budget', false],
    ]);
  });
});

describe('admin inputs', () => {
  it('refuse bad values', () => {
    expect(validate(adminFindUserInput, { email: 'nope' }).ok).toBe(false);
    expect(validate(adminCompanyFlagInput, { cid: 'c1', on: true }).ok).toBe(true);
    expect(validate(adminCompanyInput, { cid: '' }).ok).toBe(false);
    expect(validate(adminUserActionInput, { uid: 'x'.repeat(129) }).ok).toBe(false);
    expect(validate(adminDisableInput, { uid: 'u1', disabled: 'yes' }).ok).toBe(false);
    expect(validate(adminInviteInput, { cid: 'c1', uid: 'u1' }).ok).toBe(true);
  });
  it('has allow-lists for every admin response', () => {
    expect(ADMIN_FIELDS.companyDetail).toEqual(expect.arrayContaining([...ADMIN_FIELDS.companyRow, 'members', 'projectList', 'steps']));
  });
});
