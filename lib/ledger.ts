// Balance mutation — plan.md §7 "Balance rule". Every write here runs
// inside a Mongo transaction (Atlas is always a replica set, even on M0)
// so "transaction recorded but balance not updated" can't happen.
import { ObjectId, type ClientSession } from "mongodb";
import { getDb, getClient } from "./db";
import type { UserScope } from "./scope";
import type { TxnType, TxnSource, InputMode, TransactionDoc, LoanDoc, HoldingDoc } from "./types";

export interface PostTransactionInput {
  type: TxnType;
  amount: number; // for "adjustment", this is the signed delta, not an absolute value
  item?: string;
  note?: string;
  category_id?: ObjectId;
  root_category_id?: ObjectId;
  // Optional only for investment_buy/investment_sell/dividend — see
  // TransactionDoc.account_id. Every other type must still supply one;
  // callers enforce that themselves (this function trusts what it's given).
  account_id?: ObjectId;
  to_account_id?: ObjectId;
  person_id?: ObjectId;
  loan_id?: ObjectId; // set when appending to / repaying an existing loan
  holding_id?: ObjectId; // set for investment_buy/investment_sell/dividend
  quantity_delta?: number; // shares/grams/units for investment_buy/investment_sell — always positive
  tag_ids?: ObjectId[];
  date: Date;
  raw_text?: string;
  input_mode?: InputMode;
  source: TxnSource;
  confidence?: number;
  receipt_id?: ObjectId;
}

// Sign convention: how `amount` moves each account's balance.
export const ACCOUNT_SIGN: Record<TxnType, number> = {
  expense: -1,
  income: 1,
  transfer: -1,
  loan_given: -1, // money left your account
  loan_taken: 1, // money entered your account
  repayment_in: 1, // someone paid YOU back
  repayment_out: -1, // you paid someone back
  adjustment: 1, // amount is already the signed delta
  investment_buy: -1, // money left your account into the holding
  investment_sell: 1, // proceeds landed back in your account
  dividend: 1, // payout landed in your account
};

export interface PostedTransaction {
  transactionId: ObjectId;
  loanId: ObjectId | null;
  loanOutstanding: number | null;
}

