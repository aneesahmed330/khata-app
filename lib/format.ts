// PKR uses lakh/crore grouping — 1,24,500 not 124,500. No Intl.NumberFormat
// locale gives this for "en" reliably, so it's hand-rolled. DESIGN.md §4.

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) groups.unshift(rest);
  return `${groups.join(",")},${last3}`;
}

/** 124500.4 -> "1,24,500.40". Negative -> leading "-". Always shows paisa
 *  (2dp) — dropping them silently turned "50.48" into "50" everywhere it was
 *  displayed, which read as data loss even though the stored amount was fine. */
export function formatPKR(amount: number): string {
  const negative = amount < 0;
  const [wholePart, decimalPart] = Math.abs(amount).toFixed(2).split(".");
  const grouped = groupIndian(wholePart!);
  const result = `${grouped}.${decimalPart}`;
  return negative ? `-${result}` : result;
}

/** 124500.4 -> "1,24,500". Whole rupees, for summary figures — KPI tiles and
 *  the net-worth hero. Paisa are the ledger's business: a row is a record and
 *  must reconcile to the paisa, but a tile is a rounded read of a total, and
 *  the ".00" tail was pushing real digits out of the tile it sat in. */
export function formatPKRWhole(amount: number): string {
  const negative = amount < 0;
  const grouped = groupIndian(String(Math.round(Math.abs(amount))));
  return negative ? `-${grouped}` : grouped;
}

/** Same as formatPKR but with the Rs prefix for standalone display. */
export function formatPKRWithSymbol(amount: number): string {
  return `Rs ${formatPKR(amount)}`;
}

/** 124500 -> "1.2 lakh", 12400000 -> "1.2 crore". For tight UI (chips, stat tiles). */
export function formatPKRCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}${(abs / 1_00_00_000).toFixed(1)} crore`;
  if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(1)} lakh`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${Math.round(abs)}`;
}
