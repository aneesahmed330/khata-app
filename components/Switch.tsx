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
      <span
        aria-hidden
        className={clsx(
          "absolute top-1/2 size-5 -translate-y-1/2 rounded-full bg-surface transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-1",
        )}
      />
    </button>
  );
}
