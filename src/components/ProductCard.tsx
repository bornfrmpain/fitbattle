"use client";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/products/types";
import { CONDITION_LABEL } from "@/lib/categories";
import { fmt } from "@/lib/battle/rules";
import { Spinner } from "./ui";

/**
 * The one place product photos are drawn. It only shows this product's own stored photos
 * (images[], main first). If one fails it tries the listing's next photo, then asks the
 * server for an authorized refresh, then shows an error. Never a substitute image.
 */
export function ProductImage({ product, className = "", refreshUrl, compact, eager }: {
  product: Product; className?: string; refreshUrl?: string; compact?: boolean; eager?: boolean;
}) {
  const initial = product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : [];
  const [urls, setUrls] = useState(initial);
  const [idx, setIdx] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const refreshed = useRef(false);
  const handled = useRef(new Set<string>()); // srcs whose load/error was already handled
  const key = initial.join("|");
  const prevKey = useRef(key);
  // Reset only when the photos change; resetting on mount would hide an image that already loaded.
  useEffect(() => {
    if (prevKey.current === key) return;
    prevKey.current = key;
    setUrls(initial); setIdx(0); setState("loading"); refreshed.current = false; handled.current.clear();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!urls.length || state === "error") {
    const msg = urls.length ? "Photo unavailable" : "No listing photo";
    return (
      <div role="img" aria-label={`${msg}: ${product.title}`} className={`flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-white to-mist p-3 text-center ${className}`}>
        <span className={`font-semibold text-mute ${compact ? "text-[10px] leading-tight" : "text-sm"}`}>{msg}</span>
        {!compact && urls.length > 0 && <span className="text-xs text-mute/80">The listing&rsquo;s photos can&rsquo;t be reached right now.</span>}
      </div>
    );
  }

  async function onError() {
    if (idx + 1 < urls.length) { setIdx(idx + 1); return; }
    if (refreshUrl && !refreshed.current) {
      refreshed.current = true;
      try {
        const r = await fetch(refreshUrl, { method: "POST" }).then((x) => x.json());
        if (r.refreshed && Array.isArray(r.images) && r.images.length) { handled.current.clear(); setUrls(r.images); setIdx(0); setState("loading"); return; }
      } catch { /* fall through */ }
    }
    setState("error");
  }

  // The browser may finish (or fail) loading a server-rendered <img> before React attaches
  // onLoad/onError. Check on attach so a dead photo still falls back instead of hanging.
  const imgRef = (el: HTMLImageElement | null) => {
    if (!el || state !== "loading" || !el.complete || handled.current.has(el.src)) return;
    handled.current.add(el.src);
    if (el.naturalWidth > 0) setState("ok"); else void onError();
  };

  return (
    <span className={`relative block h-full w-full bg-gradient-to-b from-white to-[#f3f1f8] ${className}`}>
      {state === "loading" && <span aria-hidden className="skeleton absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} key={urls[idx]} src={urls[idx]} alt={product.title} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
        onLoad={(e) => { handled.current.add(e.currentTarget.src); setState("ok"); }} onError={(e) => { if (handled.current.has(e.currentTarget.src)) return; handled.current.add(e.currentTarget.src); void onError(); }}
        className={`relative h-full w-full object-contain transition-opacity duration-500 ${state === "ok" ? "opacity-100" : "opacity-0"}`} />
    </span>
  );
}

export function SourceBadge({ source }: { source: Product["source"] }) {
  const verified = source === "feed";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${verified ? "bg-white/90 text-ok" : "bg-white/90 text-mute"}`}>
      {verified ? <>✓ Verified listing</> : source === "manual" ? "Unverified (legacy)" : "Old demo item"}
    </span>
  );
}

export function PriceTag({ cents, className = "", label }: { cents: number; className?: string; label?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-lg bg-white/90 px-2 py-1 font-display text-sm font-semibold num shadow-sm backdrop-blur ${className}`}>
      {fmt(cents)}{label && <span className="font-sans text-[10px] font-medium text-mute">{label}</span>}
    </span>
  );
}

export function ProductCard({ product, onSelect, selectLabel = "Lock in", disabled, disabledReason, busy }: {
  product: Product; onSelect?: (p: Product) => void; selectLabel?: string; disabled?: boolean; disabledReason?: string; busy?: boolean;
}) {
  return (
    <article className={`group card flex flex-col overflow-hidden ${disabled && !busy ? "opacity-55" : "lift"}`}>
      <div className="relative aspect-[4/5] overflow-hidden">
        <ProductImage product={product} className="transition-transform duration-700 group-hover:scale-[1.02]" />
        <div className="absolute left-2.5 top-2.5"><SourceBadge source={product.source} /></div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="eyebrow !text-ink truncate">{product.brand ?? "No designer listed"}</p>
        <p className="line-clamp-2 text-sm text-mute min-h-[2.5rem]">{product.title}</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-display text-lg font-semibold num">{fmt(product.priceCents)}</span>
          <span className="text-xs text-mute">{product.size ? `Size ${product.size}` : "Size not listed"}</span>
        </div>
        {product.condition && <p className="text-xs text-mute">{CONDITION_LABEL[product.condition]}</p>}
        <div className="mt-auto flex gap-2 pt-3">
          {onSelect && (
            <button className="btn btn-dark flex-1 !min-h-10 text-sm" disabled={disabled || busy} onClick={() => onSelect(product)} title={disabledReason}>
              {busy ? <><Spinner /> Locking in</> : selectLabel}
            </button>
          )}
          {product.listingUrl && <a href={product.listingUrl} target="_blank" rel="noopener noreferrer" className="btn btn-quiet !min-h-10 !px-3 text-sm" aria-label={`View ${product.title} on Grailed`}>Grailed ↗</a>}
        </div>
        {disabled && disabledReason && <p className="text-xs font-semibold text-danger pt-1">{disabledReason}</p>}
      </div>
    </article>
  );
}
