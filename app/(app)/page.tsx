import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { AccountGrid } from "@/components/AccountGrid";
import { CountUpAmount } from "@/components/CountUpAmount";
import { StatPair } from "@/components/StatTile";
import { HoldingList, type HoldingSummary } from "@/components/HoldingList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatPKR } from "@/lib/format";
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
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [accounts, openHoldings, monthTotals] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.holdings.find({ status: "open" }).toArray(),
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
  ]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const spent = monthTotals.find((r) => r._id === "expense")?.total ?? 0;
  const earned = monthTotals.find((r) => r._id === "income")?.total ?? 0;

  const holdings: HoldingSummary[] = openHoldings.map((h) => ({
    id: h._id.toHexString(),
    name: h.name,
    typeLabel: TYPE_LABEL[h.type],
    investedTotal: h.invested_total,
    currentValue: h.current_value,
    quantity: h.quantity,
    quantityUnit: h.quantity_unit,
  }));
  const totalInvested = holdings.reduce((sum, h) => sum + h.investedTotal, 0);
  const totalCurrentValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? h.investedTotal), 0);
  const gain = totalCurrentValue - totalInvested;
  const hasAnyCurrentValue = holdings.some((h) => h.currentValue !== undefined);

  const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <main className="mx-auto max-w-md px-4">
      {/* Hero — compact: smaller display size than the wordmark on /login, tighter
          line spacing, one eyebrow row instead of two stacked labels. Home has no
          TopBar, so it needs its own safe-area clearance for the status bar in
          standalone PWA mode — stacked on top of the normal 16px gutter, not
          instead of it (env(...) is 0 on non-notched phones). */}
      <section
        className="flex items-start justify-between gap-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
      >
        <div className="min-w-0">
          <div className="t-micro text-fg-faint">{monthLabel}</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="t-label font-num text-fg-muted">Rs</span>
            <CountUpAmount value={totalBalance} className="t-balance-compact text-accent-text" />
          </div>
          <div className="t-label mt-1 text-fg-muted">
            Across {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="-mr-2 -mt-1 shrink-0">
          <ThemeToggle />
        </div>
      </section>

      {accounts.length > 0 ? (
        <section className="mt-4">
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

      {spent > 0 || earned > 0 ? (
        <section className="mt-3">
          <StatPair outLabel="Spent" outValue={spent} inLabel="Received" inValue={earned} />
        </section>
      ) : null}

      {/* This is the dashboard — listings live on /history, loan stats on
          /loans. Home only ever shows summary state, never a feed. */}
      {holdings.length > 0 ? (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="t-micro text-fg-faint">Investments</h2>
            <Link
              href="/investments"
              className="flex items-center gap-0.5 text-[12px] text-fg-muted transition-colors hover:text-fg"
            >
              View all
              <ChevronRight size={13} strokeWidth={2} aria-hidden />
            </Link>
          </div>
          <div className="mb-2">
            <StatPair
              outLabel="Invested"
              outValue={totalInvested}
              inLabel={hasAnyCurrentValue ? "Current value" : "Invested"}
              inValue={totalCurrentValue}
            />
          </div>
          {hasAnyCurrentValue ? (
            <p className={`t-label mb-2 ${gain >= 0 ? "text-in" : "text-out"}`}>
              {gain >= 0 ? "+" : ""}
              {formatPKR(gain)} overall
            </p>
          ) : null}
          <HoldingList holdings={holdings} />
        </section>
      ) : (
        <section className="mt-6">
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
