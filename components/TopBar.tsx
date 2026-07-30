import { ThemeToggle } from "./ThemeToggle";

// Sticky, hairline-bottom. Uses a translucent surface so the ledger scrolls
// under it rather than being clipped by a solid block.
export function TopBar({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <header
      className="sticky top-0 z-20 border-b border-rule bg-surface/85 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Padding lives on the sticky element itself, not an ancestor — once this
          header pins to the viewport top mid-scroll, it needs to already be tall
          enough to clear the status bar. Padding on a scrolled-past ancestor
          would only help before the first scroll. */}
      <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          {eyebrow ? <div className="t-micro text-fg-faint">{eyebrow}</div> : null}
          <h1 className="t-title truncate">{title}</h1>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
