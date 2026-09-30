import type { Company, ModuleKey, Plan } from './types';

export interface ModuleDef { key: ModuleKey; name: string; description: string; tier: 'core' | Plan }

export const MODULES: ModuleDef[] = [
  { key: 'reports', name: 'Daily reports and photos', description: 'Daily site reports with photos, issues and headcount.', tier: 'core' },
  { key: 'ai', name: 'SiteFlow AI', description: 'Voice-note reports in English or Twi, a daily summary and answers about your projects.', tier: 'professional' },
  { key: 'materials', name: 'Materials and stock', description: 'Deliveries, daily usage, stock levels and unusual-use alerts.', tier: 'starter' },
  { key: 'labour', name: 'Labour and wage sheets', description: 'Attendance, daily wages and bank-ready wage sheets.', tier: 'starter' },
  { key: 'safety', name: 'Health and safety', description: 'Incident reports, toolbox talks and days without injury.', tier: 'starter' },
  { key: 'budget', name: 'Budget and costs', description: 'Budget against actual, expenses and overspend alerts.', tier: 'professional' },
  { key: 'changeorders', name: 'Change orders', description: 'Price extra work and get it approved before it starts.', tier: 'professional' },
  { key: 'scheduling', name: 'Scheduling', description: 'Programme per project and across the portfolio, with delay alerts.', tier: 'professional' },
  { key: 'documents', name: 'Drawings and documents', description: 'Drawing revisions, permits and contracts. Site sees the latest only.', tier: 'professional' },
  { key: 'rfis', name: 'RFIs', description: 'Questions to architects and consultants with due dates and answers on record.', tier: 'professional' },
  { key: 'inspections', name: 'Inspections and punch lists', description: 'Checklists on the phone, failed items flagged, defects tracked to close.', tier: 'professional' },
  { key: 'subcontractors', name: 'Subcontractors', description: 'Contract value, certified work, retention and bank payments.', tier: 'professional' },
  { key: 'equipment', name: 'Equipment', description: 'Fleet location, hours, fuel and service reminders.', tier: 'enterprise' },
  { key: 'portal', name: 'Client portal and billing', description: 'Clients see progress and photos. Milestone invoices by email.', tier: 'enterprise' },
  { key: 'audit', name: 'Approvals and audit trail', description: 'Approval limits and a record of every change.', tier: 'enterprise' },
  { key: 'integrations', name: 'Integrations', description: 'QuickBooks, Sage, Odoo, Google Drive, Microsoft 365 and Excel.', tier: 'enterprise' },
];

// What a new company starts with (the setup wizard can add more)
export const DEFAULT_MODULES: Partial<Record<ModuleKey, boolean>> = { materials: true, labour: true, budget: true, safety: true };

export const isOn = (company: Pick<Company, 'modules'> | null | undefined, key: ModuleKey): boolean =>
  key === 'reports' || !!company?.modules?.[key];

export function planFor(modules: Partial<Record<ModuleKey, boolean>>): Plan {
  const tiers = MODULES.filter((m) => m.tier !== 'core' && modules[m.key]).map((m) => m.tier);
  if (tiers.includes('enterprise')) return 'enterprise';
  if (tiers.includes('professional')) return 'professional';
  return 'starter';
}
