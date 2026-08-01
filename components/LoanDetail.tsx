"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import {
  Check,
  CircleAlert,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import {
  recordRepaymentAction,
  addToLoanAction,
  writeOffLoanAction,
  setLoanFlagAction,
  deleteLoanAction,
  type LoanActionResult,
} from "@/actions/loans";
import { Switch } from "@/components/Switch";
import { SectionHead } from "@/components/SectionHead";
import { formatPKRWhole } from "@/lib/format";
import { Sensitive } from "@/components/Sensitive";

export interface LoanDetailData {
  id: string;
  personName: string;
  direction: "given" | "taken";
  principal: number;
  outstanding: number;
  writtenOff?: number;
  excludeFromTotal: boolean;
  status: "open" | "settled";
  openedOn: string;
}

export interface LoanTxnRow {
  id: string;
  kind: "loan_given" | "loan_taken" | "repayment_in" | "repayment_out";
  amount: number;
  accountName?: string;
  date: string;
}

const KIND_LABEL: Record<LoanTxnRow["kind"], string> = {
  loan_given: "Lent",
  loan_taken: "Borrowed",
  repayment_in: "They paid back",
  repayment_out: "You paid back",
};

/** Same glyph vocabulary as the ledger: → money leaving you, ← money coming
 *  in. One shared icon for every row made "borrowed" and "paid back" — money
 *  going opposite directions — look like the same event at a glance. */
const KIND_ICON: Record<LoanTxnRow["kind"], typeof ArrowRight> = {
  loan_given: ArrowRight,
  loan_taken: ArrowLeft,
  repayment_in: ArrowLeft,
  repayment_out: ArrowRight,
};

type Panel = null | "repay" | "add";

