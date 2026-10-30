"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEFAULT_SLOTS, SLOT_LABEL, SLOTS, type Slot } from "@/lib/categories";
import { THEME_INFO, type BattleMode, type Theme } from "@/lib/battle/types";
import { post } from "@/lib/client";

const MODES: { v: BattleMode; label: string; help: string }[] = [
  { v: "friend", label: "Play a friend", help: "Get an invite code and link. The battle starts when they join." },
  { v: "random", label: "Random opponent", help: "Join the next player looking for a match, or wait in the queue for one. If you join someone, their rules apply." },
  { v: "local", label: "Same device", help: "Two players pass one screen. Both seats belong to your account." },
  { v: "solo", label: "Solo practice", help: "Build one outfit against the clock. No opponent, no votes." },
];
const TIMERS: { v: string; label: string }[] = [
  { v: "", label: "No timer" }, { v: "15", label: "15 s" }, { v: "30", label: "30 s" }, { v: "60", label: "60 s" }, { v: "120", label: "2 min" }, { v: "custom", label: "Custom" },
];
const BUDGETS: { v: string; label: string }[] = [
  { v: "200", label: "€200" }, { v: "500", label: "€500" }, { v: "1000", label: "€1,000" }, { v: "", label: "Unlimited" }, { v: "custom", label: "Custom" },
];

