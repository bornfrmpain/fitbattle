import { NextResponse } from "next/server";
import { BattleError } from "./battle/rules";
import { currentUser, type User } from "./auth";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (code: string, message: string, status = 400) => NextResponse.json({ error: { code, message } }, { status });

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new BattleError("auth_required", "Sign in to do that.", 401);
  return u;
}

/** Wraps a route handler so domain errors become structured JSON instead of 500s. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof BattleError) return fail(e.code, e.message, e.status);
      console.error(e);
      return fail("server_error", "Something failed on our side. Your battle state is unchanged; try again.", 500);
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    throw new BattleError("bad_json", "Request body must be JSON.");
  }
}
