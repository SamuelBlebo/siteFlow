// Firestore and Storage paths as plain strings, so they work with the web SDK (doc(db, path)),
// React Native Firebase (firestore().doc(path)) and the Admin SDK (db.doc(path)).
// Never hand-type a path in an app: add it here.
export type SiteCollection =
  | 'materials' | 'materialLogs' | 'workers' | 'workerPay' | 'attendance' | 'reports' | 'issues' | 'milestones' | 'expenses' | 'finance'
  | 'changeOrders' | 'rfis' | 'inspections' | 'punchItems' | 'subcontractors' | 'incidents'
  | 'toolboxTalks' | 'tasks' | 'drawings' | 'documents' | 'billing';

export const paths = {
  users: () => 'users',
  user: (uid: string) => `users/${uid}`,
  companies: () => 'companies',
  company: (cid: string) => `companies/${cid}`,
  equipment: (cid: string) => `companies/${cid}/equipment`,
  activity: (cid: string) => `companies/${cid}/activity`,
  notifications: (cid: string) => `companies/${cid}/notifications`,
  sites: (cid: string) => `companies/${cid}/sites`,
  site: (cid: string, sid: string) => `companies/${cid}/sites/${sid}`,
  sub: (cid: string, sid: string, name: SiteCollection) => `companies/${cid}/sites/${sid}/${name}`,
  subDoc: (cid: string, sid: string, name: SiteCollection, id: string) => `companies/${cid}/sites/${sid}/${name}/${id}`,
  // Money is kept apart from the site document so site teams can read the site without seeing it
  finance: (cid: string, sid: string) => `companies/${cid}/sites/${sid}/finance/summary`,
  workerPay: (cid: string, sid: string, workerId: string) => `companies/${cid}/sites/${sid}/workerPay/${workerId}`,
  attendance: (cid: string, sid: string, date: string) => `companies/${cid}/sites/${sid}/attendance/${date}`,
  issueComments: (cid: string, sid: string, issueId: string) => `companies/${cid}/sites/${sid}/issues/${issueId}/comments`,
  // Storage
  issuePhoto: (cid: string, sid: string, issueId: string, file: string) => `companies/${cid}/sites/${sid}/issues/${issueId}/${file}`,
  photo: (cid: string, sid: string, reportId: string, file: string) => `companies/${cid}/sites/${sid}/reports/${reportId}/${file}`,
};