export function LoanDetail({
  loan,
  accounts,
  transactions,
}: {
  loan: LoanDetailData;
  accounts: { id: string; name: string }[];
  transactions: LoanTxnRow[];
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const repaid = Math.max(loan.principal - loan.outstanding, 0);
  const repaidPct = loan.principal > 0 ? Math.min((repaid / loan.principal) * 100, 100) : 0;
  const settled = loan.status === "settled";
  const theyOweYou = loan.direction === "given";

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-chip border border-rule bg-surface-lift p-4">
        {/* No direction glyph here on purpose. In a list row the arrow sits
            beside the name and reads as direction, but alone in a card's
            top-right corner it reads as a back button — and this screen
            already has a real one in the header. The line below says which
            way the money went in words. */}
        <div className="min-w-0">
          <div className="t-title truncate">{loan.personName}</div>
          <div className="t-label text-fg-muted">
            {theyOweYou ? "Owes you" : "You owe them"}
            {settled ? " · settled" : ""} · opened {loan.openedOn}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <div className="t-micro text-fg-faint">Outstanding</div>
            <div className={clsx("t-kpi tnum", settled ? "text-fg-muted" : theyOweYou ? "text-in" : "text-out")}>
              <Sensitive>{formatPKRWhole(loan.outstanding)}</Sensitive>
            </div>
          </div>
          <div>
            <div className="t-micro text-fg-faint">Original</div>
            <div className="t-kpi tnum text-fg-muted">
              <Sensitive>{formatPKRWhole(loan.principal)}</Sensitive>
            </div>
          </div>
        </div>

        {loan.principal > 0 ? (
          <div className="mt-3">
            <div className="h-1.5 w-full bg-rule-soft">
              <div
                className="anim-bar-grow h-1.5 rounded-r-[3px] bg-chart-in"
                style={{ "--bar-w": `${repaidPct}%` } as React.CSSProperties}
              />
            </div>
            <div className="t-micro mt-1.5 text-fg-faint">
              <Sensitive>{formatPKRWhole(repaid)}</Sensitive> back · {Math.round(repaidPct)}%
              {loan.writtenOff && loan.writtenOff > 0 ? (
                <>
                  {" "}
                  · <Sensitive>{formatPKRWhole(loan.writtenOff)}</Sensitive> written off
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {loan.excludeFromTotal ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="t-micro rounded-full border border-rule bg-surface-sunk px-2 py-1 text-fg-muted">
              Not in net worth
            </span>
          </div>
        ) : null}
      </div>

      {!settled ? (
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label={theyOweYou ? "They paid back" : "You paid back"}
            active={panel === "repay"}
            onClick={() => setPanel(panel === "repay" ? null : "repay")}
          />
          <ActionButton
            label={theyOweYou ? "Lend more" : "Borrow more"}
            active={panel === "add"}
            onClick={() => setPanel(panel === "add" ? null : "add")}
          />
        </div>
      ) : null}

      {panel === "repay" ? (
        <RepayPanel loanId={loan.id} accounts={accounts} outstanding={loan.outstanding} />
      ) : null}
      {panel === "add" ? (
        <AddPanel loanId={loan.id} accounts={accounts} theyOweYou={theyOweYou} />
      ) : null}

      {transactions.length > 0 ? (
        <div>
          <h2 className="t-micro mb-2 text-fg-faint">History</h2>
          <div className="overflow-hidden rounded-chip border border-rule">
            {transactions.map((t, i) => {
              const Icon = KIND_ICON[t.kind];
              return (
              <Link
                key={t.id}
                href={`/txn/${t.id}`}
                className={clsx(
                  "flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-lift/60",
                  i > 0 && "border-t border-rule-soft",
                )}
              >
                <Icon size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="t-body truncate">{KIND_LABEL[t.kind]}</div>
                  <div className="t-label truncate text-fg-muted">
                    {/* "—" for no account, not "Unspecified account" — down a
                        column of rows that reads as a repeated error rather
                        than "the user chose not to name one". */}
                    {[t.accountName ?? "—", t.date].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="tnum shrink-0 font-num text-[15px]">
                  <Sensitive>{formatPKRWhole(t.amount)}</Sensitive>
                </span>
              </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <FlagsSection loan={loan} />
      <LoanFooterActions loanId={loan.id} settled={settled} personName={loan.personName} />
    </div>
  );
}

function FlagsSection({ loan }: { loan: LoanDetailData }) {
  const [checked, setChecked] = useState(loan.excludeFromTotal);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    const next = !checked;
    setChecked(next);
    setFailed(false);

    const body = new FormData();
    body.set("loan_id", loan.id);
    body.set("value", String(next));

    const result = await setLoanFlagAction(undefined, body);
    if (result?.error) {
      setChecked(!next);
      setFailed(true);
    }
  }

  return (
    <section>
      <SectionHead label="This loan" />
      <div className="overflow-hidden rounded-chip border border-rule">
        <div className="flex items-start gap-3 px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <div className="t-body">Leave out of net worth</div>
            <div className="t-label text-fg-muted">
              Repayments and additions still record here, but the outstanding amount stops
              counting toward your total assets.
            </div>
            {failed ? <div className="t-label mt-1 text-out">Couldn&apos;t save that.</div> : null}
          </div>
          <Switch checked={checked} onChange={() => void toggle()} label="Leave out of net worth" />
        </div>
      </div>
    </section>
  );
}

function LoanFooterActions({
  loanId,
  settled,
  personName,
}: {
  loanId: string;
  settled: boolean;
  personName: string;
}) {
  const [mode, setMode] = useState<null | "writeoff" | "delete">(null);

  if (mode === "writeoff") {
    return <WriteOffConfirm loanId={loanId} onCancel={() => setMode(null)} />;
  }
  if (mode === "delete") {
    return (
      <form action={deleteLoanAction} className="mt-2 flex w-full flex-col gap-3">
        <p className="t-label text-center text-fg-muted">
          This undoes every entry on this loan — whichever accounts they moved get their balances
          back — and removes {personName}&apos;s loan entirely. Use &ldquo;write off&rdquo; instead
          if the money really moved and just won&apos;t come back.
        </p>
        <input type="hidden" name="loan_id" value={loanId} />
        <div className="flex gap-2">
          <DangerSubmit label="Yes, delete it" />
          <button
            type="button"
            onClick={() => setMode(null)}
            className="rounded-chip border border-rule px-4 py-3 text-[15px] text-fg-muted transition-colors hover:text-fg"
          >
            Keep it
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-2 flex justify-center gap-5">
      {!settled ? (
        <button
          type="button"
          onClick={() => setMode("writeoff")}
          className="py-2 text-[13px] text-fg-faint transition-colors hover:text-fg-muted"
        >
          Write off the rest
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setMode("delete")}
        className="flex items-center gap-1.5 py-2 text-[13px] text-out/70 transition-colors hover:text-out"
      >
        <Trash2 size={13} strokeWidth={1.75} aria-hidden />
        Delete this loan
      </button>
    </div>
  );
}

function WriteOffConfirm({ loanId, onCancel }: { loanId: string; onCancel: () => void }) {
  const [state, formAction] = useFormState<LoanActionResult, FormData>(writeOffLoanAction, {});
  return (
    <form action={formAction} className="mt-2 flex w-full flex-col gap-3">
      <p className="t-label text-center text-fg-muted">
        Closes the loan at zero without moving any money — for a remainder that was forgiven or
        settled outside the app. No account balance changes.
      </p>
      <input type="hidden" name="loan_id" value={loanId} />
      {state.error ? <ErrorNote message={state.error} /> : null}
      <div className="flex gap-2">
        <SubmitButton label="Write it off" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-chip border border-rule px-4 py-3 text-[14px] text-fg-muted transition-colors hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function RepayPanel({
  loanId,
  accounts,
  outstanding,
}: {
  loanId: string;
  accounts: { id: string; name: string }[];
  outstanding: number;
}) {
  const [state, formAction] = useFormState<LoanActionResult, FormData>(recordRepaymentAction, {});
  return (
    <form action={formAction}>
      <PanelShell error={state.error}>
        <input type="hidden" name="loan_id" value={loanId} />
        <p className="t-label text-fg-muted">
          How much came back? <span className="tnum">{formatPKRWhole(outstanding)}</span> outstanding.
        </p>
        <AmountInput name="amount" defaultValue={String(Math.round(outstanding))} />
        <AccountSelect name="account_id" accounts={accounts} />
        <DateInput />
        <SubmitButton label="Record repayment" />
      </PanelShell>
    </form>
  );
}

function AddPanel({
  loanId,
  accounts,
  theyOweYou,
}: {
  loanId: string;
  accounts: { id: string; name: string }[];
  theyOweYou: boolean;
}) {
  const [state, formAction] = useFormState<LoanActionResult, FormData>(addToLoanAction, {});
  return (
    <form action={formAction}>
      <PanelShell error={state.error}>
        <input type="hidden" name="loan_id" value={loanId} />
        <p className="t-label text-fg-muted">
          {theyOweYou ? "How much more did you lend?" : "How much more did you borrow?"}
        </p>
        <AmountInput name="amount" />
        <AccountSelect name="account_id" accounts={accounts} />
        <DateInput />
        <SubmitButton label={theyOweYou ? "Add to what they owe" : "Add to what you owe"} />
      </PanelShell>
    </form>
  );
}

function PanelShell({ children, error }: { children: React.ReactNode; error?: string }) {
  return (
    <div className="anim-rise flex flex-col gap-3 rounded-chip border border-rule bg-surface-lift p-4">
      {children}
      {error ? <ErrorNote message={error} /> : null}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2">
      <CircleAlert size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-out" aria-hidden />
      <p className="t-label text-out">{message}</p>
    </div>
  );
}

function AmountInput({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <input
      name={name}
      type="text"
      inputMode="decimal"
      required
      defaultValue={defaultValue}
      placeholder="0.00"
      className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 font-num text-[16px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
    />
  );
}

function DateInput() {
  return (
    <input
      name="date"
      type="date"
      defaultValue={new Date().toISOString().slice(0, 10)}
      className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 font-num text-[14px] text-fg outline-none transition-colors focus:border-accent"
    />
  );
}

function AccountSelect({ name, accounts }: { name: string; accounts: { id: string; name: string }[] }) {
  return (
    <select
      name={name}
      defaultValue={accounts[0]?.id ?? ""}
      className="t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 text-fg outline-none transition-colors focus:border-accent"
    >
      <option value="">Not sure / don&apos;t remember</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

function ActionButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-chip border px-3 py-2 text-[13px] transition-colors",
        active ? "border-accent bg-accent text-on-accent" : "border-rule bg-surface-sunk text-fg hover:border-fg-faint",
      )}
    >
      {label}
    </button>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex flex-1 items-center justify-center gap-2 rounded-chip bg-accent py-3 text-[14px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98] disabled:opacity-50"
    >
      {pending ? (
        <Loader2 size={15} strokeWidth={2} className="animate-spin" aria-hidden />
      ) : (
        <Check size={15} strokeWidth={2.5} aria-hidden />
      )}
      {label}
    </button>
  );
}

function DangerSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex flex-1 items-center justify-center gap-2 rounded-chip border border-out bg-out/10 py-3 text-[15px] font-medium text-out transition-transform duration-150 active:scale-[0.98] disabled:opacity-50"
    >
      {pending ? (
        <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden />
      ) : (
        <Trash2 size={16} strokeWidth={1.75} aria-hidden />
      )}
      {label}
    </button>
  );
}
