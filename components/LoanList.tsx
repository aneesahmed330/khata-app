import { ArrowRight, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { formatPKR } from "@/lib/format";
import { Sensitive } from "@/components/Sensitive";

export interface LoanSummary {
  id: string;
  personName: string;
  direction: "given" | "taken";
  outstanding: number;
}

// Same glyph vocabulary as LedgerRow's loan_given/loan_taken icons (→ money
// out to them, ← money in from them) — a dashboard summary, not a ledger, so
// no delete/edit affordance, just who and how much.
export function LoanList({ loans }: { loans: LoanSummary[] }) {
  if (loans.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-chip border border-rule">
      {loans.map((loan, i) => {
        const Icon = loan.direction === "given" ? ArrowRight : ArrowLeft;
        return (
          <div
            key={loan.id}
            className={clsx("flex items-center gap-2.5 px-3 py-2.5", i > 0 && "border-t border-rule-soft")}
          >
            <Icon size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="t-body truncate">{loan.personName}</div>
              <div className="t-label text-fg-muted">{loan.direction === "given" ? "You lent" : "You borrowed"}</div>
            </div>
            <span className="tnum shrink-0 font-num text-[15px]">
              <Sensitive>{formatPKR(loan.outstanding)}</Sensitive>
            </span>
          </div>
        );
      })}
    </div>
  );
}
