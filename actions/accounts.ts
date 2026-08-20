"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser, type UserScope } from "@/lib/scope";
import { recomputeAccountBalance } from "@/lib/ledger";
import { normalizeName } from "@/lib/taxonomy";
import type { AccountType } from "@/lib/types";

export interface AccountActionResult {
  error?: string;
  ok?: boolean;
}

const ACCOUNT_TYPES = new Set<AccountType>(["bank", "cash", "wallet"]);

function revalidateAccounts(id?: string) {
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/history");
  if (id) revalidatePath(`/accounts/${id}`);
}

async function loadAccount(scope: UserScope, id: string) {
  if (!ObjectId.isValid(id)) return null;
  return scope.accounts.findOne({ _id: new ObjectId(id) });
}

/** Name and type. Balance is deliberately not editable here — it's the sum of
 *  the ledger, and letting it be typed over would silently desync every
 *  transaction behind it. Use a declare_account entry to reconcile instead. */
export async function updateAccountAction(
  _prev: AccountActionResult | undefined,
  formData: FormData,
): Promise<AccountActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const id = String(formData.get("account_id") ?? "");
  const scope = await forUser(session.userId);
  const account = await loadAccount(scope, id);
  if (!account) return { error: "Account not found." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name can't be empty." };
  if (name.length > 30) return { error: "Name is too long (30 characters max)." };

  const type = String(formData.get("type") ?? "") as AccountType;
  if (!ACCOUNT_TYPES.has(type)) return { error: "Pick a valid account type." };

  const normalized = normalizeName(name);
  // Two accounts with the same normalized name would make every "which
  // account?" chip ambiguous and break alias resolution.
  const clash = await scope.accounts.findOne({ name_normalized: normalized });
  if (clash && !clash._id.equals(account._id)) {
    return { error: `You already have an account called "${clash.name}".` };
  }

  await scope.accounts.updateOne(
    { _id: account._id },
    { $set: { name, name_normalized: normalized, type } },
  );

  revalidateAccounts(id);
  return { ok: true };
}

/** The two display/arithmetic flags. Submitted one at a time by the toggles,
 *  so each switch round-trips independently and a slow save can't revert the
 *  other one. */
export async function setAccountFlagAction(
  _prev: AccountActionResult | undefined,
  formData: FormData,
): Promise<AccountActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const id = String(formData.get("account_id") ?? "");
  const flag = String(formData.get("flag") ?? "");
  if (flag !== "hide_balance" && flag !== "exclude_from_total") {
    return { error: "Unknown setting." };
  }
  const value = String(formData.get("value") ?? "") === "true";

  const scope = await forUser(session.userId);
  const account = await loadAccount(scope, id);
  if (!account) return { error: "Account not found." };

  await scope.accounts.updateOne({ _id: account._id }, { $set: { [flag]: value } });

  revalidateAccounts(id);
  return { ok: true };
}

/** Archiving keeps every transaction and the balance intact, just takes the
 *  account out of the pickers and the dashboard. It's the reversible option,
 *  and the right one for an account you've closed in real life. */
export async function setAccountArchivedAction(
  _prev: AccountActionResult | undefined,
  formData: FormData,
): Promise<AccountActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const id = String(formData.get("account_id") ?? "");
  const archived = String(formData.get("archived") ?? "") === "true";
  if (!ObjectId.isValid(id)) return { error: "Invalid account." };

  const scope = await forUser(session.userId);
  try {
    await scope.accounts.updateOne({ _id: new ObjectId(id) }, { $set: { archived } });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that." };
  }

  revalidateAccounts(id);
  return { ok: true };
}

/** Only ever allowed for an account with nothing behind it.
 *
 *  Deleting an account that has transactions would either orphan them — rows
 *  pointing at an account that no longer exists, with no way to recompute a
 *  balance — or require deleting real financial history as a side effect of a
 *  settings change. Neither is acceptable, so this refuses and points at
 *  archiving, which is what the user actually wants in that case. */
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("account_id") ?? "");
  if (!ObjectId.isValid(id)) redirect("/");

  const scope = await forUser(session.userId);
  const accountId = new ObjectId(id);

  const used = await scope.transactions.countDocuments({
    $or: [{ account_id: accountId }, { to_account_id: accountId }],
  } as never);
  if (used > 0) redirect(`/accounts/${id}?e=has-transactions`);

  await scope.accounts.deleteOne({ _id: accountId });
  revalidateAccounts();
  redirect("/");
}

/** Recompute the balance from the transactions behind it — the reconcile
 *  escape hatch for an account that has drifted. */
export async function recomputeAccountAction(
  _prev: AccountActionResult | undefined,
  formData: FormData,
): Promise<AccountActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const id = String(formData.get("account_id") ?? "");
  if (!ObjectId.isValid(id)) return { error: "Invalid account." };

  const scope = await forUser(session.userId);
  try {
    await recomputeAccountBalance(scope, new ObjectId(id));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Recalculation failed." };
  }

  revalidateAccounts(id);
  return { ok: true };
}
