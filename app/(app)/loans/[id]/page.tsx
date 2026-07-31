import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { LoanDetail, type LoanDetailData, type LoanTxnRow } from "@/components/LoanDetail";

export const dynamic = "force-dynamic";

const LOAN_TXN_TYPES = ["loan_given", "loan_taken", "repayment_in", "repayment_out"] as const;

export default async function LoanPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!ObjectId.isValid(params.id)) notFound();

  const scope = await forUser(session.userId);
  const loan = await scope.loans.findOne({ _id: new ObjectId(params.id) });
  if (!loan) notFound();

  const [person, accounts, txns] = await Promise.all([
    scope.people.findOne({ _id: loan.person_id }),
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.transactions
      .find({ loan_id: loan._id, deleted_at: { $exists: false } }, { sort: { date: -1, _id: -1 } })
      .toArray(),
  ]);

  const accountsById = new Map(accounts.map((a) => [a._id.toHexString(), a] as const));

  const data: LoanDetailData = {
    id: loan._id.toHexString(),
    personName: person?.name ?? "Unknown",
    direction: loan.direction,
    principal: loan.principal,
    outstanding: loan.outstanding,
    writtenOff: loan.written_off,
    status: loan.status,
    openedOn: loan.created_at.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  };

  const rows: LoanTxnRow[] = txns
    .filter((t) => (LOAN_TXN_TYPES as readonly string[]).includes(t.type))
    .map((t) => ({
      id: t._id.toHexString(),
      kind: t.type as LoanTxnRow["kind"],
      amount: t.amount,
      accountName: t.account_id ? accountsById.get(t.account_id.toHexString())?.name : undefined,
      date: t.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    }));

  return (
    <>
      <header
        className="sticky top-0 z-20 border-b border-rule bg-surface/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <Link
            href="/loans"
            aria-label="Back"
            className="-ml-2 flex size-9 items-center justify-center rounded-chip text-fg-muted transition-colors hover:bg-surface-lift hover:text-fg"
          >
            <ArrowLeft size={19} strokeWidth={1.75} aria-hidden />
          </Link>
          <h1 className="t-title truncate">{data.personName}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-6 pt-5">
        <LoanDetail
          loan={data}
          accounts={accounts.map((a) => ({ id: a._id.toHexString(), name: a.name }))}
          transactions={rows}
        />
      </main>
    </>
  );
}
