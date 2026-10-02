import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { AggregateField, getFirestore, FieldValue, type Query } from 'firebase-admin/firestore';
import { paths, round2, type SiteFinance } from '@siteflow/shared';

// Keeps a site's spending totals right. Whenever an expense is added, changed or deleted, the
// totals are counted again and written to the finance summary. Counting again (rather than adding
// the difference) means a repeated trigger can never double count, and no app may write these totals.
//
// The counting is done by Firestore (sum and count aggregations), which costs one read per 1,000
// expenses instead of reading every expense. Only the categories that can have changed are
// recounted: those already in the summary plus the expense's old and new category.
export const recalcSiteSpending = onDocumentWritten('companies/{cid}/sites/{sid}/expenses/{eid}', async (event) => {
  const { cid, sid } = event.params;
  const db = getFirestore();
  const expenses = db.collection(paths.sub(cid, sid, 'expenses'));
  const totalOf = async (q: Query) => {
    const r = (await q.aggregate({ amount: AggregateField.sum('amount'), n: AggregateField.count() }).get()).data();
    return { amount: round2(Number(r.amount) || 0), n: r.n };
  };

  const summaryRef = db.doc(paths.finance(cid, sid));
  const summary = (await summaryRef.get()).data() as Partial<SiteFinance> | undefined;
  const categories = new Set<string>(Object.keys(summary?.byCategory || {}));
  for (const c of [event.data?.before?.data()?.category, event.data?.after?.data()?.category]) if (typeof c === 'string' && c) categories.add(c);

  const all = await totalOf(expenses);
  const byCategory: Record<string, number> = {};
  for (const c of categories) {
    const t = await totalOf(expenses.where('category', '==', c));
    if (t.n > 0) byCategory[c] = t.amount; // a category with no expenses left drops out
  }
  // mergeFields replaces these fields whole (a plain merge would keep categories that no longer have spending)
  await summaryRef.set({ spent: all.amount, byCategory, expenseCount: all.n, computedAt: FieldValue.serverTimestamp() },
    { mergeFields: ['spent', 'byCategory', 'expenseCount', 'computedAt'] });
  logger.info('Site spending recalculated', { cid, sid, spent: all.amount, expenses: all.n, categories: categories.size });
});
