import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser, type UserScope } from "@/lib/scope";
import { postTransaction } from "@/lib/ledger";
import type { InvestmentType } from "@/lib/types";

// Mobile equivalent of app/(app)/investments/[id]/page.tsx +
// components/HoldingDetail.tsx (detail fields, buy/sell/dividend, current
// value snapshot, exclude_from_total/hide_value toggles) and the matching
// actions in actions/investments.ts — JSON in/out instead of server-rendered
// page + form actions.

const TYPE_LABEL: Record<InvestmentType, string> = {
  stock: "Stock",
  mutual_fund: "Mutual fund",
  gold: "Gold",
  crypto: "Crypto",
  real_estate: "Real estate",
  other: "Other",
};

function parseAmount(raw: unknown): number | null {
  const n = Number(String(raw ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseQuantity(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function loadHolding(scope: UserScope, id: string) {
  if (!ObjectId.isValid(id)) return null;
  return scope.holdings.findOne({ _id: new ObjectId(id) });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const holding = await loadHolding(scope, params.id);
  if (!holding) return NextResponse.json({ error: "Holding not found." }, { status: 404 });

  const [accounts, txns] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.transactions
      .find({ holding_id: holding._id, deleted_at: { $exists: false } }, { sort: { date: -1 } })
      .toArray(),
  ]);
  const accountsById = new Map(accounts.map((a) => [a._id.toHexString(), a] as const));

  const transactions = txns
    .filter((t) => t.type === "investment_buy" || t.type === "investment_sell" || t.type === "dividend")
    .map((t) => ({
      id: t._id.toHexString(),
      kind: t.type as "investment_buy" | "investment_sell" | "dividend",
      amount: t.amount,
      quantityDelta: t.quantity_delta,
      accountName: t.account_id ? accountsById.get(t.account_id.toHexString())?.name : undefined,
      date: t.date.toISOString().slice(0, 10),
    }));

  return NextResponse.json({
    id: holding._id.toHexString(),
    name: holding.name,
    symbol: holding.symbol,
    type: holding.type,
    typeLabel: TYPE_LABEL[holding.type],
    quantity: holding.quantity,
    quantityUnit: holding.quantity_unit,
    investedTotal: holding.invested_total,
    currentValue: holding.current_value,
    currentValueUpdatedAt: holding.current_value_updated_at?.toISOString().slice(0, 10),
    dividendsReceived: holding.dividends_received,
    hideValue: holding.hide_value ?? false,
    excludeFromTotal: holding.exclude_from_total ?? false,
    status: holding.status,
    transactions,
    accounts: accounts.map((a) => ({ id: a._id.toHexString(), name: a.name })),
  });
}

// Account is optional for buy/sell/dividend — sometimes the user genuinely
// doesn't remember which account funded a purchase/received a payout.
// Omitting it (or an id that isn't this user's) resolves to "no account
// recorded," never a guess. Mirrors actions/investments.ts's
// resolveOptionalAccount exactly.
async function resolveOptionalAccount(scope: UserScope, raw: unknown) {
  const value = String(raw ?? "");
  if (!value) return { ok: true as const, id: undefined };
  if (!ObjectId.isValid(value)) return { ok: false as const, error: "Invalid account." };
  const account = await scope.accounts.findOne({ _id: new ObjectId(value) });
  if (!account) return { ok: false as const, error: "Account not found." };
  return { ok: true as const, id: account._id };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const holding = await loadHolding(scope, params.id);
  if (!holding) return NextResponse.json({ error: "Holding not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "buy" || action === "sell") {
    const amount = parseAmount(body.amount);
    if (!amount) {
      return NextResponse.json(
        { error: `${action === "buy" ? "Amount" : "Proceeds"} must be a number greater than zero.` },
        { status: 400 },
      );
    }
    const quantity = parseQuantity(body.quantity);
    if (action === "sell" && quantity && quantity > holding.quantity) {
      return NextResponse.json(
        {
          error: `You only hold ${holding.quantity}${holding.quantity_unit ? ` ${holding.quantity_unit}` : ""}.`,
        },
        { status: 400 },
      );
    }
    const resolvedAccount = await resolveOptionalAccount(scope, body.accountId);
    if (!resolvedAccount.ok) return NextResponse.json({ error: resolvedAccount.error }, { status: 400 });

    try {
      await postTransaction(scope, {
        type: action === "buy" ? "investment_buy" : "investment_sell",
        amount,
        holding_id: holding._id,
        quantity_delta: quantity,
        account_id: resolvedAccount.id,
        date: new Date(),
        source: "manual",
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not record the transaction." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "dividend") {
    const amount = parseAmount(body.amount);
    if (!amount) {
      return NextResponse.json({ error: "Amount must be a number greater than zero." }, { status: 400 });
    }
    const resolvedAccount = await resolveOptionalAccount(scope, body.accountId);
    if (!resolvedAccount.ok) return NextResponse.json({ error: resolvedAccount.error }, { status: 400 });

    try {
      await postTransaction(scope, {
        type: "dividend",
        amount,
        holding_id: holding._id,
        account_id: resolvedAccount.id,
        date: new Date(),
        source: "manual",
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not record the dividend." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "updateValue") {
    const currentValue = parseAmount(body.currentValue);
    if (currentValue === null) {
      return NextResponse.json({ error: "Current value must be a number greater than zero." }, { status: 400 });
    }

    await scope.holdings.updateOne(
      { _id: holding._id },
      { $set: { current_value: currentValue, current_value_updated_at: new Date() } },
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "toggleFlag") {
    const field = String(body.field ?? "");
    if (field !== "excludeFromTotal" && field !== "hideValue") {
      return NextResponse.json({ error: "Unknown setting." }, { status: 400 });
    }
    const docField = field === "excludeFromTotal" ? "exclude_from_total" : "hide_value";
    const value = Boolean(body.value);

    await scope.holdings.updateOne({ _id: holding._id }, { $set: { [docField]: value } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
