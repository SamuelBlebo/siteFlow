// Counts documents per collection name, walking subcollections. Read-only.
//   node scripts/launch/count-docs.mjs <project id> <database id>
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../firebase/functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const [project, database] = process.argv.slice(2);
if (!project || !database) { console.error('Usage: count-docs.mjs <project id> <database id>'); process.exit(2); }
const db = getFirestore(initializeApp({ projectId: project }), database);

const counts = {};
async function walk(collections) {
  for (const col of collections) {
    const docs = await col.listDocuments(); // also finds parents that only hold subcollections
    const snap = await col.get();
    counts[col.id] = (counts[col.id] || 0) + snap.size;
    for (const d of docs) await walk(await d.listCollections());
  }
}
await walk(await db.listCollections());
for (const k of Object.keys(counts).sort()) console.log(`${k}\t${counts[k]}`);
