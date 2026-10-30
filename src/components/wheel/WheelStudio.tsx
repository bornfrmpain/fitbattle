"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, post } from "@/lib/client";
import { fmt } from "@/lib/battle/rules";
import {
  charLength, decodeShare, defaultWheel, encodeShare, LIMITS, MODE_LABEL, parseEuroAmount, parseLines, PRESETS, validateWheel,
  WHEEL_MODES, type WheelConfig, type WheelMode,
} from "@/lib/wheel/model";
import { draftStore, localWheels } from "@/lib/wheel/local";
import type { SavedWheel } from "@/lib/wheel/repo";
import { Notice, Spinner } from "../ui";
import { useMuted, useWheelSpin, WheelView } from "./Wheel";

type Where = "cloud" | "local";
const snap = (w: WheelConfig) => JSON.stringify([w.title, w.mode, w.entries]);

interface BattleRef { id: string; status: string; seats: ({ name: string } | null)[]; viewer: { seats: number[] } }

export function WheelStudio({ signedIn, shareParam, idParam }: { signedIn: boolean; shareParam?: string; idParam?: string }) {
  const where: Where = signedIn ? "cloud" : "local";
  const [wheel, setWheel] = useState<WheelConfig>(() => defaultWheel("price"));
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedWhere, setSavedWhere] = useState<Where | null>(null);
  const [snapshot, setSnapshot] = useState(() => snap(defaultWheel("price")));
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error" | "ok"; text: string } | null>(null);
  const [saved, setSaved] = useState<SavedWheel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { muted, toggle } = useMuted();

  const entries = wheel.entries;
  const validation = useMemo(() => validateWheel(wheel), [wheel]);
  const spinnable = validation.ok;
  const dirty = snap(wheel) !== snapshot;
  const { ref, rotation, spinning, result, spins, spin } = useWheelSpin(spinnable ? entries.length : 0, { muted, resetKey: JSON.stringify(entries) });
  const resultText = result !== null && spinnable ? entries[result] : null;

  // ---- initial load: shared link > saved wheel id > last draft > default
  useEffect(() => {
    (async () => {
      if (shareParam) {
        const r = decodeShare(shareParam);
        if (r.ok) { load(r.wheel, null, null, "Loaded from a shared link. Save it to keep your own copy."); setReady(true); return; }
        setNotice({ tone: "error", text: `Couldn't open the shared wheel: ${r.errors[0]}` });
      } else if (idParam && signedIn) {
        try { const { wheel: w } = await api<{ wheel: SavedWheel }>(`/api/wheels/${idParam}`); load(w, w.id, "cloud"); setReady(true); return; }
        catch (e) { setNotice({ tone: "error", text: (e as Error).message }); }
      }
      const d = draftStore.load();
      if (d) { setWheel(d.wheel); setSavedId(d.savedId); setSavedWhere(d.savedWhere); setSnapshot(d.snapshot || snap(d.wheel)); }
      setReady(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the working wheel across refreshes.
  useEffect(() => { if (ready) draftStore.save({ wheel, savedId, savedWhere, snapshot }); }, [ready, wheel, savedId, savedWhere, snapshot]);
  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const refreshSaved = useCallback(async () => {
    if (where === "local") { setSaved(localWheels.list()); return; }
    try { setSaved((await api<{ wheels: SavedWheel[] }>("/api/wheels")).wheels); }
    catch (e) { setNotice({ tone: "error", text: `Couldn't load your saved wheels: ${(e as Error).message}` }); setSaved([]); }
  }, [where]);
  useEffect(() => { refreshSaved(); }, [refreshSaved]);

  /** `unsaved`: the loaded wheel exists nowhere else yet (a duplicate), so leaving should warn. */
  function load(w: WheelConfig, id: string | null, w2: Where | null, msg?: string, unsaved = false) {
    const copy = { ...w, entries: [...w.entries] };
    // Presets, shared links and saved wheels can be reopened, so an unedited one isn't "unsaved".
    setWheel(copy); setSavedId(id); setSavedWhere(w2); setSnapshot(unsaved ? "" : snap(copy));
    setNotice(msg ? { tone: "info", text: msg } : null);
  }
  const confirmDiscard = (what: string) => !dirty || confirm(`${what}? Your unsaved changes to “${wheel.title || "this wheel"}” will be lost.`);
  const update = (patch: Partial<WheelConfig>) => { if (!spinning) setWheel((w) => ({ ...w, ...patch })); };
  const setEntries = (fn: (e: string[]) => string[]) => update({ entries: fn(entries) });

  async function save(asNew = false) {
    if (!validation.ok) { setNotice({ tone: "error", text: validation.errors[0] }); return; }
    setBusy(true);
    try {
      let s: SavedWheel;
      if (where === "local") s = localWheels.save(validation.wheel, asNew ? undefined : savedWhere === "local" ? savedId ?? undefined : undefined);
      else if (savedId && savedWhere === "cloud" && !asNew) s = (await api<{ wheel: SavedWheel }>(`/api/wheels/${savedId}`, { method: "PUT", body: JSON.stringify(validation.wheel) })).wheel;
      else s = (await post<{ wheel: SavedWheel }>("/api/wheels", validation.wheel)).wheel;
      setWheel({ title: s.title, mode: s.mode, entries: s.entries }); setSavedId(s.id); setSavedWhere(where); setSnapshot(snap(s));
      setNotice({ tone: "ok", text: where === "cloud" ? "Saved to your account." : "Saved on this device only. Sign in to keep wheels in your account." });
      refreshSaved();
    } catch (e) { setNotice({ tone: "error", text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function removeSaved(w: SavedWheel) {
    if (!confirm(`Delete “${w.title}”? This can't be undone.`)) return;
    try {
      if (where === "local") localWheels.remove(w.id); else await api(`/api/wheels/${w.id}`, { method: "DELETE" });
      if (savedId === w.id) { setSavedId(null); setSavedWhere(null); setSnapshot(""); }
      refreshSaved();
    } catch (e) { setNotice({ tone: "error", text: (e as Error).message }); }
  }
  async function renameSaved(w: SavedWheel) {
    const t = prompt("New title", w.title);
    if (t === null) return;
    const v = validateWheel({ ...w, title: t });
    if (!v.ok) { setNotice({ tone: "error", text: v.errors[0] }); return; }
    try {
      if (where === "local") localWheels.save(v.wheel, w.id); else await api(`/api/wheels/${w.id}`, { method: "PUT", body: JSON.stringify(v.wheel) });
      if (savedId === w.id) { setWheel(v.wheel); setSnapshot(snap(v.wheel)); }
      refreshSaved();
    } catch (e) { setNotice({ tone: "error", text: (e as Error).message }); }
  }
  async function duplicateSaved(w: SavedWheel) {
    const copy = { title: `${w.title}`.slice(0, LIMITS.maxTitleLength - 7) + " (copy)", mode: w.mode, entries: w.entries };
    try { if (where === "local") localWheels.save(copy); else await post("/api/wheels", copy); refreshSaved(); setNotice({ tone: "ok", text: `Duplicated “${w.title}”.` }); }
    catch (e) { setNotice({ tone: "error", text: (e as Error).message }); }
  }

  const shareUrl = typeof window !== "undefined" && validation.ok ? `${location.origin}/wheel?w=${encodeShare(validation.wheel)}` : "";
  const stageUrl = validation.ok ? `/wheel/stage?w=${encodeShare(validation.wheel)}` : "";

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-20 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-8 md:pt-12">
        <div><p className="eyebrow">Randomizer</p><h1 className="display mt-2 text-4xl md:text-6xl">Wheel</h1></div>
        <div className="seg" role="tablist" aria-label="Wheel mode">
          {WHEEL_MODES.map((m) => (
            <button key={m} role="tab" aria-selected={wheel.mode === m} disabled={spinning}
              onClick={() => { if (m !== wheel.mode && confirmDiscard(`Switch to the ${MODE_LABEL[m]}`)) load(defaultWheel(m), null, null); }}>{MODE_LABEL[m]}</button>
          ))}
        </div>
      </div>

      {notice && <div className="mt-5"><Notice tone={notice.tone} title={notice.tone === "error" ? "Something needs attention" : undefined}>{notice.text}</Notice></div>}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Wheel: the main visual */}
        <section aria-label="Wheel" className="flex flex-col items-center gap-5">
          <p className="font-display text-xl font-semibold tracking-tight text-center md:text-2xl">{wheel.title || "Untitled wheel"}</p>
          <div className="w-full max-w-[640px]">
            {spinnable ? (
              <WheelView entries={entries} rotationRef={ref} rotation={rotation} resultIndex={result} spinning={spinning} spins={spins} onHubClick={spin} />
            ) : (
              <div className="glass flex aspect-square items-center justify-center rounded-full p-10 text-center text-mute">
                {validation.ok ? null : validation.errors[0]}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button data-testid="spin-button" className="btn btn-dark !min-h-14 !px-10 text-base" onClick={spin} disabled={!spinnable || spinning} aria-describedby="spin-help">
              {spinning ? <><Spinner /> Spinning</> : result !== null ? "Spin again" : "Spin"}
            </button>
            <button className="btn btn-quiet !min-h-14" onClick={toggle} aria-pressed={!muted}>{muted ? "Sound off" : "Sound on"}</button>
          </div>
          <p id="spin-help" className="text-xs text-mute">{entries.length} {entries.length === 1 ? "entry" : "entries"} · each has an equal chance</p>

          <div aria-live="polite" className="w-full max-w-[640px]">
            {resultText !== null && (
              <ResultPanel text={resultText} wheel={wheel} signedIn={signedIn} onSpin={spin} spinning={spinning} />
            )}
          </div>
        </section>

        {/* Editor */}
        <section aria-label="Edit wheel" className="flex flex-col gap-4">
          <div className="glass p-5">
            <label className="label" htmlFor="wh-title">Title</label>
            <input id="wh-title" className="field" value={wheel.title} maxLength={200} disabled={spinning}
              onChange={(e) => update({ title: e.target.value })} placeholder="e.g. Pick a Brand" />
            {charLength(wheel.title.trim()) > LIMITS.maxTitleLength && <p className="mt-1 text-xs text-danger">Up to {LIMITS.maxTitleLength} characters.</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-mute">Presets:</span>
              {PRESETS[wheel.mode].map((p) => (
                <button key={p.title} className="link" disabled={spinning} onClick={() => { if (confirmDiscard(`Load the “${p.title}” preset`)) load(p, null, null); }}>{p.title}</button>
              ))}
            </div>
          </div>

          <EntryEditor entries={entries} disabled={spinning} setEntries={setEntries} />

          <div className="glass flex flex-wrap gap-2 p-4">
            <button className="btn btn-dark" disabled={busy || spinning || !validation.ok} onClick={() => save(false)}>{busy ? <Spinner /> : null}{savedId && savedWhere === where ? "Save changes" : "Save wheel"}</button>
            {savedId && <button className="btn btn-quiet" disabled={busy || spinning || !validation.ok} onClick={() => save(true)}>Save as new</button>}
            <button className="btn btn-quiet" disabled={spinning} onClick={() => { if (confirmDiscard("Start a new wheel")) load({ title: "", mode: wheel.mode, entries: ["", ""] }, null, null); }}>New</button>
            <button className="btn btn-quiet" disabled={spinning || !validation.ok}
              onClick={() => { load({ ...wheel, title: `${wheel.title}`.slice(0, LIMITS.maxTitleLength - 7) + " (copy)" }, null, null, "This is an unsaved copy.", true); }}>Duplicate</button>
            <button className="btn btn-quiet" disabled={spinning || entries.length === 0}
              onClick={() => { if (confirm("Remove every entry from this wheel?")) update({ entries: [] }); }}>Clear</button>
            <button className="btn btn-quiet" disabled={!validation.ok}
              onClick={async () => { await navigator.clipboard.writeText(shareUrl); setNotice({ tone: "ok", text: "Share link copied. It contains this wheel's title and entries." }); }}>Copy share link</button>
            {validation.ok ? <Link className="btn btn-quiet" href={stageUrl} target="_blank">Stream view ↗</Link> : <button className="btn btn-quiet" disabled>Stream view ↗</button>}
          </div>
          <p className="text-xs text-mute">
            {dirty ? "Unsaved changes. " : savedId ? "Saved. " : ""}
            {where === "cloud" ? "Wheels you save are stored in your account." : <>Wheels are saved on this device only. <Link href="/signin?next=/wheel" className="link">Sign in</Link> to keep them in your account.</>}
          </p>

          <SavedList saved={saved} where={where} activeId={savedId} disabled={spinning}
            onLoad={(w) => { if (confirmDiscard(`Open “${w.title}”`)) load(w, w.id, where); }}
            onRename={renameSaved} onDuplicate={duplicateSaved} onDelete={removeSaved} />
        </section>
      </div>
    </div>
  );
}

function EntryEditor({ entries, disabled, setEntries }: { entries: string[]; disabled: boolean; setEntries: (fn: (e: string[]) => string[]) => void }) {
  const [add, setAdd] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const room = LIMITS.maxEntries - entries.length;

  function addOne() {
    const t = add.trim();
    if (!t) { setMsg("Type something to add."); return; }
    if (room <= 0) { setMsg(`A wheel can have up to ${LIMITS.maxEntries} entries.`); return; }
    if (charLength(t) > LIMITS.maxEntryLength) { setMsg(`Entries can be up to ${LIMITS.maxEntryLength} characters.`); return; }
    setEntries((e) => [...e, t]); setAdd(""); setMsg(null); addInput.current?.focus();
  }
  function addLines() {
    const lines = parseLines(paste);
    if (!lines.length) { setMsg("Paste at least one line."); return; }
    const tooLong = lines.filter((l) => charLength(l) > LIMITS.maxEntryLength).length;
    const usable = lines.filter((l) => charLength(l) <= LIMITS.maxEntryLength).slice(0, Math.max(0, room));
    setEntries((e) => [...e, ...usable]); setPaste("");
    const skipped = lines.length - usable.length;
    setMsg(skipped ? `Added ${usable.length}. Skipped ${skipped}${tooLong ? ` (${tooLong} too long)` : ""}${lines.length - tooLong > room ? `; the wheel is full at ${LIMITS.maxEntries}` : ""}.` : `Added ${usable.length} ${usable.length === 1 ? "entry" : "entries"}.`);
  }
  const move = (i: number, d: number) => setEntries((e) => { const c = [...e]; const j = i + d; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j], c[i]]; return c; });

  return (
    <div className="glass p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-display font-semibold">Entries</p>
        <p className={`num text-sm ${entries.length < LIMITS.minEntries || entries.length > LIMITS.maxEntries ? "text-danger" : "text-mute"}`}>{entries.length} / {LIMITS.maxEntries}</p>
      </div>
      <ol className="mt-3 flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto pr-1" aria-label="Wheel entries">
        {entries.map((e, i) => {
          const empty = !e.trim(), long = charLength(e.trim()) > LIMITS.maxEntryLength;
          return (
            <li key={i} className="flex items-center gap-1.5">
              <span className="num w-7 shrink-0 text-right text-xs text-mute">{i + 1}</span>
              <input className={`field !min-h-10 flex-1 !py-1.5 ${empty || long ? "!shadow-[inset_0_0_0_2px_var(--color-danger)]" : ""}`} value={e} disabled={disabled}
                aria-label={`Entry ${i + 1}`} aria-invalid={empty || long} maxLength={200}
                onChange={(ev) => setEntries((list) => list.map((x, j) => (j === i ? ev.target.value : x)))} />
              <button className="btn btn-quiet !min-h-10 !px-2.5" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`Move entry ${i + 1} up`}>↑</button>
              <button className="btn btn-quiet !min-h-10 !px-2.5" disabled={disabled || i === entries.length - 1} onClick={() => move(i, 1)} aria-label={`Move entry ${i + 1} down`}>↓</button>
              <button className="btn btn-quiet !min-h-10 !px-2.5" disabled={disabled} onClick={() => setEntries((list) => list.filter((_, j) => j !== i))} aria-label={`Delete entry ${i + 1}`}>✕</button>
            </li>
          );
        })}
      </ol>
      {entries.length < LIMITS.minEntries && <p className="mt-2 text-xs text-danger">Add at least {LIMITS.minEntries} entries to spin.</p>}
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); addOne(); }}>
        <label className="sr-only" htmlFor="wh-add">New entry</label>
        <input id="wh-add" ref={addInput} className="field flex-1" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add an entry" disabled={disabled} maxLength={200} />
        <button className="btn btn-dark" disabled={disabled}>Add</button>
      </form>
      <button className="link mt-3 text-sm" onClick={() => setShowPaste((v) => !v)} aria-expanded={showPaste}>{showPaste ? "Hide list paste" : "Paste a list (one per line)"}</button>
      {showPaste && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="sr-only" htmlFor="wh-paste">Entries, one per line</label>
          <textarea id="wh-paste" className="field min-h-28" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Rick Owens\nBalenciaga\nChrome Hearts"} disabled={disabled} />
          <button className="btn btn-quiet self-start" onClick={addLines} disabled={disabled}>Add lines</button>
        </div>
      )}
      {msg && <p role="status" className="mt-2 text-sm text-mute">{msg}</p>}
    </div>
  );
}

function SavedList({ saved, where, activeId, disabled, onLoad, onRename, onDuplicate, onDelete }: {
  saved: SavedWheel[] | null; where: Where; activeId: string | null; disabled: boolean;
  onLoad: (w: SavedWheel) => void; onRename: (w: SavedWheel) => void; onDuplicate: (w: SavedWheel) => void; onDelete: (w: SavedWheel) => void;
}) {
  return (
    <section className="glass p-5" aria-label="Saved wheels">
      <div className="flex items-baseline justify-between"><p className="font-display font-semibold">Saved wheels</p><p className="text-xs text-mute">{where === "cloud" ? "In your account" : "On this device"}</p></div>
      {saved === null ? <p className="mt-3 text-sm text-mute">Loading…</p> : saved.length === 0 ? <p className="mt-3 text-sm text-mute">No saved wheels yet.</p> : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {saved.map((w) => (
            <li key={w.id} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${w.id === activeId ? "bg-white shadow-[var(--shadow-soft)]" : ""}`}>
              <button className="min-w-0 flex-1 text-left" onClick={() => onLoad(w)} disabled={disabled}>
                <span className="block truncate font-semibold">{w.title}</span>
                <span className="block text-xs text-mute">{MODE_LABEL[w.mode]} · {w.entries.length} entries</span>
              </button>
              <button className="link text-xs" onClick={() => onRename(w)} disabled={disabled}>Rename</button>
              <button className="link text-xs" onClick={() => onDuplicate(w)} disabled={disabled}>Duplicate</button>
              <button className="link text-xs text-danger" onClick={() => onDelete(w)} disabled={disabled}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultPanel({ text, wheel, signedIn, onSpin, spinning }: { text: string; wheel: WheelConfig; signedIn: boolean; onSpin: () => void; spinning: boolean }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [battles, setBattles] = useState<BattleRef[] | null>(null);
  const [target, setTarget] = useState("");
  const [state, setState] = useState<{ tone: "ok" | "error"; text: string; href?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const euro = wheel.mode === "price" ? parseEuroAmount(text) : null;
  const challenge = `${wheel.title || "Wheel"}: ${text}`.slice(0, 100);

  useEffect(() => { setCopied(false); setState(null); }, [text]);
  useEffect(() => {
    if (!open || !signedIn || battles) return;
    api<{ battles: BattleRef[] }>("/api/battles").then((r) => {
      const usable = r.battles.filter((b) => b.status !== "complete" && b.viewer.seats.length > 0);
      setBattles(usable); setTarget(usable[0]?.id ?? "");
    }).catch(() => setBattles([]));
  }, [open, signedIn, battles]);

  async function apply() {
    if (!target) return;
    setBusy(true); setState(null);
    try { await post(`/api/battles/${target}/challenges`, { text: challenge, sourceTitle: "Wheel" }); setState({ tone: "ok", text: "Added as a challenge. Players, judges and the stream view can see it.", href: `/battle/${target}` }); }
    catch (e) { setState({ tone: "error", text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="night pop-in rounded-3xl p-6 text-center md:p-8" data-testid="wheel-result">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Result</p>
      <p className="display mt-3 break-words text-4xl md:text-5xl" data-testid="wheel-result-text">{text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button className="btn btn-accent" onClick={onSpin} disabled={spinning}>Spin again</button>
        <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }}>{copied ? "Copied" : "Copy result"}</button>
        <button className="btn bg-white/10 text-white hover:bg-white/20" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Use in FIT/DUEL</button>
      </div>
      {open && (
        <div className="mt-5 rounded-2xl bg-white p-4 text-left text-sm text-ink">
          <p className="font-semibold">Add as a challenge to a battle</p>
          <p className="mt-0.5 text-xs text-mute">Shown as “{challenge}”. It doesn&rsquo;t change any battle rule: budgets, verified listings and rounds stay enforced.</p>
          {!signedIn ? <p className="mt-2"><Link href="/signin?next=/wheel" className="link">Sign in</Link> to add challenges to your battles.</p>
            : battles === null ? <p className="mt-2 text-mute">Loading your battles…</p>
            : battles.length === 0 ? <p className="mt-2 text-mute">You have no battle in progress.</p>
            : (
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="sr-only" htmlFor="wh-battle">Battle</label>
                <select id="wh-battle" className="field !min-h-10 flex-1" value={target} onChange={(e) => setTarget(e.target.value)}>
                  {battles.map((b) => <option key={b.id} value={b.id}>{b.seats.map((s) => s?.name ?? "…").join(" vs ")} · {b.status}</option>)}
                </select>
                <button className="btn btn-dark !min-h-10" disabled={busy || !target} onClick={apply}>{busy ? <Spinner /> : null}Add challenge</button>
              </div>
            )}
          {state && <p role="status" className={`mt-2 ${state.tone === "error" ? "text-danger" : "text-ok"}`}>{state.text} {state.href && <Link className="link" href={state.href}>Open battle</Link>}</p>}
          <div className="mt-4 border-t border-line pt-3">
            <p className="font-semibold">Start a new battle with it</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {euro !== null
                ? <Link className="btn btn-quiet !min-h-10" href={`/play?budget=${euro / 100}`}>Budget of {fmt(euro)}</Link>
                : wheel.mode === "price" && <span className="text-xs text-mute">This result isn&rsquo;t a euro amount, so it can&rsquo;t be used as a budget. Battles use euros.</span>}
              <Link className="btn btn-quiet !min-h-10" href={`/play?theme=custom&customTheme=${encodeURIComponent(challenge.slice(0, 80))}`}>As the battle theme</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
