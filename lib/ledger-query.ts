// Cursor-paginated + date-filtered transaction fetching, shared by the
// History page's first (SSR) page and /api/transactions's "load more" pages —
// one place for the query shape so both agree on sort order and cursor math.
import { ObjectId } from "mongodb";
import type { UserScope } from "./scope";
import type { TransactionDoc } from "./types";

export interface LedgerQueryOptions {
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
  cursor?: string;
  limit?: number;
}

// "Spending" for History's total — just expenses. Loans move money out of an
// account too, but lending isn't spending it (the cash becomes a receivable,
// tracked on /loans with its own totals), so including them here would count
// the same rupee as both "spent" and "owed to you" at once.
const OUTFLOW_TYPES = ["expense"];

export function encodeCursor(t: Pick<TransactionDoc, "date" | "_id">): string {
  return `${t.date.toISOString()}_${t._id.toHexString()}`;
}

function decodeCursor(cursor: string): { date: Date; id: ObjectId } | null {
  const sep = cursor.lastIndexOf("_");
  if (sep === -1) return null;
  const date = new Date(cursor.slice(0, sep));
  const idStr = cursor.slice(sep + 1);
  if (Number.isNaN(date.getTime()) || !ObjectId.isValid(idStr)) return null;
  return { date, id: new ObjectId(idStr) };
}

function dateRangeFilter(from?: string, to?: string): Record<string, unknown> | null {
  if (!from && !to) return null;
  const range: Record<string, Date> = {};
  if (from) range.$gte = new Date(`${from}T00:00:00`);
  if (to) range.$lte = new Date(`${to}T23:59:59.999`);
  return { date: range };
}

export async function fetchLedgerPage(
  scope: UserScope,
  opts: LedgerQueryOptions = {},
): Promise<{ transactions: TransactionDoc[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 30, 100);
  const and: Record<string, unknown>[] = [{ deleted_at: { $exists: false } }];

  const dateFilter = dateRangeFilter(opts.from, opts.to);
  if (dateFilter) and.push(dateFilter);

  if (opts.cursor) {
    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      and.push({
        $or: [{ date: { $lt: decoded.date } }, { date: decoded.date, _id: { $lt: decoded.id } }],
      });
    }
  }

  const filter = and.length === 1 ? and[0]! : { $and: and };

  const page = await scope.transactions
    .find(filter as never, { sort: { date: -1, _id: -1 }, limit: limit + 1 })
    .toArray();

  const hasMore = page.length > limit;
  const transactions = hasMore ? page.slice(0, limit) : page;
  const last = transactions[transactions.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last) : null;

  return { transactions, nextCursor };
}

export async function fetchLedgerTotals(
  scope: UserScope,
  opts: { from?: string; to?: string } = {},
): Promise<{ count: number; outflow: number }> {
  const base: Record<string, unknown> = { deleted_at: { $exists: false } };
  const dateFilter = dateRangeFilter(opts.from, opts.to);
  if (dateFilter) Object.assign(base, dateFilter);

  const [count, outflowAgg] = await Promise.all([
    scope.transactions.countDocuments(base as never),
    scope.transactions
      .aggregate<{ _id: null; total: number }>([
        { $match: { ...base, type: { $in: OUTFLOW_TYPES } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
  ]);

  return { count, outflow: outflowAgg[0]?.total ?? 0 };
}
