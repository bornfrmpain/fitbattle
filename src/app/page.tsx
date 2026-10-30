import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { getBrand } from "@/lib/brand";
import { SLOT_LABEL, SLOTS, SUBCATEGORIES, subcategoriesForSlot } from "@/lib/categories";
import { db } from "@/lib/db";
import { liveDataConfigured, searchProducts } from "@/lib/products";
import { normalizeProduct, type Product } from "@/lib/products/types";

export const dynamic = "force-dynamic";

async function featured(): Promise<Product[]> {
  if (liveDataConfigured()) {
    const r = await searchProducts({ limit: 8 }).catch(() => null);
    if (r?.items.length) return r.items;
  }
  const rows = db().prepare("SELECT snapshot_json FROM outfit_items WHERE source = 'feed' ORDER BY locked_at DESC LIMIT 8").all() as { snapshot_json: string }[];
  return rows.map((r) => normalizeProduct(JSON.parse(r.snapshot_json)));
}

/** Composition made of the real battle UI elements; no garments, no prices. */
function ArenaPreview() {
  const side = (name: string, seat: 0 | 1, active: boolean, pct: number) => (
    <div className={`rounded-2xl p-3 ${active ? "bg-white shadow-[var(--shadow-soft)]" : "opacity-70"}`}>
      <div className={`flex items-center gap-2.5 ${seat ? "flex-row-reverse text-right" : ""}`}>
        <span className="grid h-9 w-9 place-items-center rounded-full font-display text-xs font-bold text-white" style={{ background: seat ? "var(--brand-p2)" : "var(--brand-p1)" }}>{name[0]}</span>
        <div><p className="font-display text-sm font-semibold">{name}</p><p className="text-[11px] font-semibold" style={{ color: active ? "var(--brand-p1)" : "var(--color-mute)" }}>{active ? "On the clock" : "2 of 4 locked"}</p></div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-mist"><div className={`h-full rounded-full ${seat ? "ml-auto" : ""}`} style={{ width: `${pct}%`, background: seat ? "var(--brand-p2)" : "var(--brand-p1)" }} /></div>
    </div>
  );
  return (
    <div aria-hidden className="glass chrome-edge rise relative p-4 md:p-5" style={{ animationDelay: ".15s" }}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {side("You", 0, true, 46)}
        <div className="flex flex-col items-center gap-1">
          <p className="eyebrow !text-[10px]">Round 3 / 4</p>
          <div className="night relative grid h-24 w-24 place-items-center rounded-full">
            <svg width="96" height="96" className="absolute inset-0 -rotate-90"><circle cx="48" cy="48" r="41" fill="none" stroke="#ffffff1a" strokeWidth="4" />
              <circle cx="48" cy="48" r="41" fill="none" stroke="url(#hp)" strokeWidth="4" strokeLinecap="round" strokeDasharray="257.6" strokeDashoffset="90" />
              <defs><linearGradient id="hp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--brand-p1)" /><stop offset="1" stopColor="var(--brand-p2)" /></linearGradient></defs></svg>
            <span className="relative font-display text-xl font-semibold num">0:42</span>
          </div>
          <p className="font-display text-xs font-semibold">Shoes</p>
        </div>
        {side("Chat", 1, false, 62)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[0, 1].map((s) => (
          <div key={s} className="grid grid-cols-4 gap-1.5">
            {SLOTS.map((slot, i) => (
              <div key={slot} className={`aspect-[4/5] rounded-lg ${i < 2 ? "bg-gradient-to-b from-white to-mist shadow-[var(--shadow-soft)]" : "bg-mist/70"} flex items-end p-1`}>
                <span className="text-[9px] font-semibold text-mute">{SLOT_LABEL[slot]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Home() {
  const [items, brand] = [await featured(), getBrand()];
  return (
    <>
      <section className="mx-auto grid max-w-[1440px] items-center gap-12 px-4 pt-14 pb-16 md:px-8 md:pt-20 lg:grid-cols-[1.15fr_1fr]">
        <div className="rise">
          <p className="eyebrow">{brand.streamerName ? `Live with ${brand.streamerHandle ?? brand.streamerName} · ` : ""}1v1 outfit battles · real Grailed pieces</p>
          <h1 className="display mt-5 text-[13vw] leading-[0.92] sm:text-7xl xl:text-8xl">
            Build your fit.<br /><span style={{ background: "linear-gradient(100deg, var(--brand-p1), var(--brand-p2))", WebkitBackgroundClip: "text", color: "transparent" }}>Beat your opponent.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-mute">Find real Grailed pieces. Build your outfit. Beat your opponent. Every price is the listing&rsquo;s real price, locked the moment you pick it.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/play" className="btn btn-dark !min-h-12 !px-6">Start a battle</Link>
            <Link href="/browse" className="btn btn-quiet !min-h-12 !px-6">Browse clothing</Link>
          </div>
        </div>
        <ArenaPreview />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-20 md:px-8" aria-labelledby="how-h">
        <p className="eyebrow">How it works</p>
        <h2 id="how-h" className="display mt-2 text-4xl md:text-5xl">Three moves to a winner</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["Set the rules", "Budget, a per-pick timer from 15 seconds to none, the four categories and a theme. Invite a friend or open it to chat."],
            ["Find pieces before time runs out", "Each round names a category. Paste a Grailed listing link and its verified price and photos import. The clock runs on the server, so refreshing buys no time."],
            ["Reveal and vote", "Both fits land side by side with every locked price. Try them on with AI, then viewers pick the winner."],
          ].map(([t, d], i) => (
            <li key={t} className="glass p-6 md:p-7">
              <p className="font-display text-sm font-semibold text-accent num">0{i + 1}</p>
              <h3 className="mt-4 font-display text-xl font-semibold tracking-tight">{t}</h3>
              <p className="mt-2 text-mute">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-20 md:px-8" aria-labelledby="cat-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="eyebrow">The four rounds</p><h2 id="cat-h" className="display mt-2 text-4xl md:text-5xl">Categories</h2></div>
          <Link href="/browse" className="link text-sm">Browse clothing</Link>
        </div>
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SLOTS.map((slot, i) => (
            <li key={slot}>
              <Link href={`/browse?slot=${slot}`} className="glass lift flex h-full flex-col p-6">
                <span className="font-display text-sm font-semibold text-mute num">0{i + 1}</span>
                <span className="mt-10 font-display text-2xl font-semibold tracking-tight">{SLOT_LABEL[slot]}</span>
                <span className="mt-2 text-sm text-mute">{subcategoriesForSlot(slot).map((s) => SUBCATEGORIES[s].label).join(", ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-20 md:px-8" aria-labelledby="feat-h">
        <p className="eyebrow">Verified listings</p>
        <h2 id="feat-h" className="display mt-2 text-4xl md:text-5xl">Picked in battles</h2>
        {items.length ? (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">{items.map((p, i) => <ProductCard key={`${p.id}-${i}`} product={p} />)}</div>
        ) : (
          <p className="mt-4 max-w-prose text-mute">Nothing yet. Pieces appear here once verified Grailed listings are locked into battles. This space is never filled with placeholder products.</p>
        )}
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-24 md:px-8">
        <div className="night relative overflow-hidden rounded-[28px] px-6 py-14 md:px-14 md:py-20">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full opacity-50 blur-3xl" style={{ background: "var(--brand-p1)" }} />
          <div className="relative flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <h2 className="display text-5xl md:text-7xl">Your move.</h2>
            <div className="flex flex-wrap gap-3">
              <Link href="/play" className="btn btn-accent !min-h-12 !px-6">Start a battle</Link>
              <Link href="/join" className="btn !min-h-12 !px-6 bg-white/10 text-white hover:bg-white/20">Join with a code</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
