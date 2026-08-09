// The one shape both Layer 1 (dict parser) and Layer 2 (Gemini) produce —
// plan.md §3 INTENT_SCHEMA. Server always re-validates with this Zod schema
// even when Gemini's responseSchema already enforced it — schema
// conformance is not semantic correctness (a category_id that isn't the
// user's, for instance).
import { z } from "zod";

export const IntentEnum = z.enum([
  "add_expense",
  "add_income",
  "lend_money",
  "borrow_money",
  "record_repayment",
  "transfer",
  "declare_account",
  "query_data",
  "need_clarification",
  "multi",
]);
export type Intent = z.infer<typeof IntentEnum>;

export const NewCategorySchema = z.object({
  name: z.string().min(2).max(30),
  type: z.enum(["expense", "income"]),
  parent_id: z.string().optional(),
  parent_name: z.string().optional(),
  reason: z.string().optional(),
});

export const DeclaredAccountSchema = z.object({
  name: z.string().min(1).max(30),
  type: z.enum(["bank", "cash", "wallet"]),
  balance: z.number(),
});

export const LoanActionEnum = z.enum(["new", "append", "repayment"]);

// A single transaction inside a "multi" message — e.g. "200 InDrive, Sohaib ka
// 100 udhaar" is one add_expense + one lend_money. Deliberately NOT the same
// schema as ParsedIntentSchema recursed: a sub-action can't itself be "multi"
// or need_clarification/query_data, so this is a flat, non-recursive object
// (the original comment on `actions` warned specifically against adding
// "unused recursive-type complexity" — this sidesteps that by only allowing
// one level of nesting, defined once).
export const SubActionIntentEnum = z.enum([
  "add_expense",
  "add_income",
  "lend_money",
  "borrow_money",
  "transfer",
  "declare_account",
]);

export const SubActionSchema = z.object({
  intent: SubActionIntentEnum,
  amount: z.number().positive().optional(),
  item: z.string().max(80).optional(),
  date: z.string().optional(),
  note: z.string().max(200).optional(),

  category_id: z.string().optional(),
  account_id: z.string().optional(),
  to_account_id: z.string().optional(),
  person_id: z.string().optional(),
  person_name: z.string().max(50).optional(),

  new_category: NewCategorySchema.optional(),
  new_tags: z.array(z.string().min(1).max(30)).max(5).optional(),
  declared_account: DeclaredAccountSchema.optional(),
  loan_action: LoanActionEnum.optional(),
});
export type SubAction = z.infer<typeof SubActionSchema>;

export const ParsedIntentSchema = z.object({
  intent: IntentEnum,
  amount: z.number().positive().optional(),
  item: z.string().max(80).optional(),
  date: z.string().optional(), // YYYY-MM-DD
  note: z.string().max(200).optional(),
  direction: z.enum(["given", "taken"]).optional(),

  category_id: z.string().optional(),
  account_id: z.string().optional(),
  to_account_id: z.string().optional(),
  person_id: z.string().optional(),
  person_name: z.string().max(50).optional(), // when no existing person_id yet

  new_category: NewCategorySchema.optional(),
  new_person: z.object({ name: z.string().min(1).max(50) }).optional(),
  new_tags: z.array(z.string().min(1).max(30)).max(5).optional(),
  declared_account: DeclaredAccountSchema.optional(),
  loan_action: LoanActionEnum.optional(),

  missing: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  clarification_question: z.string().optional(),

  // Set only on the audio path: what Gemini actually heard, in Roman Urdu.
  // Surfaced in the preview so a misheard entry is visible BEFORE it commits,
  // and stored as the example's raw_text so the corpus learns from real speech.
  transcript: z.string().max(400).optional(),

  // Only set (and only meaningful) when intent === "multi" — one entry per
  // distinct financial event in the message. Every other top-level field
  // (amount, category_id, account_id, ...) is unset on the wrapper itself in
  // that case; each action carries its own.
  actions: z.array(SubActionSchema).min(2).max(5).optional(),
});

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

// The Gemini-specific responseSchema (built from @google/genai's `Type`
// enum, not plain JSON Schema strings) lives in lib/llm.ts, not here — this
// file stays free of that SDK import so components can safely `import type`
// from it without pulling server-only code into the client bundle.
