export const STAGES = ['Site clearing', 'Foundation', 'Blockwork', 'Lintel level', 'First floor slab', 'Roof level', 'Roofing', 'Plastering', 'Finishing', 'Handover'];
// Kinds of construction work and their usual stages. Stages are suggestions: any stage can be typed in
// (up to STAGE_MAX characters), and "other" work has no list at all.
export const WORK_TYPES = [
  { key: 'building', label: 'Building (houses, flats, offices)', stages: STAGES },
  { key: 'roads', label: 'Roads and drainage', stages: ['Mobilisation', 'Site clearing', 'Earthworks', 'Sub-base', 'Base course', 'Drains and culverts', 'Surfacing', 'Road markings and signs', 'Handover'] },
  { key: 'civil', label: 'Bridges and civil works', stages: ['Mobilisation', 'Excavation', 'Piling and foundations', 'Substructure', 'Superstructure', 'Deck or slab', 'Finishing works', 'Testing', 'Handover'] },
  { key: 'utilities', label: 'Water, power and utilities', stages: ['Survey', 'Trenching', 'Pipe or cable laying', 'Backfilling', 'Testing', 'Connections', 'Reinstatement', 'Handover'] },
  { key: 'renovation', label: 'Renovation and fit-out', stages: ['Assessment', 'Strip-out and demolition', 'Structural repairs', 'Roofing', 'Electrical and plumbing', 'Plastering', 'Painting and finishing', 'Handover'] },
  { key: 'other', label: 'Other (type your own stages)', stages: [] as string[] },
] as const;
export type WorkType = (typeof WORK_TYPES)[number]['key'];
export const STAGE_MAX = 60;               // same limit as the security rules
export const TRADES = ['Mason', 'Carpenter', 'Steel bender', 'Electrician', 'Plumber', 'Welder', 'Roofer', 'Painter', 'Tiler', 'Labourer'];
export const UNITS = ['bags', 'lengths', 'pcs', 'trips', 'sheets', 'kg', 'litres', 'm³'];
export const EXPENSE_CATEGORIES = ['Materials', 'Labour', 'Transport', 'Equipment', 'Permits', 'Other'];
export const CO_REASONS = ['Client request', 'Design change', 'Site condition', 'Other'];
export const INCIDENT_TYPES = ['Near miss', 'First aid', 'Lost-time injury', 'Property damage'];
export const DISCIPLINES = ['Architectural', 'Structural', 'Electrical', 'Mechanical', 'Civil'];

// Business rules, kept in one place so web, mobile and functions agree
export const RETENTION_RATE = 0.05;        // held on subcontractor payments
export const HIGH_USAGE_FACTOR = 1.3;      // usage above 130% of usual daily use
export const BUDGET_WARN_PCT = 90;         // budget nearly used
export const OVERSPEND_GAP_PCT = 15;       // budget used ahead of progress by this much
export const BEHIND_GAP_PCT = 8;           // progress behind plan by this much
export const APPROVAL_LIMITS = { changeOrder: 50000, payment: 20000, materialOrder: 10000 }; // GH₵, MD approval above
export const TIMEZONE = 'Africa/Accra';     // UTC+0, no daylight saving
