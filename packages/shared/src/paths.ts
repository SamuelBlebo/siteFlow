// Firestore paths as plain strings, so they work with both the web SDK (doc(db, path))
// and React Native Firebase (firestore().doc(path)).
export type SiteCollection =
  | 'materials' | 'materialLogs' | 'workers' | 'attendance' | 'reports' | 'expenses'
  | 'changeOrders' | 'rfis' | 'inspections' | 'punchItems' | 'subcontractors' | 'incidents'
  | 'toolboxTalks' | 'tasks' | 'drawings' | 'documents' | 'billing';

export const paths = {
  user: (uid: string) => `users/${uid}`,
  company: (cid: string) => `companies/${cid}`,
  equipment: (cid: string) => `companies/${cid}/equipment`,
  activity: (cid: string) => `companies/${cid}/activity`,
  sites: (cid: string) => `companies/${cid}/sites`,
  site: (cid: string, sid: string) => `companies/${cid}/sites/${sid}`,
  sub: (cid: string, sid: string, name: SiteCollection) => `companies/${cid}/sites/${sid}/${name}`,
  attendance: (cid: string, sid: string, date: string) => `companies/${cid}/sites/${sid}/attendance/${date}`,
  photo: (cid: string, sid: string, reportId: string, file: string) => `companies/${cid}/sites/${sid}/reports/${reportId}/${file}`,
};
