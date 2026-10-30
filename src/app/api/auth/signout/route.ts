import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) deleteSession(t);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
