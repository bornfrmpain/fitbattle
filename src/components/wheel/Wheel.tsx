"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { charLength, indexAtRotation, pickIndex, segmentAngle, spinEase, targetRotation } from "@/lib/wheel/model";

// Segment colours from the FIT/DUEL palette. Text colour is chosen per fill for contrast.
const FILLS = ["var(--brand-p1)", "var(--brand-p2)", "#C9BCFF", "#1E1C2B", "#9DB8FF", "#EEEAF8"];
const DARK_TEXT = new Set([2, 4, 5]);

function colorIndex(i: number, n: number) {
  let c = i % FILLS.length;
  if (i === n - 1 && n > 1 && c === 0) c = 2; // never two equal colours where the wheel closes
  return c;
}

function truncate(text: string, max: number) {
  if (charLength(text) <= max) return text;
  const g = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return g.slice(0, Math.max(1, max - 1)).join("").trimEnd() + "…";
}

const C = 500, R = 470;
function arc(i: number, n: number) {
  if (n === 1) return `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z`;
  const s = (2 * Math.PI) / n;
  const a0 = i * s - Math.PI / 2, a1 = (i + 1) * s - Math.PI / 2;
  const large = s > Math.PI ? 1 : 0;
  return `M ${C} ${C} L ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)} Z`;
}

export interface WheelProps {
  entries: string[];
  rotationRef: React.RefObject<SVGGElement | null>;
  rotation: number;
  resultIndex: number | null;
  spinning: boolean;
  spins: number;
  onHubClick?: () => void;
  hubLabel?: string;
  className?: string;
}

/** The wheel drawing. Rotation is applied to `rotationRef` (driven by useWheelSpin). */
export function WheelView({ entries, rotationRef, rotation, resultIndex, spinning, spins, onHubClick, hubLabel = "Spin", className = "" }: WheelProps) {
  const n = entries.length;
  const s = segmentAngle(Math.max(n, 1));
  const arcWidth = (2 * Math.PI * R * 0.62) / Math.max(n, 1);
  const font = Math.max(11, Math.min(40, arcWidth * 0.5));
  // Room between the hub (r≈110) and the label end (0.9R). Unbounded is wide: ≈0.72em per character.
  const maxChars = Math.max(3, Math.floor((R * 0.9 - 118) / (font * 0.72)));
  const showWinner = resultIndex !== null && !spinning;
  return (
    <svg viewBox="0 0 1000 1000" className={`block h-auto w-full select-none ${className}`} role="img"
      aria-label={`Wheel with ${n} entries`} data-testid="wheel" data-rotation={rotation} data-result={resultIndex ?? ""} data-spinning={spinning} data-spins={spins} data-entries={n}>
      <defs>
        <filter id="wheel-shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#2a1f6a" floodOpacity="0.22" /></filter>
        <radialGradient id="hub-grad" cx="35%" cy="30%"><stop offset="0" stopColor="#3a3650" /><stop offset="1" stopColor="#12111C" /></radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R + 18} fill="#ffffff" filter="url(#wheel-shadow)" />
      <g ref={rotationRef} transform={`rotate(${rotation} ${C} ${C})`}>
        {entries.map((e, i) => {
          const ci = colorIndex(i, n);
          const mid = (i + 0.5) * s;
          const won = showWinner && i === resultIndex;
          return (
            <g key={i}>
              <path d={arc(i, n)} fill={FILLS[ci]} stroke="#ffffff" strokeWidth={n > 60 ? 1 : 2.5} opacity={showWinner && !won ? 0.55 : 1} style={{ transition: "opacity .4s" }}>
                <title>{e}</title>
              </path>
              <text transform={`rotate(${mid - 90} ${C} ${C})`} x={C + R * 0.9} y={C} dominantBaseline="central" textAnchor="end"
                fontFamily="var(--font-display)" fontWeight={600} fontSize={font} fill={DARK_TEXT.has(ci) ? "#0E0D16" : "#ffffff"} style={{ pointerEvents: "none" }}>
                {truncate(e, maxChars)}
              </text>
            </g>
          );
        })}
      </g>
      <circle cx={C} cy={C} r={R + 8} fill="none" stroke="#ffffff" strokeWidth="14" />
      <circle cx={C} cy={C} r={R + 15} fill="none" stroke="#0E0D1614" strokeWidth="2" />
      {/* Hub */}
      <g role={onHubClick ? "button" : undefined} tabIndex={onHubClick ? 0 : undefined} aria-label={onHubClick ? `${hubLabel} the wheel` : undefined}
        onClick={onHubClick} onKeyDown={(e) => { if (onHubClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onHubClick(); } }}
        style={{ cursor: onHubClick && !spinning ? "pointer" : "default", outline: "none" }}>
        <circle cx={C} cy={C} r={92} fill="url(#hub-grad)" stroke="#ffffff" strokeWidth="10" />
        <text x={C} y={C} dominantBaseline="central" textAnchor="middle" fontFamily="var(--font-display)" fontWeight={700} fontSize={34} fill="#ffffff">{spinning ? "…" : hubLabel.toUpperCase()}</text>
      </g>
      {/* Fixed pointer at 12 o'clock */}
      <g aria-hidden>
        <path d={`M ${C - 34} 6 L ${C + 34} 6 L ${C} 86 Z`} fill="#12111C" stroke="#ffffff" strokeWidth="8" strokeLinejoin="round" />
        <circle cx={C} cy={22} r={7} fill="var(--brand-p1)" />
      </g>
    </svg>
  );
}

