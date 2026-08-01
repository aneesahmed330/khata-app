import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser, type UserScope } from "@/lib/scope";
import {
  resolveOrCreateCategory,
  resolveOrCreatePerson,
  resolveOrDeclareAccount,
  resolveLoan,
} from "@/lib/resolve";
import { postTransaction } from "@/lib/ledger";
import { saveReceipt, type Effect } from "@/lib/receipt";
import { categoryPath } from "@/lib/taxonomy";
import type { ParsedIntent, SubAction } from "@/lib/schemas";
import type { AccountType, CategoryType, InputMode, TxnSource } from "@/lib/types";

interface ActionOverride {
  confirmCreateCategory?: boolean;
  confirmCreateAccount?: boolean;
  confirmedLoanAction?: "new" | "append" | "repayment";
  /** The user answered "I don't remember which account". Distinct from simply
   *  not having sent one, which still has to ask. */
  confirmNoAccount?: boolean;
}

interface CommitRequest {
  parsed: ParsedIntent;
  rawText: string;
  inputMode: InputMode;
  // echoed back from /nl/parse or /nl/parse-audio, or "manual" when the
  // ManualEntryForm built the ParsedIntent directly without going through
  // either parsing layer at all.
  source?: "dict" | "llm" | "llm_audio" | "manual";
  confirmCreateCategory?: boolean;
  confirmCreateAccount?: boolean;
  confirmedLoanAction?: "new" | "append" | "repayment";
  confirmNoAccount?: boolean;
  // For intent === "multi" only — resolving action[i] a second time after a
  // confirm chip. Keyed by index rather than re-sending the whole array with
  // the answer baked in, so the client only has to remember which slot
  // needed a decision.
  actionOverrides?: Record<number, ActionOverride>;
}

// Handled in this pass — plan.md scope note: record_repayment (as its own
// top-level intent) is intentionally not wired up yet — it needs the same
// resolveLoan()/account plumbing but doubling the branch count in one sitting
// was the wrong tradeoff. query_data never belongs in a ledger-writing
// endpoint at all — it's a read, not a commit. "multi" IS handled below.
const SUPPORTED = new Set([
  "add_expense",
  "add_income",
  "lend_money",
  "borrow_money",
  "transfer",
  "declare_account",
  "multi",
]);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as CommitRequest | null;
  if (!body?.parsed) return NextResponse.json({ error: "parsed is required" }, { status: 400 });

  const { parsed } = body;
  if (!SUPPORTED.has(parsed.intent)) {
    return NextResponse.json(
      { error: `${parsed.intent} is not supported yet — use the manual form.` },
      { status: 400 },
    );
  }

  const scope = await forUser(session.userId);

  try {
    if (parsed.intent === "multi") {
      return await commitMulti(scope, body);
    }

    const ctx = ctxFrom(body);
    let outcome: ResolveOutcome;
    switch (parsed.intent) {
      case "add_expense":
      case "add_income":
        outcome = await resolveExpenseOrIncome(scope, parsed, ctx, {
          confirmCreateCategory: body.confirmCreateCategory,
        });
        break;
      case "lend_money":
      case "borrow_money":
        outcome = await resolveLoanAction(scope, parsed, ctx, {
          confirmedLoanAction: body.confirmedLoanAction,
          confirmNoAccount: body.confirmNoAccount,
        });
        break;
      case "transfer":
        outcome = await resolveTransfer(scope, parsed, ctx);
        break;
      case "declare_account":
        outcome = await resolveDeclareAccount(scope, parsed, ctx, {
          confirmCreateAccount: body.confirmCreateAccount,
        });
        break;
      default:
        return NextResponse.json({ error: "unreachable" }, { status: 500 });
    }
    return await commitOne(scope, outcome);
  } catch (err) {
    console.error("nl/commit failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Commit failed." },
      { status: 500 },
    );
  }
}

// ── Shared resolve/commit plumbing ──────────────────────────────────────
// Every intent's handling splits into "resolve" (look up or propose
// categories/accounts/people — pure reads plus, once confirmed, the small
// zero-blast-radius auto-creates from plan.md §4.2) and "commit" (actually
// post the transaction). Multi runs every action's resolve step FIRST and
// only starts posting once none of them need a confirmation — so a multi
// message never ends up half-committed because action 3 of 4 needed a chip.

