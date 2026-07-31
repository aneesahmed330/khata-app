"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Check, CircleAlert, Loader2, TrendingUp, TrendingDown, Coins, PenLine, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import {
  buyMoreAction,
  sellAction,
  recordDividendAction,
  updateCurrentValueAction,
  deleteHoldingAction,
  type InvestmentActionResult,
} from "@/actions/investments";
import { formatPKR } from "@/lib/format";

export interface HoldingDetailData {
  id: string;
  name: string;
  symbol?: string;
  typeLabel: string;
  quantity: number;
  quantityUnit?: string;
  investedTotal: number;
  currentValue?: number;
  currentValueUpdatedAt?: string;
  dividendsReceived: number;
  status: "open" | "closed";
}

export interface HoldingTxnRow {
  id: string;
  kind: "investment_buy" | "investment_sell" | "dividend";
  amount: number;
  quantityDelta?: number;
  accountName?: string;
  date: string;
}

const KIND_LABEL: Record<HoldingTxnRow["kind"], string> = {
  investment_buy: "Bought",
  investment_sell: "Sold",
  dividend: "Dividend",
};
const KIND_ICON = { investment_buy: TrendingUp, investment_sell: TrendingDown, dividend: Coins };

type Panel = null | "buy" | "sell" | "dividend" | "value";

export function HoldingDetail({
  holding,
  accounts,
  transactions,
}: {
  holding: HoldingDetailData;
  accounts: { id: string; name: string }[];
  transactions: HoldingTxnRow[];
}) {
  const [panel, setPanel] = useState<Panel>(null);

  const gain = holding.currentValue !== undefined ? holding.currentValue - holding.investedTotal : null;
  const gainPct = gain !== null && holding.investedTotal > 0 ? (gain / holding.investedTotal) * 100 : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-chip border border-rule p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="t-title">{holding.name}</div>
            <div className="t-label text-fg-muted">
              {holding.typeLabel}
              {holding.symbol ? ` · ${holding.symbol}` : ""}
              {holding.status === "closed" ? " · Closed" : ""}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="Invested" value={formatPKR(holding.investedTotal)} />
          {holding.currentValue !== undefined ? (
            <Stat
              label="Current value"
              value={formatPKR(holding.currentValue)}
              tone={gain !== null ? (gain >= 0 ? "text-in" : "text-out") : undefined}
            />
          ) : (
            <Stat label="Current value" value="Not set" muted />
          )}
        </div>

        {gain !== null ? (
          <div className={clsx("mt-2 t-label", gain >= 0 ? "text-in" : "text-out")}>
            {gain >= 0 ? "+" : ""}
            {formatPKR(gain)} ({gainPct !== null ? gainPct.toFixed(1) : "0.0"}%)
          </div>
        ) : null}

        {holding.quantity > 0 ? (
          <div className="mt-3 t-label text-fg-muted">
            {holding.quantity}
            {holding.quantityUnit ? ` ${holding.quantityUnit}` : ""} held
          </div>
        ) : null}

        {holding.dividendsReceived > 0 ? (
          <div className="mt-1 t-label text-fg-muted">
            {formatPKR(holding.dividendsReceived)} dividends received to date
          </div>
        ) : null}
      </div>

      {holding.status === "open" ? (
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Buy more" active={panel === "buy"} onClick={() => setPanel(panel === "buy" ? null : "buy")} />
          <ActionButton label="Sell" active={panel === "sell"} onClick={() => setPanel(panel === "sell" ? null : "sell")} />
          <ActionButton
            label="Record dividend"
            active={panel === "dividend"}
            onClick={() => setPanel(panel === "dividend" ? null : "dividend")}
          />
          <ActionButton
            label="Update value"
            active={panel === "value"}
            onClick={() => setPanel(panel === "value" ? null : "value")}
          />
        </div>
      ) : null}

      {panel === "buy" ? <BuyPanel holdingId={holding.id} accounts={accounts} /> : null}
      {panel === "sell" ? <SellPanel holdingId={holding.id} accounts={accounts} /> : null}
      {panel === "dividend" ? <DividendPanel holdingId={holding.id} accounts={accounts} /> : null}
      {panel === "value" ? <ValuePanel holdingId={holding.id} currentValue={holding.currentValue} /> : null}

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
                      {[t.accountName ?? "Unspecified account", t.date].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className="tnum shrink-0 font-num text-[15px]">{formatPKR(t.amount)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <DeleteHolding holdingId={holding.id} name={holding.name} />
    </div>
  );
}

function DeleteHolding({ holdingId, name }: { holdingId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="mt-2 flex justify-center">
      {confirming ? (
        <form action={deleteHoldingAction} className="flex w-full flex-col gap-3">
          <p className="t-label text-center text-fg-muted">
            This reverses every buy/sell/dividend {name} ever posted — any account it touched gets its
            balance back. {name} itself is removed, not just closed.
          </p>
          <input type="hidden" name="holding_id" value={holdingId} />
          <div className="flex gap-2">
            <DeleteButton />
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-chip border border-rule px-4 py-3 text-[15px] text-fg-muted transition-colors hover:text-fg"
            >
              Keep it
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 py-2 text-[13px] text-out/70 transition-colors hover:text-out"
        >
          <Trash2 size={13} strokeWidth={1.75} aria-hidden />
          Delete this holding
        </button>
      )}
    </div>
  );
}

function DeleteButton() {
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
      Yes, delete it
    </button>
  );
}

