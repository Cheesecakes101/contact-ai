import { NextResponse, type NextRequest } from "next/server";

// Optional single-user lock. When APP_PASSCODE is set, everything except
// Contact Drop rooms (which attendees open without an account) needs the cookie.
const PUBLIC = [/^\/drop(\/|$)/, /^\/api\/rooms(\/|$)/, /^\/login$/, /^\/api\/login$/, /^\/_next\//, /^\/favicon/, /^\/manifest/, /^\/icon/];

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();
  if (req.cookies.get("cai_auth")?.value === (await sha256(passcode))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Locked" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
