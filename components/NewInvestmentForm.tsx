"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, CircleAlert, Loader2, Plus } from "lucide-react";
import { createHoldingAction, type InvestmentActionResult } from "@/actions/investments";
import type { InvestmentType } from "@/lib/types";

const TYPE_LABEL: Record<InvestmentType, string> = {
  stock: "Stock (PSX etc.)",
  mutual_fund: "Mutual fund",
  gold: "Gold",
  crypto: "Crypto",
  real_estate: "Real estate",
  other: "Other",
};

// Whether "quantity" even makes sense for the type — a stock has shares, gold
// has grams/tola, but real estate and "other" usually don't have a natural
// unit, so those default the field closed rather than forcing an empty one.
const HAS_NATURAL_QUANTITY: Record<InvestmentType, boolean> = {
  stock: true,
  mutual_fund: true,
  gold: true,
  crypto: true,
  real_estate: false,
  other: false,
};

const QUANTITY_UNIT_HINT: Record<InvestmentType, string> = {
  stock: "shares",
  mutual_fund: "units",
  gold: "grams",
  crypto: "coins",
  real_estate: "",
  other: "",
};

export function NewInvestmentForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState<InvestmentActionResult, FormData>(createHoldingAction, {});
  const [type, setType] = useState<InvestmentType>("stock");
  // Most people just want "I put 20,000 into stocks" without breaking it into
  // exact shares — quantity is opt-in, not a field sitting there by default.
  const [trackQuantity, setTrackQuantity] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Type" htmlFor="type">
        <select
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as InvestmentType)}
          className="t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors focus:border-accent"
        >
          {(Object.keys(TYPE_LABEL) as InvestmentType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Name" htmlFor="name">
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder="HUBCO, PSX stocks, DHA plot… — as specific or general as you like"
          className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
        />
      </Field>

      {type === "stock" ? (
        <Field label="Symbol (optional)" htmlFor="symbol">
          <input
            id="symbol"
            name="symbol"
            type="text"
            maxLength={12}
            placeholder="HUBC"
            className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
          />
        </Field>
      ) : null}

      <Field label="Amount invested" htmlFor="amount">
        <input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="0.00"
          className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 font-num text-[17px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
        />
      </Field>

      {HAS_NATURAL_QUANTITY[type] ? (
        trackQuantity ? (
          <div className="flex gap-2">
            <div className="flex-[2]">
              <Field label="Quantity" htmlFor="quantity">
                <input
                  id="quantity"
                  name="quantity"
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  placeholder="0"
                  className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 font-num text-[15px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Unit" htmlFor="quantity_unit">
                <input
                  id="quantity_unit"
                  name="quantity_unit"
                  type="text"
                  maxLength={20}
                  defaultValue={QUANTITY_UNIT_HINT[type]}
                  className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors focus:border-accent"
                />
              </Field>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setTrackQuantity(true)}
            className="t-label flex items-center gap-1.5 self-start text-fg-faint transition-colors hover:text-fg-muted"
          >
            <Plus size={13} strokeWidth={2} aria-hidden />
            Also track exact quantity ({QUANTITY_UNIT_HINT[type]})
          </button>
        )
      ) : null}

      <Field label="From account (optional)" htmlFor="account_id">
        <select
          id="account_id"
          name="account_id"
          defaultValue=""
          className="t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors focus:border-accent"
        >
          <option value="">Not sure / don&apos;t remember</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <p className="t-label mt-1.5 text-fg-faint">
          Leaving this blank still logs the investment — it just won&apos;t deduct from any account balance.
        </p>
      </Field>

      <Field label="Date" htmlFor="date">
        <input
          id="date"
          name="date"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 font-num text-[15px] text-fg outline-none transition-colors focus:border-accent"
        />
      </Field>

      <Field label="Note" htmlFor="note">
        <textarea
          id="note"
          name="note"
          rows={2}
          maxLength={200}
          placeholder="Optional"
          className="t-body w-full resize-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
        />
      </Field>

      {state.error ? (
        <div className="flex items-start gap-2">
          <CircleAlert size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-out" aria-hidden />
          <p className="t-label text-out">{state.error}</p>
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 flex items-center justify-center gap-2 rounded-chip bg-accent py-3.5 text-[15px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
    >
      {pending ? (
        <>
          <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden />
          Saving…
        </>
      ) : (
        <>
          <Check size={16} strokeWidth={2.5} aria-hidden />
          Add investment
        </>
      )}
    </button>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="t-micro mb-1.5 block text-fg-faint">
        {label}
      </label>
      {children}
    </div>
  );
}
