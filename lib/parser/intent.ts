// Layer 1 intent signals — plan.md §2.2. Keyword-based; anything genuinely
// ambiguous is exactly what Layer 2 (Gemini) exists for, so this stays
// deliberately narrow rather than trying to cover every phrasing.
import type { Intent } from "../schemas";

export interface IntentSignal {
  intent: Intent;
  direction?: "given" | "taken";
}

const RULES: Array<{ test: RegExp; signal: IntentSignal }> = [
  {
    test: /\b(udhaar|qarz)\b.*\b(diya|de\s*di|dia)\b/,
    signal: { intent: "lend_money", direction: "given" },
  },
  {
    test: /\b(udhaar|qarz)\b.*\b(liya|le\s*li|lia)\b/,
    signal: { intent: "borrow_money", direction: "taken" },
  },
  {
    test: /\b(wapas|vasooli|adaigi|return\s*kiye?)\b/,
    signal: { intent: "record_repayment" },
  },
  {
    test: /\b(mila|mile|aaya|aayi|salary|tankhwah)\b/,
    signal: { intent: "add_income" },
  },
  {
    test: /\b(nikal\w*|transfer)\b/,
    signal: { intent: "transfer" },
  },
  {
    test: /\b(pari\s*hai|para\s*hai|mein\s*hain|mein\s*hai|balance\s*hai)\b/,
    signal: { intent: "declare_account" },
  },
];

/** Returns null (not "add_expense") when nothing matches — the caller
 *  decides the default so this module stays a pure signal detector. */
export function detectIntent(text: string): IntentSignal | null {
  const t = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.test.test(t)) return rule.signal;
  }
  return null;
}
