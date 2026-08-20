import { HandCoins } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { TopBar } from "@/components/TopBar";
import { EmptyState } from "@/components/EmptyState";
import { SectionHead } from "@/components/SectionHead";
import { KpiBand, KpiTile } from "@/components/Kpi";
import { LoanList, type LoanSummary } from "@/components/LoanList";
import { formatPKRWhole } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LoansPage() {
  const session = await getSession();
  if (!session) return null;

  const scope = await forUser(session.userId);
  const [people, allLoans] = await Promise.all([
    scope.people.find({}).toArray(),
    scope.loans.find({}, { sort: { created_at: -1 } }).toArray(),
  ]);

  const peopleById = new Map(people.map((p) => [p._id.toHexString(), p] as const));
  const toSummary = (l: (typeof allLoans)[number]): LoanSummary => ({
    id: l._id.toHexString(),
    personName: peopleById.get(l.person_id.toHexString())?.name ?? "Unknown",
    direction: l.direction,
    principal: l.principal,
    outstanding: l.outstanding,
    status: l.status,
    excludeFromTotal: l.exclude_from_total,
  });

  const open = allLoans.filter((l) => l.status === "open").map(toSummary);
  const settled = allLoans.filter((l) => l.status === "settled").map(toSummary);

  // Same rule as Home's net worth and /investments' portfolio summary — a loan
  // taken out of the total must not quietly reappear in this page's own Position
  // band, and the row itself still shows in the list either way.
  const counted = open.filter((l) => !l.excludeFromTotal);
  const excludedCount = open.length - counted.length;
  const owedToYou = counted
    .filter((l) => l.direction === "given")
    .reduce((sum, l) => sum + l.outstanding, 0);
  const youOwe = counted
    .filter((l) => l.direction === "taken")
    .reduce((sum, l) => sum + l.outstanding, 0);
  const net = owedToYou - youOwe;

  return (
    <>
      <TopBar
        title="Loans"
        eyebrow={open.length > 0 ? `${open.length} open` : "All settled"}
      />
      <main className="mx-auto max-w-md px-4 pb-6 pt-4">
        {allLoans.length === 0 ? (
          <EmptyState
            Icon={HandCoins}
            message="No loans yet. Track money you've lent or borrowed."
            actionLabel="Add a loan"
            actionHref="/add"
          />
        ) : (
          <>
            <SectionHead
              label="Position"
              meta={excludedCount > 0 ? `${excludedCount} not counted` : undefined}
            />
            <KpiBand>
              <KpiTile label="Owed to you" value={formatPKRWhole(owedToYou)} tone="in" />
              <KpiTile label="You owe" value={formatPKRWhole(youOwe)} tone="out" />
              <KpiTile
                label="Net"
                value={`${net < 0 ? "−" : "+"}${formatPKRWhole(Math.abs(net))}`}
                tone={net < 0 ? "out" : "in"}
                footnote={net < 0 ? "in the red" : "in your favour"}
              />
            </KpiBand>

            <section className="mt-5">
              <SectionHead label="Open" meta={open.length > 0 ? `${open.length}` : undefined} />
              {open.length > 0 ? (
                <LoanList loans={open} />
              ) : (
                <p className="t-label rounded-chip border border-rule bg-surface-lift px-4 py-5 text-center text-fg-faint">
                  Nothing outstanding right now.
                </p>
              )}
            </section>

            {settled.length > 0 ? (
              <section className="mt-5">
                <SectionHead label="Settled" meta={`${settled.length}`} />
                <LoanList loans={settled} />
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
