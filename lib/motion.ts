// Single source of truth for every animation in the app — DESIGN.md §6.
// Never inline a duration or easing curve outside this file.

export const ease = {
  out: [0.2, 0.8, 0.2, 1] as const, // primary — confident decel
  inOut: [0.5, 0, 0.5, 1] as const,
};

export const dur = {
  micro: 0.12, // hover, press, chip toggle
  state: 0.22, // color/opacity change, tab switch
  enter: 0.34, // list item, sheet content
  morph: 0.45, // bubble → ledger line (the signature moment)
};

export const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
}; // bottom sheet
