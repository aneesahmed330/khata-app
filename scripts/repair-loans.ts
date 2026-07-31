// npm run repair:loans            → dry run
// npm run repair:loans -- --apply → writes
//
// Repairs loans left inconsistent by a bug in lib/ledger.ts (now fixed): the
// transaction that OPENS a loan was inserted before the loan row existed, and
// its id was never written back. So the opening entry carried no `loan_id`.
//
// reverseTransaction only touches a loan when the transaction names one. Undo
// a freshly-created loan — or delete that row from History — and the money was
// correctly returned to the account while the loan itself survived at full
// outstanding. The Loans screen then shows a debt the ledger has already
// unwound. That's what this script finds.
//
// Two distinct repairs:
//
//   LINK    the loan's opening transaction is still live but unlinked. Write
//           the id back so future deletes/undos reverse the loan properly.
//
//   ORPHAN  every transaction backing the loan is soft-deleted. The money has
//           already moved back; the loan is a leftover with nothing behind it.
//           Removing it is what reverseTransaction would have done itself had
//           the link existed (it drops a loan once principal hits zero).
//
// Account balances are NOT touched — the reversals already corrected them.
import path from "node:path";
import { config } from "dotenv";
import { getDb } from "../lib/db";
import { forUser } from "../lib/scope";
import { formatPKR } from "../lib/format";
import type { UserDoc, TransactionDoc } from "../lib/types";

config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");
const MATCH_WINDOW_MS = 10_000;

async function main() {
  const db = await getDb();
  const users = await db.collection<UserDoc>("users").find({}).toArray();

  let linked = 0;
  let orphaned = 0;
  let healthy = 0;
  let ambiguous = 0;

  for (const user of users) {
    const scope = await forUser(user._id);
    const loans = await scope.loans.find({}).toArray();
    if (loans.length === 0) continue;

    console.log(`\n${user.email} — ${loans.length} loan(s)`);

    for (const loan of loans) {
      const label = `${formatPKR(loan.principal)} (${loan.direction})`;
      const openingType = loan.direction === "given" ? "loan_given" : "loan_taken";

      const linkedLive = await scope.transactions.countDocuments({
        loan_id: loan._id,
        deleted_at: { $exists: false },
      } as never);
      if (linkedLive > 0) {
        healthy++;
        continue;
      }

      // Unlinked candidates written at the same moment as the loan itself —
      // both were produced by one postTransaction call, so the gap is
      // milliseconds. Deleted ones count here: they're what proves the loan
      // is an orphan rather than merely unlinked.
      const candidates = (await scope.transactions
        .find({ type: openingType, person_id: loan.person_id } as never)
        .toArray()) as TransactionDoc[];

      const matches = candidates.filter(
        (t) =>
          !t.loan_id &&
          Math.abs(t.created_at.getTime() - loan.created_at.getTime()) <= MATCH_WINDOW_MS,
      );

      if (matches.length > 1) {
        ambiguous++;
        console.log(`   ! ${label}: ${matches.length} candidate opening entries — skipped`);
        continue;
      }

      const opening = matches[0];
      const live = opening && !opening.deleted_at;

      if (live) {
        linked++;
        console.log(`   LINK   ${label}: opening entry relinked`);
        if (APPLY) {
          await scope.transactions.updateOne({ _id: opening._id }, { $set: { loan_id: loan._id } });
        }
        continue;
      }

      orphaned++;
      console.log(
        `   ORPHAN ${label}: ${opening ? "opening entry was deleted" : "no opening entry at all"}` +
          ` — nothing backs this loan, removing`,
      );
      if (APPLY) await scope.loans.deleteOne({ _id: loan._id });
    }
  }

  console.log(
    `\n${healthy} healthy · ${linked} ${APPLY ? "relinked" : "to relink"} · ` +
      `${orphaned} ${APPLY ? "removed" : "to remove"} · ${ambiguous} ambiguous`,
  );
  if (!APPLY && (linked > 0 || orphaned > 0)) {
    console.log("\nNothing written. Re-run with --apply to make these changes.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
