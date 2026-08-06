import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { postTransaction } from "@/lib/ledger";
import type { InvestmentType } from "@/lib/types";

// Mobile equivalent of app/(app)/investments/page.tsx + NewInvestmentForm's
// submit — same holding shape and unrealised gain/loss math (open holdings,
// exclude_from_total carved out), JSON in/out instead of server-rendered
// list + form action.

const TYPE_LABEL: Record<InvestmentType, string> = {
  stock: "Stock",
  mutual_fund: "Mutual fund",
  gold: "Gold",
  crypto: "Crypto",
  real_estate: "Real estate",
  other: "Other",
};

const INVESTMENT_TYPES = new Set<InvestmentType>([
  "stock",
  "mutual_fund",
  "gold",
  "crypto",
  "real_estate",
  "other",
]);

function parseAmount(raw: unknown): number | null {
  const n = Number(String(raw ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseQuantity(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const scope = await forUser(session.userId);
  const holdings = await scope.holdings.find({}, { sort: { created_at: -1 } }).toArray();

  const open = holdings.filter((h) => h.status === "open");
  const counted = open.filter((h) => !h.exclude_from_total);
  const invested = counted.reduce((sum, h) => sum + h.invested_total, 0);
  const valued = counted.reduce((sum, h) => sum + (h.current_value ?? h.invested_total), 0);
  const gain = valued - invested;

  return NextResponse.json({
    holdings: holdings.map((h) => ({
      id: h._id.toHexString(),
      name: h.name,
      typeLabel: TYPE_LABEL[h.type],
      investedTotal: h.invested_total,
      currentValue: h.current_value,
      quantity: h.quantity,
      quantityUnit: h.quantity_unit,
      hideValue: h.hide_value ?? false,
      excludeFromTotal: h.exclude_from_total ?? false,
    })),
    invested,
    valued,
    gain,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const type = String(body.type ?? "") as InvestmentType;
  if (!INVESTMENT_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid investment type." }, { status: 400 });
  }

  const investedTotal = parseAmount(body.investedTotal);
  if (!investedTotal) {
    return NextResponse.json({ error: "Amount must be a number greater than zero." }, { status: 400 });
  }

  const quantity = parseQuantity(body.quantity);
  const quantityUnit = String(body.quantityUnit ?? "").trim() || undefined;

  const scope = await forUser(session.userId);

  let accountId: ObjectId | undefined;
  const accountRaw = String(body.accountId ?? "");
  if (accountRaw) {
    if (!ObjectId.isValid(accountRaw)) {
      return NextResponse.json({ error: "Invalid account." }, { status: 400 });
    }
    const account = await scope.accounts.findOne({ _id: new ObjectId(accountRaw) });
    if (!account) return NextResponse.json({ error: "Account not found." }, { status: 400 });
    accountId = account._id;
  }

  const holdingId = new ObjectId();
  await scope.holdings.insertOne({
    _id: holdingId,
    name,
    type,
    quantity: 0,
    quantity_unit: quantityUnit,
    invested_total: 0,
    dividends_received: 0,
    status: "open",
    created_at: new Date(),
  });

  try {
    await postTransaction(scope, {
      type: "investment_buy",
      amount: investedTotal,
      account_id: accountId,
      holding_id: holdingId,
      quantity_delta: quantity,
      date: new Date(),
      source: "manual",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not record the investment." },
      { status: 400 },
    );
  }

  return NextResponse.json({ id: holdingId.toHexString() });
}
