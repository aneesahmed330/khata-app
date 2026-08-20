import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";

// Mobile equivalent of app/(app)/add/page.tsx's account/category fetch — the
// Add screen's own data need, kept separate from /api/home so a new entry
// never waits on Home's heavier aggregation queries.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const [accounts, categories] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.categories.find({}).toArray(),
  ]);
  const categoryById = new Map(categories.map((c) => [c._id.toHexString(), c] as const));

  return NextResponse.json({
    accounts: accounts.map((a) => ({ id: a._id.toHexString(), name: a.name, type: a.type })),
    categories: categories.map((c) => ({
      id: c._id.toHexString(),
      name: c.name,
      type: c.type,
      parentName: c.parent_id ? categoryById.get(c.parent_id.toHexString())?.name : undefined,
      usageCount: c.usage_count,
    })),
  });
}
