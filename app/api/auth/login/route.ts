import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword, createSessionToken } from "@/lib/auth";
import type { UserDoc } from "@/lib/types";

// Mobile equivalent of actions/auth.ts's loginAction — same lookup/verify,
// but returns the token in the JSON body instead of setting a cookie +
// redirecting, since a native client has no cookie jar to rely on and
// stores the token itself (react-native-keychain).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are both required." }, { status: 400 });
  }

  const db = await getDb();
  const user = await db.collection<UserDoc>("users").findOne({ email });

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const token = await createSessionToken({ userId: user._id.toHexString(), email: user.email });
  return NextResponse.json({
    token,
    user: { id: user._id.toHexString(), email: user.email, name: user.name },
  });
}
