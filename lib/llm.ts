// The ONLY file that talks to an LLM — plan.md §3. If Gemini ever needs
// swapping, this is the one file that changes.
import { GoogleGenAI, Type, createPartFromBase64 } from "@google/genai";
import type { AccountDoc, CategoryDoc, PersonDoc, TagDoc, LoanDoc } from "./types";
import { ParsedIntentSchema, type ParsedIntent } from "./schemas";
import { renderCategoryTreeForPrompt } from "./taxonomy";
import { renderExamplesForPrompt } from "./retrieval";
import type { ExampleDoc } from "./types";

// Gemini's structured-output schema uses the SDK's `Type` enum (uppercase
// "STRING"/"OBJECT"/...), not plain JSON Schema strings — this lives here,
// not lib/schemas.ts, so that file stays free of the @google/genai import
// and safe for client components to `import type` from.
const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: [
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
      ],
    },
    amount: { type: Type.NUMBER },
    item: { type: Type.STRING },
    date: { type: Type.STRING },
    note: { type: Type.STRING },
    direction: { type: Type.STRING, enum: ["given", "taken"] },
    category_id: { type: Type.STRING },
    account_id: { type: Type.STRING },
    to_account_id: { type: Type.STRING },
    person_id: { type: Type.STRING },
    person_name: { type: Type.STRING },
    new_category: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        type: { type: Type.STRING, enum: ["expense", "income"] },
        parent_id: { type: Type.STRING },
        parent_name: { type: Type.STRING },
        reason: { type: Type.STRING },
      },
      required: ["name", "type"],
    },
    new_person: {
      type: Type.OBJECT,
      properties: { name: { type: Type.STRING } },
      required: ["name"],
    },
    new_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    declared_account: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        type: { type: Type.STRING, enum: ["bank", "cash", "wallet"] },
        balance: { type: Type.NUMBER },
      },
      required: ["name", "type", "balance"],
    },
    loan_action: { type: Type.STRING, enum: ["new", "append", "repayment"] },
    missing: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidence: { type: Type.NUMBER },
    clarification_question: { type: Type.STRING },
    transcript: { type: Type.STRING },
    // Only populated when intent === "multi" — mirrors lib/schemas.ts's
    // SubActionSchema. Deliberately ONE level deep and not a $ref back to the
    // parent object: a sub-action can't itself be "multi", so there is no
    // recursion to express here, matching why Zod's side stays non-recursive.
    actions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          intent: {
            type: Type.STRING,
            enum: ["add_expense", "add_income", "lend_money", "borrow_money", "transfer", "declare_account"],
          },
          amount: { type: Type.NUMBER },
          item: { type: Type.STRING },
          date: { type: Type.STRING },
          note: { type: Type.STRING },
          category_id: { type: Type.STRING },
          account_id: { type: Type.STRING },
          to_account_id: { type: Type.STRING },
          person_id: { type: Type.STRING },
          person_name: { type: Type.STRING },
          new_category: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["expense", "income"] },
              parent_id: { type: Type.STRING },
              parent_name: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ["name", "type"],
          },
          declared_account: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["bank", "cash", "wallet"] },
              balance: { type: Type.NUMBER },
            },
            required: ["name", "type", "balance"],
          },
          loan_action: { type: Type.STRING, enum: ["new", "append", "repayment"] },
        },
        required: ["intent"],
      },
    },
  },
  required: ["intent", "confidence"],
};

// Overridable via env because free-tier model availability shifts —
// check AI Studio (aistudio.google.com) for the current alias if this 404s.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

const SYSTEM_RULES = `You are the parsing engine for Khata, a Roman-Urdu-first expense tracker.
You output ONLY structured data matching the provided schema — never prose.

Rules:
- Pick the MOST SPECIFIC existing category (a child, e.g. "Transport > InDrive"), not just its root ("Transport"). If nothing fits, propose a new_category with parent_id or parent_name set — never propose a new root unless truly nothing existing fits.
- Never propose depth beyond 2 levels (root -> child only).
- Preserve context the user stated (e.g. "flat se office") in the "note" field — never drop it.
- "item" is the THING involved, as a short noun phrase of 1-4 words ("Biryani", "Petrol", "Flat rent"). NEVER put the user's whole sentence in it. If there is no specific thing beyond the category itself, leave item unset rather than echoing the sentence.
- Accounts: if the user names one, match it. If the message says something like "<account> mein <amount> pari hai", the intent is declare_account with a declared_account object — never propose a *new account* from an ordinary expense/income message.
- If the user has an open loan with a named person, set loan_action ("new" | "append" | "repayment") based on context — but never guess the funding account when money moves; leave account_id unset and add "account_id" to missing instead.
- Loans and income NEVER default to an account automatically — always leave account_id unset (add "account_id" to missing) unless the user names one explicitly.
- Convert relative dates ("aj", "kal", "parso", "pichlay hafte") to an absolute YYYY-MM-DD date field using the "Today" value given below.
- If genuinely ambiguous, set intent to "need_clarification" and fill clarification_question — never guess a financially consequential fact. clarification_question must always be written in English, regardless of what language the user spoke — it's UI copy, not a transcription.
- query_data intent must NEVER include any new_* field.
- Text may be Roman Urdu, Urdu script, or English — handle all three.
- confidence is your own calibrated 0-1 estimate of how sure you are.
- MULTI-INTENT: if the message describes more than one distinct financial event, set the top-level "intent" to "multi" and put one object per event in "actions" (2-5 items). Each action follows all the same rules above (most-specific category, never default an account for loans/income, etc.) as if it were its own top-level parse. When intent is "multi", leave every OTHER top-level field unset (amount, category_id, account_id, ...) — those belong only on each action, never on the wrapper. Do not use "multi" for a single event just because the sentence is long; it's specifically for genuinely separate transactions bundled into one message.

Worked example — this exact pattern (an expense mentioned alongside a separate loan) is the most common multi case:
User said: "ma na subha indrive karwai te jis ky ma na 200 rupees diya ty...ab sohaib ma mera 100 rupa dena ha"
(Translation: paid 200 for an InDrive ride this morning; separately, Sohaib owes me 100.)
Correct output shape:
{
  "intent": "multi",
  "confidence": 0.9,
  "actions": [
    { "intent": "add_expense", "amount": 200, "item": "InDrive ride", "category_id": "<Transport > InDrive id>" },
    { "intent": "lend_money", "amount": 100, "person_name": "Sohaib" }
  ]
}
Note the loan action has NO account_id (loans never default an account) and the wrapper has no amount/category_id/account_id of its own — only "intent", "confidence", and "actions".`;