interface ResolveCtx {
  rawText: string;
  inputMode?: InputMode;
  source: TxnSource;
  confidence?: number;
}

function ctxFrom(body: CommitRequest): ResolveCtx {
  return {
    rawText: body.rawText,
    inputMode: body.inputMode,
    source: body.source ?? "llm",
    confidence: body.parsed.confidence,
  };
}

interface ResolvedAction {
  effects: Effect[];
  /** Returns null when nothing was actually posted (declare_account's
   *  "nothing_changed" skip, or a brand-new account opened at a 0 balance —
   *  both real, valid outcomes with no transaction behind them). */
  commit: () => Promise<ObjectId | null>;
}

type ResolveOutcome =
  | { ok: true; resolved: ResolvedAction }
  | { ok: false; status: number; body: Record<string, unknown> };

async function commitOne(scope: UserScope, outcome: ResolveOutcome) {
  if (!outcome.ok) return NextResponse.json(outcome.body, { status: outcome.status });
  const transactionId = await outcome.resolved.commit();
  const receipt = await saveReceipt(
    scope,
    outcome.resolved.effects,
    transactionId ? [transactionId] : [],
  );
  return NextResponse.json(receipt);
}

async function commitMulti(scope: UserScope, body: CommitRequest) {
  const actions = body.parsed.actions;
  if (!actions || actions.length < 2) {
    return NextResponse.json({ error: "actions (2+) is required for intent: multi" }, { status: 400 });
  }

  const resolved: ResolvedAction[] = [];
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    const override = body.actionOverrides?.[i] ?? {};
    const asIntent = subActionAsIntent(action);
    const ctx = ctxFrom(body);

    let outcome: ResolveOutcome;
    switch (action.intent) {
      case "add_expense":
      case "add_income":
        outcome = await resolveExpenseOrIncome(scope, asIntent, ctx, {
          confirmCreateCategory: override.confirmCreateCategory,
        });
        break;
      case "lend_money":
      case "borrow_money":
        outcome = await resolveLoanAction(scope, asIntent, ctx, {
          confirmedLoanAction: override.confirmedLoanAction,
          confirmNoAccount: override.confirmNoAccount,
        });
        break;
      case "transfer":
        outcome = await resolveTransfer(scope, asIntent, ctx);
        break;
      case "declare_account":
        outcome = await resolveDeclareAccount(scope, asIntent, ctx, {
          confirmCreateAccount: override.confirmCreateAccount,
        });
        break;
      default:
        outcome = { ok: false, status: 400, body: { error: `Unsupported action intent: ${action.intent}` } };
    }

    if (!outcome.ok) {
      // Tagged with which action needs a decision so the client can show
      // just that one action's confirm chips while leaving the rest of the
      // preview alone, then resubmit the same actions array plus this one
      // override rather than re-parsing the whole message again.
      return NextResponse.json({ ...outcome.body, actionIndex: i }, { status: outcome.status });
    }
    resolved.push(outcome.resolved);
  }

  // Nothing needed confirmation — safe to actually post everything now, in
  // order, as one receipt covering every effect.
  const transactionIds: ObjectId[] = [];
  const effects: Effect[] = [];
  for (const r of resolved) {
    const id = await r.commit();
    if (id) transactionIds.push(id);
    effects.push(...r.effects);
  }

  const receipt = await saveReceipt(scope, effects, transactionIds);
  return NextResponse.json(receipt);
}

/** SubAction is ParsedIntent's fields minus the multi-only/parse-only ones
 *  (no `actions`, `transcript`, `clarification_question`, `missing`) — every
 *  field the resolvers actually read is shared, so this is just a type-level
 *  widening, not a data transformation. confidence isn't on SubAction (only
 *  the parent message has an overall confidence), so it's set to 1 here:
 *  manual/multi actions are never a Layer-1/2 confidence estimate. */
function subActionAsIntent(action: SubAction): ParsedIntent {
  return { ...action, confidence: 1 };
}

// ── Expense / Income ─────────────────────────────────────────────────────

