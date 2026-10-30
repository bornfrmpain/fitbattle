"use client";
import { useEffect } from "react";
import { decodeShare } from "@/lib/wheel/model";
import type { Brand } from "@/lib/brand";
import { useMuted, useWheelSpin, WheelView } from "./Wheel";

// Wheel-only display for a livestream. Space or Enter spins; controls stay small and out of the way.
export function WheelStage({ share, brand }: { share?: string; brand: Brand }) {
  const parsed = share ? decodeShare(share) : { ok: false as const, errors: ["No wheel in this link. Open the stream view from the Wheel page."] };
  const entries = parsed.ok ? parsed.wheel.entries : [];
  const { muted, toggle } = useMuted();
  const { ref, rotation, spinning, result, spins, spin } = useWheelSpin(entries.length, { muted });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.key === " " || e.key === "Enter") && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); spin(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [spin]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-[2vh] overflow-hidden p-[3vh]"
      style={{ background: "radial-gradient(70% 70% at 0% 0%, #e4dbfe, transparent 60%), radial-gradient(60% 70% at 100% 100%, #d9e3ff, transparent 60%), #F5F4F9" }}>
      {!parsed.ok ? (
        <p role="alert" className="glass max-w-lg p-6 text-center">{parsed.errors[0]}</p>
      ) : (
        <>
          <p className="font-display text-[4.2vh] font-semibold tracking-tight">{parsed.wheel.title}</p>
          <div className="aspect-square" style={{ height: result !== null && !spinning ? "64vh" : "74vh", transition: "height .5s cubic-bezier(.2,.7,.2,1)" }}>
            <WheelView entries={entries} rotationRef={ref} rotation={rotation} resultIndex={result} spinning={spinning} spins={spins} onHubClick={spin} />
          </div>
          <div aria-live="polite" className="min-h-[9vh]">
            {result !== null && !spinning && (
              <p className="night pop-in rounded-2xl px-[3vh] py-[1.4vh] text-center font-display text-[5vh] font-bold" data-testid="stage-result">{entries[result]}</p>
            )}
          </div>
          <div className="absolute bottom-[2vh] right-[2vh] flex gap-2 opacity-60 transition-opacity hover:opacity-100">
            <button className="btn btn-quiet !min-h-9 text-sm" onClick={toggle}>{muted ? "Sound off" : "Sound on"}</button>
            <button className="btn btn-dark !min-h-9 text-sm" onClick={spin} disabled={spinning}>Spin</button>
          </div>
          <p className="absolute bottom-[2vh] left-[2vh] text-xs text-mute">{brand.appName} · Space to spin</p>
        </>
      )}
    </div>
  );
}
