"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

// So ThemeStateLabel (a separate component instance, e.g. sitting next to
// this button in the same Settings row) updates the instant this toggle is
// clicked — same same-tab-notification need lib/use-hide-balances.ts and
// lib/use-accent.ts solve with their own custom events.
const THEME_CHANGED_EVENT = "khata-theme-changed";

function currentTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

// Paper mode is first-class (DESIGN.md §8), so it needs a real control. The
// pre-paint script in app/layout.tsx applies the stored choice; this only
// reads/writes it. Renders a fixed-size placeholder before mount so the
// header never shifts.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => setTheme(currentTheme()), []);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("khata-theme", next);
    } catch {
      /* private mode — the in-page switch still works, it just won't persist */
    }
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Paper mode" : "Ink mode"}
      className="flex size-9 items-center justify-center rounded-chip text-fg-muted transition-colors duration-200 hover:bg-surface-lift hover:text-fg active:scale-95"
    >
      {theme === null ? (
        <span className="size-[18px]" aria-hidden />
      ) : (
        // key forces a remount on every toggle, so anim-fade actually replays
        // instead of skipping (React would otherwise reuse the same DOM node).
        <span key={theme} className="anim-fade">
          {theme === "dark" ? (
            <Sun size={18} strokeWidth={1.75} aria-hidden />
          ) : (
            <Moon size={18} strokeWidth={1.75} aria-hidden />
          )}
        </span>
      )}
    </button>
  );
}

// A textual state readout next to the icon toggle — matches KhataMobile's
// SettingsScreen, which shows "On"/"Off" under the Dark mode row instead of
// leaving the icon as the only signal of which mode is active.
export function ThemeStateLabel() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
    const onChange = () => setTheme(currentTheme());
    window.addEventListener(THEME_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, onChange);
  }, []);

  return <>{theme === null ? "Ink or Paper" : theme === "dark" ? "Ink" : "Paper"}</>;
}
