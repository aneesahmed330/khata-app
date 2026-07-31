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
import { RankBars, type RankRow } from "@/components/charts/RankBars";
import { fetchDailySpend, fetchPeriodTotals, deltaPct } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

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
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(startOfToday);
  from.setDate(from.getDate() - (range.days - 1));
  // The immediately preceding window of equal length — comparing a 30-day span
  // against "last calendar month" would compare unequal periods and inflate or
  // deflate every delta on the page.
  const prevFrom = new Date(from);
  prevFrom.setDate(prevFrom.getDate() - range.days);

  const [totals, prevTotals, daily, byRoot, prevByRoot, categories] = await Promise.all([
    fetchPeriodTotals(scope, from),
    fetchPeriodTotals(scope, prevFrom, from),
    fetchDailySpend(scope, from, now),
    rootSpend(scope, from),
    rootSpend(scope, prevFrom, from),
    scope.categories.find({ parent_id: null }).toArray(),
  ]);

  const names = new Map(categories.map((c) => [c._id.toHexString(), c.name] as const));
  const prevByRootMap = new Map(prevByRoot.map((r) => [String(r._id), r.total] as const));

  const rows: RankRow[] = byRoot
    .filter((r) => r._id)
    .map((r) => ({
      id: String(r._id),
      name: names.get(String(r._id)) ?? "Uncategorised",
      total: r.total,
      deltaPct: deltaPct(r.total, prevByRootMap.get(String(r._id)) ?? 0),
    }));

  const spendTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const net = totals.income - totals.expense;
  const spendDelta = deltaPct(totals.expense, prevTotals.expense);

  const daysWithSpend = daily.filter((d) => d.value > 0);
  const dailyAvg = daily.length > 0 ? totals.expense / daily.length : 0;
  const busiest = daily.reduce<(typeof daily)[number] | null>(
    (top, d) => (top === null || d.value > top.value ? d : top),
    null,
  );

  const empty = totals.expense === 0 && totals.income === 0;

  return (
    <>
      <TopBar title="Insights" eyebrow={`${range.label} · to ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`} />
      <main className="mx-auto max-w-md px-4 pb-6 pt-4">
        <RangeTabs active={range.key} basePath="/insights" />

        {empty ? (
          <div className="mt-4">
            <EmptyNote>No entries in this range.</EmptyNote>
          </div>
        ) : (
          <>
            <section className="mt-5">
              <SectionHead label="Summary" />
              <KpiBand>
                <KpiTile
                  label="Spent"
                  value={formatPKRWhole(totals.expense)}
                  delta={spendDelta !== null ? { pct: spendDelta, goodWhen: "down" } : undefined}
                />
                <KpiTile label="Per day" value={formatPKRWhole(dailyAvg)} footnote={`over ${daily.length}d`} />
                <KpiTile
                  label="Net"
                  value={`${net < 0 ? "−" : "+"}${formatPKRWhole(Math.abs(net))}`}
                  tone={net < 0 ? "out" : "in"}
                />
              </KpiBand>
            </section>

            <section className="mt-5">
              <SectionHead label="Daily spending" meta={busiest && busiest.value > 0 ? `peak ${busiest.fullLabel}` : undefined} />
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
                      ariaLabel={`Daily spending over the last ${range.label}`}
                    />
                    <p className="t-label mt-2 border-t border-rule pt-2.5 text-fg-muted">
                      Spent on {daysWithSpend.length} of {daily.length} days.
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
              <SectionHead label="Where it went" meta={`${rows.length} categories`} />
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
                  Percentages are share of spend; the coloured figure is change vs the previous{" "}
                  {range.days} days.
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
