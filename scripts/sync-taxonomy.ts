// npm run sync:taxonomy            → dry run, shows what would change
// npm run sync:taxonomy -- --apply → writes
//
// SEED_TREE is COPIED into each user at bootstrap (plan.md §8.2), so editing
// lib/taxonomy.ts only affects users created afterwards. This backfills the
// difference into existing users: any root or leaf present in SEED_TREE but
// missing from their categories gets inserted, marked from_seed like the
// originals. Idempotent — re-running adds nothing.
//
// It also re-points transactions that landed in the wrong category because the
// right one did not exist yet. That part is listed explicitly and only runs
// with --apply.
import path from "node:path";
import { config } from "dotenv";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";
import { forUser } from "../lib/scope";
import { SEED_TREE, normalizeName } from "../lib/taxonomy";
import type { UserDoc, CategoryDoc } from "../lib/types";

config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");

/** Aliases to add once the categories they point at exist. Keyed by
 *  "Root › Leaf" so a leaf name that repeats under several roots (Maintenance)
 *  can never bind to the wrong parent — bootstrap's BASE_ALIASES keys by leaf
 *  name alone, which would be ambiguous here. */
const NEW_ALIASES: Array<{ path: string; terms: string[] }> = [
  {
    path: "Property › Flat Rent",
    // "flat ka rent" must resolve here rather than Home › Rent, which is the
    // household one. Layer 1 picks the LONGEST matching alias (lib/parser/dict.ts),
    // so "flat ka rent" wins over a bare "rent" if one is ever added.
    terms: ["flat rent", "flat ka rent", "flat ki rent", "flat kirya", "flat ka kiraya"],
  },
];

/** Transactions to move, for cases where the correct category did not exist at
 *  the time they were entered. Matched narrowly and reported before writing. */
const REPOINT: Array<{ fromPath: string; toPath: string; rawTextMatches: RegExp }> = [
  { fromPath: "Home › Rent", toPath: "Property › Flat Rent", rawTextMatches: /\bflat\b/i },
];

function pathOf(cat: CategoryDoc, byId: Map<string, CategoryDoc>): string {
  if (cat.parent_id === null) return cat.name;
  const parent = byId.get(cat.parent_id.toHexString());
  return parent ? `${parent.name} › ${cat.name}` : cat.name;
}

async function main() {
  const db = await getDb();
  const users = await db.collection<UserDoc>("users").find({}).toArray();

  if (users.length === 0) {
    console.log("No users found — nothing to sync. Run `npm run seed:user` first.");
    process.exit(0);
  }

  console.log(APPLY ? "Applying changes.\n" : "DRY RUN — no writes. Add --apply to commit.\n");

  for (const user of users) {
    console.log(`── ${user.email}`);
    const scope = await forUser(user._id);
    let addedCategories = 0;
    let addedAliases = 0;
    let moved = 0;

    // ── 1. Backfill missing roots and leaves ────────────────────────────────
    for (const seedRoot of SEED_TREE) {
      let root = await scope.categories.findOne({
        name_normalized: normalizeName(seedRoot.name),
        parent_id: null,
      });

      if (!root) {
        const rootId = new ObjectId();
        const doc: CategoryDoc = {
          _id: rootId,
          user_id: user._id,
          name: seedRoot.name,
          name_normalized: normalizeName(seedRoot.name),
          type: seedRoot.type,
          parent_id: null,
          root_id: rootId,
          from_seed: true,
          auto_created: false,
          created_at: new Date(),
          usage_count: 0,
        };
        console.log(`   + root  ${seedRoot.name}`);
        addedCategories++;
        if (APPLY) await scope.categories.raw().insertOne(doc);
        root = doc;
      }

      for (const childName of seedRoot.children) {
        // Scoped by parent_id — matches the (user_id, parent_id, name_normalized)
        // unique index, so "Maintenance" under Property is distinct from the
        // ones under Home and Transport rather than colliding with them.
        const existing = await scope.categories.findOne({
          name_normalized: normalizeName(childName),
          parent_id: root._id,
        });
        if (existing) continue;

        console.log(`   + leaf  ${seedRoot.name} › ${childName}`);
        addedCategories++;
        if (APPLY) {
          await scope.categories.raw().insertOne({
            _id: new ObjectId(),
            user_id: user._id,
            name: childName,
            name_normalized: normalizeName(childName),
            type: seedRoot.type,
            parent_id: root._id,
            root_id: root._id,
            from_seed: true,
            auto_created: false,
            created_at: new Date(),
            usage_count: 0,
          });
        }
      }
    }

    // Re-read so the new rows are visible to the alias/repoint steps below.
    // On a dry run they aren't in the DB yet, so paths pointing at them simply
    // won't be found and get reported as skipped.
    const categories = await scope.categories.find({}).toArray();
    const byId = new Map(categories.map((c) => [c._id.toHexString(), c] as const));
    const byPath = new Map(categories.map((c) => [pathOf(c, byId), c] as const));

    // ── 2. Aliases for the new categories ───────────────────────────────────
    for (const entry of NEW_ALIASES) {
      const cat = byPath.get(entry.path);
      if (!cat) {
        console.log(`   ! alias skipped — "${entry.path}" not found${APPLY ? "" : " (expected on a dry run)"}`);
        continue;
      }
      for (const term of entry.terms) {
        const exists = await scope.aliases.findOne({ term_normalized: normalizeName(term) });
        if (exists) continue;

        console.log(`   + alias "${term}" → ${entry.path}`);
        addedAliases++;
        if (APPLY) {
          await scope.aliases.raw().insertOne({
            _id: new ObjectId(),
            user_id: user._id,
            term,
            term_normalized: normalizeName(term),
            maps_to: { kind: "category", id: cat._id },
            script: "latin",
            weight: 1,
            hit_count: 0,
            source: "seed",
          });
        }
      }
    }

    // ── 3. Re-point transactions whose correct category didn't exist yet ─────
    for (const rule of REPOINT) {
      const from = byPath.get(rule.fromPath);
      const to = byPath.get(rule.toPath);
      if (!from || !to) continue;

      const candidates = await scope.transactions
        .find({ category_id: from._id, deleted_at: { $exists: false } })
        .toArray();

      for (const txn of candidates) {
        if (!rule.rawTextMatches.test(txn.raw_text ?? "")) continue;

        console.log(
          `   ~ move  ${txn.amount} "${txn.raw_text ?? txn.item ?? ""}"\n` +
            `           ${rule.fromPath} → ${rule.toPath}`,
        );
        moved++;
        if (APPLY) {
          // Amount and account are untouched, so no balance recompute is needed
          // — only the category attribution changes.
          await scope.transactions.updateOne(
            { _id: txn._id },
            { $set: { category_id: to._id, root_category_id: to.root_id } },
          );
        }
      }
    }

    if (addedCategories + addedAliases + moved === 0) {
      console.log("   already in sync");
    }
    console.log("");
  }

  console.log(
    APPLY
      ? "Done."
      : "Nothing written. Re-run with --apply to commit these changes.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Sync failed:", err.message ?? err);
  process.exit(1);
});
