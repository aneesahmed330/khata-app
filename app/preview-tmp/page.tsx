// TEMPORARY — visual check harness. Deleted after screenshotting.
import { SectionHead } from "@/components/SectionHead";
import { KpiBand, KpiTile } from "@/components/Kpi";
import { LoanList, type LoanSummary } from "@/components/LoanList";
import { LoanDetail, type LoanDetailData, type LoanTxnRow } from "@/components/LoanDetail";
import { HideBalancesToggle } from "@/components/HideBalancesToggle";
import { NetWorthPrefsToggle } from "@/components/NetWorthPrefsToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Palette, Wallet, FolderTree, Users } from "lucide-react";
import { formatPKRWhole } from "@/lib/format";

const open: LoanSummary[] = [
  { id: "1", personName: "Saqlain", direction: "given", principal: 3700, outstanding: 3700, status: "open" },
  { id: "2", personName: "Asim Butt", direction: "given", principal: 70000, outstanding: 70000, status: "open", excludeFromTotal: true },
  { id: "3", personName: "Faizan", direction: "given", principal: 30000, outstanding: 30000, status: "open" },
];

const detail: LoanDetailData = {
  id: "2", personName: "Asim Butt", direction: "given",
  principal: 70000, outstanding: 70000, excludeFromTotal: true,
  status: "open", openedOn: "3 Jul 2026",
};
const history: LoanTxnRow[] = [
  { id: "a", kind: "loan_given", amount: 70000, accountName: undefined, date: "3 Jul" },
];

export default function Preview() {
  const owedToYou = 33700, youOwe = 0, net = owedToYou;
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <SectionHead label="Position" meta="1 not counted" />
      <KpiBand>
        <KpiTile label="Owed to you" value={formatPKRWhole(owedToYou)} tone="in" />
        <KpiTile label="You owe" value={formatPKRWhole(youOwe)} tone="out" />
        <KpiTile label="Net" value={`+${formatPKRWhole(net)}`} tone="in" footnote="in your favour" />
      </KpiBand>

      <section className="mt-5">
        <SectionHead label="Open" meta="3" />
        <LoanList loans={open} />
      </section>

      <div className="my-8 border-t border-rule pt-6">
        <SectionHead label="Loan detail (excluded)" />
        <LoanDetail
          loan={detail}
          accounts={[{ id: "x", name: "Cash" }, { id: "y", name: "Meezan Bank" }]}
          transactions={history}
        />
      </div>

      <div className="my-8 border-t border-rule pt-6">
        <SectionHead label="Settings — Preferences list" />
        <div className="divide-y divide-rule-soft rounded-chip border border-rule">
          <div className="flex items-center gap-3 px-4 py-3">
            <Wallet size={16} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
            <span className="t-body flex-1">Accounts</span>
            <span className="tnum font-num text-[13px] text-fg-muted">7 · 705,260.23 · 1 not counted</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <FolderTree size={16} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
            <span className="t-body flex-1">Categories</span>
            <span className="tnum font-num text-[13px] text-fg-muted">65</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Users size={16} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
            <span className="t-body flex-1">People (loans)</span>
            <span className="tnum font-num text-[13px] text-fg-muted">6</span>
          </div>
        </div>

        <div className="mt-6 divide-y divide-rule-soft rounded-chip border border-rule">
          <div className="flex items-start gap-3 px-4 py-3">
            <Palette size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="t-body">Theme</div>
              <div className="t-label text-fg-muted">Ink or Paper</div>
            </div>
            <ThemeToggle />
          </div>
          <HideBalancesToggle />
          <NetWorthPrefsToggle loansInitial={true} investmentsInitial={false} />
        </div>
      </div>
    </main>
  );
}
