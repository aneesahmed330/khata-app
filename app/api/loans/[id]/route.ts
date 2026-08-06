import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";

// Mobile equivalent of app/(app)/loans/[id]/page.tsx + components/LoanDetail.tsx
// (detail fields + transaction history) and actions/loans.ts's
// setLoanFlagAction (the exclude_from_total toggle) — JSON in/out instead of
// server-rendered page + form action.

const LOAN_TXN_TYPES = ["loan_given", "loan_taken", "repayment_in", "repayment_out"] as const;

async function loadLoan(scope: Awaited<ReturnType<typeof forUser>>, id: string) {
  if (!ObjectId.isValid(id)) return null;
  return scope.loans.findOne({ _id: new ObjectId(id) });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const loan = await loadLoan(scope, params.id);
  if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });

  const [person, accounts, txns] = await Promise.all([
    scope.people.findOne({ _id: loan.person_id }),
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.transactions
      .find({ loan_id: loan._id, deleted_at: { $exists: false } }, { sort: { date: -1, _id: -1 } })
      .toArray(),
  ]);

  const accountsById = new Map(accounts.map((a) => [a._id.toHexString(), a] as const));

  const transactions = txns
    .filter((t) => (LOAN_TXN_TYPES as readonly string[]).includes(t.type))
    .map((t) => ({
      id: t._id.toHexString(),
      type: t.type,
      amount: t.amount,
      accountName: t.account_id ? accountsById.get(t.account_id.toHexString())?.name : undefined,
      date: t.date.toISOString().slice(0, 10),
    }));

  return NextResponse.json({
    id: loan._id.toHexString(),
    personName: person?.name ?? "Unknown",
    direction: loan.direction,
    principal: loan.principal,
    outstanding: loan.outstanding,
    status: loan.status,
    excludeFromTotal: loan.exclude_from_total ?? false,
    openedOn: loan.created_at.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    transactions,
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const loan = await loadLoan(scope, params.id);
  if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const value = Boolean(body.excludeFromTotal);

  await scope.loans.updateOne({ _id: loan._id }, { $set: { exclude_from_total: value } });

  return NextResponse.json({ ok: true });
}
