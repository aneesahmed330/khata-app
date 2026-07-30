import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { DateRule } from "@/components/DateRule";
import { LedgerRow } from "@/components/LedgerRow";
import { EmptyNote } from "@/components/EmptyState";
import { TopBar } from "@/components/TopBar";
import { groupTransactionsByDay } from "@/lib/ledger-view";
import { formatPKR } from "@/lib/format";

export const dynamic = "force-dynamic";

// plan.md's filter bar (category / account / person / tag) and infinite scroll
// are still Phase 4 — this is the last 200 entries, unfiltered, with per-day
// outflow totals on the date rules.
export default async function HistoryPage() {
  const session = await getSession();
  if (!session) return null;

  const scope = await forUser(session.userId);
  const [accounts, categories, transactions] = await Promise.all([
    scope.accounts.find({}).toArray(),
    scope.categories.find({}).toArray(),
    scope.transactions
      .find({ deleted_at: { $exists: false } }, { sort: { date: -1, _id: -1 }, limit: 200 })
      .toArray(),
  ]);

  const groups = groupTransactionsByDay(transactions, accounts, categories);
  const totalOutflow = groups.reduce((sum, g) => sum + g.outflow, 0);

  return (
    <>
      <TopBar title="History" eyebrow={`${transactions.length} entries`} />
      <main className="mx-auto max-w-md px-4 pt-4">
        {groups.length === 0 ? (
          <EmptyNote>No entries yet. Tap + below.</EmptyNote>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between border-b border-rule pb-3">
              <span className="t-micro text-fg-faint">Total spent</span>
              <span className="tnum font-num text-[15px]">−{formatPKR(totalOutflow)}</span>
            </div>

            {groups.map((group) => (
              <div key={group.label}>
                <DateRule
                  label={group.label}
                  total={group.outflow > 0 ? `−${formatPKR(group.outflow)}` : undefined}
                />
                {group.rows.map((row) => (
                  <LedgerRow key={row.id} row={row} />
                ))}
              </div>
            ))}

            {transactions.length === 200 ? (
              <p className="t-label py-6 text-center text-fg-faint">
                Showing the last 200 entries. Filtering is coming soon.
              </p>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
