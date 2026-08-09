import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser, type UserScope } from "@/lib/scope";

// Per-category monthly spending limits with live progress. First consumer of
// the `budgets` collection (lib/types.ts BudgetDoc, lib/scope.ts) — no other
// code reads/writes it yet.

/** Sum this calendar month's expense transactions for a category, counting a
 *  parent/root category's budget against all its children too — a budget on
 *  "Food" should cover "Food > Groceries" spend, not just uncategorised-leaf
 *  "Food" transactions. */
function monthSpend(scope: UserScope, categoryId: ObjectId, from: Date, to: Date) {
  return scope.transactions
    .aggregate<{ _id: null; total: number }>([
      {
        $match: {
          type: "expense",
          deleted_at: { $exists: false },
          date: { $gte: from, $lt: to },
          $or: [{ category_id: categoryId }, { root_category_id: categoryId }],
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .toArray();
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const budgets = await scope.budgets.find({}).toArray();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const rows = await Promise.all(
    budgets.map(async (budget) => {
      const [category, spendRows] = await Promise.all([
        scope.categories.findOne({ _id: budget.category_id }),
        monthSpend(scope, budget.category_id, monthStart, monthEnd),
      ]);
      const spent = spendRows[0]?.total ?? 0;
      // Round to one decimal so the UI doesn't render float noise; amount=0
      // budgets (not a normal state, but not worth a 500 either) read as 0%.
      const percentUsed = budget.amount > 0 ? Math.round((spent / budget.amount) * 1000) / 10 : 0;

      return {
        id: budget._id.toHexString(),
        categoryId: budget.category_id.toHexString(),
        categoryName: category?.name ?? "Unknown",
        amount: budget.amount,
        spent,
        remaining: budget.amount - spent,
        percentUsed,
      };
    }),
  );

  return NextResponse.json({ budgets: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const body = await req.json().catch(() => ({}));

  const categoryIdRaw = String(body.categoryId ?? "");
  if (!ObjectId.isValid(categoryIdRaw)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a number greater than zero." }, { status: 400 });
  }

  const category = await scope.categories.findOne({ _id: new ObjectId(categoryIdRaw) });
  if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });

  // One budget per category — re-setting "Food: 20000" replaces the existing
  // Food budget rather than piling up duplicates that'd double-count spend.
  const existing = await scope.budgets.findOne({ category_id: category._id });
  if (existing) {
    await scope.budgets.updateOne({ _id: existing._id }, { $set: { amount } });
  } else {
    await scope.budgets.insertOne({
      _id: new ObjectId(),
      category_id: category._id,
      amount,
      period: "monthly",
      start: new Date(),
    });
  }

  return NextResponse.json({ ok: true });
}
