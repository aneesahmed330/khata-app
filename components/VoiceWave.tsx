"use client";

import { useEffect, useRef } from "react";

const BARS = 28;
/** Idle floor. Not near-zero: at 0.08 a quiet moment collapsed the trace into a
 *  row of faint dots that read as "broken", not as "silence". A visible
 *  baseline says the meter is alive and simply has nothing to show yet. */
const MIN_SCALE = 0.14;

/** Live mic waveform.
 *
 *  Every frame pushes the current level onto the right and shifts the history
 *  left, so the bars read as a scrolling trace of what you actually said
 *  rather than a decorative equaliser. That distinction matters here: this is
 *  the only feedback that the mic is really picking you up, and a loop that
 *  animates whether or not sound is arriving would be a lie you can't tell
 *  apart from a dead microphone.
 *
 *  Heights are written straight to the DOM inside the frame. Putting a 60fps
 *  signal through React state would re-render the whole panel each frame to
 *  move 28 rectangles. */
export function VoiceWave({ getLevel, active }: { getLevel: () => number; active: boolean }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const historyRef = useRef<number[]>(new Array(BARS).fill(0));

  useEffect(() => {
    if (!active) return;

    // Respect the OS setting: hold a steady mid-height trace instead of
    // animating, so the panel still reads as "listening" without motion.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      barsRef.current.forEach((el) => el && (el.style.transform = "scaleY(0.4)"));
      return;
    }

    let frame = 0;
    const tick = () => {
      const history = historyRef.current;
      history.shift();
      history.push(getLevel());

      for (let i = 0; i < BARS; i++) {
        const el = barsRef.current[i];
        if (!el) continue;
        // Taper the oldest samples so the trace fades off the left edge
        // instead of ending in a hard vertical cut.
        const age = i / (BARS - 1);
        const scale = Math.max(MIN_SCALE, history[i]! * (0.45 + 0.55 * age));
        el.style.transform = `scaleY(${scale})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, getLevel]);

  // Bars flex to fill the width rather than sitting at a fixed 3px. At a fixed
  // width 28 of them covered under half the card and the trace read as a row
  // of dots; sharing the full width turns them into legible pills.
  return (
    <div className="flex h-14 w-full items-center gap-[3px]" aria-hidden>
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="h-full min-w-0 flex-1 origin-center rounded-full bg-accent"
          style={{ transform: `scaleY(${MIN_SCALE})`, opacity: 0.4 + (i / BARS) * 0.6 }}
        />
      ))}
    </div>
  );
}
