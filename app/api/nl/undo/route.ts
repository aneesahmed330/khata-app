import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { undoReceipt } from "@/lib/receipt";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const undoToken = typeof body?.undoToken === "string" ? body.undoToken : "";
  if (!undoToken) return NextResponse.json({ error: "undoToken is required" }, { status: 400 });

  const scope = await forUser(session.userId);
  const ok = await undoReceipt(scope, undoToken);
  if (!ok) return NextResponse.json({ error: "Receipt not found or already undone" }, { status: 404 });

  return NextResponse.json({ undone: true });
}
