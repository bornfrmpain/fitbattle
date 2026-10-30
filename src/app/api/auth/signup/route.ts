import { NextResponse } from "next/server";
import { createSession, createUser, SESSION_COOKIE, sessionCookieOptions, validateCredentials } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, handle, readJson } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const b = await readJson(req);
  const err = validateCredentials(b.username, b.password, b.displayName);
  if (err) return fail("bad_credentials", err);
  const username = String(b.username).trim();
  if (db().prepare("SELECT 1 FROM users WHERE username = ?").get(username)) return fail("taken", "That username is taken.", 409);
  const user = createUser(username, String(b.password), b.displayName ? String(b.displayName) : undefined);
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, createSession(user.id), sessionCookieOptions);
  return res;
});
