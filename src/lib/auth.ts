import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { newId } from "./ids";

export const SESSION_COOKIE = "fd_session";
const SESSION_TTL_MS = 30 * 24 * 3600_000;

export interface User { id: string; username: string; displayName: string }

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const got = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function validateCredentials(username: unknown, password: unknown, displayName?: unknown) {
  const u = String(username ?? "").trim();
  const p = String(password ?? "");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(u)) return "Usernames are 3–20 letters, numbers or underscores.";
  if (p.length < 8 || p.length > 200) return "Passwords need at least 8 characters.";
  if (displayName !== undefined && String(displayName).trim().length > 24) return "Display names are 24 characters or fewer.";
  return null;
}

export function createUser(username: string, password: string, displayName?: string): User {
  const id = newId("u_");
  const name = (displayName?.trim() || username).slice(0, 24);
  db().prepare("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, username, name, hashPassword(password), Date.now());
  return { id, username, displayName: name };
}

export function findUserByCredentials(username: string, password: string): User | null {
  const row = db().prepare("SELECT id, username, display_name, password_hash FROM users WHERE username = ?").get(username) as
    | { id: string; username: string; display_name: string; password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, username: row.username, displayName: row.display_name };
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString("base64url");
  db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha(token), userId, Date.now() + SESSION_TTL_MS);
  return token;
}
export function deleteSession(token: string) {
  db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
}
export function userFromToken(token: string | undefined): User | null {
  if (!token) return null;
  const row = db().prepare(
    "SELECT u.id, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
  ).get(sha(token), Date.now()) as { id: string; username: string; display_name: string } | undefined;
  return row ? { id: row.id, username: row.username, displayName: row.display_name } : null;
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production", maxAge: SESSION_TTL_MS / 1000,
};
