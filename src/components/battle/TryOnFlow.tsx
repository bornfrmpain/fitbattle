"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BattleView } from "@/lib/battle/repo";
import type { OutfitItem } from "@/lib/battle/types";
import { slotLabel } from "@/lib/categories";
import { api, post } from "@/lib/client";
import type { JobView } from "@/lib/tryon/view";
import { SUPPORT_LABEL, supportFor } from "@/lib/tryon/support";
import { ProductImage } from "../ProductCard";
import { Notice, Spinner } from "../ui";

export interface TryOnCaps { configured: boolean; extras: boolean; pricing: { fashnPerGarmentUsd: number; editPerImageUsd: number } }

/** Try-on jobs this viewer may see for a battle. */
export function useTryOns(battleId: string) {
  const [data, setData] = useState<(TryOnCaps & { jobs: JobView[] }) | null>(null);
  const reload = useCallback(() => api<TryOnCaps & { jobs: JobView[] }>(`/api/battles/${battleId}/tryons`).then(setData).catch(() => {}), [battleId]);
  useEffect(() => { reload(); }, [reload]);
  return { data, reload };
}

type Step = "photo" | "confirm" | "generating" | "result";
const MAX = 8 * 1024 * 1024;

export function TryOnFlow({ view, seat, caps, open, onClose, onChange }: {
  view: BattleView; seat: 0 | 1; caps: TryOnCaps; open: boolean; onClose: () => void; onChange: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const items = view.items.filter((i) => i.seat === seat);
  const [step, setStep] = useState<Step>("photo");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [include, setInclude] = useState<string[]>(() => items.filter((i) => supportFor(i, caps.extras).method !== "none").map((i) => i.outfitItemId));
  const [consent, setConsent] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "opponent" | "public">("private");
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(0);
  const [, setTick] = useState(0);
  const live = caps.configured;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (step !== "generating" || !job) return;
    const t = setInterval(async () => {
      setTick((x) => x + 1);
      try {
        const r = await api<{ job: JobView }>(`/api/tryon/jobs/${job.id}`);
        setJob(r.job);
        if (r.job.status === "done" || r.job.status === "failed") { setStep("result"); onChange(); }
      } catch { /* keep polling; the job runs on the server */ }
    }, 1500);
    return () => clearInterval(t);
  }, [step, job, onChange]);

  function choose(f: File | null) {
    setError(null); setWarn(null);
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return setError("Use a JPEG, PNG or WebP photo.");
    if (f.size > MAX) return setError(`That photo is ${(f.size / 1048576).toFixed(1)} MB. The limit is 8 MB.`);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      if (img.naturalHeight < 768) setWarn("This photo is small. Results look better at 768 px tall or more.");
      else if (img.naturalWidth > img.naturalHeight) setWarn("A portrait, full-body photo works best.");
    };
    img.src = url;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(url); setPhotoId(null);
  }

  async function generate(seed?: number) {
    setError(null); setBusy(true);
    try {
      let pid = photoId;
      if (!pid) {
        if (!file) throw new Error("Choose a photo first.");
        const fd = new FormData();
        fd.set("battleId", view.id); fd.set("seat", String(seat)); fd.set("consent", consent ? "yes" : "no"); fd.set("photo", file);
        pid = (await api<{ id: string }>("/api/tryon/photos", { method: "POST", body: fd })).id;
        setPhotoId(pid);
      }
      const r = await post<{ id: string }>("/api/tryon/jobs", { photoId: pid, itemIds: include, visibility, seed });
      setJob((await api<{ job: JobView }>(`/api/tryon/jobs/${r.id}`)).job); setStarted(Date.now()); setStep("generating"); onChange();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function deletePhoto() {
    if (!photoId || !confirm("Delete your photo and every result made from it?")) return;
    await api(`/api/tryon/photos/${photoId}`, { method: "DELETE" }).catch(() => {});
    setPhotoId(null); setJob(null); setFile(null); setPreview(null); setStep("photo"); onChange();
  }

  const included = items.filter((i) => include.includes(i.outfitItemId));
  const fashnCount = included.filter((i) => supportFor(i, caps.extras).method === "fashn").length;
  const editCount = included.some((i) => supportFor(i, caps.extras).method === "edit") ? 1 : 0;
  const estimate = fashnCount * caps.pricing.fashnPerGarmentUsd + editCount * caps.pricing.editPerImageUsd;
  const steps: Step[] = ["photo", "confirm", "generating", "result"];
  const labels: Record<Step, string> = { photo: "Photo", confirm: "Pieces", generating: "Generate", result: "Result" };

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="tryon-title"
      className="m-auto w-[min(1180px,96vw)] max-h-[94dvh] overflow-hidden rounded-3xl bg-pearl p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-night/55 backdrop:backdrop-blur-md">
      <div className="flex max-h-[94dvh] flex-col">
        <header className="flex flex-wrap items-center gap-4 border-b border-line bg-white/70 px-5 py-4 backdrop-blur md:px-8">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Virtual try-on {live ? "" : "· preview"}</p>
            <h2 id="tryon-title" className="display text-2xl md:text-3xl">Try on your fit</h2>
          </div>
          {live && (
            <ol className="seg hidden md:inline-flex" aria-label="Steps">
              {steps.map((s, i) => <li key={s} data-on={s === step} aria-current={s === step ? "step" : undefined}>{i + 1}. {labels[s]}</li>)}
            </ol>
          )}
          <button className="btn btn-quiet !min-h-10" onClick={onClose}>Close</button>
        </header>

        <div className="overflow-y-auto p-5 md:p-8">
          {!live ? (
            <div className="flex flex-col gap-6">
              <Notice title="Virtual try-on isn't connected yet">
                This server has no try-on service configured, so nothing can be uploaded or generated. This is a preview of how it will work: your photo, the
                real pieces from your outfit, and the generated image, always shown separately. The operator enables it by adding a fal.ai key (<code>FAL_KEY</code>).
              </Notice>
              <div className="grid gap-4 md:grid-cols-[1fr_1.2fr_1fr]">
                <Panel title="1 · Your photo" hint="Full body, facing the camera">
                  <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl bg-mist/80 p-6 text-center text-sm text-mute">
                    <span className="font-semibold text-ink">Upload unavailable</span>JPEG, PNG or WebP up to 8 MB, once try-on is connected.
                  </div>
                </Panel>
                <Panel title="2 · Pieces to try on" hint="The real listing photos are what the model receives">
                  <PieceList items={items} extras={caps.extras} include={include} onToggle={() => {}} readOnly />
                </Panel>
                <Panel title="3 · Generated outfit" hint="An AI visualization, never a fitting">
                  <div className="flex aspect-[3/4] items-center justify-center rounded-2xl bg-gradient-to-br from-white to-mist p-6 text-center text-sm text-mute">
                    Nothing generated. No AI image exists for this outfit.
                  </div>
                </Panel>
              </div>
            </div>
          ) : step === "photo" ? (
            <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
              <label className={`relative flex aspect-[3/4] max-h-[62dvh] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl bg-white text-center shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-lift)] ${preview ? "" : "chrome-edge"}`}>
                {preview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={preview} alt="Your selected photo" className="h-full w-full object-cover" />
                  : <span className="p-6"><span className="block font-display text-lg font-semibold">Choose a photo</span><span className="mt-1 block text-sm text-mute">JPEG, PNG or WebP, up to 8 MB</span></span>}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => choose(e.target.files?.[0] ?? null)} aria-label="Choose a full-body photo" />
              </label>
              <div className="flex flex-col gap-4">
                <h3 className="font-display text-xl font-semibold">A photo of the person wearing this fit</h3>
                <ul className="space-y-2 text-mute">
                  <li>Full body, head to feet, facing the camera.</li>
                  <li>One person, a simple pose, arms slightly away from the body.</li>
                  <li>Good, even light. Fitted clothes in the photo work better than bulky ones.</li>
                </ul>
                {warn && <Notice title="Heads up">{warn}</Notice>}
                {error && <Notice tone="error" title="Can't use that photo">{error}</Notice>}
                <div className="mt-auto"><button className="btn btn-dark" disabled={!file} onClick={() => setStep("confirm")}>Continue</button></div>
              </div>
            </div>
          ) : step === "confirm" ? (
            <div className="grid gap-6 md:grid-cols-[0.9fr_1.4fr]">
              <div className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {preview && <img src={preview} alt="Your photo" className="aspect-[3/4] w-full max-h-[50dvh] rounded-3xl object-cover shadow-[var(--shadow-soft)]" />}
                <button className="link self-start text-sm" onClick={() => setStep("photo")}>Change photo</button>
              </div>
              <div className="flex flex-col gap-4">
                <h3 className="font-display text-xl font-semibold">These listing photos go to the model</h3>
                <PieceList items={items} extras={caps.extras} include={include}
                  onToggle={(id) => setInclude((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))} />
                <p className="text-xs text-mute">Tops and bottoms use FASHN, a dedicated try-on model. Shoes and misc pieces are added afterwards by a general image editor, which follows the photo less closely. Estimated cost: about ${estimate.toFixed(2)} on the operator&rsquo;s fal.ai account.</p>
                <div className="card flex flex-col gap-3 p-4">
                  <p className="text-sm text-mute">Your photo is stored privately on this server and sent to fal.ai with the product photos to make the image. It&rsquo;s never public unless you choose so below, and you can delete it any time.</p>
                  <label className="flex gap-3 text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--brand-p1)]" />
                    This photo shows me, or I have the permission of the person in it, and I agree to it being processed as described.</label>
                  <div><label className="label" htmlFor="vis">Who can see the result</label>
                    <select id="vis" className="field" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
                      <option value="private">Only me</option><option value="opponent">Me and my opponent</option><option value="public">Everyone viewing this battle, including the stream view</option>
                    </select></div>
                </div>
                {error && <Notice tone="error" title="Couldn't start">{error}</Notice>}
                <div className="flex gap-2">
                  <button className="btn btn-accent" disabled={busy || !consent || fashnCount + editCount === 0} onClick={() => generate()}>{busy ? <><Spinner /> Uploading</> : "Generate try-on"}</button>
                  <button className="btn btn-quiet" onClick={() => setStep("photo")}>Back</button>
                </div>
              </div>
            </div>
          ) : step === "generating" && job ? (
            <div className="mx-auto max-w-xl py-6" aria-live="polite">
              <h3 className="display text-3xl">Generating</h3>
              <p className="mt-2 text-mute">Usually 15–60 seconds per step. You can close this; it keeps running and appears in the reveal.</p>
              <ol className="mt-6 flex flex-col gap-2">
                {job.steps.map((s, i) => {
                  const st = job.status === "done" || i < job.step ? "done" : i === job.step ? "now" : "next";
                  return (
                    <li key={i} className={`flex items-center gap-3 rounded-2xl p-4 font-medium ${st === "now" ? "bg-white shadow-[var(--shadow-soft)]" : st === "done" ? "bg-white/60" : "text-mute"}`}>
                      <span className="num w-6 text-mute">{st === "done" ? "✓" : i + 1}</span>{s.label}{st === "now" && <Spinner className="ml-auto text-accent" />}
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 num text-sm text-mute">{Math.round((Date.now() - started) / 1000)} s elapsed</p>
            </div>
          ) : step === "result" && job ? (
            job.status === "failed" ? (
              <div className="max-w-prose">
                <Notice tone="error" title="The try-on didn't work">{job.error}</Notice>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button className="btn btn-dark" disabled={busy} onClick={() => generate(job.seed)}>Retry</button>
                  <button className="btn btn-quiet" onClick={() => { setPhotoId(null); setStep("photo"); }}>Use a different photo</button>
                  <button className="btn btn-quiet" onClick={deletePhoto}>Delete my photo</button>
                </div>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[1fr_1fr_0.9fr]">
                <Panel title="Original photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/tryon/photos/${job.photoId}`} alt="Your original photo" className="aspect-[3/4] w-full rounded-2xl object-cover" />
                </Panel>
                <Panel title="Generated outfit" hint="AI visualization · not an exact fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/tryon/jobs/${job.id}/image`} alt="AI visualization of you wearing the outfit" className="aspect-[3/4] w-full rounded-2xl object-cover" />
                </Panel>
                <Panel title="Pieces in this image">
                  <ul className="flex flex-col gap-2">
                    {items.filter((i) => job.steps.some((s) => s.itemIds.includes(i.outfitItemId))).map((i) => (
                      <li key={i.outfitItemId} className="flex items-center gap-3 text-sm">
                        <span className="h-12 w-10 shrink-0 overflow-hidden rounded-lg bg-white"><ProductImage product={i} compact /></span>
                        <span className="min-w-0 flex-1 truncate">{i.brand ?? i.title}</span>
                        {i.listingUrl && <a className="link" href={i.listingUrl} target="_blank" rel="noopener noreferrer">Listing</a>}
                      </li>
                    ))}
                  </ul>
                  {job.skipped.length > 0 && <p className="mt-3 text-xs text-mute">Not shown: {job.skipped.map((s) => `${s.title} (${s.reason.replace(/\.$/, "")})`).join("; ")}.</p>}
                  <div className="mt-5 flex flex-col gap-2">
                    <a className="btn btn-dark" href={`/api/tryon/jobs/${job.id}/image?download=1`}>Save image</a>
                    <button className="btn btn-accent" disabled={busy} onClick={() => generate()}>{busy ? <><Spinner /> Starting</> : "Generate another"}</button>
                    <button className="btn btn-quiet" disabled={busy} onClick={() => generate(job.seed)}>Retry with same settings</button>
                    <button className="btn btn-quiet" onClick={() => { setPhotoId(null); setStep("photo"); }}>Use a different photo</button>
                    <button className="link self-start text-sm" onClick={deletePhoto}>Delete my photo and results</button>
                  </div>
                </Panel>
              </div>
            )
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="glass flex flex-col gap-3 p-4">
      <div><p className="font-semibold">{title}</p>{hint && <p className="text-xs text-mute">{hint}</p>}</div>
      {children}
    </section>
  );
}

function PieceList({ items, extras, include, onToggle, readOnly }: { items: OutfitItem[]; extras: boolean; include: string[]; onToggle: (id: string) => void; readOnly?: boolean }) {
  if (!items.length) return <p className="text-sm text-mute">No pieces in this outfit.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => {
        const s = supportFor(it, extras);
        const off = s.method === "none";
        return (
          <li key={it.outfitItemId} className={`flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-[var(--shadow-soft)] ${off ? "opacity-60" : ""}`}>
            {!readOnly && <input type="checkbox" disabled={off} checked={include.includes(it.outfitItemId) && !off} onChange={() => onToggle(it.outfitItemId)} className="h-5 w-5 accent-[var(--brand-p1)]" aria-label={`Include ${it.title}`} />}
            <span className="h-14 w-12 shrink-0 overflow-hidden rounded-lg"><ProductImage product={it} compact /></span>
            <span className="min-w-0 flex-1">
              <span className="eyebrow block">{slotLabel(it.slot)}</span>
              <span className="block truncate text-sm font-semibold">{it.brand ?? it.title}</span>
              <span className={`block text-xs ${off ? "font-medium text-danger" : "text-mute"}`}>{off ? s.reason : SUPPORT_LABEL[s.method]}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
