// Layer 1 alias lookup — plan.md §2.2. Matches against the caller's already
// -fetched aliases (no DB call inside this module, so it stays a pure
// function and easy to test). Longest term wins so "in drive" doesn't lose
// to a shorter accidental substring.
import type { AliasDoc } from "../types";
import { normalizeName } from "../taxonomy";

export function matchAlias(text: string, aliases: AliasDoc[]): AliasDoc | null {
  const normalized = ` ${normalizeName(text)} `; // pad so word-boundary checks are simple
  let best: AliasDoc | null = null;

  for (const alias of aliases) {
    const term = ` ${alias.term_normalized} `;
    if (normalized.includes(term)) {
      if (!best || alias.term_normalized.length > best.term_normalized.length) {
        best = alias;
      }
    }
  }
  return best;
}
