import Link from "next/link";
import clsx from "clsx";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { AccountGrid } from "@/components/AccountGrid";
import { CountUpAmount } from "@/components/CountUpAmount";
import { KpiBand, KpiTile } from "@/components/Kpi";
import { SectionHead } from "@/components/SectionHead";
import { AreaChart } from "@/components/charts/AreaChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { LiquidityBar } from "@/components/charts/LiquidityBar";
import { HoldingList, type HoldingSummary } from "@/components/HoldingList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sensitive } from "@/components/Sensitive";
import { formatPKRWhole } from "@/lib/format";
import { fetchNetWorth, fetchDailySpend, fetchPeriodTotals, deltaPct } from "@/lib/dashboard";
import type { InvestmentType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<InvestmentType, string> = {
  stock: "Stock",
  mutual_fund: "Mutual fund",
  gold: "Gold",
  crypto: "Crypto",
  real_estate: "Real estate",
  other: "Other",
};

export default async function HomePage() {
  const session = await getSession();
  if (!session) return null; // middleware already redirects; defense in depth

  const scope = await forUser(session.userId);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

  const [netWorth, accounts, openHoldings, thisMonth, lastMonth, daily] = await Promise.all([
    fetchNetWorth(scope),
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.holdings.find({ status: "open" }).toArray(),
    fetchPeriodTotals(scope, startOfMonth),
    fetchPeriodTotals(scope, startOfLastMonth, startOfMonth),
    fetchDailySpend(scope, thirtyDaysAgo, now),
  ]);

  const net = thisMonth.income - thisMonth.expense;
  const spendDelta = deltaPct(thisMonth.expense, lastMonth.expense);
  const incomeDelta = deltaPct(thisMonth.income, lastMonth.income);

  const holdings: HoldingSummary[] = openHoldings.map((h) => ({
    id: h._id.toHexString(),
    name: h.name,
    typeLabel: TYPE_LABEL[h.type],
    investedTotal: h.invested_total,
    currentValue: h.current_value,
    quantity: h.quantity,
    quantityUnit: h.quantity_unit,
  }));

  const monthLabel = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const spentSeries = daily.map((d) => d.value);
  const hasSpendData = daily.some((d) => d.value > 0);

  return (
    <main className="mx-auto max-w-md px-4 pb-6">
      {/* Hero. The headline is net worth, not the cash balance — with money
          split across accounts, PSX and udhaar, the account total alone answers
          a narrower question than the one you open the app asking. */}
      <section
        className="flex items-start justify-between gap-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
      >
        <div className="min-w-0">
          <div className="t-micro text-fg-faint">Net worth · {monthLabel}</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="t-label font-num text-fg-muted">Rs</span>
            <CountUpAmount value={netWorth.total} className="t-balance-compact text-accent-text" />
          </div>
        </div>
        <div className="-mr-2 -mt-1 shrink-0">
          <ThemeToggle />
        </div>
      </section>

      {/* Signature: the same total, decomposed by how fast you can reach it. */}
      {netWorth.total !== 0 || netWorth.owed > 0 ? (
        <section className="mt-4 rounded-chip border border-rule bg-surface-lift p-4">
          <LiquidityBar
            segments={[
              { key: "liquid", label: "In accounts", value: netWorth.liquid },
              { key: "invested", label: "Invested", value: netWorth.invested },
              { key: "receivable", label: "Owed to you", value: netWorth.receivable },
            ]}
            owed={netWorth.owed}
          />
        </section>
      ) : null}

      <section className="mt-5">
        <SectionHead label="This month" />
        <KpiBand>
          <KpiTile
            label="Spent"
            value={formatPKRWhole(thisMonth.expense)}
            chart={<Sparkline values={spentSeries} tone="out" />}
            delta={spendDelta !== null ? { pct: spendDelta, goodWhen: "down" } : undefined}
          />
          <KpiTile
            label="Received"
            value={formatPKRWhole(thisMonth.income)}
            delta={incomeDelta !== null ? { pct: incomeDelta, goodWhen: "up" } : undefined}
          />
          <KpiTile
            label="Net"
            value={`${net < 0 ? "−" : "+"}${formatPKRWhole(Math.abs(net))}`}
            tone={net < 0 ? "out" : "in"}
          />
        </KpiBand>
      </section>

      {hasSpendData ? (
        <section className="mt-5">
          <SectionHead label="Spending" meta="Last 30 days" href="/insights" hrefLabel="Insights" />
          <div className="rounded-chip border border-rule bg-surface-lift p-4 pb-2">
            <AreaChart points={daily} ariaLabel="Daily spending, last 30 days" />
          </div>
        </section>
      ) : null}

      {accounts.length > 0 ? (
        <section className="mt-5">
          <SectionHead
            label="Accounts"
            meta={`${accounts.length}`}
          />
          <AccountGrid
            accounts={accounts.map((a) => ({
              id: a._id.toHexString(),
              name: a.name,
              balance: a.balance,
              type: a.type,
            }))}
          />
        </section>
      ) : null}

      {holdings.length > 0 ? (
        <InvestmentSection holdings={holdings} />
      ) : (
        <section className="mt-5">
          <Link
            href="/investments/new"
            className="flex items-center justify-center rounded-chip border border-rule py-3 text-[14px] text-fg-muted transition-colors hover:border-fg-faint hover:text-fg"
          >
            Start tracking your investments
          </Link>
        </section>
      )}
    </main>
  );
}

function InvestmentSection({ holdings }: { holdings: HoldingSummary[] }) {
  const invested = holdings.reduce((sum, h) => sum + h.investedTotal, 0);
  const valued = holdings.reduce((sum, h) => sum + (h.currentValue ?? h.investedTotal), 0);
  const gain = valued - invested;
  const priced = holdings.some((h) => h.currentValue !== undefined);
  const gainPct = invested > 0 ? (gain / invested) * 100 : 0;

  return (
    <section className="mt-5">
      <SectionHead label="Investments" meta={`${holdings.length}`} href="/investments" />
      {priced ? (
        <div className="mb-2 flex items-baseline justify-between rounded-chip border border-rule bg-surface-lift px-3 py-2.5">
          <span className="t-micro text-fg-faint">Unrealised</span>
          <span
            className={clsx("tnum font-num text-[15px]", gain >= 0 ? "text-in" : "text-out")}
          >
            <Sensitive>
              {gain >= 0 ? "+" : "−"}
              {formatPKRWhole(Math.abs(gain))}
            </Sensitive>
            <span className="ml-1.5 text-[12px] opacity-80">
              {gain >= 0 ? "+" : "−"}
              {Math.abs(gainPct).toFixed(1)}%
            </span>
          </span>
        </div>
      ) : null}
      <HoldingList holdings={holdings} />
    </section>
  );
}
