import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { TopBar } from "@/components/TopBar";
import { EmptyNote } from "@/components/EmptyState";
import { StatPair } from "@/components/StatTile";
import { HoldingList, type HoldingSummary } from "@/components/HoldingList";
import { formatPKR } from "@/lib/format";
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

export default async function InvestmentsPage() {
  const session = await getSession();
  if (!session) return null;

  const scope = await forUser(session.userId);
  const holdings = await scope.holdings.find({}).toArray();

  const open = holdings.filter((h) => h.status === "open");
  const closed = holdings.filter((h) => h.status === "closed");

  const toSummary = (h: (typeof holdings)[number]): HoldingSummary => ({
    id: h._id.toHexString(),
    name: h.name,
    typeLabel: TYPE_LABEL[h.type],
    investedTotal: h.invested_total,
    currentValue: h.current_value,
    quantity: h.quantity,
    quantityUnit: h.quantity_unit,
    hideValue: h.hide_value,
    excludeFromTotal: h.exclude_from_total,
  });

  // Same rule as the dashboard's net worth — a holding taken out of the total
  // must not quietly reappear in the portfolio summary on this page.
  const counted = open.filter((h) => !h.exclude_from_total);
  const excludedCount = holdings.length - counted.length - closed.length;
  const totalInvested = counted.reduce((sum, h) => sum + h.invested_total, 0);
  const totalCurrentValue = counted.reduce(
    (sum, h) => sum + (h.current_value ?? h.invested_total),
    0,
  );
  const totalDividends = holdings.reduce((sum, h) => sum + h.dividends_received, 0);
  const gain = totalCurrentValue - totalInvested;
  const hasAnyCurrentValue = counted.some((h) => h.current_value !== undefined);

  return (
    <>
      <TopBar
        title="Investments"
        eyebrow={
          `${open.length} holding${open.length === 1 ? "" : "s"}` +
          (excludedCount > 0 ? ` · ${excludedCount} not counted` : "")
        }
      />
      <main className="mx-auto max-w-md px-4 pt-4">
        {holdings.length === 0 ? (
          <EmptyNote>No investments yet. Tap + below to add one.</EmptyNote>
        ) : (
          <>
            <div className="mb-4">
              <StatPair
                outLabel="Invested"
                outValue={totalInvested}
                inLabel={hasAnyCurrentValue ? "Current value" : "Invested"}
                inValue={totalCurrentValue}
              />
              {hasAnyCurrentValue ? (
                <p className={`t-label mt-2 ${gain >= 0 ? "text-in" : "text-out"}`}>
                  {gain >= 0 ? "+" : ""}
                  {formatPKR(gain)} overall
                </p>
              ) : (
                <p className="t-label mt-2 text-fg-faint">
                  Update a holding&apos;s current value to see gain/loss.
                </p>
              )}
              {totalDividends > 0 ? (
                <p className="t-label mt-1 text-fg-muted">
                  {formatPKR(totalDividends)} in dividends received to date
                </p>
              ) : null}
            </div>

            {open.length > 0 ? <HoldingList holdings={open.map(toSummary)} /> : null}

            {closed.length > 0 ? (
              <div className="mt-6">
                <h2 className="t-micro mb-2 text-fg-faint">Closed</h2>
                <HoldingList holdings={closed.map(toSummary)} />
              </div>
            ) : null}
          </>
        )}

        <Link
          href="/investments/new"
          className="mt-6 flex items-center justify-center gap-2 rounded-chip border border-rule py-3 text-[14px] text-fg-muted transition-colors hover:border-fg-faint hover:text-fg"
        >
          <Plus size={15} strokeWidth={2} aria-hidden />
          Add investment
        </Link>
      </main>
    </>
  );
}
