// Layer 1 date parser — plan.md §2.2. "kal"/"parso" are genuinely ambiguous
// in Urdu (used for both yesterday and tomorrow); an expense log is almost
// always about something that already happened, so both resolve to the
// past. If that assumption is wrong for a given entry, Layer 2 or a manual
// edit corrects it — it never blocks Layer 1 from firing.

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function parseDate(text: string, now = new Date()): Date | null {
  const t = text.toLowerCase();

  if (/\b(aj|aaj)\b/.test(t)) return startOfDay(now);
  if (/\bkal\b/.test(t)) return startOfDay(addDays(now, -1));
  if (/\bparso\b/.test(t)) return startOfDay(addDays(now, -2));
  if (/\bpichlay\s+hafte\b/.test(t)) return startOfDay(addDays(now, -7));

  const tareekh = t.match(/\b(\d{1,2})\s*tareekh\b/);
  if (tareekh && tareekh[1]) {
    const day = parseInt(tareekh[1], 10);
    const candidate = new Date(now.getFullYear(), now.getMonth(), day);
    // A day number greater than today's date almost certainly means last
    // month ("5 tareekh" said on the 20th means the 5th just gone).
    if (candidate > now) candidate.setMonth(candidate.getMonth() - 1);
    return startOfDay(candidate);
  }

  return null; // no date phrase found — caller defaults to today
}
