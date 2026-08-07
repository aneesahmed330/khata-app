import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";

const COOKIE_NAME = "khata_session";
const SESSION_DAYS = 30;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Copy .env.example to .env.local and fill it in.");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Factored out of createSessionCookie so the mobile login route (which
 *  returns the token in a JSON body instead of setting a cookie) shares the
 *  exact same SignJWT call rather than a second copy of it. */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

/** Factored out so /api/auth/google can set the cookie from a token it
 *  already minted (and also returns that same token as JSON for mobile),
 *  instead of signing two different tokens for the two clients. */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function createSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  await setSessionCookie(token);
}

/** Checked in this order: `Authorization: Bearer <token>` (the mobile app,
 *  which has no cookie jar of its own — it stores the token in
 *  react-native-keychain and attaches it itself) first, the httpOnly cookie
 *  (the web app) second. Every existing caller stays a zero-arg call — this
 *  reads both sources itself via next/headers, same as it already read the
 *  cookie, so no Route Handler needed to change to support mobile. */
export async function getSession(): Promise<SessionPayload | null> {
  const hdrs = await headers();
  const authHeader = hdrs.get("authorization");
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    const store = await cookies();
    token = store.get(COOKIE_NAME)?.value;
  }
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== "string" || typeof payload.email !== "string") return null;
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

// Cached across invocations by jose itself (it memoizes per-URL fetches of
// the key set) — this module only needs to describe where to look.
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Verifies a Google ID token client-side sign-in produced (native Google
 *  Sign-In on mobile, Google Identity Services on web) against Google's own
 *  published keys — no google-auth-library needed, `jose` already does JWKS
 *  verification for the app's own session tokens. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  // NEXT_PUBLIC_ because the exact same client ID is also embedded in the
  // browser (Google Identity Services button) and shipped in the mobile
  // app's config — it's a public identifier, not a secret.
  const audience = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!audience) {
    throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set.");
  }
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience,
  });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Google ID token is missing sub/email.");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : payload.email,
  };
}

export { COOKIE_NAME };
