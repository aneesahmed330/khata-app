// Action Receipts — plan.md §5. Every commit returns one of these; the
// "nothing_changed" variant exists specifically so a skip is never silent
// (declare_account with an unchanged balance, for instance).
import { ObjectId } from "mongodb";
import { randomBytes } from "node:crypto";
import type { UserScope } from "./scope";
import { reverseTransaction } from "./ledger";
import { formatPKR } from "./format";

export type Effect =
  | { kind: "account_created"; name: string; accountType: string; balance: number }
  | { kind: "balance_adjusted"; name: string; from: number; to: number; delta: number }
  | { kind: "category_created"; name: string; type: string; parent?: string }
  | { kind: "tag_created"; name: string }
  | { kind: "person_created"; name: string }
  | {
      kind: "transaction_added";
      item?: string;
      amount: number;
      categoryPath?: string;
      account: string;
      note?: string;
    }
  | { kind: "loan_opened"; person: string; amount: number }
  | { kind: "loan_updated"; person: string; added: number; outstanding: number }
  | { kind: "loan_settled"; person: string }
  | { kind: "transfer_made"; from: string; to: string; amount: number }
  | { kind: "nothing_changed"; what: string; reason: string };

export interface ActionReceipt {
  id: string;
  summary: string;
  effects: Effect[];
  undoToken: string;
  spoken: string;
}

function summarize(effects: Effect[]): { summary: string; spoken: string } {
  const txn = effects.find((e) => e.kind === "transaction_added");
  if (txn && txn.kind === "transaction_added") {
    const label = txn.item || txn.categoryPath || "Entry";
    return {
      summary: `${label} — ${formatPKR(txn.amount)}`,
      spoken: `${label}, ${formatPKR(txn.amount)} rupees, from ${txn.account}.`,
    };
  }
  const skip = effects.find((e) => e.kind === "nothing_changed");
  if (skip && skip.kind === "nothing_changed") {
    return { summary: `${skip.what} — no change`, spoken: `${skip.what}, no change.` };
  }
  const loan = effects.find((e) => e.kind === "loan_opened" || e.kind === "loan_updated");
  if (loan) {
    const amount = loan.kind === "loan_opened" ? loan.amount : loan.kind === "loan_updated" ? loan.added : 0;
    const person = loan.kind === "loan_opened" || loan.kind === "loan_updated" ? loan.person : "";
    return { summary: `${person} — ${formatPKR(amount)}`, spoken: `${formatPKR(amount)} rupees for ${person}.` };
  }
  const transfer = effects.find((e) => e.kind === "transfer_made");
  if (transfer && transfer.kind === "transfer_made") {
    return {
      summary: `${transfer.from} → ${transfer.to} — ${formatPKR(transfer.amount)}`,
      spoken: `${formatPKR(transfer.amount)} rupees transferred from ${transfer.from} to ${transfer.to}.`,
    };
  }
  const account = effects.find((e) => e.kind === "account_created" || e.kind === "balance_adjusted");
  if (account) {
    if (account.kind === "account_created") {
      return {
        summary: `Created account ${account.name} — ${formatPKR(account.balance)}`,
        spoken: `Created account ${account.name}.`,
      };
    }
    return {
      summary: `${account.name}: ${formatPKR(account.from)} → ${formatPKR(account.to)}`,
      spoken: `Adjusted ${account.name}'s balance.`,
    };
  }
  return { summary: "Done", spoken: "Done." };
}

/** Persists the receipt and returns it in the shape the UI renders.
 *  transactionIds is what /nl/undo actually reverses — the effects array
 *  is display-only, so undo can never silently do less than the commit did. */
export async function saveReceipt(
  scope: UserScope,
  effects: Effect[],
  transactionIds: ObjectId[],
): Promise<ActionReceipt> {
  const { summary, spoken } = summarize(effects);
  const undoToken = randomBytes(16).toString("hex");
  const doc = {
    _id: new ObjectId(),
    user_id: scope.userId,
    summary,
    effects,
    transaction_ids: transactionIds,
    undo_token: undoToken,
    created_at: new Date(),
  };
  await scope.receipts.raw().insertOne(doc);

  return { id: doc._id.toHexString(), summary, effects, undoToken, spoken };
}

/** Scoped by user_id + token together (plan.md §8.1) — a guessed token
 *  alone must never be enough to undo someone else's transaction. */
export async function undoReceipt(scope: UserScope, undoToken: string): Promise<boolean> {
  const receipt = await scope.receipts.findOne({ undo_token: undoToken, undone_at: { $exists: false } });
  if (!receipt) return false;

  for (const txnId of receipt.transaction_ids) {
    await reverseTransaction(scope, txnId);
  }
  await scope.receipts.updateOne({ _id: receipt._id }, { $set: { undone_at: new Date() } });
  return true;
}
