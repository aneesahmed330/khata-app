"use client";

import { useEffect, useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { formatPKR } from "@/lib/format";

// Shared by AddForm (NL path) and ManualEntryForm (fallback path) — a receipt
// looks and behaves the same regardless of how the transaction was entered,
// which is the whole point of routing both through the same /api/nl/commit
// endpoint in the first place.
export interface EffectLike {
  kind: string;
  [key: string]: unknown;
}
export interface ActionReceipt {
  id: string;
  summary: string;
  effects: EffectLike[];
  undoToken: string;
  spoken: string;
}
export interface NeedsConfirmation {
  needsConfirmation: true;
  reason: "category" | "account" | "loan_action";
  proposal?: { name: string; type?: string; parentName?: string | null; balance?: number };
  loanContext?: { person: string; outstanding: number | null };
  missing?: string[];
  /** Set only when the parent message was intent: "multi" — which of
   *  parsed.actions this confirmation is about. */
  actionIndex?: number;
}
export type CommitResponse = ActionReceipt | NeedsConfirmation | { error: string };

export function describeEffect(effect: EffectLike): string {
  switch (effect.kind) {
    case "transaction_added":
      return `${effect.item ?? effect.categoryPath ?? "Entry"} — ${formatPKR(Number(effect.amount ?? 0))}`;
    case "category_created":
      return `Created category ${effect.name}`;
    case "tag_created":
      return `Created tag "${effect.name}"`;
    case "person_created":
      return `Added ${effect.name}`;
    case "loan_opened":
      return `Loan opened — ${formatPKR(Number(effect.amount ?? 0))}`;
    case "loan_updated":
      return `${effect.person} — ${formatPKR(Number(effect.outstanding ?? 0))} outstanding`;
    case "loan_settled":
      return `${effect.person}'s loan settled`;
    case "transfer_made":
      return `${effect.from} → ${effect.to} — ${formatPKR(Number(effect.amount ?? 0))}`;
    case "account_created":
      return `Created account ${effect.name} — ${formatPKR(Number(effect.balance ?? 0))}`;
    case "balance_adjusted":
      return `${effect.name}: ${formatPKR(Number(effect.from ?? 0))} → ${formatPKR(Number(effect.to ?? 0))}`;
    case "nothing_changed":
      return `${effect.what} — ${effect.reason}`;
    default:
      return JSON.stringify(effect);
  }
}

export function ReceiptView({
  receipt,
  onUndo,
  onDone,
  doneLabel = "Add another",
}: {
  receipt: ActionReceipt;
  onUndo: () => void;
  onDone: () => void;
  doneLabel?: string;
}) {
  // 5-minute undo window server-side; the bar is a 5s visual affordance only
  // (DESIGN.md §6 undo toast), so it never implies the token has expired.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDismissed(true), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="anim-rise">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-in/15 text-in">
          <Check size={12} strokeWidth={3} aria-hidden />
        </span>
        <span className="t-label text-fg-muted">Done</span>
      </div>

      <div className="border-t border-rule">
        {receipt.effects.map((effect, i) => (
          <div key={i} className="flex items-start gap-2.5 border-b border-rule-soft py-2.5">
            <span className="mt-0.5 shrink-0 text-fg-faint">
              {effect.kind === "nothing_changed" ? (
                <span className="block size-1 rounded-full bg-fg-faint" aria-hidden />
              ) : (
                <Check size={13} strokeWidth={2} aria-hidden />
              )}
            </span>
            <span className="t-label flex-1">{describeEffect(effect)}</span>
          </div>
        ))}
      </div>

      {!dismissed ? (
        <div aria-hidden className="mt-0.5 h-px overflow-hidden">
          <div
            className="h-px origin-left bg-accent"
            style={{ animation: "k-countdown 5s linear both" }}
          />
        </div>
      ) : null}

      {/* Primary flex-1 + secondary fixed 52px square icon — same pairing as
          PreviewCard's Save/Cancel row, so a receipt's actions read the same
          as everywhere else instead of looking like an unbalanced leftover. */}
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-chip bg-accent py-3.5 text-[15px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98]"
        >
          {doneLabel}
        </button>
        <button
          type="button"
          onClick={onUndo}
          aria-label="Undo"
          className="flex size-[52px] shrink-0 items-center justify-center rounded-chip border border-rule text-fg-muted transition-colors hover:text-fg"
        >
          <Undo2 size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
}
