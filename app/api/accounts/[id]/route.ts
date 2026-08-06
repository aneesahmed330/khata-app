import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { recomputeAccountBalance } from "@/lib/ledger";
import { normalizeName } from "@/lib/taxonomy";
import type { AccountType } from "@/lib/types";

// Mobile equivalent of actions/accounts.ts — same logic (updateAccountAction/
// setAccountFlagAction/setAccountArchivedAction/deleteAccountAction/
// recomputeAccountAction), reading JSON instead of FormData and returning
// JSON instead of redirect()/revalidatePath(). Mirrors app/(app)/accounts/
// [id]/page.tsx for the GET shape.
const ACCOUNT_TYPES = new Set<AccountType>(["bank", "cash", "wallet"]);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "Invalid account." }, { status: 400 });

  const scope = await forUser(session.userId);
  const accountId = new ObjectId(params.id);
  const account = await scope.accounts.findOne({ _id: accountId });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const transactionCount = await scope.transactions.countDocuments({
    $or: [{ account_id: accountId }, { to_account_id: accountId }],
    deleted_at: { $exists: false },
  } as never);

  return NextResponse.json({
    id: account._id.toHexString(),
    name: account.name,
    type: account.type,
    balance: account.balance,
    archived: account.archived,
    hideBalance: account.hide_balance ?? false,
    excludeFromTotal: account.exclude_from_total ?? false,
    transactionCount,
    createdOn: account.created_at.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "Invalid account." }, { status: 400 });

  const scope = await forUser(session.userId);
  const accountId = new ObjectId(params.id);
  const account = await scope.accounts.findOne({ _id: accountId });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.action === "update") {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    if (name.length > 30) return NextResponse.json({ error: "Name is too long (30 characters max)." }, { status: 400 });

    const type = String(body.type ?? "") as AccountType;
    if (!ACCOUNT_TYPES.has(type)) return NextResponse.json({ error: "Pick a valid account type." }, { status: 400 });

    const normalized = normalizeName(name);
    const clash = await scope.accounts.findOne({ name_normalized: normalized });
    if (clash && !clash._id.equals(account._id)) {
      return NextResponse.json({ error: `You already have an account called "${clash.name}".` }, { status: 400 });
    }

    await scope.accounts.updateOne({ _id: account._id }, { $set: { name, name_normalized: normalized, type } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "toggleFlag") {
    const flag = String(body.flag ?? "");
    if (flag !== "hide_balance" && flag !== "exclude_from_total") {
      return NextResponse.json({ error: "Unknown setting." }, { status: 400 });
    }
    await scope.accounts.updateOne({ _id: account._id }, { $set: { [flag]: Boolean(body.value) } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "archive") {
    await scope.accounts.updateOne({ _id: account._id }, { $set: { archived: Boolean(body.archived) } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "recompute") {
    const balance = await recomputeAccountBalance(scope, account._id);
    return NextResponse.json({ ok: true, balance });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "Invalid account." }, { status: 400 });

  const scope = await forUser(session.userId);
  const accountId = new ObjectId(params.id);

  const used = await scope.transactions.countDocuments({
    $or: [{ account_id: accountId }, { to_account_id: accountId }],
  } as never);
  if (used > 0) {
    return NextResponse.json(
      { error: "This account still has entries pointing at it, so it can't be deleted. Archive it instead." },
      { status: 400 },
    );
  }

  await scope.accounts.deleteOne({ _id: accountId });
  return NextResponse.json({ ok: true });
}
