// The anti-rot gate — plan.md §4.1. The LLM never writes to the DB; every
// name it proposes passes through here. Nothing in this file auto-creates
// a category, root, or account without an explicit confirmCreate=true —
// plan.md §12 decision J: always confirm once, no threshold-based auto.
import { ObjectId } from "mongodb";
import type { UserScope } from "./scope";
import { normalizeName, assertValidParent, deriveRootId } from "./taxonomy";
import type { AccountType, CategoryType, CategoryDoc } from "./types";

const FUZZY_THRESHOLD = 0.85;
const MAX_NEW_SUBCATEGORIES_PER_DAY = 8;
const MAX_NEW_ROOTS_PER_DAY = 2;

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[a.length]![b.length]!;
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// Only categories have a daily creation cap now — accounts never did an
// abuse-prone auto-create path the way LLM-driven category proposals can.
async function countTodayCreations(
  scope: UserScope,
  extraFilter: Record<string, unknown> = {},
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return scope.categories.countDocuments({
    auto_created: true,
    created_at: { $gte: startOfDay },
    ...extraFilter,
  } as never);
}

// ── Categories ──────────────────────────────────────────────────────────

export interface CategoryResolution {
  id: ObjectId | null;
  rootId: ObjectId | null;
  created: boolean;
  proposal?: { name: string; type: CategoryType; parentId: string | null; parentName: string | null };
}

export interface ResolveCategoryOptions {
  parentId?: string; // existing root's id, if the LLM found one
  parentName?: string; // fallback when it only has a name
  confirmCreate?: boolean; // true once the user has tapped the creation chip
  createdFromText?: string;
}

export async function resolveOrCreateCategory(
  scope: UserScope,
  name: string,
  type: CategoryType,
  opts: ResolveCategoryOptions = {},
): Promise<CategoryResolution> {
  const normalized = normalizeName(name);
  const isRootRequest = !opts.parentId && !opts.parentName;

  // Resolve the intended parent (root category), if any was named.
  let parent: CategoryDoc | null = null;
  if (opts.parentId) {
    parent = await scope.categories.findOne({ _id: new ObjectId(opts.parentId) });
  } else if (opts.parentName) {
    parent = await scope.categories.findOne({
      name_normalized: normalizeName(opts.parentName),
      parent_id: null,
    });
  }
  if (parent) assertValidParent(parent); // parent must itself be a root

  // A parent was named but didn't resolve — this is a data problem (the LLM
  // hallucinated a root, or it was deleted), not "make it a root instead".
  // Silently falling back to root-scope here would let a mistyped parent
  // create a same-named root category by accident.
  if (!isRootRequest && !parent) {
    throw new Error(
      `Named parent category "${opts.parentName ?? opts.parentId}" was not found.`,
    );
  }

  const siblingFilter = { parent_id: parent?._id ?? null };

  // 1. Exact match within the same parent scope.
  const exact = await scope.categories.findOne({
    name_normalized: normalized,
    ...siblingFilter,
  } as never);
  if (exact) return { id: exact._id, rootId: deriveRootId(exact), created: false };

  // 2. Alias hit (aliases are always per-user and point at the specific id).
  const alias = await scope.aliases.findOne({ term_normalized: normalized, "maps_to.kind": "category" });
  if (alias) {
    const aliased = await scope.categories.findOne({ _id: alias.maps_to.id });
    if (aliased) return { id: aliased._id, rootId: deriveRootId(aliased), created: false };
  }

  // 3. Fuzzy match — scoped to the same parent. "Transport > Other" and
  //    "Food > Other" must never collide (plan.md §4.1).
  const siblings = await scope.categories.find(siblingFilter as never).toArray();
  let best: { doc: CategoryDoc; score: number } | null = null;
  for (const sib of siblings) {
    const score = similarity(normalized, sib.name_normalized);
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { doc: sib, score };
  }
  if (best) {
    // Learn the alias so next time this is a zero-call Layer 1 hit.
    await scope.aliases.raw().insertOne({
      _id: new ObjectId(),
      user_id: scope.userId,
      term: name,
      term_normalized: normalized,
      maps_to: { kind: "category", id: best.doc._id },
      script: "latin",
      weight: 1,
      hit_count: 0,
      source: "correction",
    });
    return { id: best.doc._id, rootId: deriveRootId(best.doc), created: false };
  }

  // 4/5. Nothing found — propose creation. Only actually create if the
  // caller has already collected a one-time confirmation from the user.
  const proposal = {
    name,
    type,
    parentId: parent?._id.toHexString() ?? null,
    parentName: parent?.name ?? opts.parentName ?? null,
  };

  if (!opts.confirmCreate) {
    return { id: null, rootId: null, created: false, proposal };
  }

  const capCollection = isRootRequest ? MAX_NEW_ROOTS_PER_DAY : MAX_NEW_SUBCATEGORIES_PER_DAY;
  const createdToday = await countTodayCreations(scope, {
    parent_id: isRootRequest ? null : { $ne: null },
  });
  if (createdToday >= capCollection) {
    throw new Error(
      `Daily limit reached for new ${isRootRequest ? "root categories" : "subcategories"}. Pick an existing one instead.`,
    );
  }

  const newId = new ObjectId();
  const rootId = parent ? parent._id : newId;
  await scope.categories.raw().insertOne({
    _id: newId,
    user_id: scope.userId,
    name,
    name_normalized: normalized,
    type,
    parent_id: parent?._id ?? null,
    root_id: rootId,
    from_seed: false,
    auto_created: true,
    created_at: new Date(),
    created_from_text: opts.createdFromText,
    usage_count: 0,
  });
  return { id: newId, rootId, created: true };
}

