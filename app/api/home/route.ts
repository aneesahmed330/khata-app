import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { fetchNetWorth, fetchDailySpend, fetchPeriodTotals, deltaPct } from "@/lib/dashboard";
import type { InvestmentType } from "@/lib/types";

// Mobile equivalent of app/(app)/page.tsx (Home) — same lib/dashboard.ts calls
// and the same three scope.*.find() reads, returned as one JSON payload
// instead of rendered server-side.
const TYPE_LABEL: Record<InvestmentType, string> = {
  stock: "Stock",
  mutual_fund: "Mutual fund",
  gold: "Gold",
  crypto: "Crypto",
  real_estate: "Real estate",
  other: "Other",
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

  const [netWorth, accounts, openHoldings, thisMonth, lastMonth, daily] = await Promise.all([
    fetchNetWorth(scope),
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.holdings.find({ status: "open" }).toArray(),
    fetchPeriodTotals(scope, startOfMonth),
    fetchPeriodTotals(scope, startOfLastMonth, startOfMonth),
    fetchDailySpend(scope, thirtyDaysAgo, now),
  ]);

  const net = thisMonth.income - thisMonth.expense;

  return NextResponse.json({
    netWorth,
    thisMonth: {
      spent: thisMonth.expense,
      received: thisMonth.income,
      net,
      spendDeltaPct: deltaPct(thisMonth.expense, lastMonth.expense),
      incomeDeltaPct: deltaPct(thisMonth.income, lastMonth.income),
    },
    daily,
    accounts: accounts.map((a) => ({
      id: a._id.toHexString(),
      name: a.name,
      balance: a.balance,
      type: a.type,
      hideBalance: a.hide_balance,
      excludeFromTotal: a.exclude_from_total,
    })),
    holdings: openHoldings.map((h) => ({
      id: h._id.toHexString(),
      name: h.name,
      typeLabel: TYPE_LABEL[h.type],
      investedTotal: h.invested_total,
      currentValue: h.current_value,
      quantity: h.quantity,
      quantityUnit: h.quantity_unit,
      hideValue: h.hide_value,
      excludeFromTotal: h.exclude_from_total,
    })),
  });
}
