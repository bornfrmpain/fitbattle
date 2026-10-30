"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

export function JoinForm({ initialCode, signedIn }: { initialCode: string; signedIn: boolean }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (!signedIn) return <Link href={`/signin?next=${encodeURIComponent(`/join?code=${code}`)}`} className="btn btn-dark mt-8">Sign in to join</Link>;
  return (
    <form className="mt-8 flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault(); setError(null); setBusy(true);
      try { const r = await post<{ battle: { id: string } }>("/api/join", { code }); router.push(`/battle/${r.battle.id}`); }
      catch (x) { setError((x as Error).message); setBusy(false); }
    }}>
      <label className="label" htmlFor="code">Invite code</label>
      <input id="code" className="field display num !text-5xl !h-20 tracking-widest uppercase" maxLength={6} autoComplete="off" value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} required />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button className="btn btn-dark" disabled={busy || code.length < 6}>{busy ? "Joining…" : "Join battle"}</button>
    </form>
  );
}
