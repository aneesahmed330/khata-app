"use client";

import { Square, X } from "lucide-react";
import { VoiceWave } from "@/components/VoiceWave";

/** The recording state.
 *
 *  The old version showed a pulsing mic and the word "Listening…" — a loop
 *  that ran identically whether the mic was working, muted, or denied. The
 *  waveform replaces it with the one thing worth showing here: evidence that
 *  your voice is arriving. The pulse is gone; a ring that throbs on a timer
 *  next to a trace that responds to sound is just noise competing with signal.
 *
 *  The cap bar is the second honest addition — recording stops on its own at
 *  20s (lib/recorder.ts), and that used to happen without warning. */
export function RecordingPanel({
  elapsed,
  maxSeconds,
  getLevel,
  onStop,
  onCancel,
}: {
  elapsed: number;
  maxSeconds: number;
  getLevel: () => number;
  onStop: () => void;
  onCancel: () => void;
}) {
  const remaining = Math.max(maxSeconds - elapsed, 0);
  const usedPct = Math.min((elapsed / maxSeconds) * 100, 100);
  const nearCap = remaining <= 5;

  return (
    <div className="anim-rise flex flex-col rounded-sheet border border-rule bg-surface-lift px-5 pb-5 pt-4">
      <div className="flex items-center justify-between">
        <span className="t-micro flex items-center gap-2 text-fg-muted">
          <span className="anim-blink size-1.5 rounded-full bg-out" aria-hidden />
          Recording
        </span>
        <span className="tnum font-num text-[13px] text-fg-muted" aria-live="off">
          0:{String(elapsed).padStart(2, "0")}
        </span>
      </div>

      <div className="my-5">
        <VoiceWave getLevel={getLevel} active />
      </div>

      {/* Time left, as a rule rather than a number — it only needs to be read
          at a glance, and it turns red for the last five seconds. */}
      <div className="h-px w-full bg-rule">
        <div
          className={`h-px transition-[width] duration-1000 ease-linear ${nearCap ? "bg-out" : "bg-accent"}`}
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <p className="t-micro mt-2 text-center text-fg-faint" aria-live="polite">
        {nearCap ? `Stops in ${remaining}s` : "Speak naturally — Roman Urdu, Urdu or English"}
      </p>

      <button
        type="button"
        onClick={onStop}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-chip bg-accent py-3.5 text-[15px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98]"
      >
        <Square size={14} strokeWidth={2.5} aria-hidden />
        Done
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 flex items-center justify-center gap-1.5 py-2 text-[13px] text-fg-faint transition-colors hover:text-fg-muted"
      >
        <X size={13} strokeWidth={2} aria-hidden />
        Discard
      </button>
    </div>
  );
}
