// Shared shaping for every ledger list (Home, History). This was duplicated
// verbatim in both pages, which meant each display fix had to be made twice and
// they drifted apart. One place now.
import type { AccountDoc, CategoryDoc, HoldingDoc, PersonDoc, TagDoc, TransactionDoc, TxnType } from "./types";
import type { LedgerRowData } from "@/components/LedgerRow";
import { relativeDateLabel } from "@/components/DateRule";

/** Types that represent SPENDING — used for the per-day outflow subtotal.
 *  Deliberately just "expense". `adjustment` doesn't belong (an opening
 *  balance or reconciliation isn't spending). `loan_given`/`repayment_out`
 *  don't either, even though money leaves an account: lending isn't spending
 *  it, the cash becomes a receivable, not a loss — and loans already have
 *  their own totals on /loans. Folding them in here double-counted the same
 *  rupee as both "spent" and "owed to you" at once. */
const OUTFLOW: ReadonlySet<TxnType> = new Set<TxnType>(["expense"]);

export interface DayGroup {
  label: string;
  rows: LedgerRowData[];
  outflow: number;
}

/** Pure row-shaping for one transaction — pulled out of groupTransactionsByDay
 *  so the paginated /api/transactions route can build identical rows without
 *  duplicating the lookup logic. */
export function buildLedgerRow(
  t: TransactionDoc,
  accountsById: Map<string, AccountDoc>,
  categoriesById: Map<string, CategoryDoc>,
  peopleById: Map<string, PersonDoc>,
  holdingsById: Map<string, HoldingDoc>,
  tagsById: Map<string, TagDoc> = new Map(),
): LedgerRowData {
  const category = t.category_id ? categoriesById.get(t.category_id.toHexString()) : undefined;
  const root = category?.parent_id
    ? categoriesById.get(category.parent_id.toHexString())
    : undefined;

  return {
    id: t._id.toHexString(),
    type: t.type,
    item: t.item,
    amount: t.amount,
    categoryPath: category
      ? root
        ? `${root.name} › ${category.name}`
        : category.name
      : undefined,
    accountName: t.account_id ? accountsById.get(t.account_id.toHexString())?.name : undefined,
    toAccountName: t.to_account_id ? accountsById.get(t.to_account_id.toHexString())?.name : undefined,
    personName: t.person_id ? peopleById.get(t.person_id.toHexString())?.name : undefined,
    holdingName: t.holding_id ? holdingsById.get(t.holding_id.toHexString())?.name : undefined,
    note: t.note,
    tagNames: t.tag_ids?.length
      ? t.tag_ids.map((id) => tagsById.get(id.toHexString())?.name).filter((n): n is string => Boolean(n))
      : undefined,
  };
}

export function groupTransactionsByDay(
  transactions: TransactionDoc[],
  accounts: AccountDoc[],
  categories: CategoryDoc[],
  people: PersonDoc[],
  holdings: HoldingDoc[] = [],
  now = new Date(),
  tags: TagDoc[] = [],
): DayGroup[] {
  const accountsById = new Map(accounts.map((a) => [a._id.toHexString(), a] as const));
  const categoriesById = new Map(categories.map((c) => [c._id.toHexString(), c] as const));
  const peopleById = new Map(people.map((p) => [p._id.toHexString(), p] as const));
  const holdingsById = new Map(holdings.map((h) => [h._id.toHexString(), h] as const));
  const tagsById = new Map(tags.map((t) => [t._id.toHexString(), t] as const));

  const groups: DayGroup[] = [];

  for (const t of transactions) {
    const row = buildLedgerRow(t, accountsById, categoriesById, peopleById, holdingsById, tagsById);
    const label = relativeDateLabel(t.date, now);
    const outflow = OUTFLOW.has(t.type) ? t.amount : 0;
    const last = groups[groups.length - 1];

    if (last && last.label === label) {
      last.rows.push(row);
      last.outflow += outflow;
    } else {
      groups.push({ label, rows: [row], outflow });
    }
  }

  return groups;
}
