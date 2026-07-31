import Link from "next/link";
import clsx from "clsx";

export const RANGES = [
  { key: "30d", label: "30D", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "6m", label: "6M", days: 180 },
  { key: "1y", label: "1Y", days: 365 },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

export function resolveRange(raw: string | undefined): (typeof RANGES)[number] {
  return RANGES.find((r) => r.key === raw) ?? RANGES[0];
}

/** A segmented control built from links, not state — the range belongs in the
 *  URL so a given view is shareable and survives a reload, and the page stays
 *  a server component with no client JS for this. */
export function RangeTabs({ active, basePath }: { active: RangeKey; basePath: string }) {
  return (
    <div
      role="group"
      aria-label="Time range"
      className="flex gap-0.5 rounded-chip border border-rule bg-surface-sunk p-0.5"
    >
      {RANGES.map((r) => {
        const isActive = r.key === active;
        return (
          <Link
            key={r.key}
            href={`${basePath}?range=${r.key}`}
            aria-current={isActive ? "true" : undefined}
            className={clsx(
              "tnum flex-1 rounded-[10px] py-1.5 text-center text-[12px] font-medium transition-colors",
              isActive
                ? "bg-surface-lift text-fg"
                : "text-fg-faint hover:text-fg-muted",
            )}
          >
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}
