"use client";

import clsx from "clsx";

// A real boolean toggle — DESIGN.md has no switch primitive yet (ThemeToggle
// is two icon buttons, not a boolean), and "enable to hide balances" is
// genuinely a switch, not a two-state icon button.
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={clsx(
        "relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200",
        checked ? "border-accent bg-accent" : "border-rule bg-surface-sunk",
      )}
    >
      {/* left-0 is load-bearing. Without an inset anchor the knob falls back to
          its static position, which a button's inherited text-align shifts —
          it ended up at x=46 inside a 48px track, i.e. rendered off the end,
          so the switch read as a plain filled pill with no knob at all.
          Travel: 3px inset on each side of a 20px knob in a 46px inner track. */}
      <span
        aria-hidden
        className={clsx(
          "absolute left-0 top-1/2 size-5 -translate-y-1/2 rounded-full bg-surface transition-transform duration-200",
          checked ? "translate-x-[23px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}