/** Teach Layer 1 that this item name means this category — plan.md §2.2's
 *  correction loop, which was only half-wired: resolveOrCreateCategory above
 *  learns an alias when a FUZZY name match happens, but the common path (the
 *  LLM returning a `category_id` for an existing category) taught the system
 *  nothing. So "onion" burned an LLM call every single time and could land in
 *  a different category on each one, which is what made categorisation feel
 *  random. With this, the second "onion" is a deterministic zero-call Layer 1
 *  hit that always lands where the first one did.
 *
 *  Upsert, not insert: the newest decision wins, so correcting a category on
 *  /txn/[id] re-points the alias instead of leaving the old mapping to win
 *  next time. Multi-word items are fine — matchAlias does a padded substring
 *  test, and longest-term-wins, so "flat rent" beats a bare "rent". */
export async function learnItemAlias(
  scope: UserScope,
  item: string | undefined,
  categoryId: ObjectId,
): Promise<void> {
  const term = item?.trim();
  if (!term) return;
  const normalized = normalizeName(term);
  // A single character (or a bare number) would match almost any sentence.
  if (normalized.length < 3 || /^\d+$/.test(normalized)) return;

  await scope.aliases.raw().updateOne(
    { user_id: scope.userId, term_normalized: normalized },
    {
      $set: {
        term,
        maps_to: { kind: "category", id: categoryId },
        script: "latin",
        source: "correction",
      },
      $setOnInsert: { user_id: scope.userId, term_normalized: normalized, weight: 1, hit_count: 0 },
    },
    { upsert: true },
  );
}

// ── People ──────────────────────────────────────────────────────────────

export async function resolveOrCreatePerson(
  scope: UserScope,
  name: string,
): Promise<{ id: ObjectId; created: boolean }> {
  const normalized = normalizeName(name);
  const existing = await scope.people.findOne({ name_normalized: normalized });
  if (existing) return { id: existing._id, created: false };

  // Auto — zero blast radius (plan.md §4.2).
  const newId = new ObjectId();
  await scope.people.raw().insertOne({
    _id: newId,
    user_id: scope.userId,
    name,
    name_normalized: normalized,
    auto_created: true,
    created_from_text: name,
  });
  return { id: newId, created: true };
}

// ── Tags ────────────────────────────────────────────────────────────────

