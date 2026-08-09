import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser, type UserScope } from "@/lib/scope";

async function loadBudget(scope: UserScope, id: string) {
  if (!ObjectId.isValid(id)) return null;
  return scope.budgets.findOne({ _id: new ObjectId(id) });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const budget = await loadBudget(scope, params.id);
  if (!budget) return NextResponse.json({ error: "Budget not found." }, { status: 404 });

  await scope.budgets.deleteOne({ _id: budget._id });

  return NextResponse.json({ ok: true });
}
