import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { HoldingDetail, type HoldingDetailData, type HoldingTxnRow } from "@/components/HoldingDetail";
import type { InvestmentType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<InvestmentType, string> = {
  stock: "Stock",
  mutual_fund: "Mutual fund",
  gold: "Gold",
  crypto: "Crypto",
  real_estate: "Real estate",
  other: "Other",
};

export default async function HoldingPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!ObjectId.isValid(params.id)) notFound();

  const scope = await forUser(session.userId);
  const holding = await scope.holdings.findOne({ _id: new ObjectId(params.id) });
  if (!holding) notFound();

  const [accounts, txns] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.transactions
      .find({ holding_id: holding._id, deleted_at: { $exists: false } }, { sort: { date: -1 } })
      .toArray(),
  ]);

  const accountsById = new Map(accounts.map((a) => [a._id.toHexString(), a] as const));

  const data: HoldingDetailData = {
    id: holding._id.toHexString(),
    name: holding.name,
    symbol: holding.symbol,
    typeLabel: TYPE_LABEL[holding.type],
    quantity: holding.quantity,
    quantityUnit: holding.quantity_unit,
    investedTotal: holding.invested_total,
    currentValue: holding.current_value,
    currentValueUpdatedAt: holding.current_value_updated_at?.toISOString(),
    dividendsReceived: holding.dividends_received,
    status: holding.status,
  };

  const rows: HoldingTxnRow[] = txns
    .filter((t) => t.type === "investment_buy" || t.type === "investment_sell" || t.type === "dividend")
    .map((t) => ({
      id: t._id.toHexString(),
      kind: t.type as HoldingTxnRow["kind"],
      amount: t.amount,
      quantityDelta: t.quantity_delta,
      accountName: t.account_id ? accountsById.get(t.account_id.toHexString())?.name : undefined,
      date: t.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    }));

  return (
    <>
      <header
        className="sticky top-0 z-20 border-b border-rule bg-surface/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <Link
            href="/investments"
            aria-label="Back"
            className="-ml-2 flex size-9 items-center justify-center rounded-chip text-fg-muted transition-colors hover:bg-surface-lift hover:text-fg"
          >
            <ArrowLeft size={19} strokeWidth={1.75} aria-hidden />
          </Link>
          <h1 className="t-title truncate">{holding.name}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-5">
        <HoldingDetail
          holding={data}
          accounts={accounts.map((a) => ({ id: a._id.toHexString(), name: a.name }))}
          transactions={rows}
        />
      </main>
    </>
  );
}
