export const STAGES = ['Site clearing', 'Foundation', 'Blockwork', 'Lintel level', 'First floor slab', 'Roof level', 'Roofing', 'Plastering', 'Finishing', 'Handover'];
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
