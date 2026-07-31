import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { DateFilterBar } from "@/components/DateFilterBar";
import { HistoryList } from "@/components/HistoryList";
import { EmptyNote } from "@/components/EmptyState";
import { TopBar } from "@/components/TopBar";
import { groupTransactionsByDay } from "@/lib/ledger-view";
import { fetchLedgerPage, fetchLedgerTotals } from "@/lib/ledger-query";
import { formatPKR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  const from = searchParams.from || undefined;
  const to = searchParams.to || undefined;

  const scope = await forUser(session.userId);
  const [accounts, categories, people, holdings, page, totals] = await Promise.all([
    scope.accounts.find({}).toArray(),
    scope.categories.find({}).toArray(),
    scope.people.find({}).toArray(),
    scope.holdings.find({}).toArray(),
    fetchLedgerPage(scope, { from, to, limit: 30 }),
    fetchLedgerTotals(scope, { from, to }),
  ]);

  const groups = groupTransactionsByDay(page.transactions, accounts, categories, people, holdings);

  return (
    <>
      <TopBar
        title="History"
        eyebrow={`${totals.count} entr${totals.count === 1 ? "y" : "ies"}`}
      />
      <main className="mx-auto max-w-md px-4 pt-4">
        <DateFilterBar from={from} to={to} />

        {groups.length === 0 ? (
          <EmptyNote>
            {from || to ? "No entries in this range." : "No entries yet. Tap + below."}
          </EmptyNote>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between border-b border-rule pb-3">
              <span className="t-micro text-fg-faint">Total spent</span>
              <span className="tnum font-num text-[15px]">−{formatPKR(totals.outflow)}</span>
            </div>

            <HistoryList
              key={`${from ?? ""}_${to ?? ""}`}
              initialGroups={groups}
              initialNextCursor={page.nextCursor}
              from={from}
              to={to}
            />
          </>
        )}
      </main>
    </>
  );
}
