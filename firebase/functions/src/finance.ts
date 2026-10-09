import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { AggregateField, getFirestore, FieldValue, type Query, type Transaction } from 'firebase-admin/firestore';
import { EXPENSE_CATEGORIES, paths, round2, type SiteFinance } from '@siteflow/shared';

// Keeps a site's spending totals right. Whenever an expense is added, changed or deleted, the
// totals are counted again and written to the finance summary. Counting again (rather than adding
// the difference) means a repeated trigger can never double count, and no app may write these totals.
//
// Firestore does the counting (sum and count aggregations): about one read per 1,000 expenses
// instead of reading every expense. Counted per category: the standard ones, any already in the
// summary, and this expense's old and new category.
//
// It all runs in a transaction that reads and writes the summary, so two expenses saved at the
// same moment can't leave stale totals: if another update lands first, this one runs again and
// counts both.
export const recalcSiteSpending = onDocumentWritten('companies/{cid}/sites/{sid}/expenses/{eid}', async (event) => {
  const { cid, sid } = event.params;
  const db = getFirestore();
  // Sample projects: the loader writes its own totals (skip its bulk writes), and a sample project being
  // removed needs no recount. Changes people make to sample data are still counted.
  if (event.data?.after?.data()?.sample === true && !event.data?.before?.exists) return;
  if (!event.data?.after?.exists) {
    const site = await db.doc(paths.site(cid, sid)).get();
    if (!site.exists || site.data()?.removing) return;
  }
  const expenses = db.collection(paths.sub(cid, sid, 'expenses'));
  const summaryRef = db.doc(paths.finance(cid, sid));
  const changed = [event.data?.before?.data()?.category, event.data?.after?.data()?.category].filter((c): c is string => typeof c === 'string' && !!c);

  const totals = await db.runTransaction(async (tx: Transaction) => {
    const totalOf = async (q: Query) => {
      const r = (await tx.get(q.aggregate({ amount: AggregateField.sum('amount'), n: AggregateField.count() }))).data();
      return { amount: round2(Number(r.amount) || 0), n: r.n };
    };
    const summary = (await tx.get(summaryRef)).data() as Partial<SiteFinance> | undefined;
    const categories = new Set<string>([...EXPENSE_CATEGORIES, ...Object.keys(summary?.byCategory || {}), ...changed]);
    const all = await totalOf(expenses);
    const byCategory: Record<string, number> = {};
    for (const c of categories) {
      const t = await totalOf(expenses.where('category', '==', c));
      if (t.n > 0) byCategory[c] = t.amount; // a category with no expenses left drops out
    }
    // mergeFields replaces these fields whole (a plain merge would keep categories that no longer have spending)
    tx.set(summaryRef, { spent: all.amount, byCategory, expenseCount: all.n, computedAt: FieldValue.serverTimestamp() },
      { mergeFields: ['spent', 'byCategory', 'expenseCount', 'computedAt'] });
    return { spent: all.amount, expenses: all.n, categories: categories.size };
  });
  logger.info('Site spending recalculated', { cid, sid, ...totals });
});
