import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { updateTransaction, reverseTransaction } from "@/lib/ledger";
import { learnItemAlias } from "@/lib/resolve";

// Mobile equivalent of app/(app)/txn/[id]/page.tsx + actions/transactions.ts —
// same updateTransaction/reverseTransaction calls, JSON in/out instead of
// FormData + redirect.

function parseAmount(raw: unknown): number | null {
  const n = Number(String(raw ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "Invalid entry id." }, { status: 400 });

  const scope = await forUser(session.userId);
  const txn = await scope.transactions.findOne({ _id: new ObjectId(params.id) });
  if (!txn || txn.deleted_at) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const [account, category] = await Promise.all([
    txn.account_id ? scope.accounts.findOne({ _id: txn.account_id }) : Promise.resolve(null),
    txn.category_id ? scope.categories.findOne({ _id: txn.category_id }) : Promise.resolve(null),
  ]);
  const root =
    category?.parent_id ? await scope.categories.findOne({ _id: category.parent_id }) : null;

  return NextResponse.json({
    id: txn._id.toHexString(),
    type: txn.type,
    amount: txn.amount,
    item: txn.item ?? "",
    note: txn.note ?? "",
    date: txn.date.toISOString().slice(0, 10),
    accountId: txn.account_id?.toHexString() ?? "",
    accountName: account?.name,
    categoryId: txn.category_id?.toHexString() ?? "",
    categoryName: category ? (root ? `${root.name} › ${category.name}` : category.name) : undefined,
    rawText: txn.raw_text ?? "",
    source: txn.source,
    // Same lock as the web edit form (lib/ledger.ts refuses these edits for
    // loan/transfer/investment rows) — the mobile form disables them too.
    financialsLocked: Boolean(txn.loan_id || txn.to_account_id || txn.holding_id),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "Invalid entry id." }, { status: 400 });

  const scope = await forUser(session.userId);
  const txn = await scope.transactions.findOne({ _id: new ObjectId(params.id) });
  if (!txn || txn.deleted_at) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  const amount = parseAmount(body.amount);
  if (!amount) return NextResponse.json({ error: "Amount must be a number greater than zero." }, { status: 400 });

  const dateRaw = String(body.date ?? "");
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00`) : txn.date;
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const accountRaw = String(body.account_id ?? "");
  let accountId: ObjectId | undefined;
  if (accountRaw) {
    if (!ObjectId.isValid(accountRaw)) return NextResponse.json({ error: "Invalid account." }, { status: 400 });
    accountId = new ObjectId(accountRaw);
    const account = await scope.accounts.findOne({ _id: accountId });
    if (!account) return NextResponse.json({ error: "Account not found." }, { status: 400 });
  }

  const categoryRaw = String(body.category_id ?? "");
  let categoryId: ObjectId | null = null;
  let rootCategoryId: ObjectId | null = null;
  if (categoryRaw) {
    if (!ObjectId.isValid(categoryRaw)) return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    const cat = await scope.categories.findOne({ _id: new ObjectId(categoryRaw) });
    if (!cat) return NextResponse.json({ error: "Category not found." }, { status: 400 });
    categoryId = cat._id;
    rootCategoryId = cat.root_id;
  }

  const item = String(body.item ?? "").trim();

  try {
    await updateTransaction(scope, txn._id, {
      amount,
      item,
      note: String(body.note ?? "").trim(),
      date,
      account_id: accountId,
      category_id: categoryId,
      root_category_id: rootCategoryId,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed." }, { status: 400 });
  }

  if (categoryId) await learnItemAlias(scope, item, categoryId);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "Invalid entry id." }, { status: 400 });

  const scope = await forUser(session.userId);
  await reverseTransaction(scope, new ObjectId(params.id));

  return NextResponse.json({ ok: true });
}
