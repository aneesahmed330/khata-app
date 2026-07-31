// npm run restore:openings            → dry run
// npm run restore:openings -- --apply → writes
//
// One-off. Accounts declared via `declare_account` were created with their
// balance written straight onto the account document and NO backing transaction
// (lib/resolve.ts, now fixed). That broke the invariant
// `account.balance == sum(transactions)`, and running recomputeAccountBalance
// over those accounts reset them to their (much smaller) transaction sums,
// destroying the declared openings.
//
// This restores them the way they should have been recorded in the first place:
// an `adjustment` transaction carrying the opening amount, so the balance is
// backed by the ledger and survives any future recompute.
import path from "node:path";
import { config } from "dotenv";
import { getDb } from "../lib/db";
import { forUser } from "../lib/scope";
import { postTransaction, ACCOUNT_SIGN } from "../lib/ledger";
import { formatPKR } from "../lib/format";
import type { UserDoc } from "../lib/types";

config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");

/** The balance each account showed in the UI before the recompute wiped it.
 *  Taken from the screenshots/diagnosis, not guessed:
 *    Cash −105 · HBL 19,650 · Mezaan Bank 1,20,000 · SadaPay 1,200
 *  Mezaan's target is 90,000, not 1,20,000, because one of its two identical
 *  30,000 salary entries was a genuine duplicate and has been reversed. */
const TARGET_BALANCE: Record<string, number> = {
  "Mezaan Bank": 90_000,
  HBL: 19_650,
  SadaPay: 1_200,
  // Cash is intentionally absent: bootstrap created it at 0 and every rupee
  // through it is a real transaction, so it is already fully backed.
};

async function main() {
  const db = await getDb();
  const users = await db.collection<UserDoc>("users").find({}).toArray();

  console.log(APPLY ? "Applying changes.\n" : "DRY RUN — no writes. Add --apply to commit.\n");

  for (const user of users) {
    console.log(`── ${user.email}`);
    const scope = await forUser(user._id);
    const accounts = await scope.accounts.find({}).toArray();
    const txns = await scope.transactions.find({ deleted_at: { $exists: false } }).toArray();
    let changes = 0;

    for (const acc of accounts) {
      let summed = 0;
      let hasOpening = false;
      for (const t of txns) {
        if (t.account_id?.equals(acc._id)) {
          summed += ACCOUNT_SIGN[t.type] * t.amount;
          if (t.type === "adjustment") hasOpening = true;
        }
        if (t.to_account_id?.equals(acc._id)) summed += t.amount;
      }

      const target = TARGET_BALANCE[acc.name];
      if (target === undefined) {
        const ok = summed === acc.balance;
        console.log(
          `   ${acc.name.padEnd(14)} ${formatPKR(acc.balance).padStart(10)}  ${ok ? "backed" : `DRIFT (txns=${formatPKR(summed)})`}`,
        );
        continue;
      }

      if (hasOpening) {
        console.log(`   ${acc.name.padEnd(14)} already has an opening adjustment — skipped`);
        continue;
      }

      const opening = target - summed;
      if (opening === 0) {
        console.log(`   ${acc.name.padEnd(14)} already at ${formatPKR(target)} — nothing to add`);
        continue;
      }

      console.log(
        `   ${acc.name.padEnd(14)} txns=${formatPKR(summed).padStart(9)}  ` +
          `+ opening ${formatPKR(opening)}  → ${formatPKR(target)}`,
      );
      changes++;

      if (APPLY) {
        // postTransaction $inc's the account balance itself, so the stored
        // balance lands on `target` without a separate $set.
        await postTransaction(scope, {
          type: "adjustment",
          amount: opening, // ACCOUNT_SIGN.adjustment is +1 — already a signed delta
          item: "Opening balance",
          account_id: acc._id,
          date: acc.created_at,
          raw_text: `Opening balance reconstructed for ${acc.name}`,
          source: "adjustment",
        });
      }
    }

    // Label any adjustment this script wrote before `item` was set above —
    // without it the ledger rendered them as a bare "Entry".
    // Filtered in JS rather than with { item: { $exists: false } }: rows written
    // before lib/db.ts set ignoreUndefined have `item: null` with the key
    // present, which $exists:false does not match.
    const unlabelled = await scope.transactions
      .find({ type: "adjustment", deleted_at: { $exists: false } })
      .toArray();
    for (const t of unlabelled) {
      if (t.item) continue;
      if (!t.raw_text?.startsWith("Opening balance reconstructed")) continue;
      console.log(`   label  ${formatPKR(t.amount)} adjustment → "Opening balance"`);
      changes++;
      if (APPLY) {
        await scope.transactions.updateOne({ _id: t._id }, { $set: { item: "Opening balance" } });
      }
    }

    if (changes === 0) console.log("   nothing to restore");
    console.log("");
  }

  // Read-only verification — never calls recomputeAccountBalance (it writes).
  console.log("Final state:");
  for (const user of users) {
    const scope = await forUser(user._id);
    const accounts = await scope.accounts.find({ archived: { $ne: true } }).toArray();
    const txns = await scope.transactions.find({ deleted_at: { $exists: false } }).toArray();

    for (const acc of accounts) {
      let summed = 0;
      for (const t of txns) {
        if (t.account_id?.equals(acc._id)) summed += ACCOUNT_SIGN[t.type] * t.amount;
        if (t.to_account_id?.equals(acc._id)) summed += t.amount;
      }
      const ok = summed === acc.balance;
      console.log(
        `   ${acc.name.padEnd(14)} ${formatPKR(acc.balance).padStart(10)}  ` +
          (ok ? "= sum(transactions) ✓" : `!= sum(transactions) ${formatPKR(summed)} ✗`),
      );
    }
  }

  console.log(APPLY ? "\nDone." : "\nNothing written. Re-run with --apply to commit.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Restore failed:", err.message ?? err);
  process.exit(1);
});