function Choice({ name, value, checked, onChange, children }: { name: string; value: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return <label className="choice"><input type="radio" name={name} value={value} checked={checked} onChange={onChange} /><span>{children}</span></label>;
}
function Group({ title, children, help }: { title: string; children: React.ReactNode; help?: React.ReactNode }) {
  return (
    <fieldset className="glass grid gap-4 p-5 md:grid-cols-[13rem_1fr] md:p-6">
      <legend className="sr-only">{title}</legend>
      <div><p className="font-display text-base font-semibold tracking-tight">{title}</p>{help && <p className="mt-1 text-sm text-mute">{help}</p>}</div>
      <div className="min-w-0">{children}</div>
    </fieldset>
  );
}

export interface SetupPrefill { budgetEur?: number; theme?: string; customTheme?: string; note?: string }

export function SetupForm({ signedIn, prefill }: { signedIn: boolean; prefill?: SetupPrefill }) {
  const router = useRouter();
  const [mode, setMode] = useState<BattleMode>("friend");
  const [timer, setTimer] = useState("60");
  const [customTimer, setCustomTimer] = useState("45");
  const [budget, setBudget] = useState(prefill?.budgetEur ? "custom" : "500");
  const [customBudget, setCustomBudget] = useState(prefill?.budgetEur ? String(prefill.budgetEur) : "750");
  const [slots, setSlots] = useState<Slot[]>(DEFAULT_SLOTS);
  const [turnOrder, setTurnOrder] = useState<"alternating" | "full">("alternating");
  const [theme, setTheme] = useState<Theme>(prefill?.theme === "custom" ? "custom" : "none");
  const [customTheme, setCustomTheme] = useState(prefill?.customTheme ?? "");
  const [voteTarget, setVoteTarget] = useState("3");
  const [p2, setP2] = useState("Player 2");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const timerSeconds = timer === "custom" ? Number(customTimer) : timer ? Number(timer) : null;
  const budgetEur = budget === "custom" ? Number(customBudget) : budget ? Number(budget) : null;
  const toggleSlot = (s: Slot) => setSlots((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : SLOTS.filter((x) => cur.includes(x) || x === s)));
  const solo = mode === "solo";
  const turns = slots.length * (solo ? 1 : 2);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!slots.length) return setError("Pick at least one category.");
    setBusy(true);
    const config = { mode, timerSeconds, budgetCents: budgetEur === null ? null : Math.round(budgetEur * 100), slots, turnOrder, theme, customTheme, voteTarget: Number(voteTarget) };
    try {
      const r = mode === "random"
        ? await post<{ battle: { id: string } }>("/api/matchmaking", { config })
        : await post<{ battle: { id: string } }>("/api/battles", { config, localOpponentName: p2 });
      router.push(`/battle/${r.battle.id}`);
    } catch (x) { setError((x as Error).message); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {prefill?.note && <p role="status" className="glass px-5 py-4 text-sm"><span className="font-semibold">From the Wheel:</span> {prefill.note}</p>}
      <Group title="Format">
        <div className="grid sm:grid-cols-2 gap-2">
          {MODES.map((m) => (
            <label key={m.v} className="choice"><input type="radio" name="mode" checked={mode === m.v} onChange={() => setMode(m.v)} />
              <span className="!flex-col !items-start !py-3"><strong className="font-semibold text-ink">{m.label}</strong><small className="text-sm font-normal text-mute">{m.help}</small></span></label>
          ))}
        </div>
        {mode === "local" && (
          <div className="mt-4 max-w-xs"><label className="label" htmlFor="p2">Second player&rsquo;s name</label>
            <input id="p2" className="field" value={p2} maxLength={24} onChange={(e) => setP2(e.target.value)} /></div>
        )}
      </Group>

      <Group title="Turn timer" help="Applies to each pick, not the whole battle. Kept on the server, so refreshing or switching devices doesn't add time.">
        <div className="flex flex-wrap gap-2">{TIMERS.map((t) => <Choice key={t.v} name="timer" value={t.v} checked={timer === t.v} onChange={() => setTimer(t.v)}>{t.label}</Choice>)}</div>
        {timer === "custom" && (
          <div className="mt-3 flex items-center gap-2"><label className="sr-only" htmlFor="ct">Seconds per turn</label>
            <input id="ct" className="field num !w-28" type="number" min={10} max={600} value={customTimer} onChange={(e) => setCustomTimer(e.target.value)} /><span className="text-mute text-sm">seconds, 10 to 600</span></div>
        )}
      </Group>

      <Group title="Outfit budget" help="The combined listed price of your pieces, before shipping, taxes and fees. Picks over what you have left are blocked.">
        <div className="flex flex-wrap gap-2">{BUDGETS.map((b) => <Choice key={b.v} name="budget" value={b.v} checked={budget === b.v} onChange={() => setBudget(b.v)}>{b.label}</Choice>)}</div>
        {budget === "custom" && (
          <div className="mt-3 flex items-center gap-2"><span className="text-mute">€</span><label className="sr-only" htmlFor="cb">Budget in euros</label>
            <input id="cb" className="field num !w-36" type="number" min={1} max={100000} value={customBudget} onChange={(e) => setCustomBudget(e.target.value)} /></div>
        )}
      </Group>

      <Group title="Categories" help="Each category is a round. Tops include jackets and coats; Miscellaneous covers bags, jewellery, hats, belts and eyewear. Turn categories off for a quicker battle.">
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((s) => (
            <label key={s} className="choice"><input type="checkbox" checked={slots.includes(s)} onChange={() => toggleSlot(s)} /><span>{SLOT_LABEL[s]}</span></label>
          ))}
        </div>
        <p className="mt-2 text-sm text-mute">Rounds always run Tops → Bottoms → Shoes → Miscellaneous, and both players get the same category each round. {turns} picks in total.</p>
      </Group>

      {!solo && (
        <Group title="Turn order">
          <div className="flex flex-wrap gap-2">
            <Choice name="to" value="alternating" checked={turnOrder === "alternating"} onChange={() => setTurnOrder("alternating")}>Alternating</Choice>
            <Choice name="to" value="full" checked={turnOrder === "full"} onChange={() => setTurnOrder("full")}>Full outfit</Choice>
          </div>
          <p className="mt-3 text-sm text-mute max-w-prose">
            {turnOrder === "alternating"
              ? `Player 1 picks a ${SLOT_LABEL[slots[0] ?? "top"].toLowerCase()}, then player 2 picks one, then the next category. You see each other's picks as they land.`
              : "Player 1 builds the whole outfit, one timed pick per category, then player 2 builds theirs."}
          </p>
        </Group>
      )}

      <Group title="Theme" help="Two themes are enforced by the rules. The rest guide players and voters, because listing data can't prove a piece is “archive”.">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(THEME_INFO) as Theme[]).map((t) => <Choice key={t} name="theme" value={t} checked={theme === t} onChange={() => setTheme(t)}>{THEME_INFO[t].label}</Choice>)}
        </div>
        <p className="mt-3 text-sm text-mute">{THEME_INFO[theme].description}</p>
        {theme === "custom" && <input className="field mt-3 max-w-md" placeholder="e.g. Dressed for a Berlin winter" maxLength={80} value={customTheme} onChange={(e) => setCustomTheme(e.target.value)} aria-label="Custom theme" />}
      </Group>

      {!solo && (
        <Group title="Votes to win" help="Voting closes when this many judges have voted. The host can also close it early once one vote is in.">
          <input className="field num !w-24" type="number" min={1} max={25} value={voteTarget} onChange={(e) => setVoteTarget(e.target.value)} aria-label="Votes needed" />
        </Group>
      )}

      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center">
        {error && <p role="alert" className="text-sm text-danger sm:order-2">{error}</p>}
        {signedIn ? (
          <button className="btn btn-dark !min-h-12 sm:min-w-64" disabled={busy}>{busy ? "Setting up…" : mode === "random" ? "Find an opponent" : mode === "friend" ? "Create battle and get invite" : "Start battle"}</button>
        ) : (
          <Link className="btn btn-dark" href="/signin?next=/play">Sign in to start</Link>
        )}
      </div>
    </form>
  );
}
