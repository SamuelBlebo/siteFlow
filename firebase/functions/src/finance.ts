import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { expenseTotals, paths, type Expense } from '@siteflow/shared';

// Keeps a site's spending totals right. Whenever an expense is added, changed or deleted, the
// totals are worked out again from all of the site's expenses and written to the finance summary.
// Recalculating (rather than adding the difference) means a repeated trigger can never double count,
// and no app is allowed to write these totals.
export const recalcSiteSpending = onDocumentWritten('companies/{cid}/sites/{sid}/expenses/{eid}', async (event) => {
  const { cid, sid } = event.params;
  const db = getFirestore();
  const snap = await db.collection(paths.sub(cid, sid, 'expenses')).get();
  const totals = expenseTotals(snap.docs.map((d) => d.data() as Expense));
  // mergeFields replaces these fields whole (a plain merge would keep categories that no longer have spending)
  await db.doc(paths.finance(cid, sid)).set({ ...totals, computedAt: FieldValue.serverTimestamp() },
    { mergeFields: ['spent', 'byCategory', 'expenseCount', 'computedAt'] });
  logger.info('Site spending recalculated', { cid, sid, spent: totals.spent, expenses: totals.expenseCount });
});
