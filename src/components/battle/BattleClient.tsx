"use client";
import { useCallback, useEffect, useState } from "react";
import type { BattleView } from "@/lib/battle/repo";
import type { Brand } from "@/lib/brand";
import { fmt } from "@/lib/battle/rules";
import { SLOT_LABEL, SLOT_PHRASE, slotLabel } from "@/lib/categories";
import { THEME_INFO } from "@/lib/battle/types";
import { api, post } from "@/lib/client";
import type { Product } from "@/lib/products/types";
import { PieceFinder } from "../PieceFinder";
import { Avatar, BudgetBar, CategoryTracker, ChallengeList, Notice, TimerRing } from "../ui";
import { PriceTag, ProductImage } from "../ProductCard";
import { emptyLabel, slotState } from "./Outfit";
import { OutfitPanel } from "./Outfit";
import { Reveal } from "./Reveal";

type View = BattleView;

/** Polls the server. The server is the clock; we only keep an offset for display. */
export function useBattle(initial: View) {
  const [view, setView] = useState<View>(initial);
  const [offset, setOffset] = useState(initial.serverNow - Date.now());
  const [connError, setConnError] = useState(false);
  const apply = useCallback((v: View) => { setView(v); setOffset(v.serverNow - Date.now()); }, []);
  const refresh = useCallback(async () => {
    try { apply((await api<{ battle: View }>(`/api/battles/${initial.id}`, { cache: "no-store" })).battle); setConnError(false); }
    catch { setConnError(true); }
  }, [initial.id, apply]);
  useEffect(() => {
    if (view.status === "complete") return;
    const t = setInterval(refresh, view.status === "voting" ? 3000 : 1000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [view.status, refresh]);
  return { view, offset, apply, refresh, connError };
}

export function BattleClient({ initial, brand }: { initial: View; brand: Brand }) {
  const { view, offset, apply, refresh, connError } = useBattle(initial);
  return (
    <>
      {connError && <div role="status" className="night py-2 text-center text-sm">Reconnecting… your turn and timer are kept on the server.</div>}
      {view.status === "waiting" && <WaitingRoom view={view} />}
      {view.status === "active" && <BattleScreen view={view} offset={offset} apply={apply} refresh={refresh} />}
      {(view.status === "voting" || view.status === "complete") && <Reveal view={view} apply={apply} brand={brand} />}
    </>
  );
}

function WaitingRoom({ view }: { view: View }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" && view.invite ? `${location.origin}/join?code=${view.invite.code}` : "";
  const isRandom = view.config.mode === "random";
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 md:py-20">
      <p className="eyebrow">Waiting room</p>
      <h1 className="display mt-3 text-5xl md:text-7xl">{isRandom ? "Finding an opponent" : "Waiting for your opponent"}</h1>
      {isRandom ? (
        <p className="mt-5 max-w-prose text-lg text-mute">You&rsquo;re in the queue. The battle starts the moment another player looks for a match. Queue slots expire after 24 hours.</p>
      ) : view.invite ? (
        <div className="mt-10 grid gap-4 md:grid-cols-[auto_1fr]">
          <div className="night rounded-3xl p-7 md:p-9">
            <p className="text-sm text-white/70">Invite code</p>
            <p className="font-display num mt-1 text-6xl font-semibold tracking-[0.12em] md:text-7xl">{view.invite.code}</p>
            <p className="mt-3 text-xs text-white/60">Expires {new Date(view.invite.expiresAt).toLocaleString()}</p>
          </div>
          <div className="glass flex flex-col justify-center gap-3 p-6">
            <p className="text-mute">Drop the code in chat or send the link. The first timer starts as soon as they join.</p>
            <input readOnly className="field" value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
            <button className="btn btn-dark" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>{copied ? "Link copied" : "Copy invite link"}</button>
          </div>
        </div>
      ) : <p className="mt-5 text-lg text-mute">Waiting for the second player to join.</p>}
      <RulesSummary view={view} />
    </div>
  );
}

export function RulesSummary({ view }: { view: View }) {
  const c = view.config;
  const rows: [string, string][] = [
    ["Format", c.mode === "local" ? "Same device, two players" : c.mode === "solo" ? "Solo practice" : c.mode === "random" ? "Random online opponent" : "Private battle"],
    ["Turn timer", c.timerSeconds ? `${c.timerSeconds} seconds per pick` : "No timer"],
    ["Budget", c.budgetCents ? `${fmt(c.budgetCents)} combined listed price` : "Unlimited"],
    ["Turns", c.turnOrder === "alternating" ? "Alternating, one piece each per category" : "Full outfit, player 1 first"],
    ["Categories", c.slots.map((s) => slotLabel(s)).join(" · ")],
    ["Theme", c.theme === "custom" ? `Custom: ${c.customTheme}` : THEME_INFO[c.theme].label],
  ];
  return (
    <dl className="glass mt-8 grid gap-x-8 gap-y-3 p-6 sm:grid-cols-2">
      {rows.map(([k, v]) => <div key={k}><dt className="eyebrow">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>)}
    </dl>
  );
}

function PlayerSide({ view, seat, active, right }: { view: View; seat: 0 | 1; active: boolean; right?: boolean }) {
  const p = view.seats[seat];
  if (!p) return <div />;
  const you = view.viewer.seats.includes(seat) && view.config.mode !== "local";
  const filled = view.turns.filter((t) => t.seat === seat && t.status === "filled").length;
  const total = view.turns.filter((t) => t.seat === seat).length;
  return (
    <div className={`relative min-w-0 rounded-2xl p-2 sm:p-3 transition-colors duration-300 ${active ? "bg-white shadow-[var(--shadow-soft)]" : "opacity-70"}`}
      style={active ? { boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${seat === 0 ? "var(--brand-p1)" : "var(--brand-p2)"} 55%, transparent), var(--shadow-soft)` } : undefined}>
      <div className={`flex items-center gap-2 sm:gap-3 ${right ? "flex-row-reverse text-right" : ""}`}>
        <span className="hidden sm:inline-flex"><Avatar name={p.name} seat={seat} active={active} size={44} /></span><span className="sm:hidden"><Avatar name={p.name} seat={seat} active={active} size={30} /></span>
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold sm:text-base md:text-lg">{p.name}{you && <span className="ml-1.5 font-sans text-xs font-medium text-mute">you</span>}</p>
          <p className="truncate text-xs font-semibold" style={{ color: active ? (seat === 0 ? "var(--brand-p1)" : "var(--brand-p2)") : "var(--color-mute)" }}>
            {active ? <><span className="sm:hidden">Picking</span><span className="hidden sm:inline">On the clock</span></> : <><span className="sm:hidden">{filled}/{total}</span><span className="hidden sm:inline">{filled} of {total} locked</span></>}
            {view.config.mode === "local" && seat === 1 && <span className="hidden md:inline"> · same device</span>}
          </p>
        </div>
      </div>
      <div className="mt-3 hidden sm:block"><BudgetBar spent={view.spent[seat]} budget={view.config.budgetCents} seat={seat} align={right ? "right" : "left"} /></div>
    </div>
  );
}

function BattleScreen({ view, offset, apply, refresh }: { view: View; offset: number; apply: (v: View) => void; refresh: () => void }) {
  const turn = view.turns[view.currentTurn];
  const mine = view.viewer.seats.includes(turn.seat);
  const name = view.seats[turn.seat]?.name ?? "Player";
  const budget = view.config.budgetCents;
  const remaining = budget === null ? null : budget - view.spent[turn.seat];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const solo = view.config.mode === "solo";
  const roundSize = solo || view.config.turnOrder === "full" ? 1 : 2;
  const round = Math.floor(view.currentTurn / roundSize) + 1;
  const rounds = Math.ceil(view.turns.length / roundSize);
  const local = view.config.mode === "local";

  useEffect(() => setMessage(null), [view.currentTurn]);

  async function onSelect(p: Product) {
    setBusyId(p.id); setMessage(null);
    try { apply((await post<{ battle: View }>(`/api/battles/${view.id}/select`, { expectedTurn: view.currentTurn, productId: p.id, primaryImage: p.imageUrl })).battle); }
    catch (e) { setMessage((e as Error).message); refresh(); }
    finally { setBusyId(null); }
  }
  async function skip() {
    if (!confirm(`Leave ${slotLabel(turn.slot).toLowerCase()} empty and end this turn?`)) return;
    try { apply((await post<{ battle: View }>(`/api/battles/${view.id}/skip`, { expectedTurn: view.currentTurn })).battle); }
    catch (e) { setMessage((e as Error).message); refresh(); }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-3 md:px-8 pb-16">
      {/* Arena */}
      <section aria-label="Scoreboard" className="chrome-edge sticky top-[3.75rem] z-30 mt-3 rounded-[22px] bg-white/[.96] p-2 shadow-[var(--shadow-lift)] backdrop-blur-xl md:mt-5 md:p-2.5">
        <div className={`grid items-center gap-2 md:gap-4 ${solo ? "grid-cols-[1fr_auto]" : "grid-cols-[1fr_auto_1fr]"}`}>
          <PlayerSide view={view} seat={0} active={turn.seat === 0} />
          <div className="flex flex-col items-center gap-1.5 px-1">
            <p className="eyebrow">Round {round} / {rounds}</p>
            <div className="hidden md:block"><TimerRing deadline={turn.deadline} total={view.config.timerSeconds} offset={offset} onExpire={refresh} size={104} /></div>
            <div className="md:hidden"><TimerRing deadline={turn.deadline} total={view.config.timerSeconds} offset={offset} onExpire={refresh} size={84} /></div>
            <p className="font-display text-sm font-semibold md:text-base">{SLOT_LABEL[turn.slot as keyof typeof SLOT_LABEL] ?? slotLabel(turn.slot)}</p>
          </div>
          {!solo && <PlayerSide view={view} seat={1} active={turn.seat === 1} right />}
        </div>
        <div className="mt-1.5 flex justify-center">
          <CategoryTracker slots={view.config.slots} current={turn.slot} focused={focus} onSelect={(s) => setFocus(focus === s ? null : s)}
            done={(s) => view.turns.filter((t) => t.slot === s).every((t) => t.status !== "pending" && t.status !== "active")} />
        </div>
      </section>

      {focus && <CategoryFocus view={view} slot={focus} onClose={() => setFocus(null)} />}
      {view.challenges.length > 0 && <div className="mt-6"><ChallengeList challenges={view.challenges} /></div>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="display text-3xl md:text-4xl">{mine ? (local ? `${name}, your pick` : "Your pick") : `${name} is choosing`}</h1>
              <p className="mt-2 text-mute">Find {SLOT_PHRASE[turn.slot as keyof typeof SLOT_PHRASE] ?? "a piece"}{remaining !== null ? <> for <span className="num font-semibold text-ink">{fmt(remaining)}</span> or less</> : ""}.
                {view.config.theme !== "none" && <> Theme: <span className="font-medium text-ink">{view.config.theme === "custom" ? view.config.customTheme : THEME_INFO[view.config.theme].label}</span>.</>}</p>
            </div>
            {mine && <button className="btn btn-quiet text-sm" onClick={skip}>Leave {slotLabel(turn.slot).toLowerCase()} empty</button>}
          </div>
          {message && <div className="mb-4"><Notice tone="error" title="Couldn't lock that in">{message}</Notice></div>}
          {mine ? (
            <PieceFinder key={view.currentTurn} slot={turn.slot as never} onSelect={onSelect} remainingCents={remaining} busyId={busyId} theme={view.config.theme} />
          ) : (
            <div className="flex flex-col gap-4">
              <Notice title={view.viewer.seats.length ? "Waiting for your turn" : "You're watching this battle"}>{view.viewer.seats.length ? "You can look around; picks unlock on your turn." : "Picks appear as they're locked in."}</Notice>
              <PieceFinder key={`w${view.currentTurn}`} slot={turn.slot as never} theme={view.config.theme} />
            </div>
          )}
        </div>
        <OutfitPanel view={view} />
      </div>
    </div>
  );
}

/** Both players' picks for one category, opened from the category tabs. */
function CategoryFocus({ view, slot, onClose }: { view: View; slot: string; onClose: () => void }) {
  const seats: (0 | 1)[] = view.config.mode === "solo" ? [0] : [0, 1];
  const current = view.turns[view.currentTurn]?.slot === slot;
  return (
    <section aria-label={`${slotLabel(slot)} picks`} className="glass pop-in mt-4 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-display font-semibold">{slotLabel(slot)}{current && <span className="ml-2 font-sans text-xs font-semibold text-accent">current round</span>}</p>
        <button className="btn btn-quiet !min-h-9 text-sm" onClick={onClose}>Close</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {seats.map((seat) => {
          const { turn, item } = slotState(view, seat, slot);
          return (
            <div key={seat} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-[var(--shadow-soft)]">
              <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-mist">{item && <ProductImage product={item} compact />}</div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-mute">{view.seats[seat]?.name}</p>
                {item ? (<><p className="truncate font-semibold">{item.brand ?? "No designer listed"}</p><p className="truncate text-sm text-mute">{item.title}</p><PriceTag cents={item.priceCents} className="mt-1 !bg-mist" /></>)
                  : <p className="text-sm text-mute">{emptyLabel(turn?.status)}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
