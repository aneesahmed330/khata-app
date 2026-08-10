import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { fetchLedgerPage } from "@/lib/ledger-query";
import { groupTransactionsByDay } from "@/lib/ledger-view";

// Backs History's infinite scroll — the SSR page renders the first batch,
// this serves every batch after. Same day-grouping as the page itself so a
// group split across the page boundary merges back into one on the client.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const nowParam = searchParams.get("now");
  const now = nowParam ? new Date(nowParam) : new Date();

  const scope = await forUser(session.userId);
  const [accounts, categories, people, holdings, tags, { transactions, nextCursor }] = await Promise.all([
    scope.accounts.find({}).toArray(),
    scope.categories.find({}).toArray(),
    scope.people.find({}).toArray(),
    scope.holdings.find({}).toArray(),
    scope.tags.find({}).toArray(),
    fetchLedgerPage(scope, { from, to, cursor, limit: 30, q }),
  ]);

  const groups = groupTransactionsByDay(transactions, accounts, categories, people, holdings, now, tags);
  return NextResponse.json({ groups, nextCursor });
}
