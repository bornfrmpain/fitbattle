"use client";
// Shared building blocks for the battle, reveal and stream screens.
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/battle/rules";
import { SLOTS, slotLabel, slotShort, type Slot } from "@/lib/categories";

export const seatVar = (seat: number) => (seat === 0 ? "var(--brand-p1)" : "var(--brand-p2)");

export function Avatar({ name, seat, size = 44, active }: { name: string; seat: number; size?: number; active?: boolean }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <span aria-hidden className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ${active ? "on-clock" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.36, ["--glow" as string]: seatVar(seat),
        background: `radial-gradient(120% 120% at 20% 10%, color-mix(in srgb, ${seatVar(seat)} 55%, white), ${seatVar(seat)} 55%, color-mix(in srgb, ${seatVar(seat)} 60%, black))` }}>
      {initials}
    </span>
  );
}

export function BudgetBar({ spent, budget, seat, align = "left" }: { spent: number; budget: number | null; seat: number; align?: "left" | "right" }) {
  const pct = budget ? Math.min(100, (spent / budget) * 100) : 0;
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="num text-sm"><span className="font-semibold">{fmt(spent)}</span><span className="text-mute">{budget ? ` of ${fmt(budget)}` : " spent · no limit"}</span></p>
      {budget !== null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={spent} aria-label="Budget used">
          <div className={`h-full rounded-full transition-[width] duration-500 ${align === "right" ? "ml-auto" : ""}`} style={{ width: `${pct}%`, background: seatVar(seat) }} />
        </div>
      )}
    </div>
  );
}

/** Server-authoritative remaining time; `offset` = server clock − local clock. */
export function useRemaining(deadline: number | null, offset: number, onExpire?: () => void) {
  const [now, setNow] = useState(() => Date.now() + offset);
  const fired = useRef<number | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + offset), 200); return () => clearInterval(t); }, [offset]);
  const left = deadline ? Math.max(0, deadline - now) : null;
  useEffect(() => {
    if (deadline && left === 0 && fired.current !== deadline) { fired.current = deadline; onExpire?.(); }
  }, [left, deadline, onExpire]);
  return left;
}

export function TimerRing({ deadline, total, offset, onExpire, size = 132 }: { deadline: number | null; total: number | null; offset: number; onExpire?: () => void; size?: number }) {
  const left = useRemaining(deadline, offset, onExpire);
  const r = size / 2 - 7, c = 2 * Math.PI * r;
  const frac = left !== null && total ? left / (total * 1000) : 1;
  const s = left === null ? null : Math.ceil(left / 1000);
  const urgent = s !== null && s <= 10;
  return (
    <div className="night relative flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, boxShadow: "0 18px 40px -18px #12111ccc, inset 0 1px 0 #ffffff1f" }}
      role="timer" aria-live={s !== null && s <= 5 ? "assertive" : "off"} aria-label={s === null ? "No timer" : `${s} seconds left`}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff1a" strokeWidth="4" />
        {s !== null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={urgent ? "#ff5d7a" : "url(#tr)"} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset .2s linear" }} />}
        <defs><linearGradient id="tr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--brand-p1)" /><stop offset="1" stopColor="var(--brand-p2)" /></linearGradient></defs>
      </svg>
      <span className={`relative font-display num font-semibold ${urgent ? "urgent" : ""}`} style={{ fontSize: s === null ? size * 0.13 : size * 0.26 }}>
        {s === null ? "No timer" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}
      </span>
    </div>
  );
}

/** The four battle categories as one progress track. */
/** The four battle categories as one progress track. Each one opens that category's picks. */
export function CategoryTracker({ slots, current, done, focused, onSelect }: {
  slots: string[]; current: string | null; done: (slot: string) => boolean; focused?: string | null; onSelect?: (slot: string) => void;
}) {
  const ordered = [...slots].sort((a, b) => SLOTS.indexOf(a as Slot) - SLOTS.indexOf(b as Slot));
  return (
    <div className="seg w-full sm:w-auto" role="group" aria-label="Categories">
      {ordered.map((s) => (
        <button key={s} type="button" data-on={(focused ?? current) === s} aria-pressed={focused === s} aria-current={s === current ? "step" : undefined}
          onClick={() => onSelect?.(s)} className="flex-1 justify-center gap-1.5"
          title={s === current ? `${slotLabel(s)} · current round` : `Show ${slotLabel(s).toLowerCase()} picks`}>
          {done(s) && <span aria-label="done" className="text-ok">✓</span>}
          {s === current && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />}
          <span className="sm:hidden">{slotShort(s)}</span><span className="hidden sm:inline">{slotLabel(s)}</span>
        </button>
      ))}
    </div>
  );
}

export function ChallengeList({ challenges, dark }: { challenges: { id: string; text: string; sourceTitle: string | null }[]; dark?: boolean }) {
  if (!challenges.length) return null;
  return (
    <ul aria-label="Challenges" className="flex flex-wrap gap-2">
      {challenges.map((c) => (
        <li key={c.id} className={`rounded-xl px-3 py-1.5 text-sm ${dark ? "bg-white/10 text-white" : "bg-white shadow-[var(--shadow-soft)]"}`}>
          <span className={`font-semibold ${dark ? "" : "text-accent"}`}>Challenge</span> · {c.text}
          {c.sourceTitle && <span className={dark ? "text-white/60" : "text-mute"}> · {c.sourceTitle}</span>}
        </li>
      ))}
    </ul>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "error" | "ok"; title?: string; children: React.ReactNode }) {
  const color = tone === "error" ? "var(--color-danger)" : tone === "ok" ? "var(--color-ok)" : "var(--brand-p1)";
  return (
    <div role={tone === "error" ? "alert" : "status"} className="card flex gap-3 p-4 text-sm" style={{ boxShadow: `inset 3px 0 0 ${color}, var(--shadow-soft)` }}>
      <div className="min-w-0">
        {title && <p className="font-semibold text-ink">{title}</p>}
        <div className="text-mute">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="glass chrome-edge relative flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div aria-hidden className="mb-1 grid h-14 w-14 place-items-center rounded-2xl bg-mist">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-mute"><path d="M8 3l-5 4 3 3 2-1v12h8V9l2 1 3-3-5-4a4 4 0 01-8 0z" strokeLinejoin="round" /></svg>
      </div>
      <p className="font-display text-xl font-semibold tracking-tight">{title}</p>
      {children && <div className="max-w-md text-sm text-mute">{children}</div>}
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}
