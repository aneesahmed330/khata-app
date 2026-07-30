// All indexes from plan.md §7, in one place. Run once via
// scripts/seed-user.ts / scripts/seed-examples.ts (both call this) — a
// production app would use a migration tool, but for a single-user MVP
// this is the pragmatic equivalent.
import { getDb } from "./db";

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();

  await Promise.all([
    db.collection("transactions").createIndex({ user_id: 1, date: -1 }),
    db.collection("transactions").createIndex({ user_id: 1, root_category_id: 1, date: 1 }),
    db.collection("transactions").createIndex({ user_id: 1, category_id: 1, date: 1 }),
    db.collection("transactions").createIndex({ user_id: 1, tag_ids: 1 }),
    db.collection("accounts").createIndex({ user_id: 1, name_normalized: 1 }, { unique: true }),
    db
      .collection("categories")
      .createIndex({ user_id: 1, parent_id: 1, name_normalized: 1 }, { unique: true }),
    db.collection("categories").createIndex({ user_id: 1, root_id: 1 }),
    db.collection("tags").createIndex({ user_id: 1, name_normalized: 1 }, { unique: true }),
    db.collection("people").createIndex({ user_id: 1, name_normalized: 1 }, { unique: true }),
    db.collection("loans").createIndex({ user_id: 1, status: 1 }),
    db.collection("aliases").createIndex({ user_id: 1, term_normalized: 1 }),
    db.collection("receipts").createIndex({ user_id: 1, created_at: -1 }),
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("examples").createIndex({ raw_text: "text" }),
  ]);
}
