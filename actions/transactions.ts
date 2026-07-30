"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { updateTransaction, reverseTransaction } from "@/lib/ledger";

export interface TxnActionResult {
  error?: string;
}

/** Every ledger page is server-rendered, and balances show on more than one of
 *  them, so a mutation has to invalidate all of them — not just the one the form
 *  was submitted from. */
function revalidateLedger() {
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/insights");
  revalidatePath("/settings");
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function updateTransactionAction(
  _prev: TxnActionResult | undefined,
  formData: FormData,
): Promise<TxnActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const id = String(formData.get("id") ?? "");
  if (!ObjectId.isValid(id)) return { error: "Invalid entry id." };

  const scope = await forUser(session.userId);
  const txn = await scope.transactions.findOne({ _id: new ObjectId(id) });
  if (!txn) return { error: "Entry not found." };

  const amount = parseAmount(formData.get("amount"));
  if (!amount) return { error: "Amount must be a number greater than zero." };

  const dateRaw = String(formData.get("date") ?? "");
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00`) : txn.date;
  if (Number.isNaN(date.getTime())) return { error: "Invalid date." };

  const accountRaw = String(formData.get("account_id") ?? "");
  if (!ObjectId.isValid(accountRaw)) return { error: "Invalid account." };
  const accountId = new ObjectId(accountRaw);
  // Confirms the account is THIS user's — an id from a tampered form must never
  // move another tenant's balance (plan.md §8.1).
  const account = await scope.accounts.findOne({ _id: accountId });
  if (!account) return { error: "Account not found." };

  const categoryRaw = String(formData.get("category_id") ?? "");
  let categoryId: ObjectId | null = null;
  let rootCategoryId: ObjectId | null = null;
  if (categoryRaw) {
    if (!ObjectId.isValid(categoryRaw)) return { error: "Invalid category." };
    const cat = await scope.categories.findOne({ _id: new ObjectId(categoryRaw) });
    if (!cat) return { error: "Category not found." };
    categoryId = cat._id;
    rootCategoryId = cat.root_id;
  }

  try {
    await updateTransaction(scope, txn._id, {
      amount,
      item: String(formData.get("item") ?? "").trim(),
      note: String(formData.get("note") ?? "").trim(),
      date,
      account_id: accountId,
      category_id: categoryId,
      root_category_id: rootCategoryId,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed." };
  }

  revalidateLedger();
  redirect("/history");
}

// Deleting inline from a list (Home/History rows) should land back on that
// same list, not always jump to History — but the target still comes from a
// form field, so it's checked against a fixed allow-list rather than trusted
// as-is (an unvalidated redirect target from form data is an open-redirect risk).
const REDIRECT_ALLOWLIST = new Set(["/", "/history"]);

export async function deleteTransactionAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const requested = String(formData.get("redirectTo") ?? "");
  const redirectTo = REDIRECT_ALLOWLIST.has(requested) ? requested : "/history";
  if (!ObjectId.isValid(id)) redirect(redirectTo);

  const scope = await forUser(session.userId);
  // Soft-delete + full balance/loan reversal (plan.md §5 — never hard-delete).
  await reverseTransaction(scope, new ObjectId(id));

  revalidateLedger();
  redirect(redirectTo);
}
