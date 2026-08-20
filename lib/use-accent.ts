"use client";

import { useEffect, useState } from "react";

export interface AccentPreset {
  key: string;
  label: string;
  color: string;
}

// "marigold" is the app's existing brand accent (app/globals.css's --k-accent)
// and stays the implicit default — no data-accent attribute needed for it, so
// a user who never opens this picker sees exactly what they always have. The
// other seven mirror KhataMobile's src/lib/accent.tsx ACCENT_PRESETS exactly,
// so a color picked on one platform reads as "the same color" on the other.
export const ACCENT_PRESETS: AccentPreset[] = [
  { key: "marigold", label: "Marigold", color: "#e8a33d" },
  { key: "indigo", label: "Indigo", color: "#4f46e5" },
  { key: "blue", label: "Blue", color: "#2563eb" },
  { key: "teal", label: "Teal", color: "#0d9488" },
  { key: "emerald", label: "Emerald", color: "#059669" },
  { key: "amber", label: "Amber", color: "#d97706" },
  { key: "rose", label: "Rose", color: "#e11d48" },
  { key: "violet", label: "Violet", color: "#7c3aed" },
];
const DEFAULT_KEY = "marigold";
const KEY = "khata-accent";
const EVENT = "khata-accent-changed";

function readStored(): string {
  try {
    const v = localStorage.getItem(KEY);
    return v && ACCENT_PRESETS.some((p) => p.key === v) ? v : DEFAULT_KEY;
  } catch {
    return DEFAULT_KEY;
  }
}

// Same localStorage + same-tab custom-event pattern as lib/use-hide-balances.ts
// and ThemeToggle's own "khata-theme" key — no Context Provider anywhere in
// the tree. The actual color swap happens in CSS (app/globals.css's
// :root[data-accent="…"] blocks); this hook only reads/writes the attribute
// and the picker's own selected-state.
export function useAccent(): [string, (key: string) => void] {
  const [accentKey, setAccentKeyState] = useState(DEFAULT_KEY);

  useEffect(() => {
    setAccentKeyState(readStored());
    const onChange = () => setAccentKeyState(readStored());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  function setAccent(key: string) {
    if (key === DEFAULT_KEY) document.documentElement.removeAttribute("data-accent");
    else document.documentElement.dataset.accent = key;
    try {
      localStorage.setItem(KEY, key);
    } catch {
      /* private mode — the picker still works, it just won't persist */
    }
    window.dispatchEvent(new Event(EVENT));
    setAccentKeyState(key);
  }

  return [accentKey, setAccent];
}
