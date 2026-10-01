import { can } from '../permissions';
import type { Issue, IssuePriority, IssueStatus, Role } from '../types';

export const ISSUE_PRIORITIES: IssuePriority[] = ['critical', 'high', 'medium', 'low'];
export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export const ISSUE_PRIORITY_HINTS: Record<IssuePriority, string> = {
  critical: 'Work has stopped or someone could be hurt',
  high: 'Holding up work today',
  medium: 'Needs sorting this week',
  low: 'Minor, when there is time',
};
export const ISSUE_STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };
export const ISSUE_CATEGORIES = ['Materials', 'Labour', 'Equipment', 'Drawings or design', 'Safety', 'Weather', 'Client', 'Utilities', 'Other'];

export const isOpenIssue = (s: IssueStatus | undefined) => s === 'open' || s === 'in_progress';
const RANK: Record<IssuePriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// Open before finished, then most urgent first, then most recently active
export function sortIssues<T extends Pick<Issue, 'priority' | 'status'> & { lastActivityAt?: unknown; createdAt?: unknown }>(issues: T[]): T[] {
  const t = (v: unknown) => (v && typeof v === 'object' && 'seconds' in v ? (v as { seconds: number }).seconds : 0);
  return [...issues].sort((a, b) =>
    Number(!isOpenIssue(a.status)) - Number(!isOpenIssue(b.status))
    || RANK[a.priority] - RANK[b.priority]
    || t(b.lastActivityAt ?? b.createdAt) - t(a.lastActivityAt ?? a.createdAt));
}

export interface IssueFilter { q?: string; status?: 'open' | IssueStatus | 'all'; priority?: IssuePriority | ''; siteId?: string; assignedTo?: string; category?: string }
export function filterIssues<T extends Partial<Issue>>(issues: T[], f: IssueFilter = {}): T[] {
  const words = (f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return issues.filter((i) => {
    if (f.status === 'open' && !isOpenIssue(i.status)) return false;
    if (f.status && f.status !== 'open' && f.status !== 'all' && i.status !== f.status) return false;
    if (f.priority && i.priority !== f.priority) return false;
    if (f.siteId && i.siteId !== f.siteId) return false;
    if (f.assignedTo && i.assignedTo !== f.assignedTo) return false;
    if (f.category && i.category !== f.category) return false;
    if (words.length) {
      const hay = [i.title, i.description, i.location, i.category, i.siteName, i.createdByName, i.assignedToName, i.resolution].join(' ').toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

// What someone may do with an issue. The security rules enforce the same.
//  - Site managers (owner, admin, project manager): everything.
//  - The person it's assigned to: start it and resolve it.
//  - The person who reported it: fix its details and add photos while it's open.
//  - Anyone doing site work on the site: comment.
export function issueActions(issue: Pick<Issue, 'status' | 'assignedTo' | 'createdBy'>, user: { uid: string; role: Role | null }, siteOpen = true) {
  const work = siteOpen && can(user.role, 'site.work');
  const manager = work && can(user.role, 'sites.manage');
  const assignee = work && !!issue.assignedTo && issue.assignedTo === user.uid;
  const reporter = work && issue.createdBy === user.uid;
  const open = isOpenIssue(issue.status);
  return {
    comment: work,
    edit: manager || (reporter && issue.status === 'open'),
    assign: manager && issue.status !== 'closed',
    setPriority: manager && issue.status !== 'closed',
    start: (manager || assignee) && issue.status === 'open',
    resolve: (manager || assignee) && open,
    close: manager && issue.status === 'resolved',
    reopen: manager && !open,
  };
}

// The stored issue (createdAt / updatedAt / lastActivityAt are server timestamps set by the app)
export function issueDoc(input: { title: string; description?: string; priority: IssuePriority; category: string; location?: string; dueDate?: string },
  meta: { companyId: string; siteId: string; siteName: string; uid: string; name: string; photos?: string[]; assignedTo?: string | null; assignedToName?: string; date: string }) {
  return {
    companyId: meta.companyId, siteId: meta.siteId, siteName: meta.siteName,
    title: input.title, description: input.description || '', priority: input.priority, category: input.category,
    location: input.location || '', dueDate: input.dueDate || null, date: meta.date,
    status: 'open' as IssueStatus, assignedTo: meta.assignedTo ?? null, assignedToName: meta.assignedToName || '',
    photos: meta.photos || [], photoCount: (meta.photos || []).length,
    resolution: '', resolvedBy: null, resolvedByName: '',
    commentCount: 0, createdBy: meta.uid, createdByName: meta.name,
  };
}
