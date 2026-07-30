import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { DateRule } from "@/components/DateRule";
import { LedgerRow } from "@/components/LedgerRow";
import { AccountGrid } from "@/components/AccountGrid";
import { CountUpAmount } from "@/components/CountUpAmount";
import { StatPair } from "@/components/StatTile";
import { EmptyLedger } from "@/components/EmptyState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { groupTransactionsByDay } from "@/lib/ledger-view";
import { formatPKR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (!session) return null; // middleware already redirects; defense in depth

  const scope = await forUser(session.userId);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [accounts, categories, transactions, monthTotals] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.categories.find({}).toArray(),
    scope.transactions
      .find({ deleted_at: { $exists: false } }, { sort: { date: -1 }, limit: 25 })
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
  ]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const spent = monthTotals.find((r) => r._id === "expense")?.total ?? 0;
  const earned = monthTotals.find((r) => r._id === "income")?.total ?? 0;

  const grouped = groupTransactionsByDay(transactions, accounts, categories);
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

      <section className="mt-6">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="t-micro text-fg-faint">Activity</h2>
          {grouped.length > 0 ? (
            <Link
              href="/history"
              className="flex items-center gap-0.5 text-[12px] text-fg-muted transition-colors hover:text-fg"
            >
              View all
              <ChevronRight size={13} strokeWidth={2} aria-hidden />
            </Link>
          ) : null}
        </div>

        {grouped.length === 0 ? (
          <div className="mt-4">
            <EmptyLedger />
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.label}>
              <DateRule
                label={group.label}
                total={group.outflow > 0 ? `−${formatPKR(group.outflow)}` : undefined}
              />
              {group.rows.map((row) => (
                <LedgerRow key={row.id} row={row} redirectTo="/" />
              ))}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
