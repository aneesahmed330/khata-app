import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { TopBar } from "@/components/TopBar";
import { EmptyNote } from "@/components/EmptyState";
import { StatPair } from "@/components/StatTile";
import { LoanList } from "@/components/LoanList";

export const dynamic = "force-dynamic";

export default async function LoansPage() {
  const session = await getSession();
  if (!session) return null;

  const scope = await forUser(session.userId);
  const [people, allLoans] = await Promise.all([
    scope.people.find({}).toArray(),
    scope.loans.find({}).toArray(),
  ]);

  const peopleById = new Map(people.map((p) => [p._id.toHexString(), p] as const));
  // A settled loan's `outstanding` is 0 by definition — the figure worth
  // showing for history is what it originally was (`principal`).
  const toSummary = (l: (typeof allLoans)[number]) => ({
    id: l._id.toHexString(),
    personName: peopleById.get(l.person_id.toHexString())?.name ?? "Unknown",
    direction: l.direction,
    outstanding: l.status === "open" ? l.outstanding : l.principal,
  });

  const open = allLoans.filter((l) => l.status === "open").map(toSummary);
  const settled = allLoans.filter((l) => l.status === "settled").map(toSummary);

  const owedToYou = open.filter((l) => l.direction === "given").reduce((sum, l) => sum + l.outstanding, 0);
  const youOwe = open.filter((l) => l.direction === "taken").reduce((sum, l) => sum + l.outstanding, 0);

  return (
    <>
      <TopBar title="Loans" eyebrow={`${open.length} open`} />
      <main className="mx-auto max-w-md px-4 pt-4">
        {allLoans.length === 0 ? (
          <EmptyNote>No loans yet — lend or borrow, and it&apos;ll show up here.</EmptyNote>
        ) : (
          <>
            <div className="mb-4">
              <StatPair outLabel="You owe" outValue={youOwe} inLabel="Owed to you" inValue={owedToYou} />
            </div>

            {open.length > 0 ? (
              <LoanList loans={open} />
            ) : (
              <p className="t-label text-fg-faint">No open loans right now.</p>
            )}

            {settled.length > 0 ? (
              <div className="mt-6">
                <h2 className="t-micro mb-2 text-fg-faint">Settled</h2>
                <LoanList loans={settled} />
              </div>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
