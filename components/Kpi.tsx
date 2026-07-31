import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Sensitive } from "@/components/Sensitive";

/** A row of tiles divided by hairlines rather than spaced by gaps — the divided
 *  band is what makes a screen read as a dashboard instead of a stack of cards.
 *  Two or three per row; four is too narrow for tabular figures at this width. */
export function KpiBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-rule overflow-hidden rounded-chip border border-rule bg-surface-lift">
      {children}
    </div>
  );
}

export interface DeltaInfo {
  /** Signed percent vs the comparison period. */
  pct: number;
  /** Which direction is the good one — spending down is good, income up is good. */
  goodWhen: "down" | "up";
}

export function KpiTile({
  label,
  value,
  tone,
  delta,
  chart,
  footnote,
}: {
  label: string;
  value: string;
  /** Polarity only — reserved in/out steps, never used for identity. */
  tone?: "in" | "out";
  delta?: DeltaInfo;
  chart?: React.ReactNode;
  footnote?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-3 py-3">
      <span className="t-micro truncate text-fg-faint">{label}</span>

      <span
        className={clsx(
          "t-kpi tnum truncate",
          tone === "in" && "text-in",
          tone === "out" && "text-out",
        )}
      >
        <Sensitive>{value}</Sensitive>
      </span>

      {delta ? <DeltaChip {...delta} /> : null}
      {footnote ? <span className="t-micro truncate text-fg-faint">{footnote}</span> : null}
      {chart ? <div className="mt-0.5">{chart}</div> : null}
    </div>
  );
}

/** Colour is allowed here: a delta is summary/state, and it always ships the
 *  arrow glyph alongside, so the judgement is never colour-alone. */
function DeltaChip({ pct, goodWhen }: DeltaInfo) {
  const rounded = Math.round(pct);
  if (rounded === 0) {
    return <span className="t-micro text-fg-faint">flat</span>;
  }
  const rising = rounded > 0;
  const good = goodWhen === "up" ? rising : !rising;
  const Icon = rising ? ArrowUp : ArrowDown;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 text-[11px] font-medium",
        good ? "text-in" : "text-out",
      )}
    >
      <Icon size={11} strokeWidth={2.5} aria-hidden />
      <span className="tnum">{Math.abs(rounded)}%</span>
    </span>
  );
}
