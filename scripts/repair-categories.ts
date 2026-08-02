// npm run repair:categories            → dry run
// npm run repair:categories -- --apply → writes
//
// Backfill for rows committed before category_id was made mandatory
// (app/api/nl/commit/route.ts): Layer 2 (Gemini/Groq) sometimes returned
// add_expense/add_income with neither category_id nor new_category set, and
// nothing forced a re-ask, so the row landed with no category at all
// ("Cups", "Tamatar", "Onion", "Plastic items" — real examples that prompted
// this script). New entries can no longer commit that way; this repairs the
// ones that already did.
//
// For each uncategorised row this re-runs the SAME Layer 2 parser used live,
// on the row's own raw_text (falling back to item/note when raw_text wasn't
// stored), and only ever picks from this user's EXISTING categories — never
// auto-creates a new_category in bulk, since that's a much larger blast
// radius than fixing an assignment. Anything the model can't confidently
// place, or that resolves to an existing English item name (per the same
// English-only rule this fix added to lib/llm.ts), is applied; the item text
// gets rewritten too when the parse gives an English name for what was
// stored in Roman Urdu — same "one item, one name" motivation as the
// category fix, addressed together since both are read off the same call.
import path from "node:path";
import { config } from "dotenv";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";
import { forUser } from "../lib/scope";
import { parseIntent, LLMQuotaError, type UserContext } from "../lib/llm";
import { retrieveExamples } from "../lib/retrieval";
import { categoryPath } from "../lib/taxonomy";
import { formatPKR } from "../lib/format";
import type { UserDoc, LoanDoc, TxnType } from "../lib/types";

config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");

