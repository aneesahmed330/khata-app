"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { updateTransaction, reverseTransaction } from "@/lib/ledger";
import { learnItemAlias } from "@/lib/resolve";

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

  // Empty means "no funding account recorded" — only possible (and only
  // submitted this way) for a financials-locked investment entry; every
  // other type's <select> is a required field, so accountRaw is never empty
  // for those.
  const accountRaw = String(formData.get("account_id") ?? "");
  let accountId: ObjectId | undefined;
  if (accountRaw) {
    if (!ObjectId.isValid(accountRaw)) return { error: "Invalid account." };
    accountId = new ObjectId(accountRaw);
    // Confirms the account is THIS user's — an id from a tampered form must
    // never move another tenant's balance (plan.md §8.1).
    const account = await scope.accounts.findOne({ _id: accountId });
    if (!account) return { error: "Account not found." };
  }

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

  const item = String(formData.get("item") ?? "").trim();

  try {
    await updateTransaction(scope, txn._id, {
      amount,
      item,
      note: String(formData.get("note") ?? "").trim(),
      date,
      account_id: accountId,
      category_id: categoryId,
      root_category_id: rootCategoryId,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed." };
  }

  // Tags aren't a "financial" — always editable regardless of
  // financialsLocked, applied as its own $set outside updateTransaction
  // since it has no balance/ledger effect for that function to guard.
  // Mirrors app/api/transactions/[id]/route.ts's POST handler exactly.
  const tagIds = String(formData.get("tag_ids") ?? "")
    .split(",")
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  await scope.transactions.updateOne({ _id: txn._id }, { $set: { tag_ids: tagIds } });

  // A hand-fixed category is the strongest signal there is — the user is
  // telling us the parse was wrong. Without this the same item re-parsed to
  // the same wrong category forever (plan.md §2.2's correction loop, which
  // previously only learned from fuzzy name matches inside resolve.ts).
  if (categoryId) await learnItemAlias(scope, item, categoryId);

  revalidateLedger();
  redirect("/history");
}

// Deleting inline from a list (Home/History rows) should land back on that
// same list, not always jump to History — but the target still comes from a
// form field, so it's checked against a fixed allow-list rather than trusted
// as-is (an unvalidated redirect target from form data is an open-redirect risk).
const REDIRECT_ALLOWLIST = new Set(["/", "/history"]);

export async function deleteTransactionAction(
  _prev: TxnActionResult | undefined,
  formData: FormData,
): Promise<TxnActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const id = String(formData.get("id") ?? "");
  const requested = String(formData.get("redirectTo") ?? "");
  const redirectTo = REDIRECT_ALLOWLIST.has(requested) ? requested : "/history";
  if (!ObjectId.isValid(id)) return { error: "Invalid entry." };

  const scope = await forUser(session.userId);
  try {
    // Soft-delete + full balance/loan reversal (plan.md §5 — never hard-delete).
    await reverseTransaction(scope, new ObjectId(id));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't delete that." };
  }

  revalidateLedger();
  redirect(redirectTo);
}
