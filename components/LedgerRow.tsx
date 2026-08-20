"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  Scale,
  TrendingUp,
  TrendingDown,
  Coins,
  Trash2,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { Amount } from "./Amount";
import { deleteTransactionAction, type TxnActionResult } from "@/actions/transactions";
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
  investment_buy: TrendingUp,
  investment_sell: TrendingDown,
  dividend: Coins,
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
  investment_buy: "Invested",
  investment_sell: "Sold",
  dividend: "Dividend",
};

export interface LedgerRowData {
  id: string;
  type: TxnType;
  item?: string;
  amount: number;
  categoryPath?: string;
  accountName?: string;
  toAccountName?: string;
  personName?: string;
  holdingName?: string;
  note?: string;
  tagNames?: string[];
}

const LOAN_TYPES: ReadonlySet<TxnType> = new Set<TxnType>([
  "loan_given",
  "loan_taken",
  "repayment_in",
  "repayment_out",
]);

const INVESTMENT_TYPES: ReadonlySet<TxnType> = new Set<TxnType>([
  "investment_buy",
  "investment_sell",
  "dividend",
]);

export function LedgerRow({
  row,
  redirectTo,
}: {
  row: LedgerRowData;
  /** Where the delete action lands afterward — the page this row is rendered
   *  on, so deleting from Home doesn't unexpectedly jump to History. */
  redirectTo: "/" | "/history";
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleteState, deleteFormAction] = useFormState<TxnActionResult, FormData>(
    deleteTransactionAction,
    {},
  );
  const Icon = ICON[row.type];
  const hasItem = Boolean(row.item);
  const isLoan = LOAN_TYPES.has(row.type);
  const isInvestment = INVESTMENT_TYPES.has(row.type);
  // Loans key off WHO, investments key off WHICH holding — either way it's
  // the specific thing this row is about, not the generic verb.
  const subject = isLoan ? row.personName : isInvestment ? row.holdingName : undefined;

  // "Loan given" or "Invested" alone told you nothing about which loan/holding
  // it was. The subject becomes the headline; the verb moves down next to the
  // account.
  const label = subject || row.item || row.categoryPath || TYPE_LABEL[row.type];
  // When there's no item the title already IS the category path, so repeating it
  // in the meta line printed "Home › Rent" twice and made the root read like a
  // mis-categorisation rather than the parent bucket it is.
  const meta =
    isLoan || isInvestment
      ? [subject ? TYPE_LABEL[row.type] : undefined, row.accountName].filter(Boolean).join(" · ")
      : row.type === "transfer" && row.toAccountName
        ? `${row.accountName} → ${row.toAccountName}`
        : [hasItem ? row.categoryPath : undefined, row.accountName].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center gap-2.5 border-b border-rule-soft py-1.5 transition-colors last:border-b-0 hover:bg-surface-lift/60">
      <Link href={`/txn/${row.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
        {/* Monochrome by design (§3) — direction is the glyph, never a colour */}
        <Icon size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="t-body truncate leading-tight">{label}</div>
          {/* Plain 11px, not .t-micro — that utility carries text-transform:
              uppercase, and overriding it with normal-case is a coin flip
              since both live in the same cascade layer. Caps also truncated
              far sooner: "MEZAAN B…" where "Mezaan Bank" fits. */}
          {meta ? (
            <div className="truncate text-[11px] leading-tight text-fg-muted">{meta}</div>
          ) : null}
          {row.note ? (
            <div className="truncate text-[11px] italic leading-tight text-fg-faint">{row.note}</div>
          ) : null}
          {row.tagNames && row.tagNames.length > 0 ? (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {row.tagNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-surface-sunk px-1.5 py-0.5 text-[10px] leading-none text-fg-faint"
                >
                  #{name}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Fixed right column — the whole point of a ledger (§5) */}
        <Amount value={row.amount} className="shrink-0 text-right tabular-nums" />
      </Link>

      {/* Always visible, not hover-revealed — this is a touch-first PWA, and a
          row's only affordance being a :hover state left it unreachable on
          phones. A tap arms a two-icon confirm in place, so one accidental tap
          still can't delete anything. */}
      {confirming ? (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <form action={deleteFormAction}>
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <DeleteConfirmSubmit />
            </form>
            <button
              type="button"
              aria-label="Cancel delete"
              onClick={() => setConfirming(false)}
              className="flex size-7 items-center justify-center rounded-full text-fg-faint transition-colors hover:text-fg-muted"
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </div>
          {/* Only ever renders on failure — success redirects away before this
              component gets a chance to show a message. */}
          {deleteState.error ? (
            <p className="t-label max-w-40 text-right text-out">{deleteState.error}</p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          aria-label="Delete entry"
          onClick={() => setConfirming(true)}
          className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-fg-faint transition-colors hover:bg-out/10 hover:text-out"
        >
          <Trash2 size={14} strokeWidth={1.75} aria-hidden />
        </button>
      )}
    </div>
  );
}

function DeleteConfirmSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Confirm delete"
      className="flex size-7 items-center justify-center rounded-full bg-out/15 text-out transition-colors hover:bg-out/25 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden />
      ) : (
        <Check size={14} strokeWidth={2.5} aria-hidden />
      )}
    </button>
  );
}
