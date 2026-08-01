"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { ParsedIntent } from "@/lib/schemas";
import { ReceiptView, type ActionReceipt, type CommitResponse } from "@/components/ReceiptView";

type Intent =
  | "add_expense"
  | "add_income"
  | "transfer"
  | "lend_money"
  | "borrow_money"
  | "declare_account";

const INTENT_LABEL: Record<Intent, string> = {
  add_expense: "Expense",
  add_income: "Income",
  transfer: "Transfer between accounts",
  lend_money: "Lent money to someone",
  borrow_money: "Borrowed money from someone",
  declare_account: "Set an account's balance",
};

interface CategoryOption {
  id: string;
  label: string;
  depth: number;
  type: "expense" | "income";
}

type Step =
  | { kind: "form" }
  | { kind: "confirming"; reason: "account" | "loan_action"; proposal?: { name: string; balance?: number }; loanContext?: { person: string; outstanding: number | null } }
  | { kind: "receipt"; receipt: ActionReceipt }
  | { kind: "error"; message: string };

// The fallback path — every field here is picked from something that already
// exists (or, for declare_account/loans, explicitly typed by the user), so
// there's no ambiguity for the server to resolve except the two cases that
// depend on existing DB state: declaring a genuinely new account, and lending
// to/borrowing from someone with an open loan already. Both round-trip once
// for a confirm chip; everything else commits in a single request.
export function ManualEntryForm({
  accounts,
  categories,
  peopleNames,
}: {
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
  peopleNames: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [submitting, setSubmitting] = useState(false);

  const [intent, setIntent] = useState<Intent>("add_expense");
  const [amount, setAmount] = useState("");
  const [item, setItem] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState("");
  const [personName, setPersonName] = useState("");
  const [declareName, setDeclareName] = useState("");
  const [declareType, setDeclareType] = useState<"bank" | "cash" | "wallet">("bank");
  const [declareBalance, setDeclareBalance] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const categoryOptionsForIntent = useMemo(
    () => categories.filter((c) => c.type === (intent === "add_income" ? "income" : "expense")),
    [categories, intent],
  );

  const reset = useCallback(() => {
    setStep({ kind: "form" });
    setAmount("");
    setItem("");
    setCategoryId("");
    setPersonName("");
    setDeclareName("");
    setDeclareBalance("");
    setNote("");
  }, []);

  const buildParsed = useCallback((): ParsedIntent | null => {
    const amountNum = Number(amount);
    if (intent !== "declare_account" && (!amountNum || amountNum <= 0)) return null;

    const base = { date: date || undefined, note: note.trim() || undefined, confidence: 1 };

    switch (intent) {
      case "add_expense":
      case "add_income":
        if (!categoryId || !accountId) return null;
        return {
          ...base,
          intent,
          amount: amountNum,
          item: item.trim() || undefined,
          category_id: categoryId,
          account_id: accountId,
        };
      case "transfer":
        if (!accountId || !toAccountId || accountId === toAccountId) return null;
        return { ...base, intent, amount: amountNum, account_id: accountId, to_account_id: toAccountId };
      case "lend_money":
      case "borrow_money":
        if (!personName.trim()) return null;
        // Account is optional: an udhaar you're recording months later usually
        // has no account you can still name, and charging one now would
        // double-count — that cash left before the app ever saw it.
        return {
          ...base,
          intent,
          amount: amountNum,
          person_name: personName.trim(),
          account_id: accountId || undefined,
        };
      case "declare_account": {
        const balanceNum = Number(declareBalance);
        if (!declareName.trim() || Number.isNaN(balanceNum)) return null;
        return {
          ...base,
          intent,
          declared_account: { name: declareName.trim(), type: declareType, balance: balanceNum },
        };
      }
      default:
        return null;
    }
  }, [intent, amount, item, categoryId, accountId, toAccountId, personName, declareName, declareType, declareBalance, date, note]);

  const submit = useCallback(
    async (overrides: Record<string, unknown> = {}) => {
      const parsed = buildParsed();
      if (!parsed) return;

      setSubmitting(true);
      try {
        const res = await fetch("/api/nl/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parsed, rawText: "", inputMode: "text", source: "manual", ...overrides }),
        });
        const data = (await res.json()) as CommitResponse;

        if ("needsConfirmation" in data) {
          if (data.reason === "account" && data.allowNoAccount) {
            // The form intentionally sent no account; re-submit saying so.
            void submit({ confirmNoAccount: true });
          } else if (data.reason === "account" && data.proposal) {
            setStep({ kind: "confirming", reason: "account", proposal: data.proposal });
          } else if (data.reason === "loan_action" && data.loanContext) {
            setStep({ kind: "confirming", reason: "loan_action", loanContext: data.loanContext });
          } else {
            // "category" reason, or an account-missing reason with no
            // proposal — can't happen from this form (every field that could
            // trigger those is required before submit is even enabled), but
            // fail loudly rather than silently doing nothing if it ever does.
            setStep({ kind: "error", message: "Needs a detail this form doesn't collect yet." });
          }
          return;
        }
        if ("error" in data) {
          setStep({ kind: "error", message: data.error });
          return;
        }
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(8);
        }
        setStep({ kind: "receipt", receipt: data });
        router.refresh();
      } catch {
        setStep({ kind: "error", message: "Save failed. Try again." });
      } finally {
        setSubmitting(false);
      }
    },
    [buildParsed, router],
  );

  const undo = useCallback(
    async (receipt: ActionReceipt) => {
      await fetch("/api/nl/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undoToken: receipt.undoToken }),
      });
      reset();
      router.refresh();
    },
    [reset, router],
  );

  if (step.kind === "receipt") {
    return <ReceiptView receipt={step.receipt} onUndo={() => void undo(step.receipt)} onDone={reset} />;
  }

  if (step.kind === "confirming") {
    return (
      <div className="anim-rise">
        <p className="t-label mb-3 text-fg-muted">
          {step.reason === "account"
            ? `"${step.proposal?.name}" doesn't exist yet — create it${
                step.proposal?.balance !== undefined ? ` with a ${step.proposal.balance} opening balance` : ""
              }?`
            : `${step.loanContext?.person} already has an open loan (${step.loanContext?.outstanding ?? 0} outstanding). What is this?`}
        </p>
        <div className="flex flex-wrap gap-2">
          {step.reason === "account" ? (
            <ConfirmChip label="Create account" primary onClick={() => void submit({ confirmCreateAccount: true })} />
          ) : (
            <>
              <ConfirmChip label="New loan" onClick={() => void submit({ confirmedLoanAction: "new" })} />
              <ConfirmChip label="Add to existing" onClick={() => void submit({ confirmedLoanAction: "append" })} />
              <ConfirmChip
                label={`${step.loanContext?.person} is paying back`}
                onClick={() => void submit({ confirmedLoanAction: "repayment" })}
              />
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setStep({ kind: "form" })}
          className="t-label mt-4 text-fg-faint underline decoration-rule underline-offset-4 hover:text-fg-muted"
        >
          Cancel
        </button>
      </div>
    );
  }

  const canSubmit = buildParsed() !== null;

  return (
    <div className="flex flex-col gap-4">
      <Field label="Type" htmlFor="intent">
        <select
          id="intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value as Intent)}
          className="t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors focus:border-accent"
        >
          {(Object.keys(INTENT_LABEL) as Intent[]).map((i) => (
            <option key={i} value={i}>
              {INTENT_LABEL[i]}
            </option>
          ))}
        </select>
      </Field>

      {intent !== "declare_account" ? (
        <Field label="Amount" htmlFor="amount">
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 font-num text-[17px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
          />
        </Field>
      ) : null}

      {intent === "add_expense" || intent === "add_income" ? (
        <>
          <Field label="What was it" htmlFor="item">
            <input
              id="item"
              type="text"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              maxLength={80}
              placeholder="Biryani, Petrol, Flat rent…"
              className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
            />
          </Field>
          <Field label="Category" htmlFor="category">
            <select
              id="category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors focus:border-accent"
            >
              <option value="">Pick a category…</option>
              {categoryOptionsForIntent.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.depth > 0 ? `   › ${c.label}` : c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Account" htmlFor="account">
            <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
          </Field>
        </>
      ) : null}

      {intent === "transfer" ? (
        <>
          <Field label="From account" htmlFor="from-account">
            <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
          </Field>
          <Field label="To account" htmlFor="to-account">
            <AccountSelect
              accounts={accounts.filter((a) => a.id !== accountId)}
              value={toAccountId}
              onChange={setToAccountId}
              placeholder="Pick an account…"
            />
          </Field>
        </>
      ) : null}

      {intent === "lend_money" || intent === "borrow_money" ? (
        <>
          <Field label="Person" htmlFor="person">
            <input
              id="person"
              type="text"
              list="known-people"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              maxLength={50}
              placeholder="Name"
              className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
            />
            <datalist id="known-people">
              {peopleNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field
            label={intent === "lend_money" ? "From account (optional)" : "To account (optional)"}
            htmlFor="loan-account"
          >
            <AccountSelect
              accounts={accounts}
              value={accountId}
              onChange={setAccountId}
              placeholder="Not sure / don't remember"
            />
            <p className="t-label mt-1.5 text-fg-faint">
              Leave this blank for an older loan — it still gets recorded, it just won&apos;t move
              any account balance.
            </p>
          </Field>
        </>
      ) : null}

      {intent === "declare_account" ? (
        <>
          <Field label="Account name" htmlFor="declare-name">
            <input
              id="declare-name"
              type="text"
              value={declareName}
              onChange={(e) => setDeclareName(e.target.value)}
              maxLength={30}
              placeholder="Meezan, Cash, JazzCash…"
              className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
            />
          </Field>
          <Field label="Type" htmlFor="declare-type">
            <select
              id="declare-type"
              value={declareType}
              onChange={(e) => setDeclareType(e.target.value as "bank" | "cash" | "wallet")}
              className="t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors focus:border-accent"
            >
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="wallet">Wallet</option>
            </select>
          </Field>
          <Field label="Balance" htmlFor="declare-balance">
            <input
              id="declare-balance"
              type="text"
              inputMode="decimal"
              value={declareBalance}
              onChange={(e) => setDeclareBalance(e.target.value)}
              placeholder="0.00"
              className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 font-num text-[17px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
            />
          </Field>
          <p className="t-label text-fg-faint">
            An existing name reconciles that account&apos;s balance instead of creating a duplicate.
          </p>
        </>
      ) : null}

      <Field label="Date" htmlFor="date">
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 font-num text-[15px] text-fg outline-none transition-colors focus:border-accent"
        />
      </Field>

      <Field label="Note" htmlFor="note">
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Optional"
          className="t-body w-full resize-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
        />
      </Field>

      {step.kind === "error" ? (
        <div className="flex items-start gap-2">
          <CircleAlert size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-out" aria-hidden />
          <p className="t-label text-out">{step.message}</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit || submitting}
        className="flex items-center justify-center gap-2 rounded-chip bg-accent py-3.5 text-[15px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
      >
        {submitting ? (
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
    </div>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder,
}: {
  accounts: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors focus:border-accent"
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

function ConfirmChip({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-chip border px-3 py-2 text-[13px] transition-transform duration-150 active:scale-95",
        primary
          ? "border-accent bg-accent text-on-accent"
          : "border-rule bg-surface-sunk text-fg hover:border-fg-faint",
      )}
    >
      {label}
    </button>
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
