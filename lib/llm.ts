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

// Groq's free tier for gpt-oss-20b/120b is ~1,000 requests/day — Gemini's
// verified free-tier cap is only 20/day (2026-07-31). Text parsing tries
// Gemini first (it has native audio too, so keeping it primary means one
// fewer thing to keep in sync) and falls back to Groq only once Gemini's
// quota is actually exhausted for the day. Groq has no audio-understanding
// endpoint bundled with its chat models (STT is a separate Whisper call), so
// the audio path stays Gemini-only — plan.md's "same purpose" question from
// 2026-07-31 covers the reasoning.
const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Groq/OpenAI "strict" JSON schema mode has a different shape than Gemini's:
// every property must appear in `required` and have `additionalProperties:
// false` on every object — there's no such thing as "optional" the way
// Gemini's schema allows. "Optional" is expressed as a nullable type union
// instead (["string","null"]), and the model returns null rather than
// omitting the key. stripNulls() below converts that back to the
// omitted-key shape lib/schemas.ts's Zod schema (shared with Gemini) expects,
// so ParsedIntentSchema itself never needs to know which provider answered.
const NSTR = { type: ["string", "null"] } as const;
const NNUM = { type: ["number", "null"] } as const;

const GROQ_NEW_CATEGORY_SCHEMA = {
  type: ["object", "null"],
  properties: {
    name: { type: "string" },
    type: { type: "string", enum: ["expense", "income"] },
    parent_id: NSTR,
    parent_name: NSTR,
    reason: NSTR,
  },
  required: ["name", "type", "parent_id", "parent_name", "reason"],
  additionalProperties: false,
} as const;

const GROQ_DECLARED_ACCOUNT_SCHEMA = {
  type: ["object", "null"],
  properties: {
    name: { type: "string" },
    type: { type: "string", enum: ["bank", "cash", "wallet"] },
    balance: { type: "number" },
  },
  required: ["name", "type", "balance"],
  additionalProperties: false,
} as const;

const GROQ_SUB_ACTION_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["add_expense", "add_income", "lend_money", "borrow_money", "transfer", "declare_account"],
    },
    amount: NNUM,
    item: NSTR,
    date: NSTR,
    note: NSTR,
    category_id: NSTR,
    account_id: NSTR,
    to_account_id: NSTR,
    person_id: NSTR,
    person_name: NSTR,
    new_category: GROQ_NEW_CATEGORY_SCHEMA,
    declared_account: GROQ_DECLARED_ACCOUNT_SCHEMA,
    loan_action: { type: ["string", "null"], enum: ["new", "append", "repayment", null] },
  },
  required: [
    "intent", "amount", "item", "date", "note", "category_id", "account_id",
    "to_account_id", "person_id", "person_name", "new_category", "declared_account", "loan_action",
  ],
  additionalProperties: false,
} as const;

const GROQ_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "add_expense", "add_income", "lend_money", "borrow_money", "record_repayment",
        "transfer", "declare_account", "query_data", "need_clarification", "multi",
      ],
    },
    amount: NNUM,
    item: NSTR,
    date: NSTR,
    note: NSTR,
    direction: { type: ["string", "null"], enum: ["given", "taken", null] },
    category_id: NSTR,
    account_id: NSTR,
    to_account_id: NSTR,
    person_id: NSTR,
    person_name: NSTR,
    new_category: GROQ_NEW_CATEGORY_SCHEMA,
    new_person: {
      type: ["object", "null"],
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    new_tags: { type: ["array", "null"], items: { type: "string" } },
    declared_account: GROQ_DECLARED_ACCOUNT_SCHEMA,
    loan_action: { type: ["string", "null"], enum: ["new", "append", "repayment", null] },
    missing: { type: ["array", "null"], items: { type: "string" } },
    confidence: { type: "number" },
    clarification_question: NSTR,
    transcript: NSTR,
    actions: { type: ["array", "null"], items: GROQ_SUB_ACTION_SCHEMA },
  },
  required: [
    "intent", "amount", "item", "date", "note", "direction", "category_id", "account_id",
    "to_account_id", "person_id", "person_name", "new_category", "new_person", "new_tags",
    "declared_account", "loan_action", "missing", "confidence", "clarification_question",
    "transcript", "actions",
  ],
  additionalProperties: false,
} as const;

/** Recursively drops null-valued keys so Groq's "null means absent" strict-mode
 *  convention matches Gemini's "key just isn't there" shape before either
 *  reaches the shared Zod schema. */
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== null) out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

