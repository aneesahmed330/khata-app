import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser, type UserScope } from "@/lib/scope";
import { postTransaction, reverseTransaction } from "@/lib/ledger";

// Mobile equivalent of app/(app)/loans/[id]/page.tsx + components/LoanDetail.tsx
// (detail fields, transaction history, repay/add-more/write-off/delete panels)
// and the matching actions in actions/loans.ts — JSON in/out instead of
// server-rendered page + form actions. POST dispatches on `action`, same
// convention as /api/investments/[id]/route.ts.

const LOAN_TXN_TYPES = ["loan_given", "loan_taken", "repayment_in", "repayment_out"] as const;

function parseAmount(raw: unknown): number | null {
  const n = Number(String(raw ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadLoan(scope: UserScope, id: string) {
  if (!ObjectId.isValid(id)) return null;
  return scope.loans.findOne({ _id: new ObjectId(id) });
}

/** Mirrors actions/loans.ts's resolveOptionalAccount — an absent account_id
 *  means "money moved, source not recorded", a valid choice, not an error. */
async function resolveOptionalAccount(
  scope: UserScope,
  raw: unknown,
): Promise<{ ok: true; id?: ObjectId } | { ok: false; error: string }> {
  const value = String(raw ?? "");
  if (!value) return { ok: true, id: undefined };
  if (!ObjectId.isValid(value)) return { ok: false, error: "Invalid account." };
  const account = await scope.accounts.findOne({ _id: new ObjectId(value) });
  if (!account) return { ok: false, error: "Account not found." };
  return { ok: true, id: account._id };
}

function parseDate(raw: unknown): Date | null {
  const value = String(raw ?? "");
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? null : date;
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
    writtenOff: loan.written_off,
    status: loan.status,
    excludeFromTotal: loan.exclude_from_total ?? false,
    openedOn: loan.created_at.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    accounts: accounts.map((a) => ({ id: a._id.toHexString(), name: a.name })),
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
  const action = String(body.action ?? "");

  if (action === "repay") {
    if (loan.status === "settled") {
      return NextResponse.json({ error: "This loan is already settled." }, { status: 400 });
    }
    const amount = parseAmount(body.amount);
    if (!amount) {
      return NextResponse.json({ error: "Amount must be a number greater than zero." }, { status: 400 });
    }
    if (amount > loan.outstanding) {
      return NextResponse.json(
        { error: `That's more than the ${loan.outstanding} still outstanding.` },
        { status: 400 },
      );
    }
    const resolvedAccount = await resolveOptionalAccount(scope, body.accountId);
    if (!resolvedAccount.ok) return NextResponse.json({ error: resolvedAccount.error }, { status: 400 });
    const date = parseDate(body.date);
    if (!date) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

    try {
      await postTransaction(scope, {
        type: loan.direction === "given" ? "repayment_in" : "repayment_out",
        amount,
        account_id: resolvedAccount.id,
        person_id: loan.person_id,
        loan_id: loan._id,
        date,
        note: typeof body.note === "string" ? body.note.trim() || undefined : undefined,
        source: "manual",
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not record the repayment." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "add") {
    const amount = parseAmount(body.amount);
    if (!amount) {
      return NextResponse.json({ error: "Amount must be a number greater than zero." }, { status: 400 });
    }
    const resolvedAccount = await resolveOptionalAccount(scope, body.accountId);
    if (!resolvedAccount.ok) return NextResponse.json({ error: resolvedAccount.error }, { status: 400 });
    const date = parseDate(body.date);
    if (!date) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

    try {
      await postTransaction(scope, {
        type: loan.direction === "given" ? "loan_given" : "loan_taken",
        amount,
        account_id: resolvedAccount.id,
        person_id: loan.person_id,
        loan_id: loan._id,
        date,
        note: typeof body.note === "string" ? body.note.trim() || undefined : undefined,
        source: "manual",
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not add to the loan." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "writeoff") {
    if (loan.status === "settled") {
      return NextResponse.json({ error: "This loan is already settled." }, { status: 400 });
    }
    await scope.loans.updateOne(
      { _id: loan._id },
      { $set: { status: "settled", outstanding: 0, written_off: loan.outstanding, settled_at: new Date() } },
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "toggleFlag") {
    if (String(body.field ?? "") !== "excludeFromTotal") {
      return NextResponse.json({ error: "Unknown setting." }, { status: 400 });
    }
    await scope.loans.updateOne({ _id: loan._id }, { $set: { exclude_from_total: Boolean(body.value) } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const loan = await loadLoan(scope, params.id);
  if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });

  const txns = await scope.transactions
    .find({ loan_id: loan._id, deleted_at: { $exists: false } } as never)
    .toArray();
  for (const txn of txns) {
    await reverseTransaction(scope, txn._id);
  }
  await scope.loans.deleteOne({ _id: loan._id });

  return NextResponse.json({ ok: true });
}
