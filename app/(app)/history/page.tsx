import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { HistoryControls } from "@/components/HistoryControls";
import { HistoryList } from "@/components/HistoryList";
import { EmptyNote } from "@/components/EmptyState";
import { TopBar } from "@/components/TopBar";
import { Sensitive } from "@/components/Sensitive";
import { groupTransactionsByDay } from "@/lib/ledger-view";
import { fetchLedgerPage, fetchLedgerTotals } from "@/lib/ledger-query";
import { formatPKRWhole } from "@/lib/format";

export const dynamic = "force-dynamic";

function rangeLabel(from?: string, to?: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `since ${fmt(from)}`;
  if (to) return `up to ${fmt(to)}`;
  return "All time";
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; q?: string; types?: string; accounts?: string; sort?: string };
}) {
  const session = await getSession();
  if (!session) return null;

  const from = searchParams.from || undefined;
  const to = searchParams.to || undefined;
  const q = searchParams.q || undefined;
  const types = searchParams.types ? searchParams.types.split(",").filter(Boolean) : undefined;
  const accountIds = searchParams.accounts ? searchParams.accounts.split(",").filter(Boolean) : undefined;
  const sortDir = searchParams.sort === "asc" ? "asc" : "desc";

  const scope = await forUser(session.userId);
  const [accounts, categories, people, holdings, page, totals] = await Promise.all([
    scope.accounts.find({}).toArray(),
    scope.categories.find({}).toArray(),
    scope.people.find({}).toArray(),
    scope.holdings.find({}).toArray(),
    fetchLedgerPage(scope, { from, to, limit: 30, q, types, accountIds, sortDir }),
    fetchLedgerTotals(scope, { from, to }),
  ]);

  const groups = groupTransactionsByDay(page.transactions, accounts, categories, people, holdings);
  const accountOptions = accounts
    .filter((a) => !a.archived)
    .map((a) => ({ id: a._id.toHexString(), name: a.name }));

  return (
    <>
      <TopBar
        title="History"
        eyebrow={`${totals.count} ${totals.count === 1 ? "entry" : "entries"} · ${rangeLabel(from, to)}`}
      />
      <main className="mx-auto max-w-md px-4 pb-6 pt-3">
        <HistoryControls
          range={{ from, to }}
          q={q}
          types={searchParams.types || undefined}
          accountIds={searchParams.accounts || undefined}
          sort={sortDir}
          accounts={accountOptions}
        />

        {groups.length === 0 ? (
          <div className="mt-4">
            <EmptyNote>
              {from || to ? "Nothing in this range." : "No entries yet. Tap + below."}
            </EmptyNote>
          </div>
        ) : (
          <>
            {/* One quiet summary line rather than a boxed stat — the ledger
                below is the content, and a card here competed with it. */}
            <div className="mt-3 flex items-baseline justify-between border-b border-rule pb-2">
              <span className="t-micro text-fg-faint">Total spent</span>
              <span className="tnum font-num text-[15px] text-out">
                −<Sensitive>{formatPKRWhole(totals.outflow)}</Sensitive>
              </span>
            </div>

            <HistoryList
              key={`${from ?? ""}_${to ?? ""}_${q ?? ""}_${searchParams.types ?? ""}_${searchParams.accounts ?? ""}_${sortDir}`}
              initialGroups={groups}
              initialNextCursor={page.nextCursor}
              from={from}
              to={to}
              q={q}
              types={searchParams.types || undefined}
              accountIds={searchParams.accounts || undefined}
              sort={sortDir}
            />
          </>
        )}
      </main>
    </>
  );
}
