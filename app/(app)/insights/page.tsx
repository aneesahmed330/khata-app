import clsx from "clsx";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { formatPKR } from "@/lib/format";
import { Sensitive } from "@/components/Sensitive";
import { EmptyNote } from "@/components/EmptyState";
import { TopBar } from "@/components/TopBar";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { StatPair } from "@/components/StatTile";

export const dynamic = "force-dynamic";

interface RootSpend {
  rootId: string;
  name: string;
  total: number;
}

export default async function InsightsPage() {
  const session = await getSession();
  if (!session) return null;

  const scope = await forUser(session.userId);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [byRoot, incomeVsExpense, byDay, lastMonth, categories] = await Promise.all([
    scope.transactions
      .aggregate<{ _id: unknown; total: number }>([
        {
          $match: {
            type: "expense",
            date: { $gte: startOfMonth },
            deleted_at: { $exists: false },
          },
        },
        { $group: { _id: "$root_category_id", total: { $sum: "$amount" } } },
        { $sort: { total: -1 } },
      ])
      .toArray(),
    scope.transactions
      .aggregate<{ _id: string; total: number }>([
        {
          $match: {
            type: { $in: ["expense", "income"] },
            date: { $gte: startOfMonth },
            deleted_at: { $exists: false },
          },
        },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ])
      .toArray(),
    scope.transactions
      .aggregate<{ _id: number; total: number }>([
        {
          $match: {
            type: "expense",
            date: { $gte: startOfMonth },
            deleted_at: { $exists: false },
          },
        },
        { $group: { _id: { $dayOfMonth: "$date" }, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    scope.transactions
      .aggregate<{ _id: null; total: number }>([
        {
          $match: {
            type: "expense",
            date: { $gte: startOfLastMonth, $lt: startOfMonth },
            deleted_at: { $exists: false },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    scope.categories.find({ parent_id: null }).toArray(),
  ]);

  const namesByRoot = new Map(categories.map((c) => [c._id.toHexString(), c.name] as const));
  const spend: RootSpend[] = byRoot
    .filter((r) => r._id)
    .map((r) => ({
      rootId: String(r._id),
      name: namesByRoot.get(String(r._id)) ?? "Other",
      total: r.total,
    }));

  const maxSpend = Math.max(...spend.map((s) => s.total), 1);
  const spendTotal = spend.reduce((sum, s) => sum + s.total, 0);
  const totalExpense = incomeVsExpense.find((r) => r._id === "expense")?.total ?? 0;
  const totalIncome = incomeVsExpense.find((r) => r._id === "income")?.total ?? 0;
  const net = totalIncome - totalExpense;

  const lastMonthExpense = lastMonth[0]?.total ?? 0;
  const expenseDeltaPct =
    lastMonthExpense > 0 ? Math.round(((totalExpense - lastMonthExpense) / lastMonthExpense) * 100) : null;

  // Daily trend, day 1 through today — zero-filled so a day with no spend is a
  // real dip in the line, not a missing point.
  const totalsByDay = new Map(byDay.map((r) => [r._id, r.total] as const));
  const daysElapsed = now.getDate();
  const trend: TrendPoint[] = Array.from({ length: daysElapsed }, (_, i) => {
    const day = i + 1;
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    return {
      label: String(day),
      fullLabel: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      value: totalsByDay.get(day) ?? 0,
    };
  });

  const monthLabel = startOfMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const topCategory = spend[0];
  const topShare = topCategory && spendTotal > 0 ? Math.round((topCategory.total / spendTotal) * 100) : 0;

  return (
    <>
      <TopBar title="Insights" eyebrow={monthLabel} />
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-6 pt-5">
        {totalExpense === 0 && totalIncome === 0 ? (
          <EmptyNote>No entries yet this month.</EmptyNote>
        ) : (
          <>
            {/* Hero — the one polarity pair, plus a computed delta vs last month.
                Colour on the delta chip is allowed: it's summary/state, one of
                the three places DESIGN.md §3 permits it. */}
            <section className="flex flex-col gap-3 rounded-chip border border-rule bg-surface-lift p-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="t-micro text-fg-faint">Net this month</span>
                  {expenseDeltaPct !== null ? (
                    <span
                      className={clsx(
                        "t-label rounded-full px-2 py-0.5 text-[11px] font-medium",
                        expenseDeltaPct <= 0 ? "bg-in/10 text-in" : "bg-out/10 text-out",
                      )}
                    >
                      {Math.abs(expenseDeltaPct)}% {expenseDeltaPct <= 0 ? "less" : "more"} spent vs
                      last month
                    </span>
                  ) : null}
                </div>
                <span
                  className={clsx("tnum font-num text-[28px] leading-none", net < 0 ? "text-out" : "text-in")}
                >
                  <Sensitive>
                    {net < 0 ? "−" : "+"}
                    {formatPKR(Math.abs(net))}
                  </Sensitive>
                </span>
              </div>

              <StatPair outLabel="Spent" outValue={totalExpense} inLabel="Received" inValue={totalIncome} />
            </section>

            {/* Trend over time — one hue, hover ships by default (dataviz skill). */}
            <section className="rounded-chip border border-rule bg-surface-lift p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="t-body">Daily spending</h2>
                <span className="t-label text-fg-faint">Tap to inspect</span>
              </div>

              {trend.length < 2 || totalExpense === 0 ? (
                <p className="t-label py-6 text-center text-fg-faint">
                  Needs at least 2 days of spending to chart a trend.
                </p>
              ) : (
                <>
                  <TrendChart points={trend} />
                  <details className="mt-4 border-t border-rule pt-3">
                    <summary className="t-label cursor-pointer text-fg-muted">Table view</summary>
                    <table className="mt-3 w-full text-left">
                      <thead>
                        <tr className="t-micro text-fg-faint">
                          <th scope="col" className="pb-2 font-normal">Day</th>
                          <th scope="col" className="pb-2 text-right font-normal">Spent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trend.map((p) => (
                          <tr key={p.label} className="border-t border-rule-soft">
                            <td className="t-label py-1.5">{p.fullLabel}</td>
                            <td className="tnum py-1.5 text-right font-num text-[13px]">
                              <Sensitive>{formatPKR(p.value)}</Sensitive>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              )}
            </section>

            {/* Rank magnitude — ONE hue, length is the only variable (DESIGN.md
                §11.1). Never a colour per category: the question is "where did
                it go", which is sequential's job, not categorical's. */}
            <section className="rounded-chip border border-rule bg-surface-lift p-4">
              <h2 className="t-body mb-1">Where it went</h2>

              {spend.length === 0 ? (
                <p className="t-label py-6 text-center text-fg-faint">No expenses yet this month.</p>
              ) : (
                <>
                  {topCategory ? (
                    <p className="t-label mb-4 text-fg-muted">
                      <span className="text-fg">{topCategory.name}</span> is your biggest expense —{" "}
                      {topShare}% of the month so far.
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-1">
                    {spend.map((row) => {
                      const share = spendTotal > 0 ? Math.round((row.total / spendTotal) * 100) : 0;
                      const widthPct = Math.max((row.total / maxSpend) * 100, 2);
                      return (
                        <div
                          key={row.rootId}
                          className="rounded-[4px] px-1 py-2 transition-colors duration-150 hover:bg-surface"
                        >
                          <div className="mb-1.5 flex items-baseline justify-between gap-3">
                            <span className="t-body truncate">{row.name}</span>
                            <span className="flex shrink-0 items-baseline gap-2">
                              <span className="tnum text-[11px] text-fg-faint">{share}%</span>
                              <span className="tnum font-num text-[14px]">
                                <Sensitive>{formatPKR(row.total)}</Sensitive>
                              </span>
                            </span>
                          </div>
                          {/* square baseline, 4px rounded data-end (§11.4), grows in on mount */}
                          <div className="h-2 w-full bg-rule-soft">
                            <div
                              className="anim-bar-grow h-2 rounded-r-[4px] bg-chart-mag"
                              style={{ "--bar-w": `${widthPct}%` } as React.CSSProperties}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <details className="mt-4 border-t border-rule pt-3">
                    <summary className="t-label cursor-pointer text-fg-muted">Table view</summary>
                    <table className="mt-3 w-full text-left">
                      <thead>
                        <tr className="t-micro text-fg-faint">
                          <th scope="col" className="pb-2 font-normal">Category</th>
                          <th scope="col" className="pb-2 text-right font-normal">Share</th>
                          <th scope="col" className="pb-2 text-right font-normal">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spend.map((row) => (
                          <tr key={row.rootId} className="border-t border-rule-soft">
                            <td className="t-label py-2">{row.name}</td>
                            <td className="tnum py-2 text-right text-[13px] text-fg-muted">
                              {spendTotal > 0 ? Math.round((row.total / spendTotal) * 100) : 0}%
                            </td>
                            <td className="tnum py-2 text-right font-num text-[13px]">
                              <Sensitive>{formatPKR(row.total)}</Sensitive>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
