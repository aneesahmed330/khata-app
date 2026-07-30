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

  // NOTE: multi-item entries ("500 doodh 200 rickshaw" as one message) are
  // out of scope for this pass — /nl/commit only handles single-intent
  // payloads (see the SUPPORTED set there). A recursive `actions: ParsedIntent[]`
  // field belongs here once that's implemented; it was deliberately left off
  // rather than adding unused recursive-type complexity now.
});

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

// The Gemini-specific responseSchema (built from @google/genai's `Type`
// enum, not plain JSON Schema strings) lives in lib/llm.ts, not here — this
// file stays free of that SDK import so components can safely `import type`
// from it without pulling server-only code into the client bundle.
