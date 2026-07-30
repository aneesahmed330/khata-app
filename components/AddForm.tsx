"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, ArrowRight, Check, Undo2, X, CircleAlert, Loader2, Pencil } from "lucide-react";
import clsx from "clsx";
import type { ParsedIntent } from "@/lib/schemas";
import { useRecorder, type Recording } from "@/lib/recorder";
import { formatPKR } from "@/lib/format";
import { relativeDateLabel } from "@/components/DateRule";

// Client-side mirrors of server response shapes — kept local rather than
// importing lib/receipt.ts / lib/schemas.ts's server-only siblings, which
// pull in the mongodb driver and would break the client bundle.
interface EffectLike {
  kind: string;
  [key: string]: unknown;
}
interface ActionReceipt {
  id: string;
  summary: string;
  effects: EffectLike[];
  undoToken: string;
  spoken: string;
}
interface NeedsConfirmation {
  needsConfirmation: true;
  reason: "category" | "account" | "loan_action";
  proposal?: { name: string; type?: string; parentName?: string | null; balance?: number };
  loanContext?: { person: string; outstanding: number | null };
  missing?: string[];
}
type ParseSource = "dict" | "llm" | "llm_audio";
type ParseResponse =
  | { source: "dict" | "llm"; parsed: ParsedIntent }
  | { source: "llm_audio"; parsed: ParsedIntent; transcript: string }
  | { source: "quota_exceeded"; error: string }
  | { error: string };
type CommitResponse = ActionReceipt | NeedsConfirmation | { error: string };

type Step =
  | { kind: "input" }
  | { kind: "thinking"; rawText: string; fromAudio?: boolean }
  | {
      kind: "preview";
      rawText: string;
      source: ParseSource;
      parsed: ParsedIntent;
      pending?: NeedsConfirmation;
    }
  | { kind: "receipt"; receipt: ActionReceipt }
  | { kind: "error"; message: string };

const EXAMPLES = [
  "Petrol 200 today",
  "Paid 350 for lunch",
  "Lent Bilal 5000",
  "Salary received 300000",
];

function summaryLine(parsed: ParsedIntent): string {
  const amount = parsed.amount ? formatPKR(parsed.amount) : "?";
  switch (parsed.intent) {
    case "add_expense":
      return `${parsed.item ?? "Expense"} — ${amount}`;
    case "add_income":
      return `Income — ${amount}`;
    case "lend_money":
      return `Lent to ${parsed.person_name ?? "someone"} — ${amount}`;
    case "borrow_money":
      return `Borrowed from ${parsed.person_name ?? "someone"} — ${amount}`;
    case "transfer":
      return `Transfer — ${amount}`;
    case "declare_account":
      return `${parsed.declared_account?.name ?? "Account"} — ${formatPKR(parsed.declared_account?.balance ?? 0)}`;
    case "need_clarification":
      return parsed.clarification_question ?? "Clarification needed";
    default:
      return "Entry";
  }
}

// ParsedIntent carries IDs, not display names, so the only human-readable
// pieces available pre-commit are the proposed new names, the resolved account
// (looked up from the accounts prop) and the date. The committed receipt is
// where full category paths appear.
function metaLine(parsed: ParsedIntent, accounts: { id: string; name: string }[]): string {
  const account = parsed.account_id
    ? accounts.find((a) => a.id === parsed.account_id)?.name
    : undefined;
  const date = parsed.date ? relativeDateLabel(new Date(`${parsed.date}T00:00:00`)) : undefined;

  return [parsed.new_category?.name, account, date, parsed.new_tags?.join(" ")]
    .filter(Boolean)
    .join(" · ");
}

