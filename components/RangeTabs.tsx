import Link from "next/link";
import clsx from "clsx";

export interface RangePeriod {
  /** Start of the current period. */
  from: Date;
  /** End of the current period — "now", not a fixed boundary. */
  to: Date;
  /** Start of the comparison period, for month-over-month style deltas. */
  prevFrom: Date;
  /** End of the comparison period. */
  prevTo: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Trailing N days, compared against the N days immediately before that —
 *  equal-length windows, so a delta never compares 30 days against 23. */
function daysPeriod(days: number) {
  return (now: Date): RangePeriod => {
    const from = startOfDay(now);
    from.setDate(from.getDate() - (days - 1));
    const prevTo = from;
    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - days);
    return { from, to: now, prevFrom, prevTo };
  };
}

/** Calendar month to date, compared against the full previous calendar month —
 *  same convention Home already uses for its own month-over-month deltas, so
 *  "this month" means the same thing everywhere in the app. Not day-count
 *  normalized: on the 3rd, a partial 3-day month is compared to a full 30-day
 *  one, same trade-off Home already makes. */
function monthPeriod(now: Date): RangePeriod {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { from, to: now, prevFrom, prevTo: from };
}

export interface RangeDef {
  key: string;
  label: string;
  /** How the "vs previous period" line reads, e.g. "last month". */
  comparisonLabel: string;
  resolve(now: Date): RangePeriod;
}

export const RANGES: RangeDef[] = [
  { key: "month", label: "Month", comparisonLabel: "last month", resolve: monthPeriod },
  { key: "30d", label: "30D", comparisonLabel: "the previous 30 days", resolve: daysPeriod(30) },
  { key: "3m", label: "3M", comparisonLabel: "the previous 3 months", resolve: daysPeriod(90) },
  { key: "6m", label: "6M", comparisonLabel: "the previous 6 months", resolve: daysPeriod(180) },
  { key: "1y", label: "1Y", comparisonLabel: "the previous year", resolve: daysPeriod(365) },
];

export type RangeKey = string;

/** Defaults to 30D, not the first entry — "Month" was added to the front of
 *  the tab order because that's where it reads best, not to change what a
 *  bare /insights visit shows. */
export function resolveRange(raw: string | undefined): RangeDef {
  return RANGES.find((r) => r.key === raw) ?? RANGES.find((r) => r.key === "30d")!;
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
              isActive ? "bg-surface-lift text-fg" : "text-fg-faint hover:text-fg-muted",
            )}
          >
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}
