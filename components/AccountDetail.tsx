"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  Check,
  CircleAlert,
  Loader2,
  Trash2,
  RotateCcw,
  Archive,
  ArchiveRestore,
  Eye,
} from "lucide-react";
import clsx from "clsx";
import {
  updateAccountAction,
  setAccountFlagAction,
  setAccountArchivedAction,
  deleteAccountAction,
  recomputeAccountAction,
  type AccountActionResult,
} from "@/actions/accounts";
import { Switch } from "@/components/Switch";
import { Sensitive } from "@/components/Sensitive";
import { formatPKR } from "@/lib/format";
import type { AccountType } from "@/lib/types";

export interface AccountDetailData {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  archived: boolean;
  hideBalance: boolean;
  excludeFromTotal: boolean;
  transactionCount: number;
  createdOn: string;
}

const TYPE_LABEL: Record<AccountType, string> = {
  bank: "Bank",
  cash: "Cash",
  wallet: "Wallet",
};

export function AccountDetail({
  account,
  blockedReason,
}: {
  account: AccountDetailData;
  blockedReason?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <BalanceCard account={account} />
      <DetailsForm account={account} />
      <FlagsSection account={account} />
      <DangerSection account={account} blockedReason={blockedReason} />
    </div>
  );
}

function BalanceCard({ account }: { account: AccountDetailData }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-chip border border-rule bg-surface-lift p-4">
      <div className="t-micro text-fg-faint">Balance</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="t-label font-num text-fg-muted">Rs</span>
        {/* The card honours the account's own hide flag — a per-account mask
            the detail screen ignored would be a setting that doesn't do what
            it says. But honouring it without an escape hatch would mean
            hiding a balance once makes it unreadable everywhere forever,
            including here, where you came to manage it. So it's masked by
            default and revealable by a deliberate tap. */}
        {account.hideBalance && !revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="flex items-baseline gap-2 text-fg-muted transition-colors hover:text-fg"
          >
            <span className="t-balance-compact tnum">••••••</span>
            <span className="t-label flex items-center gap-1">
              <Eye size={13} strokeWidth={1.75} aria-hidden />
              Reveal
            </span>
          </button>
        ) : (
          <span
            className={clsx(
              "t-balance-compact tnum",
              account.balance < 0 ? "text-out" : "text-accent-text",
            )}
          >
            <Sensitive>{formatPKR(account.balance)}</Sensitive>
          </span>
        )}
      </div>
      <div className="t-label mt-2 text-fg-muted">
        {TYPE_LABEL[account.type]} · {account.transactionCount}{" "}
        {account.transactionCount === 1 ? "entry" : "entries"} · since {account.createdOn}
      </div>

      {account.excludeFromTotal || account.archived ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {account.excludeFromTotal ? <Badge>Not in net worth</Badge> : null}
          {account.archived ? <Badge>Archived</Badge> : null}
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

function DetailsForm({ account }: { account: AccountDetailData }) {
  const [state, formAction] = useFormState<AccountActionResult, FormData>(updateAccountAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h2 className="t-micro text-fg-faint">Details</h2>
      <input type="hidden" name="account_id" value={account.id} />

      <label className="block">
        <span className="t-label mb-1.5 block text-fg-muted">Name</span>
        <input
          name="name"
          type="text"
          required
          maxLength={30}
          defaultValue={account.name}
          className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 text-fg outline-none transition-colors focus:border-accent"
        />
      </label>

      <label className="block">
        <span className="t-label mb-1.5 block text-fg-muted">Type</span>
        <select
          name="type"
          defaultValue={account.type}
          className="t-body w-full appearance-none rounded-chip border border-rule bg-surface-sunk px-3.5 py-3 text-fg outline-none transition-colors focus:border-accent"
        >
          <option value="bank">Bank</option>
          <option value="cash">Cash</option>
          <option value="wallet">Wallet</option>
        </select>
      </label>

      <p className="t-label text-fg-faint">
        The balance isn&apos;t editable here — it&apos;s the sum of this account&apos;s entries. To
        correct it, add an entry like &ldquo;{account.name} mein 5000 pari hai&rdquo;.
      </p>

      {state.error ? <ErrorNote message={state.error} /> : null}
      {state.ok ? (
        <p className="t-label flex items-center gap-1.5 text-in">
          <Check size={13} strokeWidth={2.5} aria-hidden />
          Saved.
        </p>
      ) : null}

      <SaveButton />
    </form>
  );
}

function FlagsSection({ account }: { account: AccountDetailData }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="t-micro text-fg-faint">This account</h2>
      <div className="divide-y divide-rule-soft overflow-hidden rounded-chip border border-rule">
        <FlagRow
          accountId={account.id}
          flag="hide_balance"
          initial={account.hideBalance}
          title="Hide the balance"
          description="Masks it everywhere, even with the global privacy setting off. The account still works normally."
        />
        <FlagRow
          accountId={account.id}
          flag="exclude_from_total"
          initial={account.excludeFromTotal}
          title="Leave out of net worth"
          description="Entries still record here, but the balance stops counting toward your total assets."
        />
      </div>
    </section>
  );
}