const SYSTEM_RULES = `You are the parsing engine for Khata, a Roman-Urdu-first expense tracker.
You output ONLY structured data matching the provided schema — never prose.

Rules:
- Pick the MOST SPECIFIC existing category (a child, e.g. "Transport > InDrive"), not just its root ("Transport"). If nothing fits, propose a new_category with parent_id or parent_name set — never propose a new root unless truly nothing existing fits.
- Never propose depth beyond 2 levels (root -> child only).
- category_id (or new_category) is MANDATORY for every add_expense and add_income — never leave both unset. Even a vague purchase ("cups", "plastic items", "kuch samaan") gets the best-fit existing category (e.g. Home > Household, Food > Groceries) or a proposed new_category. The only categoryless intents are transfer, loan actions, and declare_account, which have no category at all.
- Preserve context the user stated (e.g. "flat se office") in the "note" field — never drop it.
- "item" is the THING involved, as a short noun phrase of 1-4 words, ALWAYS TRANSLATED TO ENGLISH regardless of what language the user spoke — "dhood" -> "Milk", "tamatar" -> "Tomatoes", "pyaz"/"onion" -> "Onions", "adrak" -> "Ginger" ("Biryani", "Petrol", "Flat rent" stay as-is since they're already the common English/loanword form). Never store the Roman Urdu or Urdu-script word itself, and never put the user's whole sentence in it — the same item spoken two different ways must always be saved under the same English name. If there is no specific thing beyond the category itself, leave item unset rather than echoing the sentence.
- Accounts: if the user names one, match it. If the message says something like "<account> mein <amount> pari hai", the intent is declare_account with a declared_account object — never propose a *new account* from an ordinary expense/income message.
- If the user has an open loan with a named person, set loan_action ("new" | "append" | "repayment") based on context — but never guess the funding account when money moves; leave account_id unset and add "account_id" to missing instead.
- Loans and income NEVER default to an account automatically — always leave account_id unset (add "account_id" to missing) unless the user names one explicitly.
- Transfer needs BOTH account_id (source) and to_account_id (destination). Only fill a side when its account is clearly and specifically named or described in the text (e.g. "mera pass cash" = the Cash account). If you can't confidently match one side to a specific existing account, leave just that field unset rather than guessing — never fill both with the same account, and never invent a side to make the transfer "complete."
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

/** Public signal: every provider that could serve this request is out of
 *  quota for today. Callers degrade to Layer 1 + manual entry (plan.md §8.3). */
export class LLMQuotaError extends Error {
  constructor() {
    super("AI quota exhausted for today.");
  }
}

/** Internal-only: ONE provider is out of quota. Not exported — parseIntent
 *  catches this to decide whether there's another provider left to try
 *  before it escalates to the public LLMQuotaError. */
class ProviderQuotaError extends Error {}

// @google/genai's ClientError/ServerError never set a `.status` property —
// the code only ever appears baked into the message string ("got status: 429
// Too Many Requests. ..."), which made the `err.status === 429` check below
// dead code: it always read undefined, so a real 429 fell through to the
// generic `throw err` and Groq was never actually tried. Confirmed by running
// scripts/repair-categories.ts against live quota — every rate-limited row
// surfaced as a hard failure instead of falling back.
function geminiStatus(err: unknown): number | undefined {
  const message = err instanceof Error ? err.message : "";
  const match = message.match(/got status: (\d+)/);
  return match ? Number(match[1]) : undefined;
}

/** Gemini call + validate. Throws ProviderQuotaError on 429. */
async function generateFromGemini(
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
    if (geminiStatus(err) === 429) throw new ProviderQuotaError("Gemini quota exhausted");
    throw err;
  }

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini returned no content.");
  }

  // Zod re-validation is deliberate even though responseSchema already
  // constrained the shape — schema conformance is not semantic correctness
  // (e.g. a category_id string that isn't actually one of this user's ids).
  return ParsedIntentSchema.parse(JSON.parse(raw));
}

/** Groq call + validate — the fallback once Gemini's daily quota is spent.
 *  Raw fetch rather than the `openai` SDK: this is the only Groq call in the
 *  app, and its request shape is a plain JSON POST, so a whole extra
 *  dependency for one call wasn't worth it. Throws ProviderQuotaError on 429. */
async function generateFromGroq(userContent: string, systemInstruction: string): Promise<ParsedIntent> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "parsed_intent", strict: true, schema: GROQ_RESPONSE_SCHEMA },
      },
      temperature: 0,
    }),
  });

  if (res.status === 429) throw new ProviderQuotaError("Groq quota exhausted");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("Groq returned no content.");
  }

  // Groq's strict mode returns every field with explicit nulls for "unset"
  // rather than omitting the key — stripNulls() converts that to the
  // omitted-key shape the shared Zod schema (same one Gemini's response goes
  // through) actually expects.
  return ParsedIntentSchema.parse(stripNulls(JSON.parse(raw)));
}

/** The single entry point for Layer 2 (text). Gemini first — it's also the
 *  audio provider, so keeping it primary means one fewer thing to keep in
 *  sync — falling back to Groq only once Gemini's daily quota is actually
 *  spent. Only surfaces LLMQuotaError once BOTH are exhausted. */
export async function parseIntent(text: string, ctx: UserContext): Promise<ParsedIntent> {
  const prompt = buildPrompt(text, ctx);
  try {
    return await generateFromGemini(prompt, SYSTEM_RULES);
  } catch (err) {
    if (!(err instanceof ProviderQuotaError)) throw err;
    try {
      return await generateFromGroq(prompt, SYSTEM_RULES);
    } catch (groqErr) {
      if (groqErr instanceof ProviderQuotaError) throw new LLMQuotaError();
      throw groqErr;
    }
  }
}

/** Layer 2 via speech — transcribe and parse in one call. `audioBase64` is raw
 *  base64 (no data: prefix). Returned intent carries a `transcript` so the UI
 *  can show what was heard before anything commits. Gemini-only: Groq's chat
 *  models don't understand audio (their Whisper endpoint is separate speech-
 *  to-text, not a combined transcribe+reason call), so there's no fallback
 *  path here — a quota-exhausted day means voice degrades to text entry. */
export async function parseIntentFromAudio(
  audioBase64: string,
  mimeType: string,
  ctx: UserContext,
): Promise<ParsedIntent> {
  try {
    return await generateFromGemini(
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
  } catch (err) {
    if (err instanceof ProviderQuotaError) throw new LLMQuotaError();
    throw err;
  }
}
