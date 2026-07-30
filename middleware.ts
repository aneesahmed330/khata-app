import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Edge runtime — kept independent of lib/auth.ts so bcryptjs never enters
// the middleware bundle. Only checks "is there a valid session"; route
// handlers/actions still call getSession() for the actual userId.
const COOKIE_NAME = "khata_session";

async function hasValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const authed = await hasValidSession(token);

  if (!authed && !isAuthRoute) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (authed && isAuthRoute) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// /api is excluded — route handlers check the session themselves and
// return 401 JSON. A page-redirect response would break fetch() callers
// (the client expects JSON, not the login page's HTML) and would also
// hijack /api/cron/daily, which authenticates via CRON_SECRET, not a
// session cookie.
//
// manifest.webmanifest/icon-*.png/apple-icon.png are also excluded — the OS
// fetches these to decide whether the app is installable, often without any
// session cookie attached. Without this exclusion every one of those requests
// got a 307 to /login instead of the actual manifest/icon bytes, which
// silently broke "Add to Home Screen" for anyone not already logged in.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|manifest.webmanifest|icon-192.png|icon-512.png|apple-icon.png).*)",
  ],
};
