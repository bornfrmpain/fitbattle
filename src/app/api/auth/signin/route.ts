import { NextResponse } from "next/server";
import { createSession, findUserByCredentials, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { fail, handle, readJson } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const b = await readJson(req);
  const user = findUserByCredentials(String(b.username ?? "").trim(), String(b.password ?? ""));
  if (!user) return fail("bad_credentials", "Username or password is wrong.", 401);
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, createSession(user.id), sessionCookieOptions);
  return res;
});
