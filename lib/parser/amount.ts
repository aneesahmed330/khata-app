// Layer 1 amount parser — plan.md §2.2. Pure TS, zero API calls.
// Handles digits ("350", "3.5k"), Urdu-Arabic digits (۳۵۰), and the small
// set of Roman-Urdu number words + modifiers documented in the plan
// ("dhai hazaar", "saarhay teen sau", "paune do sau").

const URDU_DIGITS: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

function normalizeUrduDigits(text: string): string {
  return text.replace(/[۰-۹]/g, (d) => URDU_DIGITS[d] ?? d);
}

/** Speech-to-text renders zeros as the letter o and ones as l/I surprisingly
 *  often ("5oo ki biryani", "1ooo ka petrol"). Only runs that START with a
 *  real digit are touched, so ordinary words ("lo", "do", "lakh") are safe. */
function normalizeAsrDigitLookalikes(text: string): string {
  return text.replace(/\d[\doOlI]*/g, (run) =>
    run.replace(/[oO]/g, "0").replace(/[lI]/g, "1"),
  );
}

const NUMBER_WORDS: Record<string, number> = {
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  panch: 5,
  paanch: 5,
  che: 6,
  chhe: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  gyarah: 11,
  barah: 12,
  dhai: 2.5, // special-cased: not N.5, it's its own word
};

const MULTIPLIER_WORDS: Record<string, number> = {
  sau: 100,
  saikra: 100,
  hazaar: 1000,
  hazar: 1000,
  lakh: 100_000,
};

/** Numeric amount with an optional k/hazaar/lakh multiplier: "350", "3.5k",
 *  "5 hazaar", "2 lakh".
 *
 *  The multiplier is guarded by (?![a-z]) because it must be a whole token, not
 *  the first letter of the next word. Without that guard "aj 200 ka petrol"
 *  matched the `k` of "ka" and returned 200000 — and since Layer 1 commits
 *  directly at confidence >= 0.85, every "<number> ka/ki/ke ..." phrase (the
 *  single most common Roman Urdu shape) was silently stored 1000x too large. */
function parseDigitForm(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:(k|hazaar|hazar|lakh)(?![a-z]))?/i);
  if (!match || !match[1]) return null;
  const multiplierWord = match[2];
  let value = parseFloat(match[1]);
  if (/^k$/i.test(multiplierWord ?? "")) value *= 1_000;
  else if (/^hazaa?r$/i.test(multiplierWord ?? "")) value *= 1_000;
  else if (/^lakh$/i.test(multiplierWord ?? "")) value *= 100_000;
  return value > 0 ? value : null;
}

/** "saarhay teen sau" (3.5*100=350), "paune do sau" (1.75*100=175),
 *  "dhai hazaar" (2.5*1000=2500), "panch sau" (500). */
function parseWordForm(text: string): number | null {
  const tokens = text.toLowerCase().split(/\s+/);

  for (let i = 0; i < tokens.length; i++) {
    let base: number | null = null;
    let consumed = 0;
    const tok = tokens[i] ?? "";
    const next = tokens[i + 1] ?? "";

    if (tok === "saarhay" || tok === "sadhay") {
      const n = NUMBER_WORDS[next];
      if (n !== undefined) {
        base = n + 0.5;
        consumed = 2;
      }
    } else if (tok === "paune") {
      const n = NUMBER_WORDS[next];
      if (n !== undefined) {
        base = n - 0.25;
        consumed = 2;
      }
    } else if (NUMBER_WORDS[tok] !== undefined) {
      base = NUMBER_WORDS[tok];
      consumed = 1;
    }

    if (base === null) continue;

    const multiplierTok = tokens[i + consumed];
    const multiplier = multiplierTok ? MULTIPLIER_WORDS[multiplierTok] : undefined;
    if (multiplier !== undefined) {
      return base * multiplier;
    }
    // A bare number word with no multiplier is too ambiguous to trust
    // ("teen" alone could be anything) — only word-forms WITH a multiplier
    // count as a confident Layer 1 amount match.
  }
  return null;
}

export function parseAmount(text: string): number | null {
  const normalized = normalizeAsrDigitLookalikes(normalizeUrduDigits(text));
  return parseDigitForm(normalized) ?? parseWordForm(normalized);
}
