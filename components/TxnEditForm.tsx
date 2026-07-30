"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { CircleAlert, Loader2, Lock, Trash2, Check } from "lucide-react";
import clsx from "clsx";
import {
  updateTransactionAction,
  deleteTransactionAction,
  type TxnActionResult,
} from "@/actions/transactions";
import type { TxnType, TxnSource } from "@/lib/types";

export interface TxnEditData {
  id: string;
  type: TxnType;
  amount: number;
  item: string;
  note: string;
  date: string;
  categoryId: string;
  accountId: string;
  rawText: string;
  source: TxnSource;
  financialsLocked: boolean;
}

const TYPE_LABEL: Record<TxnType, string> = {
  expense: "Expense",
  income: "Income",
  loan_given: "Loan given",
  loan_taken: "Loan taken",
  repayment_in: "Repayment received",
  repayment_out: "Repayment made",
  transfer: "Transfer",
  adjustment: "Balance adjustment",
};

const SOURCE_LABEL: Record<TxnSource, string> = {
  dict: "Layer 1 (dictionary)",
  llm: "Gemini (text)",
  llm_audio: "Gemini (voice)",
  manual: "Manual",
  recurring: "Recurring",
  adjustment: "Adjustment",
};

export function TxnEditForm({
  data,
  accounts,
  categories,
}: {
  data: TxnEditData;
  accounts: { id: string; name: string }[];
  categories: { id: string; label: string; depth: number }[];
}) {
  const [state, formAction] = useFormState<TxnActionResult, FormData>(
    updateTransactionAction,
    {},
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={data.id} />

        <div className="flex items-center justify-between">
          <span className="t-micro text-fg-faint">{TYPE_LABEL[data.type]}</span>
          <span className="t-micro text-fg-faint">{SOURCE_LABEL[data.source]}</span>
        </div>

        <Field label="Amount" htmlFor="amount">
          <input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            defaultValue={String(data.amount)}
            required
            readOnly={data.financialsLocked}
            className={clsx(
              "tnum w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 font-num text-[17px] text-fg outline-none transition-colors focus:border-accent",
              data.financialsLocked && "cursor-not-allowed opacity-60",
            )}
          />
        </Field>

        <Field label="What was it" htmlFor="item">
          <input
            id="item"
            name="item"
            type="text"
            defaultValue={data.item}
            maxLength={80}
            placeholder="Biryani, Petrol, Flat rent…"
            className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
          />
        </Field>

        <Field label="Category" htmlFor="category_id">
          <select
            id="category_id"
            name="category_id"
            defaultValue={data.categoryId}
            className="t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors focus:border-accent"
          >
            <option value="">(none)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.depth > 0 ? `   › ${c.label}` : c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Account" htmlFor="account_id">
          <select
            id="account_id"
            name="account_id"
            defaultValue={data.accountId}
            disabled={data.financialsLocked}
            className={clsx(
              "t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors focus:border-accent",
              data.financialsLocked && "cursor-not-allowed opacity-60",
            )}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {/* A disabled select submits nothing, so the value still has to reach
              the action — otherwise the edit would look like an account change. */}
          {data.financialsLocked ? (
            <input type="hidden" name="account_id" value={data.accountId} />
          ) : null}
        </Field>

        {data.financialsLocked ? (
          <p className="t-label flex items-start gap-2 text-fg-muted">
            <Lock size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
            A loan/transfer entry&apos;s amount or account can&apos;t be edited — the
            loan balance would also need to change. Delete and re-enter instead.
          </p>
        ) : null}

        <Field label="Date" htmlFor="date">
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={data.date}
            className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 font-num text-[15px] text-fg outline-none transition-colors focus:border-accent"
          />
        </Field>

        <Field label="Note" htmlFor="note">
          <textarea
            id="note"
            name="note"
            defaultValue={data.note}
            rows={2}
            maxLength={200}
            placeholder="flat → office"
            className="t-body w-full resize-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
          />
        </Field>

        {state.error ? (
          <div className="flex items-start gap-2">
            <CircleAlert size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-out" aria-hidden />
            <p className="t-label text-out">{state.error}</p>
          </div>
        ) : null}

        <SaveButton />
      </form>

      {data.rawText ? (
        <div className="border-t border-rule pt-4">
          <p className="t-micro mb-1.5 text-fg-faint">What was said/written</p>
          <p className="t-label text-fg-muted">&ldquo;{data.rawText}&rdquo;</p>
        </div>
      ) : null}

      {/* Set apart by whitespace alone, no divider — a hairline here would put
          it in the same visual rhythm as the sections above, and a delete
          trigger competing with Save for attention is exactly what read as
          off. It only gains real weight (bordered, filled, explained) once
          actually confirmed. */}
      <div className="mt-6 flex justify-center">
        {confirmingDelete ? (
          <form action={deleteTransactionAction} className="flex w-full flex-col gap-3">
            <p className="t-label text-center text-fg-muted">
              Deleting will also reverse the account balance. The entry stays in
              the record — it isn&apos;t permanently erased.
            </p>
            <input type="hidden" name="id" value={data.id} />
            <div className="flex gap-2">
              <DeleteButton />
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-chip border border-rule px-4 py-3 text-[15px] text-fg-muted transition-colors hover:text-fg"
              >
                Keep it
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-1.5 py-2 text-[13px] text-out/70 transition-colors hover:text-out"
          >
            <Trash2 size={13} strokeWidth={1.75} aria-hidden />
            Delete this entry
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="t-micro mb-1.5 block text-fg-faint">
        {label}
      </label>
      {children}
    </div>
  );
}

function SaveButton() {
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
          Save
        </>
      )}
    </button>
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
