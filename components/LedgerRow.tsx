import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  Scale,
  ChevronRight,
} from "lucide-react";
import { Amount } from "./Amount";
import type { TxnType } from "@/lib/types";

// DESIGN.md §3's glyph vocabulary, as real icons rather than Unicode
// characters: ↓ out · ↑ in · → udhaar diya · ← wapas aaya.
const ICON: Record<TxnType, typeof ArrowDown> = {
  expense: ArrowDown,
  income: ArrowUp,
  loan_given: ArrowRight,
  loan_taken: ArrowLeft,
  repayment_in: ArrowLeft,
  repayment_out: ArrowRight,
  transfer: ArrowLeftRight,
  adjustment: Scale,
};

// Fallback title per type, used when a row has no `item`. Without this every
// such row rendered the literal word "Entry" — which is what made restored
// opening-balance adjustments read as meaningless rows in the ledger.
const TYPE_LABEL: Record<TxnType, string> = {
  expense: "Expense",
  income: "Income",
  loan_given: "Loan given",
  loan_taken: "Loan taken",
  repayment_in: "Repayment received",
  repayment_out: "Repayment made",
  transfer: "Transfer",
  adjustment: "Balance adjustment",
};

export interface LedgerRowData {
  id: string;
  type: TxnType;
  item?: string;
  amount: number;
  categoryPath?: string;
  accountName?: string;
  note?: string;
}

export function LedgerRow({ row }: { row: LedgerRowData }) {
  const Icon = ICON[row.type];
  const hasItem = Boolean(row.item);
  const label = row.item || row.categoryPath || TYPE_LABEL[row.type];
  // When there's no item the title already IS the category path, so repeating it
  // in the meta line printed "Home › Rent" twice and made the root read like a
  // mis-categorisation rather than the parent bucket it is.
  const meta = [hasItem ? row.categoryPath : undefined, row.accountName]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/txn/${row.id}`}
      className="group flex items-center gap-3 border-b border-rule-soft py-2.5 transition-colors last:border-b-0 hover:bg-surface-lift/60 active:bg-surface-lift"
    >
      {/* Monochrome by design (§3) — direction is the glyph, never a colour */}
      <Icon size={15} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="t-body truncate">{label}</div>
        {meta ? <div className="t-label truncate text-fg-muted">{meta}</div> : null}
        {row.note ? <div className="t-label truncate italic text-fg-faint">{row.note}</div> : null}
      </div>

      {/* Fixed right column — the whole point of a ledger (§5) */}
      <Amount value={row.amount} className="shrink-0 text-right tabular-nums" />

      <ChevronRight
        size={14}
        strokeWidth={1.75}
        className="-mr-1 shrink-0 text-transparent transition-colors group-hover:text-fg-faint"
        aria-hidden
      />
    </Link>
  );
}