function Stat({ label, value, tone, muted }: { label: string; value: string; tone?: string; muted?: boolean }) {
  return (
    <div>
      <div className="t-micro text-fg-faint">{label}</div>
      <div className={clsx("tnum font-num text-[17px] leading-tight", tone, muted && "text-fg-faint")}>{value}</div>
    </div>
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

function PanelShell({ children, error }: { children: React.ReactNode; error?: string }) {
  return (
    <div className="anim-rise flex flex-col gap-3 rounded-chip border border-rule bg-surface-lift p-4">
      {children}
      {error ? (
        <div className="flex items-start gap-2">
          <CircleAlert size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-out" aria-hidden />
          <p className="t-label text-out">{error}</p>
        </div>
      ) : null}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center justify-center gap-2 rounded-chip bg-accent py-3 text-[14px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98] disabled:opacity-50"
    >
      {pending ? <Loader2 size={15} strokeWidth={2} className="animate-spin" aria-hidden /> : <Check size={15} strokeWidth={2.5} aria-hidden />}
      {label}
    </button>
  );
}

function AmountInput({ name, placeholder }: { name: string; placeholder?: string }) {
  return (
    <input
      name={name}
      type="text"
      inputMode="decimal"
      required
      placeholder={placeholder ?? "0.00"}
      className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 font-num text-[16px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
    />
  );
}

// Quantity is opt-in here too — most updates are just "I put in another
// 5,000", not a share count, so the field stays hidden until asked for.
function QuantityToggle({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  if (show) {
    return (
      <input
        name="quantity"
        type="text"
        inputMode="decimal"
        autoFocus
        placeholder={label}
        className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 font-num text-[15px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setShow(true)}
      className="t-label flex items-center gap-1.5 self-start text-fg-faint transition-colors hover:text-fg-muted"
    >
      <Plus size={13} strokeWidth={2} aria-hidden />
      {label}
    </button>
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

function BuyPanel({ holdingId, accounts }: { holdingId: string; accounts: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState<InvestmentActionResult, FormData>(buyMoreAction, {});
  return (
    <form action={formAction}>
      <PanelShell error={state.error}>
        <input type="hidden" name="holding_id" value={holdingId} />
        <p className="t-label text-fg-muted">How much more did you invest?</p>
        <AmountInput name="amount" />
        <QuantityToggle label="Also track exact quantity" />
        <AccountSelect name="account_id" accounts={accounts} />
        <SubmitButton label="Add purchase" />
      </PanelShell>
    </form>
  );
}

function SellPanel({ holdingId, accounts }: { holdingId: string; accounts: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState<InvestmentActionResult, FormData>(sellAction, {});
  return (
    <form action={formAction}>
      <PanelShell error={state.error}>
        <input type="hidden" name="holding_id" value={holdingId} />
        <p className="t-label text-fg-muted">Proceeds from the sale.</p>
        <AmountInput name="amount" placeholder="Proceeds" />
        <QuantityToggle label="Also track quantity sold" />
        <AccountSelect name="account_id" accounts={accounts} />
        <label className="flex items-center gap-2 t-label text-fg-muted">
          <input type="checkbox" name="close_fully" className="size-4 accent-accent" />
          This sells out the whole position
        </label>
        <SubmitButton label="Record sale" />
      </PanelShell>
    </form>
  );
}

function DividendPanel({ holdingId, accounts }: { holdingId: string; accounts: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState<InvestmentActionResult, FormData>(recordDividendAction, {});
  return (
    <form action={formAction}>
      <PanelShell error={state.error}>
        <input type="hidden" name="holding_id" value={holdingId} />
        <p className="t-label text-fg-muted">Dividend/payout received.</p>
        <AmountInput name="amount" />
        <AccountSelect name="account_id" accounts={accounts} />
        <SubmitButton label="Record dividend" />
      </PanelShell>
    </form>
  );
}

function ValuePanel({ holdingId, currentValue }: { holdingId: string; currentValue?: number }) {
  const [state, formAction] = useFormState<InvestmentActionResult, FormData>(updateCurrentValueAction, {});
  return (
    <form action={formAction}>
      <PanelShell error={state.error}>
        <input type="hidden" name="holding_id" value={holdingId} />
        <p className="t-label flex items-center gap-1.5 text-fg-muted">
          <PenLine size={12} strokeWidth={1.75} aria-hidden />
          No live price feed — punch in today&apos;s total value yourself.
        </p>
        <input
          name="current_value"
          type="text"
          inputMode="decimal"
          required
          defaultValue={currentValue !== undefined ? String(currentValue) : ""}
          placeholder="0.00"
          className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 font-num text-[16px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
        />
        <SubmitButton label="Update value" />
      </PanelShell>
    </form>
  );
}
