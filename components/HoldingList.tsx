import Link from "next/link";
import { EyeOff, MinusCircle } from "lucide-react";
import clsx from "clsx";
import { formatPKR } from "@/lib/format";
import { Sensitive } from "@/components/Sensitive";

export interface HoldingSummary {
  id: string;
  name: string;
  typeLabel: string;
  investedTotal: number;
  currentValue?: number;
  quantity: number;
  quantityUnit?: string;
  hideValue?: boolean;
  excludeFromTotal?: boolean;
}

export function HoldingList({ holdings }: { holdings: HoldingSummary[] }) {
  if (holdings.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-chip border border-rule">
      {holdings.map((h, i) => {
        const gain = h.currentValue !== undefined ? h.currentValue - h.investedTotal : null;
        return (
          <Link
            key={h.id}
            href={`/investments/${h.id}`}
            style={{ "--i": i } as React.CSSProperties}
            className={clsx(
              "anim-stagger flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-lift/60",
              i > 0 && "border-t border-rule-soft",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="t-body flex items-center gap-1.5 truncate">
                <span className="truncate">{h.name}</span>
                {h.hideValue ? (
                  <EyeOff size={11} strokeWidth={2} className="shrink-0 text-fg-faint" aria-label="Value hidden" />
                ) : null}
                {h.excludeFromTotal ? (
                  <MinusCircle
                    size={11}
                    strokeWidth={2}
                    className="shrink-0 text-fg-faint"
                    aria-label="Not counted in net worth"
                  />
                ) : null}
              </div>
              <div className="t-label truncate text-fg-muted">
                {h.typeLabel}
                {h.quantity > 0 ? ` · ${h.quantity}${h.quantityUnit ? ` ${h.quantityUnit}` : ""}` : ""}
              </div>
            </div>
            {/* hide_value has to be honoured here too. <Sensitive> only knows
                about the global privacy toggle, so a per-holding mask that
                stopped at the icon would print the very figure it promises to
                hide. The gain line goes with it — its red/green would still
                say "this one is down" with the number blanked. */}
            <div className="shrink-0 text-right">
              <div className="tnum font-num text-[15px]">
                {h.hideValue ? (
                  "••••••"
                ) : (
                  <Sensitive>{formatPKR(h.currentValue ?? h.investedTotal)}</Sensitive>
                )}
              </div>
              {gain !== null && !h.hideValue ? (
                <div className={clsx("t-label", gain >= 0 ? "text-in" : "text-out")}>
                  {gain >= 0 ? "+" : ""}
                  {formatPKR(gain)}
                </div>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
