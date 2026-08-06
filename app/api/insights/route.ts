import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { forUser, type UserScope } from "@/lib/scope";
import { fetchDailySpend, fetchPeriodTotals, deltaPct } from "@/lib/dashboard";

// Mobile equivalent of app/(app)/insights/page.tsx — same aggregations
// (fetchPeriodTotals/fetchDailySpend + the root/leaf/item rollups below,
// copied verbatim from that page's own bottom-of-file helpers), returned as
// one JSON payload instead of rendered server-side.

interface RangePeriod {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysPeriod(days: number) {
  return (now: Date): RangePeriod => {
    const from = startOfDay(now);
    from.setDate(from.getDate() - (days - 1));
    const prevTo = from;
    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - days);
    return { from, to: now, prevFrom, prevTo };
  };
}

function monthPeriod(now: Date): RangePeriod {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { from, to: now, prevFrom, prevTo: from };
}

const RANGE_RESOLVERS: Record<string, (now: Date) => RangePeriod> = {
  month: monthPeriod,
  "30d": daysPeriod(30),
  "3m": daysPeriod(90),
  "6m": daysPeriod(180),
  "1y": daysPeriod(365),
};

const DONUT_MAX_SLICES = 4;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const rangeKey = searchParams.get("range") ?? "30d";
  const resolve = RANGE_RESOLVERS[rangeKey] ?? RANGE_RESOLVERS["30d"]!;

  const scope = await forUser(session.userId);
  const now = new Date();
  const { from, to, prevFrom, prevTo } = resolve(now);

  const [totals, prevTotals, daily, byLeaf, byItem, prevByRoot, categories] = await Promise.all([
    fetchPeriodTotals(scope, from, undefined),
    fetchPeriodTotals(scope, prevFrom, prevTo),
    fetchDailySpend(scope, from, to),
    leafSpend(scope, from),
    itemSpend(scope, from),
    rootSpend(scope, prevFrom, from),
    scope.categories.find({}).toArray(),
  ]);

  const catById = new Map(categories.map((c) => [c._id.toHexString(), c] as const));
  const prevByRootMap = new Map(prevByRoot.map((r) => [String(r._id), r.total] as const));

  const itemsByCategory = new Map<string, { name: string; total: number }[]>();
  for (const r of byItem) {
    if (!r._id.category) continue;
    const catId = String(r._id.category);
    const list = itemsByCategory.get(catId) ?? [];
    list.push({ name: r._id.item ?? "Other", total: r.total });
    itemsByCategory.set(catId, list);
  }

  const rootTotals = new Map<string, number>();
  const rootNames = new Map<string, string>();
  const childrenByRoot = new Map<
    string,
    { id: string; name: string; total: number; items?: { name: string; total: number }[] }[]
  >();

  for (const r of byLeaf) {
    if (!r._id) continue;
    const cat = catById.get(String(r._id));
    if (!cat) continue;
    const rootId = cat.root_id.toHexString();
    const root = catById.get(rootId);

    rootTotals.set(rootId, (rootTotals.get(rootId) ?? 0) + r.total);
    rootNames.set(rootId, root?.name ?? "Uncategorised");

    if (cat.parent_id) {
      const list = childrenByRoot.get(rootId) ?? [];
      list.push({ id: String(r._id), name: cat.name, total: r.total, items: itemsByCategory.get(String(r._id)) });
      childrenByRoot.set(rootId, list);
    }
  }

  const rows = [...rootTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rootId, total]) => {
      const children = childrenByRoot.get(rootId);
      return {
        id: rootId,
        name: rootNames.get(rootId) ?? "Uncategorised",
        total,
        deltaPct: deltaPct(total, prevByRootMap.get(rootId) ?? 0),
        children,
        items: children ? undefined : itemsByCategory.get(rootId),
      };
    });

  const spendTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const net = totals.income - totals.expense;
  const spendDeltaPct = deltaPct(totals.expense, prevTotals.expense);
  const incomeDeltaPct = deltaPct(totals.income, prevTotals.income);

  const donutSlices: { key: string; label: string; value: number; isOther?: boolean }[] = rows
    .slice(0, DONUT_MAX_SLICES)
    .map((r) => ({ key: r.id, label: r.name, value: r.total }));
  const otherTotal = rows.slice(DONUT_MAX_SLICES).reduce((sum, r) => sum + r.total, 0);
  if (otherTotal > 0) {
    donutSlices.push({ key: "other", label: "Other", value: otherTotal, isOther: true });
  }

  return NextResponse.json({
    totals: {
      spent: totals.expense,
      received: totals.income,
      net,
      spendDeltaPct,
      incomeDeltaPct,
    },
    daily,
    donutSlices,
    rows,
    spendTotal,
  });
}

function rootSpend(scope: UserScope, from: Date, to?: Date) {
  return scope.transactions
    .aggregate<{ _id: unknown; total: number }>([
      {
        $match: {
          type: "expense",
          date: to ? { $gte: from, $lt: to } : { $gte: from },
          deleted_at: { $exists: false },
        },
      },
      { $group: { _id: "$root_category_id", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
    ])
    .toArray();
}

/** Same shape as rootSpend, grouped by the leaf category instead — used only
 *  for the current period, where the route needs the sub-category detail
 *  behind each root, not just the root's own total. */
function leafSpend(scope: UserScope, from: Date, to?: Date) {
  return scope.transactions
    .aggregate<{ _id: unknown; total: number }>([
      {
        $match: {
          type: "expense",
          date: to ? { $gte: from, $lt: to } : { $gte: from },
          deleted_at: { $exists: false },
        },
      },
      { $group: { _id: "$category_id", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
    ])
    .toArray();
}

/** One level deeper than leafSpend — grouped by {category, item} instead of
 *  category alone, current period only. Answers "which items" inside a
 *  category ("Groceries" -> Milk 460, Onions 450, ...). */
function itemSpend(scope: UserScope, from: Date, to?: Date) {
  return scope.transactions
    .aggregate<{ _id: { category: unknown; item: string | null }; total: number }>([
      {
        $match: {
          type: "expense",
          date: to ? { $gte: from, $lt: to } : { $gte: from },
          deleted_at: { $exists: false },
        },
      },
      { $group: { _id: { category: "$category_id", item: "$item" }, total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
    ])
    .toArray();
}
