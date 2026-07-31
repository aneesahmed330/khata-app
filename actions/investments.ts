"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser, type UserScope } from "@/lib/scope";
import { postTransaction, reverseTransaction } from "@/lib/ledger";
import type { InvestmentType } from "@/lib/types";

export interface InvestmentActionResult {
  error?: string;
}

function revalidateInvestments() {
  revalidatePath("/");
  revalidatePath("/investments");
  revalidatePath("/history");
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Quantity is optional across every action here — a holding like "real
// estate" or "other" has no natural share/unit count, only an amount.
function parseQuantity(raw: FormDataEntryValue | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Account is optional everywhere in this file — sometimes the user genuinely
// doesn't remember which account funded a purchase/dividend. Omitting it
// still records the transaction (for the holding's own history) but leaves
// every account balance untouched, since there's nothing honest to charge it
// against (lib/ledger.ts).
async function resolveOptionalAccount(
  scope: UserScope,
  raw: FormDataEntryValue | null,
): Promise<{ ok: true; id?: ObjectId } | { ok: false; error: string }> {
  const value = String(raw ?? "");
  if (!value) return { ok: true, id: undefined };
  if (!ObjectId.isValid(value)) return { ok: false, error: "Invalid account." };
  const account = await scope.accounts.findOne({ _id: new ObjectId(value) });
  if (!account) return { ok: false, error: "Account not found." };
  return { ok: true, id: account._id };
}

const INVESTMENT_TYPES = new Set<InvestmentType>([
  "stock",
  "mutual_fund",
  "gold",
  "crypto",
  "real_estate",
  "other",
]);

/** Creates the holding and posts its first buy in one call — a holding can't
 *  exist with nothing invested, so "add investment" and "first buy" are the
 *  same action rather than two steps. */
export async function createHoldingAction(
  _prev: InvestmentActionResult | undefined,
  formData: FormData,
): Promise<InvestmentActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const type = String(formData.get("type") ?? "") as InvestmentType;
  if (!INVESTMENT_TYPES.has(type)) return { error: "Invalid investment type." };

  const amount = parseAmount(formData.get("amount"));
  if (!amount) return { error: "Amount must be a number greater than zero." };

  const quantity = parseQuantity(formData.get("quantity"));
  const quantityUnit = String(formData.get("quantity_unit") ?? "").trim() || undefined;
  const symbol = String(formData.get("symbol") ?? "").trim() || undefined;

  const scope = await forUser(session.userId);
  const resolvedAccount = await resolveOptionalAccount(scope, formData.get("account_id"));
  if (!resolvedAccount.ok) return { error: resolvedAccount.error };

  const dateRaw = String(formData.get("date") ?? "");
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return { error: "Invalid date." };

  const note = String(formData.get("note") ?? "").trim() || undefined;

  const holdingId = new ObjectId();
  await scope.holdings.insertOne({
    _id: holdingId,
    name,
    symbol,
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
      amount,
      account_id: resolvedAccount.id,
      holding_id: holdingId,
      quantity_delta: quantity,
      date,
      note,
      source: "manual",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record the investment." };
  }

  revalidateInvestments();
  redirect(`/investments/${holdingId.toHexString()}`);
}

async function findHolding(scope: Awaited<ReturnType<typeof forUser>>, holdingId: string) {
  if (!ObjectId.isValid(holdingId)) return null;
  return scope.holdings.findOne({ _id: new ObjectId(holdingId) });
}

export async function buyMoreAction(
  _prev: InvestmentActionResult | undefined,
  formData: FormData,
): Promise<InvestmentActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const holdingId = String(formData.get("holding_id") ?? "");
  const scope = await forUser(session.userId);
  const holding = await findHolding(scope, holdingId);
  if (!holding) return { error: "Holding not found." };

  const amount = parseAmount(formData.get("amount"));
  if (!amount) return { error: "Amount must be a number greater than zero." };
  const quantity = parseQuantity(formData.get("quantity"));

  const resolvedAccount = await resolveOptionalAccount(scope, formData.get("account_id"));
  if (!resolvedAccount.ok) return { error: resolvedAccount.error };

  const dateRaw = String(formData.get("date") ?? "");
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00`) : new Date();
  const note = String(formData.get("note") ?? "").trim() || undefined;

  try {
    await postTransaction(scope, {
      type: "investment_buy",
      amount,
      account_id: resolvedAccount.id,
      holding_id: holding._id,
      quantity_delta: quantity,
      date,
      note,
      source: "manual",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record the purchase." };
  }

  revalidateInvestments();
  revalidatePath(`/investments/${holdingId}`);
  redirect(`/investments/${holdingId}`);
}

export async function sellAction(
  _prev: InvestmentActionResult | undefined,
  formData: FormData,
): Promise<InvestmentActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const holdingId = String(formData.get("holding_id") ?? "");
  const scope = await forUser(session.userId);
  const holding = await findHolding(scope, holdingId);
  if (!holding) return { error: "Holding not found." };

  const amount = parseAmount(formData.get("amount"));
  if (!amount) return { error: "Proceeds must be a number greater than zero." };
  const quantity = parseQuantity(formData.get("quantity"));
  if (quantity && quantity > holding.quantity) {
    return { error: `You only hold ${holding.quantity}${holding.quantity_unit ? ` ${holding.quantity_unit}` : ""}.` };
  }

  const resolvedAccount = await resolveOptionalAccount(scope, formData.get("account_id"));
  if (!resolvedAccount.ok) return { error: resolvedAccount.error };

  const dateRaw = String(formData.get("date") ?? "");
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00`) : new Date();
  const note = String(formData.get("note") ?? "").trim() || undefined;
  const closeFully = formData.get("close_fully") === "on";

  try {
    await postTransaction(scope, {
      type: "investment_sell",
      amount,
      account_id: resolvedAccount.id,
      holding_id: holding._id,
      quantity_delta: quantity,
      date,
      note,
      source: "manual",
    });
    // Closing manually covers holdings with no tracked quantity (real estate,
    // "other") — postTransaction only auto-closes when quantity hits zero.
    if (closeFully) {
      await scope.holdings.updateOne(
        { _id: holding._id },
        { $set: { status: "closed", quantity: 0 } },
      );
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record the sale." };
  }

  revalidateInvestments();
  revalidatePath(`/investments/${holdingId}`);
  redirect(`/investments/${holdingId}`);
}

export async function recordDividendAction(
  _prev: InvestmentActionResult | undefined,
  formData: FormData,
): Promise<InvestmentActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const holdingId = String(formData.get("holding_id") ?? "");
  const scope = await forUser(session.userId);
  const holding = await findHolding(scope, holdingId);
  if (!holding) return { error: "Holding not found." };

  const amount = parseAmount(formData.get("amount"));
  if (!amount) return { error: "Amount must be a number greater than zero." };

  const resolvedAccount = await resolveOptionalAccount(scope, formData.get("account_id"));
  if (!resolvedAccount.ok) return { error: resolvedAccount.error };

  const dateRaw = String(formData.get("date") ?? "");
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00`) : new Date();
  const note = String(formData.get("note") ?? "").trim() || undefined;

  try {
    await postTransaction(scope, {
      type: "dividend",
      amount,
      account_id: resolvedAccount.id,
      holding_id: holding._id,
      date,
      note,
      source: "manual",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record the dividend." };
  }

  revalidateInvestments();
  revalidatePath(`/investments/${holdingId}`);
  redirect(`/investments/${holdingId}`);
}

/** A valuation snapshot, not a ledger event — no money moved, so this is a
 *  plain doc update, not a transaction. */
export async function updateCurrentValueAction(
  _prev: InvestmentActionResult | undefined,
  formData: FormData,
): Promise<InvestmentActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const holdingId = String(formData.get("holding_id") ?? "");
  const scope = await forUser(session.userId);
  const holding = await findHolding(scope, holdingId);
  if (!holding) return { error: "Holding not found." };

  const currentValue = parseAmount(formData.get("current_value"));
  if (currentValue === null) return { error: "Current value must be a number greater than zero." };

  await scope.holdings.updateOne(
    { _id: holding._id },
    { $set: { current_value: currentValue, current_value_updated_at: new Date() } },
  );

  revalidateInvestments();
  revalidatePath(`/investments/${holdingId}`);
  redirect(`/investments/${holdingId}`);
}

/** Reverses every transaction the holding ever posted (restoring whatever
 *  account balances they touched) and then removes the holding itself — a
 *  holding is closer to an account than to a ledger row, so unlike a
 *  transaction it doesn't need a soft-delete trail of its own; the reversed
 *  transactions still carry the history (plan.md §5). */
export async function deleteHoldingAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const holdingId = String(formData.get("holding_id") ?? "");
  if (!ObjectId.isValid(holdingId)) redirect("/investments");

  const scope = await forUser(session.userId);
  const id = new ObjectId(holdingId);

  const txns = await scope.transactions
    .find({ holding_id: id, deleted_at: { $exists: false } } as never)
    .toArray();
  for (const txn of txns) {
    await reverseTransaction(scope, txn._id);
  }
  await scope.holdings.deleteOne({ _id: id });

  revalidateInvestments();
  redirect("/investments");
}
