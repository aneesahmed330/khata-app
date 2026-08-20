"use client";

import clsx from "clsx";
import { CaseSensitive } from "lucide-react";
import { TEXT_SIZE_PRESETS, useTextSize } from "@/lib/use-text-size";

// Mirrors KhataMobile's Settings text-size row — a segmented three-way
// picker (Small / Medium / Large) instead of a slider, since there are only
// ever three fixed steps.
export function TextSizePicker() {
  const [textSizeKey, setTextSize] = useTextSize();

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <CaseSensitive size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="t-body">Text size</div>
        <div className="t-label mb-2 text-fg-muted">Scales everything on screen</div>
        <div className="inline-flex rounded-chip border border-rule p-0.5">
          {TEXT_SIZE_PRESETS.map((p) => {
            const active = p.key === textSizeKey;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setTextSize(p.key)}
                aria-pressed={active}
                className={clsx(
                  "rounded-[10px] px-3 py-1.5 text-[13px] transition-colors",
                  active ? "bg-accent text-on-accent" : "text-fg-muted hover:text-fg",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
