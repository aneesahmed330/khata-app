"use client";

import { useEffect, useState } from "react";

export interface TextSizePreset {
  key: string;
  label: string;
  scale: number;
}

// Mirrors KhataMobile's src/lib/fontScale.tsx FONT_SIZE_PRESETS exactly.
// Applied via CSS `zoom` on <html> (app/globals.css's :root[data-text-size]
// blocks) rather than converting the type scale to rem: DESIGN.md's seven
// .t-* steps and the dozens of Tailwind arbitrary text-[Npx] values across
// the app are deliberately fixed px, and `zoom` scales the whole rendered
// page — layout, hit-testing, and all of it — without touching any of them.
export const TEXT_SIZE_PRESETS: TextSizePreset[] = [
  { key: "small", label: "Small", scale: 0.92 },
  { key: "medium", label: "Medium", scale: 1 },
  { key: "large", label: "Large", scale: 1.15 },
];
const DEFAULT_KEY = "medium";
const KEY = "khata-text-size";
const EVENT = "khata-text-size-changed";

function readStored(): string {
  try {
    const v = localStorage.getItem(KEY);
    return v && TEXT_SIZE_PRESETS.some((p) => p.key === v) ? v : DEFAULT_KEY;
  } catch {
    return DEFAULT_KEY;
  }
}

export function useTextSize(): [string, (key: string) => void] {
  const [textSizeKey, setTextSizeKeyState] = useState(DEFAULT_KEY);

  useEffect(() => {
    setTextSizeKeyState(readStored());
    const onChange = () => setTextSizeKeyState(readStored());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  function setTextSize(key: string) {
    if (key === DEFAULT_KEY) document.documentElement.removeAttribute("data-text-size");
    else document.documentElement.dataset.textSize = key;
    try {
      localStorage.setItem(KEY, key);
    } catch {
      /* private mode — the picker still works, it just won't persist */
    }
    window.dispatchEvent(new Event(EVENT));
    setTextSizeKeyState(key);
  }

  return [textSizeKey, setTextSize];
}
