import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { getDb } from "@/lib/db";
import type { UserDoc } from "@/lib/types";

// Mobile equivalent of app/(app)/settings/page.tsx's overview counts + the
// two global net-worth switches (actions/settings.ts's setNetWorthPrefAction).
// "Hide balances" is intentionally absent — lib/use-hide-balances.ts stores it
// client-side only (localStorage), so it has no server-side field to mirror.

const NET_WORTH_FIELDS = {
  loans: "count_loans_in_net_worth",
  investments: "count_investments_in_net_worth",
} as const;

type NetWorthCategory = keyof typeof NET_WORTH_FIELDS;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const db = await getDb();
  const [accountsCount, categoriesCount, peopleCount, user] = await Promise.all([
    scope.accounts.countDocuments({ archived: { $ne: true } }),
    scope.categories.countDocuments({}),
    scope.people.countDocuments({}),
    db.collection<UserDoc>("users").findOne({ _id: scope.userId }),
  ]);

  return NextResponse.json({
    accountsCount,
    categoriesCount,
    peopleCount,
    countLoansInNetWorth: user?.count_loans_in_net_worth ?? true,
    countInvestmentsInNetWorth: user?.count_investments_in_net_worth ?? true,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const field = body?.field as NetWorthCategory | undefined;
  if (field !== "loans" && field !== "investments") {
    return NextResponse.json({ error: "Unknown setting." }, { status: 400 });
  }
  const value = Boolean(body.value);

  const scope = await forUser(session.userId);
  const db = await getDb();
  await db
    .collection<UserDoc>("users")
    .updateOne({ _id: scope.userId }, { $set: { [NET_WORTH_FIELDS[field]]: value } });

  return NextResponse.json({ ok: true });
}
