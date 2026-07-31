import Link from "next/link";
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
            className={clsx(
              "flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-lift/60",
              i > 0 && "border-t border-rule-soft",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="t-body truncate">{h.name}</div>
              <div className="t-label truncate text-fg-muted">
                {h.typeLabel}
                {h.quantity > 0 ? ` · ${h.quantity}${h.quantityUnit ? ` ${h.quantityUnit}` : ""}` : ""}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="tnum font-num text-[15px]">
                <Sensitive>{formatPKR(h.currentValue ?? h.investedTotal)}</Sensitive>
              </div>
              {gain !== null ? (
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
