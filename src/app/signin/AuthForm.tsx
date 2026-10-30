"use client";
import { useState } from "react";
import { post } from "@/lib/client";

export function AuthForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h1 className="display text-4xl md:text-5xl">{mode === "signin" ? "Sign in" : "Create account"}</h1>
      <form className="mt-8 flex flex-col gap-4" onSubmit={async (e) => {
        e.preventDefault(); setError(null); setBusy(true);
        const f = new FormData(e.currentTarget);
        try {
          await post(`/api/auth/${mode}`, Object.fromEntries(f));
          location.href = next; // full reload so server components see the session
        } catch (x) { setError((x as Error).message); setBusy(false); }
      }}>
        <div><label className="label" htmlFor="u">Username</label><input id="u" name="username" className="field" autoComplete="username" required /></div>
        {mode === "signup" && <div><label className="label" htmlFor="d">Display name (shown to opponents)</label><input id="d" name="displayName" className="field" maxLength={24} /></div>}
        <div><label className="label" htmlFor="p">Password</label><input id="p" name="password" type="password" className="field" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : undefined} required /></div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button className="btn btn-dark" disabled={busy}>{busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="mt-6 text-sm text-mute underline underline-offset-4 hover:text-ink" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}>
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </>
  );
}
