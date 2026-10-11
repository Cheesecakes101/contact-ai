import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { body, error } from "@/lib/http";

export async function POST(req: Request) {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return NextResponse.json({ ok: true });
  const b = await body<{ passcode: string }>(req);
  if (b.passcode !== passcode) return error("Wrong passcode", 401);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("cai_auth", createHash("sha256").update(passcode).digest("hex"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