export function AddForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>({ kind: "input" });

  const submitText = useCallback(async (raw: string) => {
    const rawText = raw.trim();
    if (!rawText) return;
    setStep({ kind: "thinking", rawText });

    try {
      const res = await fetch("/api/nl/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const data = (await res.json()) as ParseResponse;

      if (!("source" in data)) {
        setStep({ kind: "error", message: data.error });
        return;
      }
      if (data.source === "quota_exceeded") {
        setStep({ kind: "error", message: data.error });
        return;
      }
      setStep({ kind: "preview", rawText, source: data.source, parsed: data.parsed });
    } catch {
      setStep({ kind: "error", message: "Couldn't reach the server. Try again." });
    }
  }, []);

  // Audio goes to Gemini, which transcribes and parses in one call. The browser
  // never attempts transcription — see lib/recorder.ts for why.
  const submitAudio = useCallback(async (rec: Recording) => {
    setStep({ kind: "thinking", rawText: "", fromAudio: true });

    try {
      const res = await fetch("/api/nl/parse-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: rec.base64, mimeType: rec.mimeType }),
      });
      const data = (await res.json()) as ParseResponse;

      if (!("source" in data)) {
        setStep({ kind: "error", message: data.error });
        return;
      }
      if (data.source === "quota_exceeded") {
        setStep({ kind: "error", message: data.error });
        return;
      }

      const heard = data.source === "llm_audio" ? data.transcript : "";
      setText(heard);
      setStep({ kind: "preview", rawText: heard, source: data.source, parsed: data.parsed });
    } catch {
      setStep({ kind: "error", message: "Couldn't send the recording. Try again." });
    }
  }, []);

  const recorder = useRecorder(submitAudio);

  const commit = useCallback(
    async (
      current: Extract<Step, { kind: "preview" }>,
      overrides: Record<string, unknown> = {},
    ) => {
      try {
        const res = await fetch("/api/nl/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parsed: current.parsed,
            rawText: current.rawText,
            inputMode: current.source === "llm_audio" ? "voice" : "text",
            source: current.source,
            ...overrides,
          }),
        });
        const data = (await res.json()) as CommitResponse;

        if ("needsConfirmation" in data) {
          setStep({ ...current, pending: data });
          return;
        }
        if ("error" in data) {
          setStep({ kind: "error", message: data.error });
          return;
        }
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(8); // DESIGN.md §6 — subtle commit confirmation
        }
        setStep({ kind: "receipt", receipt: data });
        setText("");
        router.refresh(); // Home's ledger + balances are server-rendered
      } catch {
        setStep({ kind: "error", message: "Save failed. Try again." });
      }
    },
    [router],
  );

  const undo = useCallback(
    async (receipt: ActionReceipt) => {
      await fetch("/api/nl/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undoToken: receipt.undoToken }),
      });
      setStep({ kind: "input" });
      setText("");
      router.refresh();
    },
    [router],
  );

  const reset = useCallback(() => setStep({ kind: "input" }), []);

  /** Back to the composer with the transcript loaded, so a mishearing is fixed
   *  by editing text rather than re-recording from scratch. */
  const editRaw = useCallback((raw: string) => {
    setText(raw);
    setStep({ kind: "input" });
  }, []);
  const isBusy = step.kind === "thinking";
  const showComposer = step.kind === "input" || step.kind === "thinking";

  return (
    <div className="flex flex-col gap-4">
      {recorder.recording ? (
        <RecordingPanel
          elapsed={recorder.elapsed}
          onStop={recorder.stop}
          onCancel={recorder.cancel}
        />
      ) : showComposer ? (
        <>
          {/* Your words — a loose bubble. The morph target is the ledger line
              rendered by PreviewCard below (DESIGN.md §5, the signature moment). */}
          <div className="rounded-sheet border border-rule bg-surface-lift px-4 py-3.5 transition-colors duration-200 focus-within:border-fg-faint">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submitText(text);
              }}
              placeholder="Speak or type…"
              rows={3}
              autoFocus
              disabled={isBusy}
              className="t-body w-full resize-none bg-transparent text-fg outline-none placeholder:text-fg-faint"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submitText(text)}
              disabled={!text.trim() || isBusy}
              className="flex flex-1 items-center justify-center gap-2 rounded-chip bg-accent py-3.5 text-[15px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
            >
              {isBusy ? (
                <>
                  <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden />
                  {step.kind === "thinking" && step.fromAudio ? "Listening…" : "Thinking…"}
                </>
              ) : (
                <>
                  Next
                  <ArrowRight size={16} strokeWidth={2.25} aria-hidden />
                </>
              )}
            </button>

            {recorder.supported ? (
              <button
                type="button"
                aria-label="Speak"
                onClick={() => void recorder.start()}
                disabled={isBusy}
                className="flex size-[52px] shrink-0 items-center justify-center rounded-full border border-rule text-fg-muted transition-colors duration-200 hover:text-fg disabled:opacity-40"
              >
                <Mic size={19} strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
          </div>

          {recorder.error ? (
            <p className="t-label flex items-start gap-2 text-out">
              <CircleAlert size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
              {recorder.error}
            </p>
          ) : null}

          {step.kind === "input" && !text ? <ExampleChips onPick={setText} /> : null}
        </>
      ) : null}

      {step.kind === "preview" ? (
        <PreviewCard
          step={step}
          accounts={accounts}
          onCommit={commit}
          onReset={reset}
          onEdit={editRaw}
        />
      ) : null}

      {step.kind === "receipt" ? (
        <ReceiptCard receipt={step.receipt} onUndo={() => void undo(step.receipt)} onDone={reset} />
      ) : null}

      {step.kind === "error" ? (
        <div className="anim-rise rounded-chip border border-rule bg-surface-lift px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <CircleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-out" aria-hidden />
            <p className="t-body flex-1">{step.message}</p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-3 w-full rounded-chip border border-rule py-2.5 text-[14px] transition-colors hover:bg-surface"
          >
            OK
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RecordingPanel({
  elapsed,
  onStop,
  onCancel,
}: {
  elapsed: number;
  onStop: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="anim-fade flex flex-col items-center rounded-sheet border border-accent bg-surface-lift px-6 py-9">
      <div className="relative mb-5 flex size-16 items-center justify-center">
        <span aria-hidden className="anim-pulse absolute inset-0 rounded-full border border-accent" />
        <span className="flex size-16 items-center justify-center rounded-full bg-accent text-on-accent">
          <Mic size={24} strokeWidth={2} aria-hidden />
        </span>
      </div>

      <p className="t-body mb-1" aria-live="polite">
        Listening…
      </p>
      <p className="tnum font-num text-[13px] text-fg-muted">
        0:{String(elapsed).padStart(2, "0")}
      </p>

      <button
        type="button"
        onClick={onStop}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-chip bg-accent py-3.5 text-[15px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98]"
      >
        <Square size={15} strokeWidth={2.5} aria-hidden />
        Done
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="t-label mt-3 text-fg-faint underline decoration-rule underline-offset-4 transition-colors hover:text-fg-muted"
      >
        Cancel
      </button>
    </div>
  );
}

function ExampleChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="anim-fade">
      <p className="t-micro mb-2 text-fg-faint">Try saying</p>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="rounded-chip border border-rule bg-surface-lift px-3 py-2 text-[13px] text-fg-muted transition-colors duration-150 hover:text-fg active:scale-95"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "anim-stamp rounded-chip border px-3 py-2 text-[13px] transition-transform duration-150 active:scale-95",
        primary
          ? "border-accent bg-accent text-on-accent"
          : "border-rule bg-surface-sunk text-fg hover:border-fg-faint",
      )}
    >
      {label}
    </button>
  );
}

