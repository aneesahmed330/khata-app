// npm run repair:entries            → dry run
// npm run repair:entries -- --apply → writes
//
// One-off repair for rows written BEFORE two parser bugs were fixed:
//
//   1. lib/parser/amount.ts treated the `k` of a following word as a x1000
//      multiplier, so "<number> ka/ki/ke ..." (the commonest Roman Urdu shape)
//      was stored 1000x too large — and "5oo" style ASR digit-letter artifacts
//      silently matched only the leading digit.
//   2. lib/parser/index.ts put the whole raw sentence in `item`.
//
// The code paths are fixed, but already-committed rows are not. Amounts are
// corrected through the ledger (reverseTransaction / recomputeAccountBalance)
// so account balances stay consistent — never by patching `amount` alone.
import path from "node:path";
import { config } from "dotenv";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";
import { forUser } from "../lib/scope";
import { reverseTransaction, recomputeAccountBalance, ACCOUNT_SIGN } from "../lib/ledger";
import { formatPKR } from "../lib/format";
import type { UserDoc, TransactionDoc } from "../lib/types";

config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");

/** Rows whose stored amount/item is wrong because of the bugs above. Matched on
 *  exact raw_text so nothing else can be caught by accident. */
const AMOUNT_FIXES: Array<{ rawText: string; amount: number; item?: string }> = [
  { rawText: "ma na 5oo ki biryani kahi te", amount: 500, item: "Biryani" },
  {
    rawText: "ma na indrive ky 100 rupa diya ty indrive ky",
    amount: 100, // already correct — only the sentence-as-item needs cleaning
    item: "InDrive",
  },
];

async function main() {
  const db = await getDb();
  const users = await db.collection<UserDoc>("users").find({}).toArray();

  console.log(APPLY ? "Applying changes.\n" : "DRY RUN — no writes. Add --apply to commit.\n");

  for (const user of users) {
    console.log(`── ${user.email}`);
    const scope = await forUser(user._id);
    const touchedAccounts = new Set<string>();
    let changes = 0;

    const all = await scope.transactions
      .find({ deleted_at: { $exists: false } }, { sort: { _id: 1 } })
      .toArray();

    // ── 1. Exact duplicates — same text, amount, account and type ───────────
    // Keeps the earliest (_id is monotonic) and reverses the rest, which both
    // soft-deletes them and undoes their balance effect.
    const groups = new Map<string, TransactionDoc[]>();
    for (const txn of all) {
      const key = [txn.raw_text ?? "", txn.amount, txn.type, txn.account_id.toHexString()].join("|");
      const list = groups.get(key);
      if (list) list.push(txn);
      else groups.set(key, [txn]);
    }

    for (const list of groups.values()) {
      if (list.length < 2 || !list[0]?.raw_text) continue;
      for (const dupe of list.slice(1)) {
        console.log(
          `   - duplicate  ${formatPKR(dupe.amount)}  "${dupe.raw_text}"\n` +
            `                keeping the first of ${list.length}, reversing this one`,
        );
        changes++;
        touchedAccounts.add(dupe.account_id.toHexString());
        if (APPLY) await reverseTransaction(scope, dupe._id);
      }
    }

    // ── 2. Wrong amounts / sentence-as-item ─────────────────────────────────
    for (const fix of AMOUNT_FIXES) {
      const matches = all.filter((t) => t.raw_text === fix.rawText && !t.deleted_at);

      for (const txn of matches) {
        const set: Partial<TransactionDoc> = {};
        if (txn.amount !== fix.amount) {
          console.log(
            `   ~ amount     ${formatPKR(txn.amount)} → ${formatPKR(fix.amount)}  "${fix.rawText}"`,
          );
          set.amount = fix.amount;
          touchedAccounts.add(txn.account_id.toHexString());
        }
        if (fix.item && txn.item !== fix.item) {
          console.log(`   ~ item       ${JSON.stringify(txn.item)} → ${JSON.stringify(fix.item)}`);
          set.item = fix.item;
        }
        if (Object.keys(set).length === 0) continue;

        changes++;
        if (APPLY) await scope.transactions.updateOne({ _id: txn._id }, { $set: set });
      }
    }

    // ── 3. Rebuild the balances of every account we touched ─────────────────
    // transactions are the source of truth; account.balance is a cache (§7).
    if (APPLY) {
      for (const id of touchedAccounts) {
        const accountId = new ObjectId(id);
        const balance = await recomputeAccountBalance(scope, accountId);
        const account = await scope.accounts.findOne({ _id: accountId });
        console.log(`   = recomputed  ${account?.name ?? id} → ${formatPKR(balance)}`);
      }
    } else if (touchedAccounts.size > 0) {
      console.log(`   = would recompute ${touchedAccounts.size} account balance(s)`);
    }

    if (changes === 0) console.log("   nothing to repair");
    console.log("");
  }

  // Read-only integrity report. This deliberately does NOT call
  // recomputeAccountBalance — that function WRITES ($set: balance), and running
  // it over every account here once overwrote declared opening balances that had
  // no backing transaction, wiping real values. Drift is reported so it can be
  // investigated; it is never silently "corrected".
  console.log("Balances (stored vs sum of transactions):");
  for (const user of users) {
    const scope = await forUser(user._id);
    const accounts = await scope.accounts.find({ archived: { $ne: true } }).toArray();
    const txns = await scope.transactions.find({ deleted_at: { $exists: false } }).toArray();

    for (const acc of accounts) {
      let summed = 0;
      for (const t of txns) {
        if (t.account_id.equals(acc._id)) summed += ACCOUNT_SIGN[t.type] * t.amount;
        if (t.to_account_id?.equals(acc._id)) summed += t.amount;
      }
      const drift = summed === acc.balance ? "" : `   DRIFT — transactions sum to ${formatPKR(summed)}`;
      console.log(`   ${acc.name.padEnd(14)} ${formatPKR(acc.balance).padStart(10)}${drift}`);
    }
  }

  console.log(APPLY ? "\nDone." : "\nNothing written. Re-run with --apply to commit.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Repair failed:", err.message ?? err);
  process.exit(1);
});