/** Optimistic switch: flips immediately, submits in the background, and rolls
 *  back if the server rejects. A toggle that waits for a round-trip before
 *  moving feels broken on a phone. */
function FlagRow({
  accountId,
  flag,
  initial,
  title,
  description,
}: {
  accountId: string;
  flag: "hide_balance" | "exclude_from_total";
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
    body.set("account_id", accountId);
    body.set("flag", flag);
    body.set("value", String(next));

    const result = await setAccountFlagAction(undefined, body);
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

function DangerSection({
  account,
  blockedReason,
}: {
  account: AccountDetailData;
  blockedReason?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const deletable = account.transactionCount === 0;
  const [recomputeState, recomputeFormAction] = useFormState<AccountActionResult, FormData>(
    recomputeAccountAction,
    {},
  );
  const [archiveState, archiveFormAction] = useFormState<AccountActionResult, FormData>(
    setAccountArchivedAction,
    {},
  );

  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-5">
      <h2 className="t-micro text-fg-faint">Manage</h2>

      <form action={recomputeFormAction} className="flex flex-col gap-2">
        <input type="hidden" name="account_id" value={account.id} />
        <PlainButton Icon={RotateCcw} label="Recalculate balance from entries" />
        {recomputeState.error ? (
          <ErrorNote message={recomputeState.error} />
        ) : recomputeState.ok ? (
          <p className="t-label flex items-center gap-1.5 text-in">
            <Check size={13} strokeWidth={2.5} aria-hidden />
            Recalculated.
          </p>
        ) : null}
      </form>

      <form action={archiveFormAction} className="flex flex-col gap-2">
        <input type="hidden" name="account_id" value={account.id} />
        <input type="hidden" name="archived" value={String(!account.archived)} />
        <PlainButton
          Icon={account.archived ? ArchiveRestore : Archive}
          label={account.archived ? "Unarchive this account" : "Archive this account"}
        />
        {archiveState.error ? <ErrorNote message={archiveState.error} /> : null}
      </form>
      <p className="t-label -mt-1 text-fg-faint">
        Archiving hides it from the dashboard and the account pickers. Nothing is deleted and the
        balance is untouched.
      </p>

      {blockedReason ? <ErrorNote message={blockedReason} /> : null}

      {confirming ? (
        <form action={deleteAccountAction} className="flex flex-col gap-3">
          <p className="t-label text-fg-muted">
            Permanently removes {account.name}. It has no entries, so nothing else is affected.
          </p>
          <input type="hidden" name="account_id" value={account.id} />
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
      ) : deletable ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center justify-center gap-1.5 py-2 text-[13px] text-out/70 transition-colors hover:text-out"
        >
          <Trash2 size={13} strokeWidth={1.75} aria-hidden />
          Delete this account
        </button>
      ) : (
        <p className="t-label text-center text-fg-faint">
          {account.transactionCount} entries point at this account, so it can&apos;t be deleted —
          archive it instead.
        </p>
      )}
    </section>
  );
}

function PlainButton({
  Icon,
  label,
}: {
  Icon: typeof RotateCcw;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-chip border border-rule py-3 text-[14px] text-fg-muted transition-colors hover:border-fg-faint hover:text-fg disabled:opacity-50"
    >
      {pending ? (
        <Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden />
      ) : (
        <Icon size={14} strokeWidth={1.75} aria-hidden />
      )}
      {label}
    </button>
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

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center justify-center gap-2 rounded-chip bg-accent py-3 text-[15px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98] disabled:opacity-50"
    >
      {pending ? (
        <Loader2 size={15} strokeWidth={2} className="animate-spin" aria-hidden />
      ) : (
        <Check size={15} strokeWidth={2.5} aria-hidden />
      )}
      Save changes
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
