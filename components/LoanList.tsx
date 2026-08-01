import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, ArrowLeft, ChevronRight, MinusCircle } from "lucide-react";
import { formatPKRWhole } from "@/lib/format";
import { Sensitive } from "@/components/Sensitive";

export interface LoanSummary {
  id: string;
  personName: string;
  direction: "given" | "taken";
  principal: number;
  outstanding: number;
  status: "open" | "settled";
  excludeFromTotal?: boolean;
}

/** Same glyph vocabulary as the ledger's loan rows: → money out to them,
 *  ← money in from them.
 *
 *  The bar is repayment progress, which the old flat list left invisible — a
 *  30,000 loan with 20,000 already back looked identical to one where nothing
 *  had been paid. Progress is the single most useful thing to know about a
 *  loan, so it gets the mark and the outstanding figure gets the emphasis. */
export function LoanList({ loans }: { loans: LoanSummary[] }) {
  if (loans.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-chip border border-rule bg-surface-lift">
      {loans.map((loan, i) => {
        const Icon = loan.direction === "given" ? ArrowRight : ArrowLeft;
        const repaid = Math.max(loan.principal - loan.outstanding, 0);
        const repaidPct = loan.principal > 0 ? (repaid / loan.principal) * 100 : 0;
        const settled = loan.status === "settled";

        return (
          <Link
            key={loan.id}
            href={`/loans/${loan.id}`}
            style={{ "--i": i } as React.CSSProperties}
            className={clsx(
              "anim-stagger block px-3 py-3 transition-colors hover:bg-surface",
              i > 0 && "border-t border-rule-soft",
            )}
          >
            <div className="flex items-center gap-2.5">
              <Icon size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="t-body flex items-center gap-1.5 truncate">
                  <span className="truncate">{loan.personName}</span>
                  {loan.excludeFromTotal ? (
                    <MinusCircle
                      size={11}
                      strokeWidth={2}
                      className="shrink-0 text-fg-faint"
                      aria-label="Not counted in net worth"
                    />
                  ) : null}
                </div>
                <div className="t-label truncate text-fg-muted">
                  {loan.direction === "given" ? "You lent" : "You borrowed"}
                  {settled ? " · settled" : ""}
                </div>
              </div>
              {/* A settled loan's outstanding is 0 by definition, so showing it
                  would put a meaningless "0" on every closed row. What's worth
                  seeing there is what the loan WAS. */}
              <div className="shrink-0 text-right">
                <div className={clsx("tnum font-num text-[15px]", settled && "text-fg-muted")}>
                  <Sensitive>
                    {formatPKRWhole(settled ? loan.principal : loan.outstanding)}
                  </Sensitive>
                </div>
                {!settled && repaid > 0 ? (
                  <div className="t-micro text-fg-faint">
                    of <Sensitive>{formatPKRWhole(loan.principal)}</Sensitive>
                  </div>
                ) : null}
              </div>
              <ChevronRight
                size={14}
                strokeWidth={2}
                className="-mr-1 shrink-0 text-fg-faint"
                aria-hidden
              />
            </div>

            {!settled && repaid > 0 ? (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 bg-rule-soft">
                  <div
                    className="anim-bar-grow h-1 rounded-r-[2px] bg-chart-in"
                    style={{ "--bar-w": `${Math.min(repaidPct, 100)}%` } as React.CSSProperties}
                  />
                </div>
                <span className="t-micro shrink-0 tabular-nums text-fg-faint">
                  {Math.round(repaidPct)}% back
                </span>
              </div>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