export async function resolveOrCreateTag(
  scope: UserScope,
  name: string,
): Promise<{ id: ObjectId; created: boolean }> {
  const normalized = normalizeName(name);
  const existing = await scope.tags.findOne({ name_normalized: normalized });
  if (existing) return { id: existing._id, created: false };

  const newId = new ObjectId();
  await scope.tags.raw().insertOne({
    _id: newId,
    user_id: scope.userId,
    name,
    name_normalized: normalized,
    auto_created: true,
    created_from_text: name,
    usage_count: 0,
  });
  return { id: newId, created: true };
}

// ── Accounts (declare_account only — plan.md §4.6) ─────────────────────

export interface AccountResolution {
  id: ObjectId | null;
  created: boolean;
  /** Amount the caller MUST post as an `adjustment` transaction. Non-null both
   *  when an existing account's balance differs and when a new account is
   *  declared with an opening balance — in the latter case the account is
   *  inserted at 0 and this carries the opening amount, so that
   *  `balance == sum(transactions)` holds from the very first write (§4.6/§7). */
  adjustment: number | null;
  proposal?: { name: string; type: AccountType; balance: number };
}

export async function resolveOrDeclareAccount(
  scope: UserScope,
  name: string,
  type: AccountType,
  balance: number,
  opts: { confirmCreate?: boolean; createdFromText?: string } = {},
): Promise<AccountResolution> {
  const normalized = normalizeName(name);
  const existing = await scope.accounts.findOne({ name_normalized: normalized });

  if (existing) {
    const delta = balance - existing.balance;
    if (delta === 0) {
      return { id: existing._id, created: false, adjustment: null }; // "nothing_changed" case
    }
    return { id: existing._id, created: false, adjustment: delta };
  }

  if (!opts.confirmCreate) {
    return { id: null, created: false, adjustment: null, proposal: { name, type, balance } };
  }

  // No daily cap here, unlike categories (§4.5's cap is about LLM-driven
  // category sprawl from ambiguous parses). Declaring an account always
  // requires an explicit user-stated balance and a one-time confirm chip —
  // there's no equivalent runaway-creation path to guard against, and a solo
  // user setting up several real bank/cash/wallet accounts in one sitting is
  // normal, not abuse.

  // Insert at 0 and hand the opening balance back as an adjustment for the
  // caller to post. Writing `balance` directly here (as this used to) left the
  // account with no backing transaction, so `recomputeAccountBalance` — or the
  // nightly reconcile in plan.md §7 — would silently reset it to 0.
  const newId = new ObjectId();
  await scope.accounts.raw().insertOne({
    _id: newId,
    user_id: scope.userId,
    name,
    name_normalized: normalized,
    type,
    balance: 0,
    archived: false,
    auto_created: true,
    created_from_text: opts.createdFromText,
    created_at: new Date(),
  });
  return { id: newId, created: true, adjustment: balance === 0 ? null : balance };
}

// ── Loans (§4.3 — never auto-decide, only surface the ambiguity) ───────

export interface LoanResolution {
  action: "new" | "append" | "repayment";
  loanId: ObjectId | null;
  outstanding: number | null;
  direction: "given" | "taken" | null; // the EXISTING loan's direction — needed to pick repayment_in vs repayment_out
  ambiguous: boolean; // true when an open loan exists and the LLM's hint isn't a confirmed choice
}

export async function resolveLoan(
  scope: UserScope,
  personId: ObjectId,
  hintedAction: "new" | "append" | "repayment" | undefined,
  confirmedAction?: "new" | "append" | "repayment",
): Promise<LoanResolution> {
  const openLoan = await scope.loans.findOne({ person_id: personId, status: "open" });

  if (!openLoan) {
    return { action: "new", loanId: null, outstanding: null, direction: null, ambiguous: false };
  }

  const action = confirmedAction ?? hintedAction;
  if (!action) {
    return {
      action: "new",
      loanId: openLoan._id,
      outstanding: openLoan.outstanding,
      direction: openLoan.direction,
      ambiguous: true,
    };
  }
  return {
    action,
    loanId: openLoan._id,
    outstanding: openLoan.outstanding,
    direction: openLoan.direction,
    ambiguous: !confirmedAction,
  };
}
