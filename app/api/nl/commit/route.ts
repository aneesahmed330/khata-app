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
import type { ParsedIntent } from "@/lib/schemas";
import type { AccountType, CategoryType, InputMode } from "@/lib/types";

interface CommitRequest {
  parsed: ParsedIntent;
  rawText: string;
  inputMode: InputMode;
  // echoed back from /nl/parse or /nl/parse-audio, for provenance only
  source?: "dict" | "llm" | "llm_audio";
  confirmCreateCategory?: boolean;
  confirmCreateAccount?: boolean;
  confirmedLoanAction?: "new" | "append" | "repayment";
}

// Handled in this pass — plan.md scope note: record_repayment (as its own
// top-level intent) and multi are intentionally not wired up yet; both need
// the same resolveLoan()/account plumbing but doubling the branch count in
// one sitting was the wrong tradeoff. query_data never belongs in a
// ledger-writing endpoint at all — it's a read, not a commit.
const SUPPORTED = new Set([
  "add_expense",
  "add_income",
  "lend_money",
  "borrow_money",
  "transfer",
  "declare_account",
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
  const date = parsed.date ? new Date(parsed.date) : new Date();

  try {
    switch (parsed.intent) {
      case "add_expense":
      case "add_income":
        return await commitExpenseOrIncome(scope, body, date);
      case "lend_money":
      case "borrow_money":
        return await commitLoan(scope, body, date);
      case "transfer":
        return await commitTransfer(scope, body, date);
      case "declare_account":
        return await commitDeclareAccount(scope, body, date);
      default:
        return NextResponse.json({ error: "unreachable" }, { status: 500 });
    }
  } catch (err) {
    console.error("nl/commit failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Commit failed." },
      { status: 500 },
    );
  }
}

async function commitExpenseOrIncome(scope: UserScope, body: CommitRequest, date: Date) {
  const { parsed, rawText, inputMode } = body;
  if (!parsed.amount) return NextResponse.json({ error: "amount is required" }, { status: 400 });

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
      confirmCreate: body.confirmCreateCategory,
      createdFromText: rawText,
    });
    if (!res.id) {
      return NextResponse.json({
        needsConfirmation: true,
        reason: "category",
        proposal: res.proposal,
      });
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
  // require an explicit account — plan.md §4.2. The parse step already
  // marks this as `missing`, but commit re-checks so a stale client can't
  // slip a transaction through unfunded.
  if (!parsed.account_id) {
    return NextResponse.json({ needsConfirmation: true, reason: "account", missing: ["account_id"] });
  }
  const account = await scope.accounts.findOne({ _id: new ObjectId(parsed.account_id) });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 400 });

  const posted = await postTransaction(scope, {
    type: parsed.intent === "add_income" ? "income" : "expense",
    amount: parsed.amount,
    item: parsed.item,
    note: parsed.note,
    category_id: categoryId,
    root_category_id: rootCategoryId,
    account_id: account._id,
    date,
    raw_text: rawText,
    input_mode: inputMode,
    source: body.source ?? "llm",
    confidence: parsed.confidence,
  });

  effects.push({
    kind: "transaction_added",
    item: parsed.item,
    amount: parsed.amount,
    categoryPath: categoryPathLabel,
    account: account.name,
    note: parsed.note,
  });

  const receipt = await saveReceipt(scope, effects, [posted.transactionId]);
  return NextResponse.json(receipt);
}

async function commitLoan(scope: UserScope, body: CommitRequest, date: Date) {
  const { parsed, rawText, inputMode } = body;
  if (!parsed.amount) return NextResponse.json({ error: "amount is required" }, { status: 400 });
  if (!parsed.person_id && !parsed.person_name) {
    return NextResponse.json({ error: "person is required" }, { status: 400 });
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

  const loanRes = await resolveLoan(
    scope,
    personId,
    parsed.loan_action,
    body.confirmedLoanAction,
  );
  if (loanRes.ambiguous) {
    return NextResponse.json({
      needsConfirmation: true,
      reason: "loan_action",
      loanContext: { person: personName, outstanding: loanRes.outstanding },
    });
  }

  if (!parsed.account_id) {
    return NextResponse.json({ needsConfirmation: true, reason: "account", missing: ["account_id"] });
  }
  const account = await scope.accounts.findOne({ _id: new ObjectId(parsed.account_id) });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 400 });

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

  const posted = await postTransaction(scope, {
    type: txnType,
    amount: parsed.amount,
    account_id: account._id,
    person_id: personId,
    loan_id: loanIdForTxn,
    date,
    note: parsed.note,
    raw_text: rawText,
    input_mode: inputMode,
    source: body.source ?? "llm",
    confidence: parsed.confidence,
  });

  if (loanRes.action === "repayment") {
    if (posted.loanOutstanding === 0) {
      effects.push({ kind: "loan_settled", person: personName });
    } else {
      effects.push({
        kind: "loan_updated",
        person: personName,
        added: -parsed.amount,
        outstanding: posted.loanOutstanding ?? 0,
      });
    }
  } else if (loanRes.action === "append") {
    effects.push({
      kind: "loan_updated",
      person: personName,
      added: parsed.amount,
      outstanding: posted.loanOutstanding ?? parsed.amount,
    });
  } else {
    effects.push({ kind: "loan_opened", person: personName, amount: parsed.amount });
  }

  effects.push({
    kind: "balance_adjusted",
    name: account.name,
    from: account.balance,
    to: account.balance + (txnType === "loan_given" || txnType === "repayment_out" ? -parsed.amount : parsed.amount),
    delta: txnType === "loan_given" || txnType === "repayment_out" ? -parsed.amount : parsed.amount,
  });

  const receipt = await saveReceipt(scope, effects, [posted.transactionId]);
  return NextResponse.json(receipt);
}