// Audio goes straight to Gemini rather than through the browser's Web Speech
// API. No browser ASR engine outputs Roman Urdu: "ur-PK" returns Urdu script
// (which the Roman-Urdu Layer 1 dictionary and the $text example corpus both
// miss entirely) while "en-*" returns phonetically mangled Latin ("500" heard
// as "5oo", "khai thi" as "kahi te"). Gemini transcribes and parses in ONE
// call, so it costs no more than the text path did while removing that whole
// class of error.
const AUDIO_RULES = `
Audio-specific rules:
- The speaker is Pakistani, speaking Roman Urdu, Urdu, or a mix with English words. Transcribe what they actually said, then parse it.
- Put your transcription in the "transcript" field, written in ROMAN URDU (Latin letters), not Urdu script — the rest of the system is Roman-Urdu based.
- Numbers spoken as words ("panch sau", "dhai hazaar") must become digits in "amount".
- If the audio is unclear, silent, or has no financial content, set intent to "need_clarification", put whatever you did hear in "transcript", and say what you need in clarification_question. Never invent an amount you did not clearly hear.`;

export interface UserContext {
  now: Date;
  timezone: string;
  accounts: AccountDoc[];
  categories: CategoryDoc[];
  people: (PersonDoc & { openLoan?: Pick<LoanDoc, "outstanding" | "direction"> })[];
  tags: TagDoc[];
  examples: ExampleDoc[];
}

/** Everything except the final "User said" line — shared by both the text and
 *  the audio path so they can never drift apart. */
function buildContextBlock(ctx: UserContext): string {
  const accountsBlock = ctx.accounts
    .map((a) => `  - ${a.name} (id: ${a._id.toHexString()}, type: ${a.type})`)
    .join("\n");

  const peopleBlock = ctx.people
    .map((p) => {
      const loan = p.openLoan
        ? ` [open loan: ${p.openLoan.direction === "given" ? "they owe you" : "you owe them"} ${p.openLoan.outstanding}]`
        : "";
      return `  - ${p.name} (id: ${p._id.toHexString()})${loan}`;
    })
    .join("\n");

  const tagsBlock = ctx.tags.map((t) => `  - ${t.name} (id: ${t._id.toHexString()})`).join("\n");

  return [
    `Examples of past parses (for calibration only, not literal matches):`,
    renderExamplesForPrompt(ctx.examples),
    ``,
    `Today: ${ctx.now.toISOString().slice(0, 10)}, Timezone: ${ctx.timezone}`,
    ``,
    `Accounts (balances withheld deliberately — never needed for parsing):`,
    accountsBlock || "  (none yet)",
    ``,
    `Categories (indented = child of the line above):`,
    renderCategoryTreeForPrompt(ctx.categories),
    ``,
    `People:`,
    peopleBlock || "  (none yet)",
    ``,
    `Tags:`,
    tagsBlock || "  (none yet)",
  ].join("\n");
}

function buildPrompt(text: string, ctx: UserContext): string {
  return `${buildContextBlock(ctx)}\n\nUser said: "${text}"`;
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export class LLMQuotaError extends Error {
  constructor() {
    super("Gemini quota exhausted for today.");
  }
}

/** Shared call + validate. Throws LLMQuotaError on 429 so callers can degrade
 *  gracefully (plan.md §8.3) instead of surfacing a raw API error. */
async function generateParsed(
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
  systemInstruction: string,
): Promise<ParsedIntent> {
  const ai = getClient();

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        temperature: 0,
      },
    });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 429) throw new LLMQuotaError();
    throw err;
  }

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini returned no content.");
  }

  const parsed = JSON.parse(raw);
  // Zod re-validation is deliberate even though responseSchema already
  // constrained the shape — schema conformance is not semantic correctness
  // (e.g. a category_id string that isn't actually one of this user's ids).
  return ParsedIntentSchema.parse(parsed);
}

/** The single entry point for Layer 2 (text). */
export async function parseIntent(text: string, ctx: UserContext): Promise<ParsedIntent> {
  return generateParsed(buildPrompt(text, ctx), SYSTEM_RULES);
}

/** Layer 2 via speech — transcribe and parse in one call. `audioBase64` is raw
 *  base64 (no data: prefix). Returned intent carries a `transcript` so the UI
 *  can show what was heard before anything commits. */
export async function parseIntentFromAudio(
  audioBase64: string,
  mimeType: string,
  ctx: UserContext,
): Promise<ParsedIntent> {
  return generateParsed(
    [
      {
        role: "user",
        parts: [
          createPartFromBase64(audioBase64, mimeType),
          { text: `${buildContextBlock(ctx)}\n\nTranscribe the audio above, then parse it.` },
        ],
      },
    ],
    `${SYSTEM_RULES}\n${AUDIO_RULES}`,
  );
}
