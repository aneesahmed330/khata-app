import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";

// Mobile equivalent of app/(app)/loans/page.tsx — same open-loans position
// math (exclude_from_total loans carved out of the KPI band, still shown in
// the list) as one JSON payload instead of server-rendered sections.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const [people, allLoans] = await Promise.all([
    scope.people.find({}).toArray(),
    scope.loans.find({}, { sort: { created_at: -1 } }).toArray(),
  ]);

  const peopleById = new Map(people.map((p) => [p._id.toHexString(), p] as const));
  const loans = allLoans.map((l) => ({
    id: l._id.toHexString(),
    personName: peopleById.get(l.person_id.toHexString())?.name ?? "Unknown",
    direction: l.direction,
    principal: l.principal,
    outstanding: l.outstanding,
    status: l.status,
    excludeFromTotal: l.exclude_from_total ?? false,
  }));

  const open = loans.filter((l) => l.status === "open");
  const counted = open.filter((l) => !l.excludeFromTotal);
  const excludedCount = open.length - counted.length;
  const owedToYou = counted
    .filter((l) => l.direction === "given")
    .reduce((sum, l) => sum + l.outstanding, 0);
  const youOwe = counted
    .filter((l) => l.direction === "taken")
    .reduce((sum, l) => sum + l.outstanding, 0);

  return NextResponse.json({
    loans,
    position: { owedToYou, youOwe, net: owedToYou - youOwe },
    excludedCount,
  });
}