async function resolveExpenseOrIncome(
  scope: UserScope,
  parsed: ParsedIntent,
  ctx: ResolveCtx,
  overrides: { confirmCreateCategory?: boolean },
): Promise<ResolveOutcome> {
  if (!parsed.amount) return { ok: false, status: 400, body: { error: "amount is required" } };

  const effects: Effect[] = [];
  let categoryId: ObjectId | undefined;
  let rootCategoryId: ObjectId | undefined;
  let categoryPathLabel: string | undefined;

  if (parsed.category_id) {
    const cat = await scope.categories.findOne({ _id: new ObjectId(parsed.category_id) });
    if (cat) {
      categoryId = cat._id;
      rootCategoryId = cat.root_id;
      const root = cat.parent_id ? await scope.categories.findOne({ _id: cat.parent_id }) : null;
      categoryPathLabel = categoryPath(cat, root);
    }
  } else if (parsed.new_category) {
    const type: CategoryType = parsed.new_category.type;
    const res = await resolveOrCreateCategory(scope, parsed.new_category.name, type, {
      parentId: parsed.new_category.parent_id,
      parentName: parsed.new_category.parent_name,
      confirmCreate: overrides.confirmCreateCategory,
      createdFromText: ctx.rawText,
    });
    if (!res.id) {
      return { ok: false, status: 200, body: { needsConfirmation: true, reason: "category", proposal: res.proposal } };
    }
    categoryId = res.id;
    rootCategoryId = res.rootId ?? undefined;
    categoryPathLabel = parsed.new_category.name;
    if (res.created) {
      effects.push({
        kind: "category_created",
        name: parsed.new_category.name,
        type,
        parent: parsed.new_category.parent_name,
      });
    }
  }

  // add_income and any expense without a resolvable/default account always
  // require an explicit account — plan.md §4.2. The parse step already marks
  // this as `missing`, but commit re-checks so a stale client can't slip a
  // transaction through unfunded.
  if (!parsed.account_id) {
    return { ok: false, status: 200, body: { needsConfirmation: true, reason: "account", missing: ["account_id"] } };
  }
  const account = await scope.accounts.findOne({ _id: new ObjectId(parsed.account_id) });
  if (!account) return { ok: false, status: 400, body: { error: "Account not found" } };

  effects.push({
    kind: "transaction_added",
    item: parsed.item,
    amount: parsed.amount,
    categoryPath: categoryPathLabel,
    account: account.name,
    note: parsed.note,
  });

  const amount = parsed.amount;
  const date = parsed.date ? new Date(parsed.date) : new Date();

  return {
    ok: true,
    resolved: {
      effects,
      commit: async () => {
        const posted = await postTransaction(scope, {
          type: parsed.intent === "add_income" ? "income" : "expense",
          amount,
          item: parsed.item,
          note: parsed.note,
          category_id: categoryId,
          root_category_id: rootCategoryId,
          account_id: account._id,
          date,
          raw_text: ctx.rawText,
          input_mode: ctx.inputMode,
          source: ctx.source,
          confidence: ctx.confidence,
        });
        return posted.transactionId;
      },
    },
  };
}

// ── Loans ────────────────────────────────────────────────────────────────