export async function postTransaction(
  scope: UserScope,
  input: PostTransactionInput,
): Promise<PostedTransaction> {
  const client = await getClient();
  const session: ClientSession = client.startSession();
  const txnId = new ObjectId();
  let loanId: ObjectId | null = input.loan_id ?? null;
  let loanOutstanding: number | null = null;

  try {
    await session.withTransaction(async () => {
      const db = await getDb();
      const transactions = db.collection<TransactionDoc>("transactions");
      const accounts = db.collection("accounts");
      const loans = db.collection<LoanDoc>("loans");
      const holdings = db.collection<HoldingDoc>("holdings");

      await transactions.insertOne(
        {
          _id: txnId,
          user_id: scope.userId,
          type: input.type,
          amount: input.amount,
          item: input.item,
          note: input.note,
          category_id: input.category_id,
          root_category_id: input.root_category_id,
          account_id: input.account_id,
          to_account_id: input.to_account_id,
          person_id: input.person_id,
          loan_id: input.loan_id,
          holding_id: input.holding_id,
          quantity_delta: input.quantity_delta,
          tag_ids: input.tag_ids ?? [],
          date: input.date,
          raw_text: input.raw_text,
          input_mode: input.input_mode,
          source: input.source,
          confidence: input.confidence,
          receipt_id: input.receipt_id,
          created_at: new Date(),
        },
        { session },
      );

      if (input.account_id) {
        const sign = ACCOUNT_SIGN[input.type];
        await accounts.updateOne(
          { _id: input.account_id, user_id: scope.userId },
          { $inc: { balance: sign * input.amount } },
          { session },
        );
      }
      if (input.to_account_id) {
        await accounts.updateOne(
          { _id: input.to_account_id, user_id: scope.userId },
          { $inc: { balance: input.amount } }, // transfer's destination always gains
          { session },
        );
      }

      if (input.type === "loan_given" || input.type === "loan_taken") {
        if (input.loan_id) {
          const updated = await loans.findOneAndUpdate(
            { _id: input.loan_id, user_id: scope.userId },
            { $inc: { principal: input.amount, outstanding: input.amount } },
            { session, returnDocument: "after" },
          );
          loanOutstanding = updated?.outstanding ?? null;
        } else if (input.person_id) {
          const newLoanId = new ObjectId();
          await loans.insertOne(
            {
              _id: newLoanId,
              user_id: scope.userId,
              person_id: input.person_id,
              direction: input.type === "loan_given" ? "given" : "taken",
              principal: input.amount,
              outstanding: input.amount,
              // Loans always have a funding account — only investment_buy/
              // sell/dividend ever omit one, and this branch only runs for
              // loan_given/loan_taken.
              account_id: input.account_id!,
              status: "open",
              created_at: new Date(),
            },
            { session },
          );
          // Back-link the opening transaction to the loan it just opened.
          // Without this the row that STARTS a loan carries no loan_id (the
          // loan doesn't exist yet at insert time), which broke two things:
          // reverseTransaction guards on txn.loan_id, so deleting that row
          // refunded the account but left the loan standing at full
          // outstanding forever; and "every transaction for this loan" could
          // never see the opening entry. Same session, so it stays atomic.
          await transactions.updateOne(
            { _id: txnId, user_id: scope.userId },
            { $set: { loan_id: newLoanId } },
            { session },
          );
          loanId = newLoanId;
          loanOutstanding = input.amount;
        }
      }

      if ((input.type === "repayment_in" || input.type === "repayment_out") && input.loan_id) {
        const updated = await loans.findOneAndUpdate(
          { _id: input.loan_id, user_id: scope.userId },
          { $inc: { outstanding: -input.amount } },
          { session, returnDocument: "after" },
        );
        loanOutstanding = updated?.outstanding ?? null;
        if (updated && updated.outstanding <= 0) {
          await loans.updateOne(
            { _id: input.loan_id, user_id: scope.userId },
            { $set: { status: "settled", outstanding: 0 } },
            { session },
          );
          loanOutstanding = 0;
        }
      }

      if (input.holding_id) {
        if (input.type === "investment_buy" || input.type === "investment_sell") {
          const investedDelta = input.type === "investment_buy" ? input.amount : -input.amount;
          const quantityDelta =
            (input.type === "investment_buy" ? 1 : -1) * (input.quantity_delta ?? 0);
          const updated = await holdings.findOneAndUpdate(
            { _id: input.holding_id, user_id: scope.userId },
            { $inc: { invested_total: investedDelta, quantity: quantityDelta } },
            { session, returnDocument: "after" },
          );
          // Selling out fully closes the holding (mirrors loans' "settled");
          // buying back into a closed holding reopens it.
          if (updated && input.type === "investment_sell" && updated.quantity <= 0) {
            await holdings.updateOne(
              { _id: input.holding_id, user_id: scope.userId },
              { $set: { status: "closed", quantity: 0 } },
              { session },
            );
          } else if (updated && input.type === "investment_buy" && updated.status === "closed") {
            await holdings.updateOne(
              { _id: input.holding_id, user_id: scope.userId },
              { $set: { status: "open" } },
              { session },
            );
          }
        } else if (input.type === "dividend") {
          await holdings.updateOne(
            { _id: input.holding_id, user_id: scope.userId },
            { $inc: { dividends_received: input.amount } },
            { session },
          );
        }
      }

      // A category/tag that just got its first real use — bump usage_count
      // so the monthly hygiene job (plan.md §4.5) can tell "used once" from
      // "used every week" when it suggests merges.
      if (input.category_id) {
        await db
          .collection("categories")
          .updateOne(
            { _id: input.category_id, user_id: scope.userId },
            { $inc: { usage_count: 1 } },
            { session },
          );
      }
      for (const tagId of input.tag_ids ?? []) {
        await db
          .collection("tags")
          .updateOne({ _id: tagId, user_id: scope.userId }, { $inc: { usage_count: 1 } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  return { transactionId: txnId, loanId, loanOutstanding };
}

/** Reverses a transaction's balance/loan effects and soft-deletes it —
 *  used by /nl/undo and manual delete. Never hard-deletes (plan.md §5). */
export async function reverseTransaction(scope: UserScope, transactionId: ObjectId): Promise<void> {
  const client = await getClient();
  const session: ClientSession = client.startSession();

  try {
    await session.withTransaction(async () => {
      const db = await getDb();
      const transactions = db.collection<TransactionDoc>("transactions");
      const accounts = db.collection("accounts");
      const loans = db.collection<LoanDoc>("loans");
      const holdings = db.collection<HoldingDoc>("holdings");

      const txn = await transactions.findOne(
        { _id: transactionId, user_id: scope.userId },
        { session },
      );
      if (!txn || txn.deleted_at) return;

      if (txn.account_id) {
        const sign = ACCOUNT_SIGN[txn.type];
        await accounts.updateOne(
          { _id: txn.account_id, user_id: scope.userId },
          { $inc: { balance: -sign * txn.amount } },
          { session },
        );
      }
      if (txn.to_account_id) {
        await accounts.updateOne(
          { _id: txn.to_account_id, user_id: scope.userId },
          { $inc: { balance: -txn.amount } },
          { session },
        );
      }

      if (txn.loan_id) {
        const delta =
          txn.type === "loan_given" || txn.type === "loan_taken" ? -txn.amount : txn.amount;
        const after = await loans.findOneAndUpdate(
          { _id: txn.loan_id, user_id: scope.userId },
          { $inc: { outstanding: delta, principal: txn.type.startsWith("loan_") ? delta : 0 }, $set: { status: "open" } },
          { session, returnDocument: "after" },
        );
        // Undoing the entry that opened the loan leaves nothing behind it —
        // principal 0, outstanding 0. Keeping that row would put a permanent
        // "0.00" loan in the list that can never be settled or removed,
        // so the loan goes with its last transaction.
        if (after && after.principal <= 0) {
          await loans.deleteOne({ _id: txn.loan_id, user_id: scope.userId }, { session });
        }
      }

      if (txn.holding_id) {
        if (txn.type === "investment_buy" || txn.type === "investment_sell") {
          const investedDelta = txn.type === "investment_buy" ? -txn.amount : txn.amount;
          const quantityDelta = (txn.type === "investment_buy" ? -1 : 1) * (txn.quantity_delta ?? 0);
          await holdings.updateOne(
            { _id: txn.holding_id, user_id: scope.userId },
            { $inc: { invested_total: investedDelta, quantity: quantityDelta }, $set: { status: "open" } },
            { session },
          );
        } else if (txn.type === "dividend") {
          await holdings.updateOne(
            { _id: txn.holding_id, user_id: scope.userId },
            { $inc: { dividends_received: -txn.amount } },
            { session },
          );
        }
      }

      await transactions.updateOne(
        { _id: transactionId, user_id: scope.userId },
        { $set: { deleted_at: new Date() } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

export interface UpdateTransactionPatch {
  amount?: number;
  item?: string;
  note?: string;
  date?: Date;
  category_id?: ObjectId | null;
  root_category_id?: ObjectId | null;
  account_id?: ObjectId;
}

/** Edits a transaction and keeps every affected account balance correct in the
 *  same Mongo transaction. The old effect is backed out and the new one applied,
 *  so changing the amount, the account, or both can never leave a stale balance.
 *
 *  Loan-linked rows reject amount/account edits: the loan's `outstanding` and
 *  `principal` would also need reworking, and a half-applied loan edit is worse
 *  than refusing one. Delete + re-enter is the honest path there (delete already
 *  reverses loan effects via reverseTransaction). */
export async function updateTransaction(
  scope: UserScope,
  transactionId: ObjectId,
  patch: UpdateTransactionPatch,
): Promise<void> {
  const client = await getClient();
  const session: ClientSession = client.startSession();

  try {
    await session.withTransaction(async () => {
      const db = await getDb();
      const transactions = db.collection<TransactionDoc>("transactions");
      const accounts = db.collection("accounts");

      const txn = await transactions.findOne(
        { _id: transactionId, user_id: scope.userId },
        { session },
      );
      if (!txn) throw new Error("Transaction not found.");
      if (txn.deleted_at) throw new Error("This entry has already been deleted.");

      const amountChanged = patch.amount !== undefined && patch.amount !== txn.amount;
      const accountChanged =
        patch.account_id !== undefined && !patch.account_id.equals(txn.account_id);

      if ((amountChanged || accountChanged) && txn.loan_id) {
        throw new Error(
          "A loan entry's amount or account can't be edited — delete and re-enter instead.",
        );
      }
      if ((amountChanged || accountChanged) && txn.to_account_id) {
        throw new Error(
          "A transfer's amount or account can't be edited — delete and re-enter instead.",
        );
      }
      if ((amountChanged || accountChanged) && txn.holding_id) {
        throw new Error(
          "An investment entry's amount or account can't be edited — delete and re-enter instead.",
        );
      }

      const sign = ACCOUNT_SIGN[txn.type];
      const newAmount = patch.amount ?? txn.amount;
      const newAccountId = patch.account_id ?? txn.account_id;

      if (amountChanged || accountChanged) {
        // Back the old effect out of the old account...
        await accounts.updateOne(
          { _id: txn.account_id, user_id: scope.userId },
          { $inc: { balance: -sign * txn.amount } },
          { session },
        );
        // ...and apply the new one to the new account (may be the same doc).
        await accounts.updateOne(
          { _id: newAccountId, user_id: scope.userId },
          { $inc: { balance: sign * newAmount } },
          { session },
        );
      }

      const set: Partial<TransactionDoc> = {};
      const unset: Record<string, ""> = {};

      if (patch.amount !== undefined) set.amount = patch.amount;
      if (patch.account_id !== undefined) set.account_id = patch.account_id;
      if (patch.date !== undefined) set.date = patch.date;

      // Empty strings clear the field rather than storing "" — a blank note
      // should read as "no note", not as a note that happens to be empty.
      if (patch.item !== undefined) {
        if (patch.item) set.item = patch.item;
        else unset.item = "";
      }
      if (patch.note !== undefined) {
        if (patch.note) set.note = patch.note;
        else unset.note = "";
      }
      if (patch.category_id !== undefined) {
        if (patch.category_id) {
          set.category_id = patch.category_id;
          if (patch.root_category_id) set.root_category_id = patch.root_category_id;
        } else {
          unset.category_id = "";
          unset.root_category_id = "";
        }
      }

      await transactions.updateOne(
        { _id: transactionId, user_id: scope.userId },
        {
          ...(Object.keys(set).length > 0 ? { $set: set } : {}),
          ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

/** Recomputes an account's balance from scratch by summing all its
 *  non-deleted transactions — the safety net referenced throughout
 *  plan.md §4.6/§7. Corrects any drift from a missed edge case. */
export async function recomputeAccountBalance(scope: UserScope, accountId: ObjectId): Promise<number> {
  const db = await getDb();
  const transactions = db.collection<TransactionDoc>("transactions");

  const [outgoing, incoming] = await Promise.all([
    transactions
      .aggregate([
        { $match: { user_id: scope.userId, account_id: accountId, deleted_at: { $exists: false } } },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ])
      .toArray(),
    transactions
      .aggregate([
        {
          $match: {
            user_id: scope.userId,
            to_account_id: accountId,
            deleted_at: { $exists: false },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
  ]);

  let balance = 0;
  for (const row of outgoing) {
    const sign = ACCOUNT_SIGN[row._id as TxnType] ?? 0;
    balance += sign * row.total;
  }
  balance += incoming[0]?.total ?? 0; // transfer destinations always gain

  await scope.accounts.updateOne({ _id: accountId }, { $set: { balance } });
  return balance;
}
