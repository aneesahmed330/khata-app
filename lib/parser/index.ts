// Layer 1 — plan.md §2.2. Deterministic, zero LLM calls. Only fires
// confidently on KNOWN vocabulary (aliases the user already has); anything
// novel scores below the commit threshold and falls through to Layer 2.
// This is intentional, not a gap — §2.2's whole argument is that Layer 1
// should only ever resolve what it's already seen.
import { ObjectId } from "mongodb";
import type { AliasDoc, AccountDoc, CategoryDoc } from "../types";
import type { ParsedIntent } from "../schemas";
import { parseAmount, countAmountMentions } from "./amount";
import { parseDate } from "./date";
import { detectIntent } from "./intent";
import { matchAlias } from "./dict";
import { normalizeName } from "../taxonomy";

const CONFIDENCE_THRESHOLD = 0.85;
const DEFAULT_ACCOUNT_MAX_AMOUNT = 5_000;

export interface Layer1Context {
  now: Date;
  aliases: AliasDoc[];
  accounts: AccountDoc[];
  categories: CategoryDoc[];
  defaultAccountId: ObjectId | null;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Bilal ko udhaar diye" -> "Bilal" — the object-marker particle "ko" is a
 *  reliable enough heuristic for Roman Urdu; anything it misses falls
 *  through to Layer 2, which has no such constraint. */
function extractPersonName(text: string): string | undefined {
  const match = text.match(/\b(\p{L}+)\s+ko\b/u);
  return match?.[1];
}

function findMentionedAccounts(text: string, accounts: AccountDoc[]): AccountDoc[] {
  const normalized = normalizeName(text);
  const found: AccountDoc[] = [];
  for (const account of accounts) {
    if (normalized.includes(account.name_normalized)) found.push(account);
  }
  return found;
}

/** Returns null when confidence is below threshold or the input needs
 *  Layer 2's judgement — never a half-confident guess. */
export function parseLayer1(text: string, ctx: Layer1Context): ParsedIntent | null {
  const amount = parseAmount(text);
  if (amount === null) return null; // nothing to anchor a confident parse on

  // More than one amount mentioned means more than one financial event —
  // Layer 1 can only ever grab the first, so trust Layer 2's multi-intent
  // handling instead of confidently committing on half the sentence.
  if (countAmountMentions(text) > 1) return null;

  const date = parseDate(text, ctx.now) ?? ctx.now;
  const signal = detectIntent(text);
  const missing: string[] = [];
  let confidence = 0.4; // amount found

  if (signal?.intent === "declare_account") {
    return parseDeclareAccount(text, amount, date, ctx);
  }

  if (signal?.intent === "transfer") {
    const mentioned = findMentionedAccounts(text, ctx.accounts);
    if (mentioned.length !== 2) return null; // ambiguous — let Layer 2 sort it out
    confidence += 0.2 + 0.15; // intent clear + both accounts resolved
    return {
      intent: "transfer",
      amount,
      date: toISODate(date),
      account_id: mentioned[0]!._id.toHexString(),
      to_account_id: mentioned[1]!._id.toHexString(),
      confidence,
    };
  }

  if (signal?.intent === "lend_money" || signal?.intent === "borrow_money") {
    const personName = extractPersonName(text);
    if (!personName) return null; // can't safely resolve who without a name
    confidence += 0.2; // intent clear
    missing.push("account_id"); // loans always confirm the account — plan.md §4.2
    return {
      intent: signal.intent,
      amount,
      date: toISODate(date),
      person_name: personName,
      direction: signal.direction,
      missing,
      confidence,
    };
  }

  // add_expense / add_income — the common path.
  const isIncome = signal?.intent === "add_income";
  const alias = matchAlias(text, ctx.aliases);
  const category =
    alias?.maps_to.kind === "category"
      ? ctx.categories.find((c) => c._id.equals(alias.maps_to.id))
      : undefined;

  if (category) confidence += 0.25;
  confidence += 0.2; // intent is clear either way (expense is the safe default)

  let accountId: ObjectId | null = null;
  if (isIncome) {
    missing.push("account_id"); // income always confirms the account — plan.md §4.2
  } else if (ctx.defaultAccountId && amount <= DEFAULT_ACCOUNT_MAX_AMOUNT) {
    accountId = ctx.defaultAccountId;
    confidence += 0.15;
  } else {
    missing.push("account_id");
  }

  // Below threshold: even the category/intent signal isn't solid enough to
  // trust — escalate to Layer 2. A non-empty `missing` on its own does NOT
  // force escalation: income/large-expense intentionally never auto-pick an
  // account (plan.md §4.2), so "confident about everything except which
  // account" still short-circuits Gemini and asks via a chip instead.
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  // `item` is the thing bought, not the sentence. Previously this was the whole
  // raw text, which made ledger titles read like "ma na indrive ky 100 rupa diya
  // ty indrive ky". Layer 1 can't do noun-phrase extraction, so it only claims an
  // item when an alias actually recognised a word — that word IS the item. With
  // no alias, item stays unset and LedgerRow falls back to the category path.
  // Nothing is lost either way: the full sentence is persisted as raw_text.
  const item = alias ? capitalize(alias.term) : undefined;

  return {
    intent: isIncome ? "add_income" : "add_expense",
    amount,
    item,
    date: toISODate(date),
    category_id: category?._id.toHexString(),
    account_id: accountId?.toHexString(),
    missing: missing.length > 0 ? missing : undefined,
    confidence,
  };
}

const ACCOUNT_TYPE_HINTS: Array<{ pattern: RegExp; type: "bank" | "wallet" | "cash" }> = [
  { pattern: /meezan|hbl|ubl|allied|bank/i, type: "bank" },
  { pattern: /jazzcash|easypaisa|sadapay|nayapay/i, type: "wallet" },
  { pattern: /cash|naqdi/i, type: "cash" },
];

function parseDeclareAccount(
  text: string,
  balance: number,
  date: Date,
  ctx: Layer1Context,
): ParsedIntent | null {
  // Prefer a name the user already has an account under (renaming/adjusting
  // an existing one); otherwise take the word right before "account"/"mein".
  const existing = findMentionedAccounts(text, ctx.accounts)[0];
  const nameMatch = text.match(/\b(\p{L}+)\s+(?:bank\s+)?account\b/iu) ?? text.match(/\b(\p{L}+)\s+mein\b/iu);
  const name = existing?.name ?? nameMatch?.[1];
  if (!name) return null;

  const hint = ACCOUNT_TYPE_HINTS.find((h) => h.pattern.test(text));
  const type = existing?.type ?? hint?.type ?? "bank";

  return {
    intent: "declare_account",
    date: toISODate(date),
    declared_account: { name, type, balance },
    confidence: 0.9, // deterministic once a name is found — no ambiguity to weigh
  };
}
