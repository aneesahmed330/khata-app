import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { resolveOrCreateTag } from "@/lib/resolve";

// Mobile-only: backs the tag picker on the manual-entry and edit-transaction
// screens. GET lists every tag the user has (for the picker); POST resolves
// a typed name to an existing tag or creates one, mirroring how NL commit
// already handles new_tags (lib/resolve.ts's resolveOrCreateTag).

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const tags = await scope.tags.find({}, { sort: { usage_count: -1 } }).toArray();

  return NextResponse.json({
    tags: tags.map((t) => ({ id: t._id.toHexString(), name: t.name })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Tag name is required." }, { status: 400 });

  const res = await resolveOrCreateTag(scope, name);
  return NextResponse.json({ id: res.id.toHexString(), name, created: res.created });
}
