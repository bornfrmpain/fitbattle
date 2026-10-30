"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONDITIONS, CONDITION_LABEL, grailedSearchUrl, SLOT_LABEL, SLOT_PLURAL, SLOTS, SUBCATEGORIES, slotLabel, subcategoriesForSlot, type Slot, type Subcategory,
} from "@/lib/categories";
import { fmt } from "@/lib/battle/rules";
import type { Product, SearchResult } from "@/lib/products/types";
import { api, post } from "@/lib/client";
import { ProductCard, ProductImage, SourceBadge } from "./ProductCard";
import { EmptyState, Notice, Spinner } from "./ui";

type Resolve =
  | { status: "invalid_url"; code: string; message: string }
  | { status: "found"; listing: { id: string; url: string }; product: Product; rejected: { url: string; reason: string }[] }
  | { status: "no_source" | "not_found" | "source_error"; listing: { id: string; url: string }; message: string };

const FAIL_TITLE: Record<string, string> = {
  invalid_url: "That link can't be used",
  no_source: "This listing can't be imported yet",
  not_found: "Listing not available",
  source_error: "Couldn't reach the listing source",
};

export function PieceFinder({ slot: lockedSlot, initialSlot, onSelect, remainingCents, busyId, disabled }: {
  slot?: Slot; initialSlot?: Slot; onSelect?: (p: Product) => Promise<void> | void;
  remainingCents?: number | null; busyId?: string | null; theme?: string; disabled?: boolean;
}) {
  const [slot, setSlot] = useState<Slot | "">(lockedSlot ?? initialSlot ?? "");
  const [sub, setSub] = useState<Subcategory | "">("");
  const [q, setQ] = useState("");
  const [f, setF] = useState({ brand: "", min: "", max: "", size: "", condition: "", sort: "relevance" });
  const [hideOver, setHideOver] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [data, setData] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  const effectiveMax = useMemo(() => {
    const typed = f.max ? Math.round(Number(f.max) * 100) : undefined;
    if (hideOver && remainingCents != null) return typed === undefined ? remainingCents : Math.min(typed, remainingCents);
    return typed;
  }, [f.max, hideOver, remainingCents]);

  const reqId = useRef(0);
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      const p = new URLSearchParams();
      if (slot) p.set("slot", slot);
      if (sub) p.set("sub", sub);
      if (q) p.set("q", q);
      if (f.brand) p.set("brand", f.brand);
      if (f.min) p.set("min", f.min);
      if (effectiveMax !== undefined) p.set("max", String(effectiveMax / 100));
      if (f.size) p.set("size", f.size);
      if (f.condition) p.set("condition", f.condition);
      if (f.sort !== "relevance") p.set("sort", f.sort);
      setLoading(true);
      try {
        const r = await api<SearchResult>(`/api/products/search?${p}`);
        if (id === reqId.current) { setData(r); setError(null); }
      } catch (e) { if (id === reqId.current) setError((e as Error).message); }
      finally { if (id === reqId.current) setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [slot, sub, q, f, effectiveMax, retry]);

  const subs = slot ? subcategoriesForSlot(slot) : [];
  const grailedLink = grailedSearchUrl({ query: [f.brand, q].filter(Boolean).join(" "), slot: slot || undefined, subcategory: sub || undefined });
  const activeFilters = [f.brand, f.min, f.max, f.size, f.condition].filter(Boolean).length;
  const searchable = !!data?.liveSource;

  return (
    <section aria-label="Find pieces" className="flex flex-col gap-5">
      <ImportBar slot={lockedSlot} onSelect={onSelect} disabled={disabled} remainingCents={remainingCents} />

      {!lockedSlot && !searchable && data && (
        <div className="seg self-start" role="tablist" aria-label="Category">
          {(["", ...SLOTS] as const).map((s) => (
            <button key={s || "all"} role="tab" aria-selected={slot === s} onClick={() => { setSlot(s); setSub(""); }}>{s ? SLOT_LABEL[s] : "All"}</button>
          ))}
        </div>
      )}
      {searchable && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <svg aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <label className="sr-only" htmlFor="pf-q">Search the connected source</label>
              <input id="pf-q" className="field !pl-10" placeholder="Search designer, item or style" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn btn-quiet" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>Filters{activeFilters ? ` · ${activeFilters}` : ""}</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!lockedSlot && (
              <div className="seg" role="tablist" aria-label="Category">
                {(["", ...SLOTS] as const).map((s) => (
                  <button key={s || "all"} role="tab" aria-selected={slot === s} onClick={() => { setSlot(s); setSub(""); }}>{s ? SLOT_LABEL[s] : "All"}</button>
                ))}
              </div>
            )}
            {subs.length > 0 && (
              <div className="seg" aria-label="Type">
                <button aria-pressed={sub === ""} onClick={() => setSub("")}>All {slot ? SLOT_PLURAL[slot] : ""}</button>
                {subs.map((s) => <button key={s} aria-pressed={sub === s} onClick={() => setSub(s)}>{SUBCATEGORIES[s].label}</button>)}
              </div>
            )}
          </div>
          {showFilters && (
            <div className="glass grid grid-cols-2 gap-3 p-4 md:grid-cols-6">
              <div className="col-span-2"><label className="label" htmlFor="f-brand">Designer</label><input id="f-brand" className="field" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} placeholder="Any" /></div>
              <div><label className="label" htmlFor="f-min">Min €</label><input id="f-min" className="field num" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value.replace(/[^\d.]/g, "") })} /></div>
              <div><label className="label" htmlFor="f-max">Max €</label><input id="f-max" className="field num" inputMode="decimal" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value.replace(/[^\d.]/g, "") })} /></div>
              <div><label className="label" htmlFor="f-size">Size</label><input id="f-size" className="field" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} placeholder="M, 32, 43" /></div>
              <div><label className="label" htmlFor="f-cond">Condition</label>
                <select id="f-cond" className="field" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })}>
                  <option value="">Any</option>{CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
                </select></div>
              <div className="col-span-2"><label className="label" htmlFor="f-sort">Sort</label>
                <select id="f-sort" className="field" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
                  <option value="relevance">Best match</option><option value="price_asc">Price, low to high</option><option value="price_desc">Price, high to low</option>
                </select></div>
              {remainingCents != null && (
                <label className="col-span-2 md:col-span-3 flex items-center gap-2 text-sm text-mute self-end pb-3">
                  <input type="checkbox" checked={hideOver} onChange={(e) => setHideOver(e.target.checked)} className="h-4 w-4 accent-[var(--brand-p1)]" />
                  Hide pieces over my remaining {fmt(remainingCents)}
                </label>
              )}
              <button className="link text-sm self-end pb-3 justify-self-start" onClick={() => setF({ brand: "", min: "", max: "", size: "", condition: "", sort: "relevance" })}>Clear filters</button>
            </div>
          )}
        </div>
      )}

      {data?.notice && <Notice tone="error" title="Source unavailable">{data.notice}</Notice>}

      {error ? (
        <Notice tone="error" title="Search failed">{error} <button className="link" onClick={() => setRetry((r) => r + 1)}>Try again</button></Notice>
      ) : loading && !data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => <div key={i} className="card overflow-hidden"><div className="skeleton aspect-[4/5]" /><div className="space-y-2 p-4"><div className="skeleton h-3 w-1/2 rounded" /><div className="skeleton h-3 w-3/4 rounded" /></div></div>)}
        </div>
      ) : data && data.items.length === 0 ? (
        searchable ? (
          <EmptyState title="Nothing matches" actions={<button className="btn btn-quiet" onClick={() => { setQ(""); setSub(""); setF({ brand: "", min: "", max: "", size: "", condition: "", sort: "relevance" }); }}>Clear search and filters</button>}>
            No verified {slot ? SLOT_PLURAL[slot] : "pieces"} match{remainingCents != null && hideOver ? ` within your remaining ${fmt(remainingCents)}` : ""}. Loosen a filter or paste a listing link above.
          </EmptyState>
        ) : (
          <EmptyState title="No items yet"
            actions={<a className="btn btn-quiet" href={grailedLink} target="_blank" rel="noopener noreferrer">Find {slot ? SLOT_PLURAL[slot] : "pieces"} on Grailed ↗</a>}>
            <p className="font-medium text-ink">Paste a Grailed listing URL to add your first piece.</p>
            <p className="mt-1">No searchable Grailed source is connected, so nothing is listed here. No placeholder products are shown.</p>
          </EmptyState>
        )
      ) : (
        <>
          <p className="text-sm text-mute" aria-live="polite">{loading ? "Updating…" : `${data?.total ?? 0} verified ${data?.total === 1 ? "piece" : "pieces"}`}</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {data?.items.map((p) => {
              const over = remainingCents != null && p.priceCents > remainingCents;
              const wrong = !!lockedSlot && p.slot !== lockedSlot;
              return (
                <ProductCard key={p.id} product={p} busy={busyId === p.id}
                  onSelect={onSelect ? (x) => onSelect(x) : undefined}
                  disabled={disabled || over || wrong || (!!busyId && busyId !== p.id)}
                  disabledReason={over ? `${fmt(p.priceCents - (remainingCents ?? 0))} over your budget` : wrong ? `Listed as ${slotLabel(p.slot).toLowerCase()}` : undefined} />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function ImportBar({ slot, onSelect, disabled, remainingCents }: { slot?: Slot; onSelect?: (p: Product) => Promise<void> | void; disabled?: boolean; remainingCents?: number | null }) {
  const [url, setUrl] = useState("");
  const [res, setRes] = useState<Resolve | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function lookup(value = url) {
    const v = value.trim();
    if (!v) return;
    setLoading(true); setRes(null); setErr(null);
    try { setRes(await post<Resolve>("/api/products/resolve", { url: v })); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }

  const p = res?.status === "found" ? res.product : null;
  const wrong = p && slot && p.slot !== slot;
  const over = p && remainingCents != null && p.priceCents > remainingCents;
  return (
    <div className="glass chrome-edge relative p-4 md:p-5">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
        <label className="sr-only" htmlFor="imp-url">Grailed listing URL</label>
        <input id="imp-url" className="field !min-h-12 flex-1" value={url} inputMode="url" autoComplete="off" spellCheck={false}
          placeholder="Paste a Grailed listing URL" onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            // Replace the field instead of inserting into it, so two links never get glued together.
            e.preventDefault();
            const v = e.clipboardData.getData("text").trim();
            setUrl(v); lookup(v);
          }} />
        <button className="btn btn-dark !min-h-12 !px-6" disabled={loading || !url.trim()}>{loading ? <><Spinner /> Importing</> : "Import"}</button>
      </form>

      {loading && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[9rem_1fr]" aria-live="polite" aria-busy="true">
          <div className="skeleton aspect-[4/5] rounded-xl" />
          <div className="space-y-3 py-1"><p className="text-sm text-mute">Retrieving listing from the connected source…</p><div className="skeleton h-3 w-1/3 rounded" /><div className="skeleton h-4 w-2/3 rounded" /><div className="skeleton h-6 w-24 rounded" /></div>
        </div>
      )}
      {err && <div className="mt-4"><Notice tone="error" title="Import failed">{err}</Notice></div>}

      {res && res.status !== "found" && (
        <div className="mt-4">
          <Notice tone={res.status === "invalid_url" || res.status === "source_error" ? "error" : "info"} title={FAIL_TITLE[res.status]}>
            {res.status !== "invalid_url" && <p className="mb-1 text-ink">✓ Valid Grailed listing link <span className="text-mute">· listing {res.listing.id}</span></p>}
            <p>{res.message}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {res.status === "source_error" && <button className="link" onClick={() => lookup()}>Try again</button>}
              {res.status !== "invalid_url" && <a className="link" href={res.listing.url} target="_blank" rel="noopener noreferrer">Open the listing on Grailed ↗</a>}
            </div>
          </Notice>
        </div>
      )}

      {p && (
        <div className="pop-in mt-4 grid gap-5 sm:grid-cols-[minmax(0,13rem)_1fr]">
          <div className="flex flex-col gap-2">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-white shadow-sm">
              <ProductImage product={p} />
              {p.images.length > 0 && <span className="absolute left-2 top-2 rounded-md bg-night/85 px-1.5 py-0.5 text-[11px] font-semibold text-white">Main photo</span>}
            </div>
            {p.images.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto" aria-label="Other listing photos">
                {p.images.slice(1).map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" referrerPolicy="no-referrer" className="h-14 w-12 shrink-0 rounded-lg bg-white object-contain shadow-sm" />
                ))}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="self-start"><SourceBadge source="feed" /></span>
            <p className="eyebrow !text-ink mt-1">{p.brand ?? "No designer listed"}</p>
            <p className="text-lg font-medium leading-snug">{p.title}</p>
            <p className="mt-1"><span className="font-display text-3xl font-semibold num">{fmt(p.priceCents)}</span> <span className="text-sm text-mute">listed price, from the source</span></p>
            <p className="text-sm text-mute">{[p.size && `Size ${p.size}`, p.condition && CONDITION_LABEL[p.condition], slotLabel(p.slot)].filter(Boolean).join(" · ")}</p>
            {p.imageSelection && <p className="text-xs text-mute">{p.imageSelection.note}</p>}
            {p.available === false && <p className="text-sm font-semibold text-danger">This listing is marked sold.</p>}
            {wrong && <p className="text-sm font-semibold text-danger">This is {slotLabel(p.slot).toLowerCase()}; this round needs {SLOT_LABEL[slot!].toLowerCase()}.</p>}
            {over && <p className="text-sm font-semibold text-danger">{fmt(p.priceCents - (remainingCents ?? 0))} over your remaining budget.</p>}
            {onSelect && (
              <div className="mt-auto flex gap-2 pt-3">
                <button className="btn btn-accent" disabled={disabled || busy || !!wrong || !!over || p.available === false}
                  onClick={async () => { setBusy(true); try { await onSelect(p); } finally { setBusy(false); } }}>{busy ? <><Spinner /> Locking in</> : "Lock in this piece"}</button>
                <button className="btn btn-quiet" onClick={() => { setRes(null); setUrl(""); }}>Clear</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