async function commitTransfer(scope: UserScope, body: CommitRequest, date: Date) {
  const { parsed, rawText, inputMode } = body;
  if (!parsed.amount || !parsed.account_id || !parsed.to_account_id) {
    return NextResponse.json({ error: "amount, account_id and to_account_id are required" }, { status: 400 });
  }
  const [from, to] = await Promise.all([
    scope.accounts.findOne({ _id: new ObjectId(parsed.account_id) }),
    scope.accounts.findOne({ _id: new ObjectId(parsed.to_account_id) }),
  ]);
  if (!from || !to) return NextResponse.json({ error: "Account not found" }, { status: 400 });

  const posted = await postTransaction(scope, {
    type: "transfer",
    amount: parsed.amount,
    account_id: from._id,
    to_account_id: to._id,
    date,
    note: parsed.note,
    raw_text: rawText,
    input_mode: inputMode,
    source: body.source ?? "llm",
    confidence: parsed.confidence,
  });

  const receipt = await saveReceipt(
    scope,
    [{ kind: "transfer_made", from: from.name, to: to.name, amount: parsed.amount }],
    [posted.transactionId],
  );
  return NextResponse.json(receipt);
}

async function commitDeclareAccount(scope: UserScope, body: CommitRequest, _date: Date) {
  const { parsed, rawText } = body;
  const declared = parsed.declared_account;
  if (!declared) return NextResponse.json({ error: "declared_account is required" }, { status: 400 });

  const res = await resolveOrDeclareAccount(
    scope,
    declared.name,
    declared.type as AccountType,
    declared.balance,
    { confirmCreate: body.confirmCreateAccount, createdFromText: rawText },
  );

  if (!res.id && res.proposal) {
    return NextResponse.json({ needsConfirmation: true, reason: "account", proposal: res.proposal });
  }
  if (!res.id) return NextResponse.json({ error: "Could not resolve account" }, { status: 500 });

  if (!res.created && res.adjustment === null) {
    const receipt = await saveReceipt(
      scope,
      [{ kind: "nothing_changed", what: declared.name, reason: "Balance already matches." }],
      [],
    );
    return NextResponse.json(receipt);
  }

  // A declared balance NEVER becomes a silent write to account.balance — it is
  // always an `adjustment` transaction (plan.md §4.6), so the ledger stays
  // reconcilable: balance always equals sum(transactions). This applies to a
  // brand-new account's opening balance too, which is why the `created` case
  // falls through to here instead of returning early — it used to return before
  // posting anything, leaving the account's balance unbacked and liable to be
  // zeroed by recomputeAccountBalance or the §7 nightly reconcile.
  const balanceBefore = (await scope.accounts.findOne({ _id: res.id }))?.balance ?? 0;

  const transactionIds: ObjectId[] = [];
  if (res.adjustment !== null) {
    const posted = await postTransaction(scope, {
      type: "adjustment",
      amount: res.adjustment,
      account_id: res.id,
      date: new Date(),
      raw_text: rawText,
      source: "adjustment",
    });
    transactionIds.push(posted.transactionId);
  }

  const effects: Effect[] = res.created
    ? [
        {
          kind: "account_created",
          name: declared.name,
          accountType: declared.type,
          balance: declared.balance,
        },
      ]
    : [
        {
          kind: "balance_adjusted",
          name: declared.name,
          from: balanceBefore,
          to: declared.balance,
          delta: res.adjustment ?? 0,
        },
      ];

  const receipt = await saveReceipt(scope, effects, transactionIds);
  return NextResponse.json(receipt);
}
