import { TrendingUp, TrendingDown } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { formatPKRWhole } from "@/lib/format";
import { Sensitive } from "@/components/Sensitive";
import { EmptyNote } from "@/components/EmptyState";
import { TopBar } from "@/components/TopBar";
import { SectionHead } from "@/components/SectionHead";
import { KpiBand, KpiTile } from "@/components/Kpi";
import { RangeTabs, resolveRange } from "@/components/RangeTabs";
import { AreaChart } from "@/components/charts/AreaChart";
import { Donut, type DonutSlice } from "@/components/charts/Donut";
import { RankBars, type RankRow } from "@/components/charts/RankBars";
import { fetchDailySpend, fetchPeriodTotals, deltaPct } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

// Past this many real categories, the rest fold into "Other" — the dataviz
// skill's own ceiling for a part-to-whole donut ("≤ 6 segments"; kept to 4
// here plus Other so every real slice can also carry a searched, non-status
// hue — see globals.css's --color-cat-* note).
const DONUT_MAX_SLICES = 4;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  const range = resolveRange(searchParams.range);
  const scope = await forUser(session.userId);

  const now = new Date();
  const { from, to, prevFrom, prevTo } = range.resolve(now);

  const [totals, prevTotals, daily, byLeaf, byItem, prevByRoot, categories] = await Promise.all([
    fetchPeriodTotals(scope, from, undefined),
    fetchPeriodTotals(scope, prevFrom, prevTo),
    fetchDailySpend(scope, from, to),
    // Leaf-level (category_id), current period only — one query gives both
    // the root totals AND what's inside each one, instead of a second
    // round-trip per root the moment a user taps to expand it.
    leafSpend(scope, from),
    // One level deeper still: the actual `item` names behind each leaf
    // category (Milk/Onions/Ginger behind "Groceries") — a category total
    // alone can't answer "which items", only a name-level breakdown can.
    itemSpend(scope, from),
    rootSpend(scope, prevFrom, from),
    scope.categories.find({}).toArray(),
  ]);

  const catById = new Map(categories.map((c) => [c._id.toHexString(), c] as const));
  const prevByRootMap = new Map(prevByRoot.map((r) => [String(r._id), r.total] as const));

  // byItem is already sorted total-desc (its own aggregation's $sort), so
  // bucketing it into per-category lists here preserves that order within
  // each bucket — no need to re-sort per category.
  const itemsByCategory = new Map<string, { name: string; total: number }[]>();
  for (const r of byItem) {
    if (!r._id.category) continue; // uncategorised — same drop behaviour as byLeaf
    const catId = String(r._id.category);
    const list = itemsByCategory.get(catId) ?? [];
    list.push({ name: r._id.item ?? "Other", total: r.total });
    itemsByCategory.set(catId, list);
  }

  // Roll each leaf up to its root, and keep the leaf itself as a "child" only
  // when it actually IS a child (a transaction categorised directly onto a
  // root has no meaningful sub-breakdown to show).
  const rootTotals = new Map<string, number>();
  const rootNames = new Map<string, string>();
  const childrenByRoot = new Map<string, { id: string; name: string; total: number; items?: { name: string; total: number }[] }[]>();

  for (const r of byLeaf) {
    if (!r._id) continue; // uncategorised — matches the prior behaviour of dropping it here too
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

  const rows: RankRow[] = [...rootTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rootId, total]) => {
      const children = childrenByRoot.get(rootId);
      return {
        id: rootId,
        name: rootNames.get(rootId) ?? "Uncategorised",
        total,
        deltaPct: deltaPct(total, prevByRootMap.get(rootId) ?? 0),
        children,
        // Only a root with NO category children of its own is itself the
        // leaf — e.g. "Health"/"Home" in the screenshots, vs "Food" whose
        // real leaves are Groceries/Chai-Nashta.
        items: children ? undefined : itemsByCategory.get(rootId),
      };
    });

  const spendTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const net = totals.income - totals.expense;
  const spendDelta = deltaPct(totals.expense, prevTotals.expense);
  const incomeDelta = deltaPct(totals.income, prevTotals.income);

  // One-line takeaway under the KPI tiles — suppressed when there's no prior
  // period to compare against, or the change is small enough to be noise.
  const spendDeltaRounded = spendDelta !== null ? Math.round(spendDelta) : null;
  const insight =
    spendDeltaRounded !== null && Math.abs(spendDeltaRounded) >= 3
      ? { pct: spendDeltaRounded, topCategory: rows[0]?.name }
      : null;

  const daysWithSpend = daily.filter((d) => d.value > 0);
  const dailyAvg = daily.length > 0 ? totals.expense / daily.length : 0;
  const busiest = daily.reduce<(typeof daily)[number] | null>(
    (top, d) => (top === null || d.value > top.value ? d : top),
    null,
  );

  // Top N by spend feed the donut; anything past that folds into one "Other"
  // slice rather than the chart growing a 9th color that reads worse than
  // the fold would have.
  const donutSlices: DonutSlice[] = rows.slice(0, DONUT_MAX_SLICES).map((r) => ({
    key: r.id,
    label: r.name,
    value: r.total,
  }));
  const otherTotal = rows.slice(DONUT_MAX_SLICES).reduce((sum, r) => sum + r.total, 0);
  if (otherTotal > 0) {
    donutSlices.push({ key: "other", label: "Other", value: otherTotal, isOther: true });
  }

  const empty = totals.expense === 0 && totals.income === 0;

  return (
    <>
      <TopBar
        title="Insights"
        eyebrow={`${range.label} · to ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
      />
      <main className="mx-auto max-w-md px-4 pb-6 pt-4">
        <RangeTabs active={range.key} basePath="/insights" />

        {empty ? (
          <div className="mt-4">
            <EmptyNote>No entries in this range.</EmptyNote>
          </div>
        ) : (
          <>
            {/* Spent / Received / Net — the same three figures Home leads
                with, so "how much moved" reads the same way everywhere. The
                old band swapped "Received" for a per-day average, which
                meant this screen could tell you what you spent but not
                whether anything came in at all. Per-day still matters, it
                just moved to the chart's own caption below, next to the
                other day-level facts. */}
            <section className="mt-5">
              <SectionHead label="Summary" />
              <KpiBand>
                <KpiTile
                  label="Spent"
                  value={formatPKRWhole(totals.expense)}
                  delta={spendDelta !== null ? { pct: spendDelta, goodWhen: "down" } : undefined}
                />
                <KpiTile
                  label="Received"
                  value={formatPKRWhole(totals.income)}
                  delta={incomeDelta !== null ? { pct: incomeDelta, goodWhen: "up" } : undefined}
                />
                <KpiTile
                  label="Net"
                  value={`${net < 0 ? "−" : "+"}${formatPKRWhole(Math.abs(net))}`}
                  tone={net < 0 ? "out" : "in"}
                />
              </KpiBand>
              {insight ? (
                <div
                  className={`mt-2 flex items-start gap-2 rounded-chip p-3 ${
                    insight.pct > 0 ? "bg-out/10" : "bg-in/10"
                  }`}
                >
                  {insight.pct > 0 ? (
                    <TrendingUp size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-out" aria-hidden />
                  ) : (
                    <TrendingDown size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-in" aria-hidden />
                  )}
                  <p className="t-label text-fg-muted">
                    You spent {Math.abs(insight.pct)}% {insight.pct > 0 ? "more" : "less"} than last period
                    {insight.topCategory ? ` — mostly on ${insight.topCategory}.` : "."}
                  </p>
                </div>
              ) : null}
              <p className="t-label mt-2 px-1 text-fg-faint">vs {range.comparisonLabel}</p>
            </section>

            <section className="mt-5">
              <SectionHead
                label="Daily spending"
                meta={busiest && busiest.value > 0 ? `peak ${busiest.fullLabel}` : undefined}
              />
              <div className="rounded-chip border border-rule bg-surface-lift p-4 pb-2">
                {daily.length < 2 || totals.expense === 0 ? (
                  <p className="t-label py-6 text-center text-fg-faint">
                    Needs at least two days of spending to chart a trend.
                  </p>
                ) : (
                  <>
                    <AreaChart
                      points={daily}
                      height={190}
                      ariaLabel={`Daily spending over ${range.label}`}
                    />
                    <p className="t-label mt-2 border-t border-rule pt-2.5 text-fg-muted">
                      Spent on {daysWithSpend.length} of {daily.length} days, averaging{" "}
                      <span className="tnum font-num text-fg">
                        <Sensitive>{formatPKRWhole(dailyAvg)}</Sensitive>
                      </span>
                      /day.
                      {busiest && busiest.value > 0 ? (
                        <>
                          {" "}Heaviest was{" "}
                          <span className="text-fg">{busiest.fullLabel}</span> at{" "}
                          <span className="tnum font-num text-fg">
                            <Sensitive>{formatPKRWhole(busiest.value)}</Sensitive>
                          </span>
                          .
                        </>
                      ) : null}
                    </p>
                  </>
                )}
              </div>
            </section>

            <section className="mt-5">
              <SectionHead label="Breakdown" meta={`${rows.length} categories`} />
              <div className="rounded-chip border border-rule bg-surface-lift p-4">
                {donutSlices.length === 0 ? (
                  <p className="t-label py-6 text-center text-fg-faint">
                    No expenses in this range.
                  </p>
                ) : (
                  <Donut slices={donutSlices} total={spendTotal} />
                )}
              </div>
            </section>

            <section className="mt-5">
              <SectionHead label="Where it went" />
              <div className="rounded-chip border border-rule bg-surface-lift px-4 py-1">
                {rows.length === 0 ? (
                  <p className="t-label py-6 text-center text-fg-faint">
                    No expenses in this range.
                  </p>
                ) : (
                  <RankBars rows={rows} total={spendTotal} />
                )}
              </div>
              {rows.length > 0 ? (
                <p className="t-label mt-2 px-1 text-fg-faint">
                  Percentages are share of spend; the coloured figure is change vs {range.comparisonLabel}.
                </p>
              ) : null}
            </section>

            {rows.length > 0 ? (
              <section className="mt-5">
                <SectionHead label="Table" />
                <div className="overflow-hidden rounded-chip border border-rule bg-surface-lift px-4 py-2">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="t-micro text-fg-faint">
                        <th scope="col" className="pb-2 font-normal">Category</th>
                        <th scope="col" className="pb-2 text-right font-normal">Share</th>
                        <th scope="col" className="pb-2 text-right font-normal">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-t border-rule-soft">
                          <td className="t-label py-2">{row.name}</td>
                          <td className="tnum py-2 text-right text-[13px] text-fg-muted">
                            {spendTotal > 0 ? Math.round((row.total / spendTotal) * 100) : 0}%
                          </td>
                          <td className="tnum py-2 text-right font-num text-[13px]">
                            <Sensitive>{formatPKRWhole(row.total)}</Sensitive>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-rule">
                        <td className="t-label py-2 text-fg-muted">Total</td>
                        <td />
                        <td className="tnum py-2 text-right font-num text-[13px]">
                          <Sensitive>{formatPKRWhole(spendTotal)}</Sensitive>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}

function rootSpend(scope: Awaited<ReturnType<typeof forUser>>, from: Date, to?: Date) {
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
 *  for the current period, where the page needs the sub-category detail
 *  behind each root, not just the root's own total. */
function leafSpend(scope: Awaited<ReturnType<typeof forUser>>, from: Date, to?: Date) {
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
 *  category alone, current period only. This is what actually answers "which
 *  items" inside a category ("Groceries" -> Milk 460, Onions 450, ...); a
 *  category-only total can never say that on its own. */
function itemSpend(scope: Awaited<ReturnType<typeof forUser>>, from: Date, to?: Date) {
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
