// Firestore document shapes. `id` is the document id (not stored as a field).
// See permissions.ts for what each role can do
export type Role = 'owner' | 'admin' | 'manager' | 'finance' | 'supervisor' | 'viewer';
export type Plan = 'starter' | 'professional' | 'enterprise';
export type ModuleKey =
  | 'reports' | 'ai' | 'materials' | 'labour' | 'safety' | 'budget' | 'changeorders' | 'scheduling'
  | 'documents' | 'rfis' | 'inspections' | 'subcontractors' | 'equipment' | 'portal' | 'audit' | 'integrations';
export type Channel = 'whatsapp' | 'email';
export type NotificationKey =
  | 'report' | 'usage' | 'stock' | 'budget' | 'co' | 'rfi' | 'safety' | 'service' | 'digest' | 'weekly';

export interface NotificationRule { whatsapp: boolean; email: boolean }

export interface Company {
  id: string;
  name: string;
  ownerId: string;
  phone?: string;
  location?: string;
  plan?: Plan;
  modules: Partial<Record<ModuleKey, boolean>>;
  notifications?: Partial<Record<NotificationKey, NotificationRule>>;
}

export interface UserProfile {
  id: string;
  companyId: string;
  role: Role;
  name: string;
  email: string;
  phone?: string;
  siteIds: string[];
  active?: boolean;              // false = switched off; treated as having no access
  mustChangePassword?: boolean;  // set when an admin issues a temporary password
}

// companies/{cid}/activity/{id}: audit trail, written by Cloud Functions only
export interface ActivityEntry { id?: string; who: string; whoId?: string; what: string; at: unknown }

export interface Site {
  id: string;
  name: string;
  location: string;
  foremanName?: string;
  foremanPhone?: string;
  foremanEmail?: string;
  stage: string;
  progress: number;          // 0-100
  status: 'active' | 'closed';
  lastReportDate: string | null; // YYYY-MM-DD
  lastReportTime?: string;       // HH:MM
  planStart?: string;            // YYYY-MM-DD
  planEnd?: string;              // YYYY-MM-DD
  client?: { name: string; email?: string; phone?: string };
}

// companies/{cid}/sites/{sid}/finance/summary. Finance roles only.
export interface SiteFinance { budget: number; spent: number }

// stock only changes together with a materialLogs entry (lastLogId points at it); the rules check the two match
export interface Material { id: string; name: string; unit: string; stock: number; reorderLevel: number; avgDaily: number; lastLogId?: string }
export interface MaterialLog {
  id?: string; materialId: string; materialName: string; unit: string;
  type: 'usage' | 'delivery'; qty: number; cost: number; supplier: string; date: string; createdBy: string;
}
export interface Worker { id: string; name: string; trade: string; active: boolean; createdBy?: string }
// companies/{cid}/sites/{sid}/workerPay/{workerId}. Finance roles only.
export interface WorkerPay { dailyRate: number; bankName?: string; accountLast4?: string }
// One doc per day. Each worker is its own map key, so two phones marking different workers never overwrite each other.
export interface Attendance { date: string; present: Record<string, boolean>; markedBy: string }
export type ReportSource = 'app' | 'web' | 'voice' | 'whatsapp';
export interface Report {
  id?: string; date: string; time: string; text: string; stage: string; progress: number; issues: string;
  photos: string[]; photoCount?: number; workersPresent: number; createdBy: string; createdByName: string; source?: ReportSource;
}
export interface Expense { id?: string; date: string; category: string; note: string; amount: number; createdBy: string }

export interface ChangeOrder {
  id?: string; number: string; title: string; reason: string; amount: number; extraDays: number;
  status: 'pending' | 'approved' | 'rejected'; raisedBy: string; decidedBy?: string; date: string;
}
export interface Rfi {
  id?: string; number: string; question: string; sentTo: string; dueDate: string;
  status: 'open' | 'answered'; answer?: string; createdBy: string;
}
export type CheckResult = 'open' | 'pass' | 'fail' | 'na';
export interface Inspection { id?: string; name: string; by: string; date: string; items: { text: string; result: CheckResult }[] }
export interface PunchItem { id?: string; number: string; location: string; issue: string; assignee: string; status: 'open' | 'ready' | 'closed'; photo?: string }
export interface Subcontractor { id?: string; name: string; trade: string; contractValue: number; percentDone: number; paid: number }
export interface Incident { id?: string; date: string; type: string; severity: 'Low' | 'Medium' | 'High'; description: string; status: 'open' | 'closed'; reportedBy: string }
export interface ScheduleTask { id?: string; name: string; startWeek: number; endWeek: number; percentDone: number }
export interface Drawing { id?: string; number: string; title: string; discipline: string; revision: string; issuedDate: string; fileUrl?: string }
export interface Equipment { id?: string; name: string; siteId: string | null; status: 'Working' | 'Idle' | 'Under repair'; hours: number; nextServiceHours: number; fuelThisWeek: number }
export interface BillingMilestone { id?: string; name: string; amount: number; status: 'upcoming' | 'invoiced' | 'paid'; order: number }

export type Severity = 'bad' | 'warn';
export interface Alert { kind: string; severity: Severity; title: string; detail: string; tab?: string }
