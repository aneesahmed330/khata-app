import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser, type UserScope } from "@/lib/scope";
import { ACCOUNT_SIGN } from "@/lib/ledger";
import type { TxnType } from "@/lib/types";

// Mobile-only: five charts for the Insights screen's chart carousel, one
// round trip instead of five. Range resolution is copied verbatim from
// app/api/insights/route.ts (not factored out — that file owns the
// dashboard's own semantics and shouldn't have to change if this one does).

interface RangePeriod {
  from: Date;
  to: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysPeriod(days: number) {
  return (now: Date): RangePeriod => {
    const from = startOfDay(now);
    from.setDate(from.getDate() - (days - 1));
    return { from, to: now };
  };
}

function monthPeriod(now: Date): RangePeriod {
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

const RANGE_RESOLVERS: Record<string, (now: Date) => RangePeriod> = {
  month: monthPeriod,
  "30d": daysPeriod(30),
  "3m": daysPeriod(90),
  "6m": daysPeriod(180),
  "1y": daysPeriod(365),
};

const LOAN_TXN_TYPES = ["loan_given", "loan_taken", "repayment_in", "repayment_out"] as const;

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Oldest-to-newest points spanning [from, to], one per `stepDays`, always
 *  ending on `to` itself even if that lands off-step — the trend must end on
 *  today, not on the last multiple of the step. */
function buildPoints(from: Date, to: Date, stepDays: number): Date[] {
  const points: Date[] = [];
  const end = startOfDay(to);
  const cursor = startOfDay(from);
  while (cursor.getTime() < end.getTime()) {
    points.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + stepDays);
  }
  points.push(end);
  return points;
}

/** Last 6 calendar months (oldest first), including the current one. */
function last6Months(now: Date): Date[] {
  return Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 1));
}

async function fetchNetWorthTrend(scope: UserScope, from: Date, to: Date, stepDays: number) {
  // Liquid net worth only — bank/cash/wallet account balances. Loans and
  // investments have no historical balance snapshots to reconstruct from,
  // only their current state, so a trend line for them would be fabricated.
  const accounts = await scope.accounts
    .find({ archived: { $ne: true }, exclude_from_total: { $ne: true } })
    .toArray();
  const accountIds = accounts.map((a) => a._id);
  const eligible = new Set(accountIds.map((id) => id.toHexString()));
  const currentTotal = accounts.reduce((sum, a) => sum + a.balance, 0);

  const points = buildPoints(from, to, stepDays);
  if (accountIds.length === 0) {
    return points.map((p) => ({ date: dateKey(p), value: 0 }));
  }

  const txns = await scope.transactions
    .find(
      {
        $or: [{ account_id: { $in: accountIds } }, { to_account_id: { $in: accountIds } }],
        date: { $gt: points[0] },
        deleted_at: { $exists: false },
      },
      { sort: { date: 1 } },
    )
    .toArray();

  const deltas = txns.map((t) => {
    let delta = 0;
    if (t.account_id && eligible.has(t.account_id.toHexString())) {
      delta += (ACCOUNT_SIGN[t.type] ?? 0) * t.amount;
    }
    // Transfer destinations always gain, independent of ACCOUNT_SIGN (see
    // lib/ledger.ts) — a transfer between two eligible accounts nets to zero
    // here, exactly as it should for a liquid-total trend.
    if (t.to_account_id && eligible.has(t.to_account_id.toHexString())) {
      delta += t.amount;
    }
    return { date: t.date, delta };
  });

  // Walk points newest -> oldest, accumulating the delta contributed by every
  // transaction still ahead of the current point, so each point's value is
  // currentTotal minus everything that happened after it.
  let idx = deltas.length - 1;
  let future = 0;
  const out: { date: string; value: number }[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i]!;
    while (idx >= 0 && deltas[idx]!.date > point) {
      future += deltas[idx]!.delta;
      idx--;
    }
    out.push({ date: dateKey(point), value: currentTotal - future });
  }
  out.reverse();
  return out;
}

async function fetchCategoryTrend(scope: UserScope, sixMonthsAgo: Date, monthKeys: string[]) {
  const rows = await scope.transactions
    .aggregate<{ _id: { root: unknown; month: string }; total: number }>([
      {
        $match: { type: "expense", date: { $gte: sixMonthsAgo }, deleted_at: { $exists: false } },
      },
      {
        $group: {
          _id: { root: "$root_category_id", month: { $dateToString: { format: "%Y-%m", date: "$date" } } },
          total: { $sum: "$amount" },
        },
      },
    ])
    .toArray();

  const totalsByRoot = new Map<string, number>();
  const byRootMonth = new Map<string, number>();
  for (const r of rows) {
    if (!r._id.root) continue;
    const rootId = String(r._id.root);
    totalsByRoot.set(rootId, (totalsByRoot.get(rootId) ?? 0) + r.total);
    byRootMonth.set(`${rootId}|${r._id.month}`, r.total);
  }

  const top5 = [...totalsByRoot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top5.length === 0) return [];

  const categories = await scope.categories
    .find({ _id: { $in: top5.map(([id]) => new ObjectId(id)) } })
    .toArray();
  const nameById = new Map(categories.map((c) => [c._id.toHexString(), c.name] as const));

  return top5.map(([rootId]) => ({
    category: nameById.get(rootId) ?? "Uncategorised",
    points: monthKeys.map((month) => ({ month, value: byRootMonth.get(`${rootId}|${month}`) ?? 0 })),
  }));
}