function PreviewCard({
  step,
  accounts,
  onCommit,
  onReset,
  onEdit,
}: {
  step: Extract<Step, { kind: "preview" }>;
  accounts: { id: string; name: string }[];
  onCommit: (step: Extract<Step, { kind: "preview" }>, overrides?: Record<string, unknown>) => void;
  onReset: () => void;
  onEdit: (text: string) => void;
}) {
  const { parsed, pending, rawText, source } = step;
  const meta = metaLine(parsed, accounts);
  const fromAudio = source === "llm_audio";

  return (
    <div className="anim-rise">
      {/* What was heard/typed, kept visible and editable. On the audio path this
          is the only place a mishearing can be caught before it commits, so it
          gets an explicit label and a fix affordance rather than being decorative. */}
      <div className="mb-4 flex items-start gap-2">
        <p className="t-label flex-1 text-fg-faint">
          {fromAudio ? <span className="text-fg-muted">Heard: </span> : null}
          &ldquo;{rawText || "…"}&rdquo;
        </p>
        <button
          type="button"
          onClick={() => onEdit(rawText)}
          aria-label="Edit"
          className="shrink-0 rounded-[4px] p-1 text-fg-faint transition-colors hover:text-fg"
        >
          <Pencil size={13} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {/* the ledger line — radius 2px, hairline drawn from the left (§5) */}
      <div className="relative">
        <span aria-hidden className="anim-rule absolute inset-x-0 top-0 h-px bg-rule" />
        <div className="flex items-center gap-3 border-b border-rule py-3.5">
          <div className="min-w-0 flex-1">
            <div className="t-body truncate">{summaryLine(parsed)}</div>
            {meta ? <div className="t-label truncate text-fg-muted">{meta}</div> : null}
            {parsed.note ? (
              <div className="t-label truncate italic text-fg-faint">{parsed.note}</div>
            ) : null}
          </div>
          {parsed.amount ? (
            <span className="tnum shrink-0 font-num text-[17px]">{formatPKR(parsed.amount)}</span>
          ) : null}
        </div>
      </div>

      {pending ? (
        <div className="mt-5">
          <p className="t-label mb-2.5 text-fg-muted">
            {pending.reason === "category"
              ? "This category doesn't exist — create it?"
              : pending.reason === "account"
                ? pending.proposal
                  ? "This account doesn't exist — create it?"
                  : "Which account?"
                : "What is this?"}
          </p>
          <div className="flex flex-wrap gap-2">
            {pending.reason === "category" && pending.proposal ? (
              <Chip
                primary
                label={`+ ${pending.proposal.name}${pending.proposal.parentName ? ` (${pending.proposal.parentName})` : ""}`}
                onClick={() => onCommit(step, { confirmCreateCategory: true })}
              />
            ) : null}
            {pending.reason === "account" && pending.proposal ? (
              <Chip
                primary
                label={`+ ${pending.proposal.name} · ${formatPKR(pending.proposal.balance ?? 0)}`}
                onClick={() => onCommit(step, { confirmCreateAccount: true })}
              />
            ) : null}
            {pending.reason === "account" && !pending.proposal
              ? accounts.map((a) => (
                  <Chip
                    key={a.id}
                    label={a.name}
                    onClick={() =>
                      onCommit({
                        ...step,
                        parsed: { ...parsed, account_id: a.id },
                        pending: undefined,
                      })
                    }
                  />
                ))
              : null}
            {pending.reason === "loan_action" && pending.loanContext ? (
              <>
                <Chip label="New loan" onClick={() => onCommit(step, { confirmedLoanAction: "new" })} />
                <Chip
                  label={`Add to ${formatPKR(pending.loanContext.outstanding ?? 0)}`}
                  onClick={() => onCommit(step, { confirmedLoanAction: "append" })}
                />
                <Chip
                  label={`${pending.loanContext.person} is paying back`}
                  onClick={() => onCommit(step, { confirmedLoanAction: "repayment" })}
                />
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onReset}
            className="t-label mt-4 text-fg-faint underline decoration-rule underline-offset-4 transition-colors hover:text-fg-muted"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => onCommit(step)}
            className="flex flex-1 items-center justify-center gap-2 rounded-chip bg-accent py-3.5 text-[15px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98]"
          >
            <Check size={16} strokeWidth={2.5} aria-hidden />
            Save
          </button>
          <button
            type="button"
            onClick={onReset}
            aria-label="Cancel"
            className="flex size-[52px] shrink-0 items-center justify-center rounded-chip border border-rule text-fg-muted transition-colors hover:text-fg"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

function ReceiptCard({
  receipt,
  onUndo,
  onDone,
}: {
  receipt: ActionReceipt;
  onUndo: () => void;
  onDone: () => void;
}) {
  // 5-minute undo window server-side; the bar is a 5s visual affordance only
  // (DESIGN.md §6 undo toast), so it never implies the token has expired.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDismissed(true), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="anim-rise">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-in/15 text-in">
          <Check size={12} strokeWidth={3} aria-hidden />
        </span>
        <span className="t-label text-fg-muted">Done</span>
      </div>

      <div className="border-t border-rule">
        {receipt.effects.map((effect, i) => (
          <div key={i} className="flex items-start gap-2.5 border-b border-rule-soft py-2.5">
            <span className="mt-0.5 shrink-0 text-fg-faint">
              {effect.kind === "nothing_changed" ? (
                <span className="block size-1 rounded-full bg-fg-faint" aria-hidden />
              ) : (
                <Check size={13} strokeWidth={2} aria-hidden />
              )}
            </span>
            <span className="t-label flex-1">{describeEffect(effect)}</span>
          </div>
        ))}
      </div>

      {!dismissed ? (
        <div aria-hidden className="mt-0.5 h-px overflow-hidden">
          <div
            className="h-px origin-left bg-accent"
            style={{ animation: "k-countdown 5s linear both" }}
          />
        </div>
      ) : null}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onUndo}
          className="flex items-center justify-center gap-2 rounded-chip border border-rule px-4 py-3.5 text-[15px] text-fg-muted transition-colors hover:text-fg"
        >
          <Undo2 size={16} strokeWidth={1.75} aria-hidden />
          Undo
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-chip bg-accent py-3.5 text-[15px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98]"
        >
          Add another
        </button>
      </div>
    </div>
  );
}

function describeEffect(effect: EffectLike): string {
  switch (effect.kind) {
    case "transaction_added":
      return `${effect.item ?? effect.categoryPath ?? "Entry"} — ${formatPKR(Number(effect.amount ?? 0))}`;
    case "category_created":
      return `Created category ${effect.name}`;
    case "tag_created":
      return `Created tag "${effect.name}"`;
    case "person_created":
      return `Added ${effect.name}`;
    case "loan_opened":
      return `Loan opened — ${formatPKR(Number(effect.amount ?? 0))}`;
    case "loan_updated":
      return `${effect.person} — ${formatPKR(Number(effect.outstanding ?? 0))} outstanding`;
    case "loan_settled":
      return `${effect.person}'s loan settled`;
    case "transfer_made":
      return `${effect.from} → ${effect.to} — ${formatPKR(Number(effect.amount ?? 0))}`;
    case "account_created":
      return `Created account ${effect.name} — ${formatPKR(Number(effect.balance ?? 0))}`;
    case "balance_adjusted":
      return `${effect.name}: ${formatPKR(Number(effect.from ?? 0))} → ${formatPKR(Number(effect.to ?? 0))}`;
    case "nothing_changed":
      return `${effect.what} — ${effect.reason}`;
    default:
      return JSON.stringify(effect);
  }
}
