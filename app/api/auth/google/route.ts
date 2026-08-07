import { NextResponse } from "next/server";
import { verifyGoogleIdToken, createSessionToken, setSessionCookie } from "@/lib/auth";
import { findOrCreateGoogleUser } from "@/lib/bootstrap";

// Shared by both clients: sets the httpOnly cookie the web app reads (via
// `getSession()`'s cookie fallback) AND returns the token in the JSON body
// for mobile, which has no cookie jar of its own — same split as
// /api/auth/login, just for the Google identity path instead of a password.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const idToken = typeof body?.idToken === "string" ? body.idToken : "";
  if (!idToken) {
    return NextResponse.json({ error: "idToken is required." }, { status: 400 });
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid Google token." }, { status: 401 });
  }

  const user = await findOrCreateGoogleUser(identity);
  const token = await createSessionToken({ userId: user._id.toHexString(), email: user.email });
  await setSessionCookie(token);

  return NextResponse.json({
    token,
    user: { id: user._id.toHexString(), email: user.email, name: user.name },
  });
}