const INTENT_FOR_TYPE: Partial<Record<TxnType, "add_expense" | "add_income">> = {
  expense: "add_expense",
  income: "add_income",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini's free tier is capped per-MINUTE (5 req/min for gemini-2.5-flash),
// not just per-day — a bare sequential loop over more than a handful of rows
// trips it well before exhausting any real daily quota. LLMQuotaError only
// fires once Groq (the fallback) has ALSO failed, which in practice means
// "both providers are momentarily rate-limited", not "done for the day" — so
// this waits out one rate-limit window and retries instead of giving up.
const QUOTA_RETRY_WAIT_MS = 65_000;
const QUOTA_MAX_RETRIES = 4;
const BETWEEN_ROWS_DELAY_MS = 3_000;

async function parseWithRetry(
  text: string,
  ctx: UserContext,
): Promise<Awaited<ReturnType<typeof parseIntent>> | null> {
  for (let attempt = 0; attempt <= QUOTA_MAX_RETRIES; attempt++) {
    try {
      return await parseIntent(text, ctx);
    } catch (err) {
      if (!(err instanceof LLMQuotaError)) throw err;
      if (attempt === QUOTA_MAX_RETRIES) return null; // give up on this row only
      console.log(
        `   … both providers rate-limited, waiting ${QUOTA_RETRY_WAIT_MS / 1000}s ` +
          `(attempt ${attempt + 1}/${QUOTA_MAX_RETRIES})`,
      );
      await sleep(QUOTA_RETRY_WAIT_MS);
    }
  }
  return null;
}

async function main() {
  const db = await getDb();
  const users = await db.collection<UserDoc>("users").find({}).toArray();

  console.log(APPLY ? "Applying changes.\n" : "DRY RUN — no writes. Add --apply to commit.\n");

  let fixed = 0;
  let renamedOnly = 0;
  let skippedNewCategory = 0;
  let skippedUnresolved = 0;

  for (const user of users) {
    const scope = await forUser(user._id);
    const uncategorised = await scope.transactions
      .find({
        type: { $in: ["expense", "income"] },
        category_id: { $exists: false },
        deleted_at: { $exists: false },
      })
      .toArray();
    if (uncategorised.length === 0) continue;

    console.log(`\n${user.email} — ${uncategorised.length} uncategorised row(s)`);

    const [accounts, categories, people, tags] = await Promise.all([
      scope.accounts.find({ archived: { $ne: true } }).toArray(),
      scope.categories.find({}).toArray(),
      scope.people.find({}).toArray(),
      scope.tags.find({}).toArray(),
    ]);
    const openLoans = await scope.loans.find({ status: "open" }).toArray();
    const loansByPerson = new Map<string, Pick<LoanDoc, "outstanding" | "direction">>(
      openLoans.map((l) => [l.person_id.toHexString(), l] as const),
    );
    const categoriesById = new Map(categories.map((c) => [c._id.toHexString(), c] as const));

    for (const txn of uncategorised) {
      // Prefer item+note over raw_text when an item is already known: several
      // real rows here came from ONE multi-item message ("450 ky onion, 400
      // ky tamatar, ...") split into separate transactions at commit time,
      // each keeping the SAME shared raw_text. Re-parsing that shared
      // sentence re-triggers the "multi" split again here and consistently
      // broke Groq's strict JSON mode on this model for a 5-action message.
      // item+note is the already-isolated per-row text — a single expense,
      // never multi — and is exactly what's missing a category, not the
      // intent split (that part was already done correctly).
      const text = txn.item
        ? [txn.item, txn.note].filter(Boolean).join(" ")
        : txn.raw_text || txn.note || "";
      const label = `${formatPKR(txn.amount)} "${txn.item ?? (text || "(no text)")}"`;
      if (!text) {
        console.log(`   ? ${label}: no raw_text/item/note to re-parse — skipped`);
        skippedUnresolved++;
        continue;
      }

      const examples = await retrieveExamples(text, scope.userId);
      const ctx: UserContext = {
        now: txn.date,
        timezone: user.timezone ?? "Asia/Karachi",
        accounts,
        categories,
        people: people.map((p) => ({ ...p, openLoan: loansByPerson.get(p._id.toHexString()) })),
        tags,
        examples,
      };

      let result;
      try {
        result = await parseWithRetry(text, ctx);
      } catch (err) {
        console.log(`   ! ${label}: parse failed (${(err as Error).message}) — skipped`);
        skippedUnresolved++;
        await sleep(BETWEEN_ROWS_DELAY_MS);
        continue;
      }
      if (!result) {
        console.log(`   ! ${label}: still rate-limited after retries — skipped, re-run later for this one`);
        skippedUnresolved++;
        continue;
      }

      const wantIntent = INTENT_FOR_TYPE[txn.type];

      // A row whose original message described several transactions at once
      // (raw_text is the SAME full sentence for every one of them, since
      // that's what commitMulti stored) re-parses as "multi" again here, not
      // a plain add_expense/add_income — the amount is what tells them apart.
      let effective: { category_id?: string; new_category?: (typeof result)["new_category"]; item?: string } | null =
        null;
      if (result.intent === wantIntent) {
        effective = result;
      } else if (result.intent === "multi" && result.actions) {
        const match = result.actions.find((a) => a.intent === wantIntent && a.amount === txn.amount);
        if (match) effective = match;
      }

      if (!effective) {
        console.log(`   ? ${label}: re-parsed as ${result.intent}, not a matching ${wantIntent} — skipped, needs a look`);
        skippedUnresolved++;
        continue;
      }

      const set: Record<string, unknown> = {};
      let logged = false;

      if (effective.category_id && ObjectId.isValid(effective.category_id)) {
        const cat = categoriesById.get(effective.category_id);
        if (cat) {
          const parent = cat.parent_id ? categoriesById.get(cat.parent_id.toHexString()) : null;
          set.category_id = cat._id;
          set.root_category_id = cat.root_id;
          console.log(`   CATEGORY ${label} → ${categoryPath(cat, parent ?? null)}`);
          logged = true;
          fixed++;
        }
      }

      if (!logged && effective.new_category) {
        console.log(
          `   ? ${label}: model would propose a NEW category "${effective.new_category.name}" — ` +
            `skipped, bulk backfill never auto-creates one`,
        );
        skippedNewCategory++;
      } else if (!logged) {
        console.log(`   ? ${label}: still no confident category — skipped`);
        skippedUnresolved++;
      }

      if (effective.item && effective.item !== txn.item) {
        console.log(`   ~ item ${JSON.stringify(txn.item ?? "")} → ${JSON.stringify(effective.item)}`);
        set.item = effective.item;
        if (!logged) renamedOnly++;
      }

      if (Object.keys(set).length > 0 && APPLY) {
        await scope.transactions.updateOne({ _id: txn._id }, { $set: set });
      }

      await sleep(BETWEEN_ROWS_DELAY_MS);
    }
  }

  await printSummary();
  process.exit(0);

  async function printSummary() {
    console.log(
      `\n${fixed} categorised · ${renamedOnly} item-renamed-only · ` +
        `${skippedNewCategory} need a new category (manual) · ${skippedUnresolved} unresolved`,
    );
    if (!APPLY && fixed + renamedOnly > 0) {
      console.log("\nNothing written. Re-run with --apply to make these changes.");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
