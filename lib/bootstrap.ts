// The one function that creates a new user's entire starting state —
// plan.md §8.2. scripts/seed-user.ts calls this today; a future signup UI
// calls the exact same function, so nothing gets rebuilt when that ships.
import { ObjectId } from "mongodb";
import { getDb } from "./db";
import { forUser } from "./scope";
import { hashPassword, type GoogleIdentity } from "./auth";
import { SEED_TREE, normalizeName } from "./taxonomy";
import { ensureIndexes } from "./indexes";
import type { UserDoc } from "./types";

export interface BootstrapInput {
  email: string;
  name: string;
  // Exactly one of these is expected: a password for the email/password
  // signup path, a Google `sub` for the Google sign-in path.
  password?: string;
  googleId?: string;
}

export interface BootstrapResult {
  userId: ObjectId;
}

export async function bootstrapUser(input: BootstrapInput): Promise<BootstrapResult> {
  await ensureIndexes(); // idempotent — safe to call on every bootstrap
  const db = await getDb();
  const users = db.collection<UserDoc>("users");

  const existing = await users.findOne({ email: input.email.toLowerCase() });
  if (existing) {
    throw new Error(`User ${input.email} already exists (id ${existing._id.toHexString()}).`);
  }

  const userId = new ObjectId();
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const userDoc: UserDoc = {
    _id: userId,
    email: input.email.toLowerCase(),
    password_hash: passwordHash,
    google_id: input.googleId,
    name: input.name,
    currency: "PKR",
    timezone: "Asia/Karachi",
    default_account_id: null,
    tts_enabled: false,
    llm_calls_today: 0,
    llm_calls_reset_at: new Date(),
    created_at: new Date(),
  };
  await users.insertOne(userDoc);

  const scope = await forUser(userId);

  // 1. Copy the 2-level seed tree — never shared, so rename/move/merge/hygiene
  //    all stay one code path (plan.md §8.2).
  for (const root of SEED_TREE) {
    const rootId = new ObjectId();
    await scope.categories.raw().insertOne({
      _id: rootId,
      user_id: userId,
      name: root.name,
      name_normalized: normalizeName(root.name),
      type: root.type,
      parent_id: null,
      root_id: rootId,
      from_seed: true,
      auto_created: false,
      created_at: new Date(),
      usage_count: 0,
    });
    for (const childName of root.children) {
      await scope.categories.raw().insertOne({
        _id: new ObjectId(),
        user_id: userId,
        name: childName,
        name_normalized: normalizeName(childName),
        type: root.type,
        parent_id: rootId,
        root_id: rootId,
        from_seed: true,
        auto_created: false,
        created_at: new Date(),
        usage_count: 0,
      });
    }
  }

  // 2. Default "Cash" account, balance 0.
  const cashAccountId = new ObjectId();
  await scope.accounts.raw().insertOne({
    _id: cashAccountId,
    user_id: userId,
    name: "Cash",
    name_normalized: normalizeName("Cash"),
    type: "cash",
    balance: 0,
    archived: false,
    auto_created: false,
    created_at: new Date(),
  });
  await users.updateOne({ _id: userId }, { $set: { default_account_id: cashAccountId } });

  // 3. Seed aliases — mapped onto THIS user's category ids (aliases are
  //    always per-user, plan.md §2.2). Kept small here; scripts/seed-examples.ts
  //    extends this from the example corpus.
  const categories = await scope.categories.find({}).toArray();
  const byPath = new Map(categories.map((c) => [normalizeName(c.name), c] as const));
  const BASE_ALIASES: Array<{ terms: string[]; category: string }> = [
    { terms: ["palao", "biryani", "khana", "nashta", "khaana"], category: "dhaba/hotel" },
    { terms: ["indrive", "in drive", "indriver"], category: "indrive" },
    { terms: ["careem"], category: "careem" },
    { terms: ["rickshaw", "chingchi"], category: "rickshaw" },
    { terms: ["petrol", "diesel", "cng"], category: "fuel" },
    { terms: ["salary", "tankhwah"], category: "salary" },
  ];
  for (const entry of BASE_ALIASES) {
    const cat = byPath.get(entry.category);
    if (!cat) continue;
    for (const term of entry.terms) {
      await scope.aliases.raw().insertOne({
        _id: new ObjectId(),
        user_id: userId,
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

  return { userId };
}

/** Find-or-create for the Google sign-in path — looks up by `google_id`
 *  first, then by email (to link an existing email/password account the
 *  first time it's used with Google), and only falls through to
 *  `bootstrapUser` for a genuinely new address. */
export async function findOrCreateGoogleUser(identity: GoogleIdentity): Promise<UserDoc> {
  const db = await getDb();
  const users = db.collection<UserDoc>("users");
  const email = identity.email.toLowerCase();

  const byGoogleId = await users.findOne({ google_id: identity.sub });
  if (byGoogleId) return byGoogleId;

  const byEmail = await users.findOne({ email });
  if (byEmail) {
    await users.updateOne({ _id: byEmail._id }, { $set: { google_id: identity.sub } });
    return { ...byEmail, google_id: identity.sub };
  }

  const { userId } = await bootstrapUser({
    email,
    name: identity.name,
    googleId: identity.sub,
  });
  const created = await users.findOne({ _id: userId });
  if (!created) throw new Error("Failed to create user.");
  return created;
}