async function fetchIncomeVsExpense(scope: UserScope, sixMonthsAgo: Date, monthKeys: string[]) {
  const rows = await scope.transactions
    .aggregate<{ _id: { type: string; month: string }; total: number }>([
      {
        $match: {
          type: { $in: ["expense", "income"] },
          date: { $gte: sixMonthsAgo },
          deleted_at: { $exists: false },
        },
      },
      {
        $group: {
          _id: { type: "$type", month: { $dateToString: { format: "%Y-%m", date: "$date" } } },
          total: { $sum: "$amount" },
        },
      },
    ])
    .toArray();

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const entry = byMonth.get(r._id.month) ?? { income: 0, expense: 0 };
    if (r._id.type === "income") entry.income = r.total;
    else entry.expense = r.total;
    byMonth.set(r._id.month, entry);
  }

  return monthKeys.map((month) => ({
    month,
    income: byMonth.get(month)?.income ?? 0,
    expense: byMonth.get(month)?.expense ?? 0,
  }));
}

async function fetchLoanTimeline(scope: UserScope, sixMonthsAgo: Date, monthKeys: string[]) {
  const rows = await scope.transactions
    .aggregate<{ _id: { type: TxnType; month: string }; total: number }>([
      {
        $match: {
          type: { $in: LOAN_TXN_TYPES as unknown as string[] },
          date: { $gte: sixMonthsAgo },
          deleted_at: { $exists: false },
        },
      },
      {
        $group: {
          _id: { type: "$type", month: { $dateToString: { format: "%Y-%m", date: "$date" } } },
          total: { $sum: "$amount" },
        },
      },
    ])
    .toArray();

  const byMonth = new Map<string, { given: number; taken: number; repaidIn: number; repaidOut: number }>();
  for (const r of rows) {
    const entry = byMonth.get(r._id.month) ?? { given: 0, taken: 0, repaidIn: 0, repaidOut: 0 };
    if (r._id.type === "loan_given") entry.given = r.total;
    else if (r._id.type === "loan_taken") entry.taken = r.total;
    else if (r._id.type === "repayment_in") entry.repaidIn = r.total;
    else if (r._id.type === "repayment_out") entry.repaidOut = r.total;
    byMonth.set(r._id.month, entry);
  }

  return monthKeys.map((month) => ({
    month,
    given: byMonth.get(month)?.given ?? 0,
    taken: byMonth.get(month)?.taken ?? 0,
    repaidIn: byMonth.get(month)?.repaidIn ?? 0,
    repaidOut: byMonth.get(month)?.repaidOut ?? 0,
  }));
}

const TAG_BREAKDOWN_MAX = 8;

/** Spend grouped by tag for the CURRENT range (unlike categoryTrend/
 *  incomeVsExpense/loanTimeline, which are always the fixed last 6 months) —
 *  tags are a "what did this period look like" lens, same as the donut on
 *  /api/insights, not a trend line. A transaction with two tags counts
 *  toward both tags' totals (an $unwind before $group), same convention
 *  most tag-based reporting uses — it's not double-spending, it's the same
 *  rupee correctly showing up under every label it was tagged with. */
async function fetchTagBreakdown(scope: UserScope, from: Date, to: Date) {
  const rows = await scope.transactions
    .aggregate<{ _id: ObjectId; total: number; count: number }>([
      {
        $match: {
          type: "expense",
          date: { $gte: from, $lt: to },
          deleted_at: { $exists: false },
          tag_ids: { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$tag_ids" },
      { $group: { _id: "$tag_ids", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ])
    .toArray();

  if (rows.length === 0) return [];

  const tags = await scope.tags.find({ _id: { $in: rows.map((r) => r._id) } }).toArray();
  const nameById = new Map(tags.map((t) => [t._id.toHexString(), t.name] as const));

  const top = rows.slice(0, TAG_BREAKDOWN_MAX);
  const otherTotal = rows.slice(TAG_BREAKDOWN_MAX).reduce((sum, r) => sum + r.total, 0);
  const otherCount = rows.slice(TAG_BREAKDOWN_MAX).reduce((sum, r) => sum + r.count, 0);

  const breakdown = top.map((r) => ({
    name: nameById.get(r._id.toHexString()) ?? "Unknown",
    total: r.total,
    count: r.count,
  }));
  if (otherTotal > 0) {
    breakdown.push({ name: "Other tags", total: otherTotal, count: otherCount });
  }
  return breakdown;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const rangeKey = searchParams.get("range") ?? "30d";
  const resolve = RANGE_RESOLVERS[rangeKey] ?? RANGE_RESOLVERS["30d"]!;

  const scope = await forUser(session.userId);
  const now = new Date();
  const { from, to } = resolve(now);
  // Weekly buckets for the wider ranges keep the payload to ~30-60 points
  // instead of e.g. 365 daily points for "1y".
  const stepDays = rangeKey === "3m" || rangeKey === "6m" || rangeKey === "1y" ? 7 : 1;

  const months = last6Months(now);
  const monthKeys = months.map(monthKey);
  const sixMonthsAgo = months[0]!;

  const [netWorthTrend, categoryTrend, incomeVsExpense, loanTimeline, holdings, tagBreakdown] = await Promise.all([
    fetchNetWorthTrend(scope, from, to, stepDays),
    fetchCategoryTrend(scope, sixMonthsAgo, monthKeys),
    fetchIncomeVsExpense(scope, sixMonthsAgo, monthKeys),
    fetchLoanTimeline(scope, sixMonthsAgo, monthKeys),
    scope.holdings.find({ status: "open" }).toArray(),
    fetchTagBreakdown(scope, from, to),
  ]);

  const portfolio = holdings.map((h) => ({
    name: h.name,
    type: h.type,
    value: h.current_value ?? h.invested_total,
  }));

  return NextResponse.json({
    netWorthTrend,
    categoryTrend,
    incomeVsExpense,
    loanTimeline,
    portfolio,
    tagBreakdown,
  });
}
