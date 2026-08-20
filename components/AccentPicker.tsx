"use client";

import { Check, Palette } from "lucide-react";
import { ACCENT_PRESETS, useAccent } from "@/lib/use-accent";

// Mirrors KhataMobile's Settings accent-swatch row — a small circle per
// preset, the active one ringed, tapping any of them applies immediately
// (no separate "Save" step, matching every other toggle on this page).
export function AccentPicker() {
  const [accentKey, setAccent] = useAccent();

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Palette size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="t-body">Accent color</div>
        <div className="t-label mb-2 text-fg-muted">Buttons, switches and chart lines</div>
        <div className="flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((p) => {
            const active = p.key === accentKey;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setAccent(p.key)}
                aria-label={p.label}
                aria-pressed={active}
                className="flex size-8 items-center justify-center rounded-full transition-transform active:scale-90"
                style={{
                  backgroundColor: p.color,
                  outline: active ? "2px solid var(--color-fg)" : "2px solid transparent",
                  outlineOffset: 2,
                }}
              >
                {active ? <Check size={14} strokeWidth={2.5} color="#fff" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
