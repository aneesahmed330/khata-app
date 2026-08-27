"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import {
  Check,
  CircleAlert,
  Loader2,
  TrendingUp,
  TrendingDown,
  Coins,
  PenLine,
  Plus,
  Trash2,
  Eye,
} from "lucide-react";
import clsx from "clsx";
import {
  buyMoreAction,
  sellAction,
  recordDividendAction,
  updateCurrentValueAction,
  updateHoldingAction,
  setHoldingFlagAction,
  deleteHoldingAction,
  type InvestmentActionResult,
} from "@/actions/investments";
import { Switch } from "@/components/Switch";
import { Sensitive } from "@/components/Sensitive";
import { SectionHead } from "@/components/SectionHead";
import { formatPKRWhole } from "@/lib/format";
import type { InvestmentType } from "@/lib/types";

export interface HoldingDetailData {
  id: string;
  name: string;
  symbol?: string;
  type: InvestmentType;
  typeLabel: string;
  quantity: number;
  quantityUnit?: string;
  investedTotal: number;
  currentValue?: number;
  currentValueUpdatedAt?: string;
  dividendsReceived: number;
  hideValue: boolean;
  excludeFromTotal: boolean;
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
  const priced = holding.currentValue !== undefined;
  const gain = priced ? holding.currentValue! - holding.investedTotal : null;
  const gainPct =
    gain !== null && holding.investedTotal > 0 ? (gain / holding.investedTotal) * 100 : null;

