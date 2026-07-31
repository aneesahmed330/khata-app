import clsx from "clsx";
import { formatPKRWhole } from "@/lib/format";
import { Sensitive } from "@/components/Sensitive";

export interface RankRow {
  id: string;
  name: string;
  total: number;
  /** Signed % vs the previous comparable period; null when there's no baseline. */
  deltaPct: number | null;
}

/** Ranked magnitude — ONE hue, length is the only variable. A colour per
 *  category would be answering "which category is this", but the question a
 *  ranking asks is "how much", which is magnitude's job.
 *
 *  Bars share a scale anchored to the largest row, so lengths are comparable
 *  across rows; share-of-total and the vs-last-period delta ride alongside as
 *  text, since neither is encoded in the length. */
export function RankBars({ rows, total }: { rows: RankRow[]; total: number }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div>
      {rows.map((row, i) => {
        const share = total > 0 ? (row.total / total) * 100 : 0;
        const widthPct = Math.max((row.total / max) * 100, 1.5);
        return (
          <div
            key={row.id}
            className={clsx("py-2.5", i > 0 && "border-t border-rule-soft")}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="t-body min-w-0 flex-1 truncate">{row.name}</span>
              <span className="flex shrink-0 items-baseline gap-2.5">
                {row.deltaPct !== null && Math.round(row.deltaPct) !== 0 ? (
                  <span
                    className={clsx(
                      "tnum text-[11px]",
                      row.deltaPct > 0 ? "text-out" : "text-in",
                    )}
                  >
                    {row.deltaPct > 0 ? "+" : "−"}
                    {Math.abs(Math.round(row.deltaPct))}%
                  </span>
                ) : null}
                <span className="tnum text-[11px] text-fg-faint">{Math.round(share)}%</span>
                <span className="tnum font-num text-[14px]">
                  <Sensitive>{formatPKRWhole(row.total)}</Sensitive>
                </span>
              </span>
            </div>
            {/* square baseline, 4px rounded data-end, grows in on mount */}
            <div className="h-1.5 w-full bg-rule-soft">
              <div
                className="anim-bar-grow h-1.5 rounded-r-[4px] bg-chart-mag"
                style={{ "--bar-w": `${widthPct}%` } as React.CSSProperties}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
