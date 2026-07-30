// Shared shaping for every ledger list (Home, History). This was duplicated
// verbatim in both pages, which meant each display fix had to be made twice and
// they drifted apart. One place now.
import type { AccountDoc, CategoryDoc, TransactionDoc, TxnType } from "./types";
import type { LedgerRowData } from "@/components/LedgerRow";
import { relativeDateLabel } from "@/components/DateRule";

/** Types that represent money leaving — used for the per-day outflow subtotal.
 *  `adjustment` is deliberately absent: an opening balance or a reconciliation
 *  is not spending, and counting it would make day totals nonsense. */
const OUTFLOW: ReadonlySet<TxnType> = new Set<TxnType>([
  "expense",
  "loan_given",
  "repayment_out",
]);

export interface DayGroup {
  label: string;
  rows: LedgerRowData[];
  outflow: number;
}

export function groupTransactionsByDay(
  transactions: TransactionDoc[],
  accounts: AccountDoc[],
  categories: CategoryDoc[],
  now = new Date(),
): DayGroup[] {
  const accountsById = new Map(accounts.map((a) => [a._id.toHexString(), a] as const));
  const categoriesById = new Map(categories.map((c) => [c._id.toHexString(), c] as const));

  const groups: DayGroup[] = [];

  for (const t of transactions) {
    const category = t.category_id ? categoriesById.get(t.category_id.toHexString()) : undefined;
    const root = category?.parent_id
      ? categoriesById.get(category.parent_id.toHexString())
      : undefined;

    const row: LedgerRowData = {
      id: t._id.toHexString(),
      type: t.type,
      item: t.item,
      amount: t.amount,
      categoryPath: category
        ? root
          ? `${root.name} › ${category.name}`
          : category.name
        : undefined,
      accountName: accountsById.get(t.account_id.toHexString())?.name,
      note: t.note,
    };

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