  return (
    <div className="flex flex-col gap-6">
      <ValueCard holding={holding} gain={gain} gainPct={gainPct} />

      {holding.status === "open" ? (
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Buy more" active={panel === "buy"} onClick={() => setPanel(panel === "buy" ? null : "buy")} />
          <ActionButton label="Sell" active={panel === "sell"} onClick={() => setPanel(panel === "sell" ? null : "sell")} />
          <ActionButton label="Dividend" active={panel === "dividend"} onClick={() => setPanel(panel === "dividend" ? null : "dividend")} />
          <ActionButton label={priced ? "Update value" : "Set value"} active={panel === "value"} onClick={() => setPanel(panel === "value" ? null : "value")} />
        </div>
      ) : null}

      {panel === "buy" ? <BuyPanel holdingId={holding.id} accounts={accounts} /> : null}
      {panel === "sell" ? <SellPanel holdingId={holding.id} accounts={accounts} /> : null}
      {panel === "dividend" ? <DividendPanel holdingId={holding.id} accounts={accounts} /> : null}
      {panel === "value" ? <ValuePanel holdingId={holding.id} currentValue={holding.currentValue} /> : null}

      {transactions.length > 0 ? (
        <section>
          <SectionHead label="History" meta={`${transactions.length}`} />
          <div className="overflow-hidden rounded-chip border border-rule">
            {transactions.map((t, i) => {
              const Icon = KIND_ICON[t.kind];
              return (
                <Link
                  key={t.id}
                  href={`/txn/${t.id}`}
                  style={{ "--i": i } as React.CSSProperties}
                  className={clsx(
                    "anim-stagger flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-lift/60",
                    i > 0 && "border-t border-rule-soft",
                  )}
                >
                  <Icon size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="t-body truncate">
                      {KIND_LABEL[t.kind]}
                      {t.quantityDelta
                        ? ` · ${t.quantityDelta}${holding.quantityUnit ? ` ${holding.quantityUnit}` : ""}`
                        : ""}
                    </div>
                    <div className="t-label truncate text-fg-muted">
                      {/* "Unspecified account" is a real state — the user chose
                          not to name one — but repeated down a column it read
                          like a row of errors. Softened to a dash. */}
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
        </section>
      ) : null}

      <DetailsForm holding={holding} />
      <FlagsSection holding={holding} />
      <DangerSection holding={holding} />
    </div>
  );
}

function ValueCard({
  holding,
  gain,
  gainPct,
}: {
  holding: HoldingDetailData;
  gain: number | null;
  gainPct: number | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const masked = holding.hideValue && !revealed;
  const priced = holding.currentValue !== undefined;
  const show = (v: number) => (masked ? "••••••" : formatPKRWhole(v));

  return (
    <div className="rounded-chip border border-rule bg-surface-lift p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="t-title truncate">{holding.name}</div>
          <div className="t-label truncate text-fg-muted">
            {holding.typeLabel}
            {holding.symbol ? ` · ${holding.symbol}` : ""}
            {holding.quantity > 0
              ? ` · ${holding.quantity}${holding.quantityUnit ? ` ${holding.quantityUnit}` : ""}`
              : ""}
          </div>
        </div>
        {masked ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="t-label flex shrink-0 items-center gap-1 text-fg-faint transition-colors hover:text-fg"
          >
            <Eye size={13} strokeWidth={1.75} aria-hidden />
            Reveal
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="t-micro text-fg-faint">Invested</div>
          <div className="t-kpi tnum">{show(holding.investedTotal)}</div>
        </div>
        <div>
          <div className="t-micro text-fg-faint">Current value</div>
          {priced ? (
            <div
              className={clsx(
                "t-kpi tnum",
                // Colour is suppressed while masked for the same reason as the
                // gain line — it encodes up/down on its own.
                !masked && gain !== null && (gain >= 0 ? "text-in" : "text-out"),
              )}
            >
              {show(holding.currentValue!)}
            </div>
          ) : (
            // Not a number, so it doesn't get number styling — an unset value
            // rendered in the same mono face as a real figure reads like data.
            <div className="t-label pt-1.5 text-fg-faint">Not set yet</div>
          )}
        </div>
      </div>

      {gain !== null ? (
        <div className="mt-3 border-t border-rule-soft pt-3">
          {masked ? (
            // Blanking the figure but keeping the green/red sign would still
            // announce "this one is up" to anyone glancing over. Masked means
            // masked — direction included.
            <span className="t-label text-fg-faint">
              Unrealised gain hidden
              {holding.currentValueUpdatedAt ? ` · as of ${holding.currentValueUpdatedAt}` : ""}
            </span>
          ) : (
            <>
              <span className={clsx("tnum font-num text-[15px]", gain >= 0 ? "text-in" : "text-out")}>
                {gain >= 0 ? "+" : "−"}
                {formatPKRWhole(Math.abs(gain))}
              </span>
              {gainPct !== null ? (
                <span className={clsx("t-label ml-2", gain >= 0 ? "text-in" : "text-out")}>
                  {gain >= 0 ? "+" : "−"}
                  {Math.abs(gainPct).toFixed(1)}%
                </span>
              ) : null}
              <span className="t-label ml-2 text-fg-faint">
                unrealised
                {holding.currentValueUpdatedAt ? ` · as of ${holding.currentValueUpdatedAt}` : ""}
              </span>
            </>
          )}
        </div>
      ) : (
        <p className="t-label mt-3 border-t border-rule-soft pt-3 text-fg-faint">
          Set a current value to see gain or loss. There&apos;s no live price feed — you enter
          today&apos;s worth yourself.
        </p>
      )}

      {holding.dividendsReceived > 0 ? (
        <div className="t-label mt-2 text-fg-muted">
          {masked ? "••••" : formatPKRWhole(holding.dividendsReceived)} in dividends to date
        </div>
      ) : null}

      {holding.excludeFromTotal || holding.status === "closed" ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {holding.excludeFromTotal ? <Badge>Not in net worth</Badge> : null}
          {holding.status === "closed" ? <Badge>Closed</Badge> : null}
        </div>
      ) : null}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="t-micro rounded-full border border-rule bg-surface-sunk px-2 py-1 text-fg-muted">
      {children}
    </span>
  );
}

function DetailsForm({ holding }: { holding: HoldingDetailData }) {
  const [state, formAction] = useFormState<InvestmentActionResult, FormData>(updateHoldingAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <SectionHead label="Details" />
      <input type="hidden" name="holding_id" value={holding.id} />

      <label className="block">
        <span className="t-label mb-1.5 block text-fg-muted">Name</span>
        <input
          name="name"
          type="text"
          required
          maxLength={60}
          defaultValue={holding.name}
          className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 text-fg outline-none transition-colors focus:border-accent"
        />
      </label>

      <div className="flex gap-2">
        <label className="block flex-1">
          <span className="t-label mb-1.5 block text-fg-muted">Type</span>
          <select
            name="type"
            defaultValue={holding.type}
            className="t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 text-fg outline-none transition-colors focus:border-accent"
          >
            <option value="stock">Stock</option>
            <option value="mutual_fund">Mutual fund</option>
            <option value="gold">Gold</option>
            <option value="crypto">Crypto</option>
            <option value="real_estate">Real estate</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block w-26">
          <span className="t-label mb-1.5 block text-fg-muted">Symbol</span>
          <input
            name="symbol"
            type="text"
            maxLength={12}
            defaultValue={holding.symbol ?? ""}
            placeholder="HUBC"
            className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
          />
        </label>
      </div>

      <label className="block">
        <span className="t-label mb-1.5 block text-fg-muted">Unit</span>
        <input
          name="quantity_unit"
          type="text"
          maxLength={20}
          defaultValue={holding.quantityUnit ?? ""}
          placeholder="shares, grams, units…"
          className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
        />
      </label>

      <p className="t-label text-fg-faint">
        Invested total and quantity aren&apos;t editable — they&apos;re the sum of this
        holding&apos;s buys and sells. Add or delete an entry to change them.
      </p>

      {state.error ? <ErrorNote message={state.error} /> : null}
      <SubmitButton label="Save changes" />
    </form>
  );
}

function FlagsSection({ holding }: { holding: HoldingDetailData }) {
  return (
    <section>
      <SectionHead label="This holding" />
      <div className="divide-y divide-rule-soft overflow-hidden rounded-chip border border-rule">
        <FlagRow
          holdingId={holding.id}
          flag="hide_value"
          initial={holding.hideValue}
          title="Hide the value"
          description="Masks the figures everywhere, even with the global privacy setting off."
        />
        <FlagRow
          holdingId={holding.id}
          flag="exclude_from_total"
          initial={holding.excludeFromTotal}
          title="Leave out of net worth"
          description="Buys, sells and dividends still record here, but the value stops counting toward your total assets."
        />
      </div>
    </section>
  );
}

function FlagRow({
  holdingId,
  flag,
  initial,
  title,
  description,
}: {
  holdingId: string;
  flag: "hide_value" | "exclude_from_total";
  initial: boolean;
  title: string;
  description: string;
}) {
  const [checked, setChecked] = useState(initial);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    const next = !checked;
    setChecked(next);
    setFailed(false);

    const body = new FormData();
    body.set("holding_id", holdingId);
    body.set("flag", flag);
    body.set("value", String(next));

    const result = await setHoldingFlagAction(undefined, body);
    if (result?.error) {
      setChecked(!next);
      setFailed(true);
    }
  }

  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <div className="t-body">{title}</div>
        <div className="t-label text-fg-muted">{description}</div>
        {failed ? <div className="t-label mt-1 text-out">Couldn&apos;t save that.</div> : null}
      </div>
      <Switch checked={checked} onChange={() => void toggle()} label={title} />
    </div>
  );
}

function DangerSection({ holding }: { holding: HoldingDetailData }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="border-t border-rule pt-5">
      {confirming ? (
        <form action={deleteHoldingAction} className="flex w-full flex-col gap-3">
          <p className="t-label text-center text-fg-muted">
            This reverses every buy, sell and dividend {holding.name} ever posted — any account they
            touched gets its balance back — and removes the holding itself.
          </p>
          <input type="hidden" name="holding_id" value={holding.id} />
          <div className="flex gap-2">
            <DangerSubmit />
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
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 py-2 text-[13px] text-out/70 transition-colors hover:text-out"
          >
            <Trash2 size={13} strokeWidth={1.75} aria-hidden />
            Delete this holding
          </button>
        </div>
      )}
    </section>
  );
}

// ── shared bits ────────────────────────────────────────────────────────────

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

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center justify-center gap-2 rounded-chip bg-accent py-3 text-[14px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98] disabled:opacity-50"
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

function DangerSubmit() {
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

/** Quantity is opt-in — most updates are just "I put in another 5,000", not a
 *  share count, so the field stays hidden until asked for. */
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
      defaultValue=""
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
        <label className="t-label flex items-center gap-2 text-fg-muted">
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
        <SubmitButton label="Save value" />
      </PanelShell>
    </form>
  );
}