async function resolveLoanAction(
  scope: UserScope,
  parsed: ParsedIntent,
  ctx: ResolveCtx,
  overrides: {
    confirmedLoanAction?: "new" | "append" | "repayment";
    confirmNoAccount?: boolean;
  },
): Promise<ResolveOutcome> {
  if (!parsed.amount) return { ok: false, status: 400, body: { error: "amount is required" } };
  if (!parsed.person_id && !parsed.person_name) {
    return { ok: false, status: 400, body: { error: "person is required" } };
  }

  const effects: Effect[] = [];
  let personId: ObjectId;
  let personName: string;
  if (parsed.person_id) {
    personId = new ObjectId(parsed.person_id);
    const p = await scope.people.findOne({ _id: personId });
    personName = p?.name ?? "Unknown";
  } else {
    const res = await resolveOrCreatePerson(scope, parsed.person_name!);
    personId = res.id;
    personName = parsed.person_name!;
    if (res.created) effects.push({ kind: "person_created", name: personName });
  }

  const loanRes = await resolveLoan(scope, personId, parsed.loan_action, overrides.confirmedLoanAction);
  if (loanRes.ambiguous) {
    return {
      ok: false,
      status: 200,
      body: {
        needsConfirmation: true,
        reason: "loan_action",
        loanContext: { person: personName, outstanding: loanRes.outstanding },
      },
    };
  }

  // An old loan usually has no account the user can still name, and charging
  // one now would double-count: that cash left the account long before the app
  // saw it, so today's balance already reflects it. Skipping the account
  // records the receivable and moves no balance — but it has to be chosen
  // deliberately, so a merely-absent account still asks.
  let account = null as Awaited<ReturnType<typeof scope.accounts.findOne>> | null;
  if (parsed.account_id) {
    account = await scope.accounts.findOne({ _id: new ObjectId(parsed.account_id) });
    if (!account) return { ok: false, status: 400, body: { error: "Account not found" } };
  } else if (!overrides.confirmNoAccount) {
    return {
      ok: false,
      status: 200,
      body: { needsConfirmation: true, reason: "account", missing: ["account_id"], allowNoAccount: true },
    };
  }

  const isGiven = parsed.intent === "lend_money";
  let txnType: "loan_given" | "loan_taken" | "repayment_in" | "repayment_out";
  let loanIdForTxn: ObjectId | undefined;

  if (loanRes.action === "repayment") {
    txnType = loanRes.direction === "given" ? "repayment_in" : "repayment_out";
    loanIdForTxn = loanRes.loanId ?? undefined;
  } else {
    txnType = isGiven ? "loan_given" : "loan_taken";
    loanIdForTxn = loanRes.action === "append" ? (loanRes.loanId ?? undefined) : undefined;
  }

  const amount = parsed.amount;
  const date = parsed.date ? new Date(parsed.date) : new Date();
  const isOutflow = txnType === "loan_given" || txnType === "repayment_out";

  // Placeholder loan effect — `outstanding` isn't known until postTransaction
  // actually applies the $inc, so this object is mutated in place inside
  // commit() below. It's pushed now (not built later) so `effects` is the
  // single array both this function's caller and commit() share by reference.
  const loanEffect: Effect =
    loanRes.action === "repayment"
      ? { kind: "loan_updated", person: personName, added: -amount, outstanding: 0 }
      : loanRes.action === "append"
        ? { kind: "loan_updated", person: personName, added: amount, outstanding: amount }
        : { kind: "loan_opened", person: personName, amount };
  effects.push(loanEffect);
  if (account) {
    effects.push({
      kind: "balance_adjusted",
      name: account.name,
      from: account.balance,
      to: account.balance + (isOutflow ? -amount : amount),
      delta: isOutflow ? -amount : amount,
    });
  }

  return {
    ok: true,
    resolved: {
      effects,
      commit: async () => {
        const posted = await postTransaction(scope, {
          type: txnType,
          amount,
          account_id: account?._id,
          person_id: personId,
          loan_id: loanIdForTxn,
          date,
          note: parsed.note,
          raw_text: ctx.rawText,
          input_mode: ctx.inputMode,
          source: ctx.source,
          confidence: ctx.confidence,
        });

        if (loanRes.action === "repayment" && loanEffect.kind === "loan_updated") {
          const idx = effects.indexOf(loanEffect);
          effects[idx] =
            posted.loanOutstanding === 0
              ? { kind: "loan_settled", person: personName }
              : { ...loanEffect, outstanding: posted.loanOutstanding ?? 0 };
        } else if (loanRes.action === "append" && loanEffect.kind === "loan_updated") {
          loanEffect.outstanding = posted.loanOutstanding ?? amount;
        }
        return posted.transactionId;
      },
    },
  };
}

// ── Transfer ─────────────────────────────────────────────────────────────