// ---- Sound: tiny WebAudio blips, created on the first user gesture. No audio files.
let audio: AudioContext | null = null;
function ctx() {
  if (typeof window === "undefined") return null;
  try { audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { return null; }
  if (audio.state === "suspended") void audio.resume();
  return audio;
}
function blip(freq: number, dur: number, gain: number, type: OscillatorType = "square") {
  const a = ctx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
}
export const sounds = {
  tick: () => blip(1900, 0.03, 0.035),
  win: () => { blip(660, 0.16, 0.08, "sine"); setTimeout(() => blip(990, 0.28, 0.08, "sine"), 120); },
};

export function useMuted() {
  const [muted, setMuted] = useState(true);
  useEffect(() => { try { setMuted(localStorage.getItem("fitduel.wheel.muted") !== "0"); } catch { /* storage blocked */ } }, []);
  const toggle = useCallback(() => setMuted((m) => { try { localStorage.setItem("fitduel.wheel.muted", m ? "0" : "1"); } catch { /* ignore */ } return !m; }), []);
  return { muted, toggle };
}

/**
 * Spin engine. The winner is drawn with a CSPRNG before the animation starts, and the wheel
 * is animated to a rotation inside that winner's segment. A ref guard blocks overlapping spins.
 */
export function useWheelSpin(n: number, opts: { muted: boolean; onResult?: (index: number) => void; durationMs?: number; resetKey?: string }) {
  const ref = useRef<SVGGElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [spins, setSpins] = useState(0);
  const busy = useRef(false);
  const rot = useRef(0);
  const raf = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // Any change to the entries invalidates the old result (it no longer matches the wheel).
  useEffect(() => { if (!busy.current) setResult(null); }, [n, opts.resetKey]);

  const spin = useCallback((): boolean => {
    if (busy.current || n < 2) return false;
    busy.current = true;
    const index = pickIndex(n);
    const start = rot.current;
    const target = targetRotation(start, index, n, 5 + pickIndex(3), pickIndex(1000) / 1000);
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duration = optsRef.current.durationMs ?? (reduced ? 1200 : 5400);
    const seg = segmentAngle(n);
    let lastSeg = Math.floor(start / seg);
    setSpinning(true); setResult(null);
    if (!optsRef.current.muted) ctx();
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const r = start + (target - start) * spinEase(t);
      ref.current?.setAttribute("transform", `rotate(${r} ${C} ${C})`);
      const sg = Math.floor(r / seg);
      if (sg !== lastSeg) { lastSeg = sg; if (!optsRef.current.muted) sounds.tick(); }
      if (t < 1) { raf.current = requestAnimationFrame(frame); return; }
      rot.current = target;
      if (indexAtRotation(target, n) !== index) console.error("[wheel] pointer/result mismatch", { target, index, n });
      setRotation(target); setResult(index); setSpinning(false); setSpins((x) => x + 1);
      busy.current = false;
      if (!optsRef.current.muted) sounds.win();
      optsRef.current.onResult?.(index);
    };
    raf.current = requestAnimationFrame(frame);
    return true;
  }, [n]);

  return { ref, rotation, spinning, result, spins, spin, isBusy: () => busy.current };
}
