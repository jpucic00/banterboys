"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { SlotSymbol, SPRITE_PATH, SYMBOLS } from "@/lib/slots";

// Visual constants — exported so parent layouts can align things (e.g. payline overlay).
export const CELL = 64;
export const VISIBLE_CELLS = 3;
export const PADDING = 6;
export const REEL_INNER_HEIGHT = CELL * VISIBLE_CELLS;
export const REEL_OUTER_HEIGHT = REEL_INNER_HEIGHT + PADDING * 2;
export const REEL_WIDTH = CELL + PADDING * 2;

const STRIP_LEN = 30; // total cells on the scrolling strip

// Build a strip that lands with `final` centered on the middle visible row.
// The window shows 3 cells; we want strip[N-2] to be the middle (the payline symbol),
// so we put `final` at index N-2 and a random filler at N-1 (visible below the payline).
function buildStrip(final: SlotSymbol, seed: number): SlotSymbol[] {
  const strip: SlotSymbol[] = [];
  let s = (seed || 1) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return SYMBOLS[s % SYMBOLS.length];
  };
  for (let i = 0; i < STRIP_LEN - 2; i++) strip.push(rand());
  strip.push(final); // index N-2 → middle of viewport on stop (payline)
  strip.push(rand()); // index N-1 → bottom of viewport on stop
  return strip;
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export default function SlotReel({
  target,
  durationMs,
  spinId,
  spinning,
  reelIndex,
  winning = false,
  jackpot = false,
}: {
  target: SlotSymbol | null;
  durationMs: number;
  spinId: string | null;
  spinning: boolean;
  reelIndex: number;
  /** True if this reel's middle-row symbol is part of the winning combo. */
  winning?: boolean;
  /** True for the special jackpot animation. */
  jackpot?: boolean;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [strip, setStrip] = useState<SlotSymbol[]>(() =>
    buildStrip(target ?? "snake", 1 + reelIndex)
  );

  useEffect(() => {
    if (!spinning || !target || !stripRef.current || !spinId) return;

    const seed = hashString(spinId) ^ ((reelIndex + 1) * 2654435761);
    const newStrip = buildStrip(target, seed);
    setStrip(newStrip);

    const el = stripRef.current;
    // Reset to top instantly
    el.style.transition = "none";
    el.style.transform = "translateY(0px)";
    // Force reflow so the next transition actually animates
    void el.offsetHeight;

    // Stop so that strip[N-2] (target) is centered on the middle visible row.
    const finalY = (newStrip.length - VISIBLE_CELLS) * CELL;
    el.style.transition = `transform ${durationMs}ms cubic-bezier(0.15, 0.65, 0.25, 1)`;
    el.style.transform = `translateY(-${finalY}px)`;
  }, [spinId, target, durationMs, spinning, reelIndex]);

  return (
    <div
      className="overflow-hidden rounded-md"
      style={{
        width: REEL_WIDTH,
        height: REEL_OUTER_HEIGHT,
        border: "1px solid #2a2a2a",
        background:
          "linear-gradient(to bottom, #050505 0%, #0a0a0a 50%, #050505 100%)",
        padding: PADDING,
        boxShadow:
          "inset 0 8px 14px rgba(0, 0, 0, 0.9), inset 0 -8px 14px rgba(0, 0, 0, 0.9)",
      }}
    >
      <div ref={stripRef} style={{ willChange: "transform" }}>
        {strip.map((s, i) => {
          // The middle visible cell after stop is strip[length - 2].
          const isMiddleAfterStop = i === strip.length - 2;
          const pulse = winning && !spinning && isMiddleAfterStop;
          return (
            <div
              key={i}
              style={{
                height: CELL,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image
                src={SPRITE_PATH[s]}
                alt={s}
                width={52}
                height={52}
                style={{
                  imageRendering: "pixelated",
                  animation: pulse
                    ? jackpot
                      ? "slots-symbol-pulse-jackpot 0.8s ease-in-out infinite"
                      : "slots-symbol-pulse 0.9s ease-in-out infinite"
                    : undefined,
                  transformOrigin: "center",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