async function resolveTransfer(
  scope: UserScope,
  parsed: ParsedIntent,
  ctx: ResolveCtx,
): Promise<ResolveOutcome> {
  // A transfer with no clear amount isn't a "which account" question — the
  // parse itself is unreliable, so this is a real error, not a confirmable gap.
  if (!parsed.amount) {
    return { ok: false, status: 400, body: { error: "Couldn't tell the amount for this transfer." } };
  }
  // Missing accounts, unlike a missing amount, ARE resolvable with a chip —
  // same pattern as resolveExpenseOrIncome/resolveLoanAction. Gemini leaves
  // one or both unset whenever it can't confidently match an account name in
  // the text (plan.md's "never guess" rule), which used to hard-400 here
  // instead of asking, unlike every other intent.
  if (!parsed.account_id) {
    return { ok: false, status: 200, body: { needsConfirmation: true, reason: "account", field: "account_id", missing: ["account_id"] } };
  }
  if (!parsed.to_account_id) {
    return { ok: false, status: 200, body: { needsConfirmation: true, reason: "account", field: "to_account_id", missing: ["to_account_id"] } };
  }
  if (parsed.account_id === parsed.to_account_id) {
    return { ok: false, status: 400, body: { error: "Transfer needs two different accounts." } };
  }
  const [from, to] = await Promise.all([
    scope.accounts.findOne({ _id: new ObjectId(parsed.account_id) }),
    scope.accounts.findOne({ _id: new ObjectId(parsed.to_account_id) }),
  ]);
  if (!from || !to) return { ok: false, status: 400, body: { error: "Account not found" } };

  const amount = parsed.amount;
  const date = parsed.date ? new Date(parsed.date) : new Date();

  return {
    ok: true,
    resolved: {
      effects: [{ kind: "transfer_made", from: from.name, to: to.name, amount }],
      commit: async () => {
        const posted = await postTransaction(scope, {
          type: "transfer",
          amount,
          account_id: from._id,
          to_account_id: to._id,
          date,
          note: parsed.note,
          raw_text: ctx.rawText,
          input_mode: ctx.inputMode,
          source: ctx.source,
          confidence: ctx.confidence,
        });
        return posted.transactionId;
      },
    },
  };
}

// ── Declare account ──────────────────────────────────────────────────────

async function resolveDeclareAccount(
  scope: UserScope,
  parsed: ParsedIntent,
  ctx: ResolveCtx,
  overrides: { confirmCreateAccount?: boolean },
): Promise<ResolveOutcome> {
  const declared = parsed.declared_account;
  if (!declared) return { ok: false, status: 400, body: { error: "declared_account is required" } };

  const res = await resolveOrDeclareAccount(scope, declared.name, declared.type as AccountType, declared.balance, {
    confirmCreate: overrides.confirmCreateAccount,
    createdFromText: ctx.rawText,
  });

  if (!res.id && res.proposal) {
    return { ok: false, status: 200, body: { needsConfirmation: true, reason: "account", proposal: res.proposal } };
  }
  if (!res.id) return { ok: false, status: 500, body: { error: "Could not resolve account" } };

  if (!res.created && res.adjustment === null) {
    return {
      ok: true,
      resolved: {
        effects: [{ kind: "nothing_changed", what: declared.name, reason: "Balance already matches." }],
        commit: async () => null,
      },
    };
  }

  const accountId = res.id;
  const created = res.created;
  const adjustment = res.adjustment;

  // A declared balance NEVER becomes a silent write to account.balance — it is
  // always an `adjustment` transaction (plan.md §4.6), so the ledger stays
  // reconcilable: balance always equals sum(transactions). This applies to a
  // brand-new account's opening balance too — `created` still goes through
  // this path rather than returning early, because returning early used to
  // leave the account's balance unbacked and liable to be zeroed by
  // recomputeAccountBalance or the §7 nightly reconcile.
  //
  // `from` is a placeholder, corrected inside commit() once the real
  // pre-adjustment balance is read — resolve() must stay a pure lookup, no
  // reads that go stale between resolving and actually posting.
  const effect: Effect = created
    ? { kind: "account_created", name: declared.name, accountType: declared.type, balance: declared.balance }
    : { kind: "balance_adjusted", name: declared.name, from: 0, to: declared.balance, delta: adjustment ?? 0 };
  const effects: Effect[] = [effect];

  return {
    ok: true,
    resolved: {
      effects,
      commit: async () => {
        if (adjustment === null) return null; // e.g. a brand-new account opened at 0

        if (!created && effect.kind === "balance_adjusted") {
          effect.from = (await scope.accounts.findOne({ _id: accountId }))?.balance ?? 0;
        }
        const posted = await postTransaction(scope, {
          type: "adjustment",
          amount: adjustment,
          account_id: accountId,
          date: new Date(),
          raw_text: ctx.rawText,
          source: "adjustment",
        });
        return posted.transactionId;
      },
    },
  };
}
