// Aggregations behind Home and Insights. Kept out of the pages so both read
// the same numbers — "spent this month" must not be able to mean two different
// things on two screens.
import type { UserScope } from "./scope";

export interface NetWorth {
  liquid: number;
  invested: number;
  receivable: number;
  owed: number;
  /** liquid + invested + receivable − owed */
  total: number;
}

/** The whole financial position in one shape. Investments count at their
 *  latest known value — `current_value` when the user has snapshotted one,
 *  otherwise what they put in, which is the honest fallback (never a guess at
 *  an unrealised gain). */
export async function fetchNetWorth(scope: UserScope): Promise<NetWorth> {
  const [accounts, holdings, loans] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.holdings.find({ status: "open" }).toArray(),
    scope.loans.find({ status: "open" }).toArray(),
  ]);

  const liquid = accounts.reduce((sum, a) => sum + a.balance, 0);
  const invested = holdings.reduce((sum, h) => sum + (h.current_value ?? h.invested_total), 0);
  const receivable = loans
    .filter((l) => l.direction === "given")
    .reduce((sum, l) => sum + l.outstanding, 0);
  const owed = loans
    .filter((l) => l.direction === "taken")
    .reduce((sum, l) => sum + l.outstanding, 0);

  return { liquid, invested, receivable, owed, total: liquid + invested + receivable - owed };
}

export interface DaySpend {
  label: string;
  fullLabel: string;
  value: number;
}

/** Default matches UserDoc.timezone's own default. Both sides of the day
 *  bucketing below have to agree on what "a day" means, and neither the Mongo
 *  server nor the Vercel runtime is in the user's zone. */
const DEFAULT_TZ = "Asia/Karachi";

/** YYYY-MM-DD for an instant, as seen in `tz`. en-CA is the locale that
 *  formats exactly that way, so this needs no manual padding. */
function dayKeyIn(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Zero-filled daily expense series. Two things this gets right:
 *
 *  The zero-fill — without it a day with no spending vanishes and the line
 *  interpolates straight over the gap, drawing a slope that never happened.
 *
 *  The timezone — `$dateToString` defaults to UTC, so in PKT (UTC+5) anything
 *  logged after 5am local was stamped into the NEXT calendar day and appeared
 *  one bucket to the right, while local midnight entries stayed put. Most of a
 *  normal day's spending was being filed under tomorrow. Passing `timezone` to
 *  Mongo and deriving the loop's keys through the same zone makes both sides
 *  agree on the day boundary. */
export async function fetchDailySpend(
  scope: UserScope,
  from: Date,
  to: Date,
  timezone: string = DEFAULT_TZ,
): Promise<DaySpend[]> {
  const rows = await scope.transactions
    .aggregate<{ _id: string; total: number }>([
      {
        $match: {
          type: "expense",
          date: { $gte: from, $lte: to },
          deleted_at: { $exists: false },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone } },
          total: { $sum: "$amount" },
        },
      },
    ])
    .toArray();

  const byKey = new Map(rows.map((r) => [r._id, r.total] as const));
  const out: DaySpend[] = [];

  // Resolve the window's endpoints into calendar days as seen in `tz`, then walk
  // the calendar arithmetically. Stepping a Date and re-converting each time
  // would only line up while `tz` runs ahead of the runtime's own zone — true
  // for Karachi on a UTC server, silently off by one for a zone behind it.
  const endKey = dayKeyIn(to, timezone);
  const [y0, m0, d0] = dayKeyIn(from, timezone).split("-").map(Number);
  const cursor = new Date(Date.UTC(y0!, m0! - 1, d0!));

  for (let guard = 0; guard < 400; guard++) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({
      label: String(cursor.getUTCDate()),
      // Formatted in UTC to match how the key was built — this Date is a bare
      // calendar marker, not a real instant, so it must not be re-zoned.
      fullLabel: cursor.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      value: byKey.get(key) ?? 0,
    });
    if (key >= endKey) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export interface PeriodTotals {
  expense: number;
  income: number;
}

export async function fetchPeriodTotals(
  scope: UserScope,
  from: Date,
  to?: Date,
): Promise<PeriodTotals> {
  const rows = await scope.transactions
    .aggregate<{ _id: string; total: number }>([
      {
        $match: {
          type: { $in: ["expense", "income"] },
          date: to ? { $gte: from, $lt: to } : { $gte: from },
          deleted_at: { $exists: false },
        },
      },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ])
    .toArray();

  return {
    expense: rows.find((r) => r._id === "expense")?.total ?? 0,
    income: rows.find((r) => r._id === "income")?.total ?? 0,
  };
}

/** Percent change, or null when there's no baseline to compare against.
 *  Returning null rather than 0 keeps "no data last month" visually distinct
 *  from "exactly the same as last month". */
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
