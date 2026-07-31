"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { forUser, type UserScope } from "@/lib/scope";
import { postTransaction, reverseTransaction } from "@/lib/ledger";

export interface LoanActionResult {
  error?: string;
}

function revalidateLoans(id?: string) {
  revalidatePath("/");
  revalidatePath("/loans");
  revalidatePath("/history");
  if (id) revalidatePath(`/loans/${id}`);
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadLoan(scope: UserScope, id: string) {
  if (!ObjectId.isValid(id)) return null;
  return scope.loans.findOne({ _id: new ObjectId(id) });
}

async function resolveAccount(scope: UserScope, raw: FormDataEntryValue | null) {
  const value = String(raw ?? "");
  if (!ObjectId.isValid(value)) return null;
  return scope.accounts.findOne({ _id: new ObjectId(value) });
}

/** Money coming back. `repayment_in` when they're paying you, `repayment_out`
 *  when you're paying them — the direction of the ORIGINAL loan decides, not
 *  the person doing the paying, which is why this reads the loan first. */
export async function recordRepaymentAction(
  _prev: LoanActionResult | undefined,
  formData: FormData,
): Promise<LoanActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const loanId = String(formData.get("loan_id") ?? "");
  const scope = await forUser(session.userId);
  const loan = await loadLoan(scope, loanId);
  if (!loan) return { error: "Loan not found." };
  if (loan.status === "settled") return { error: "This loan is already settled." };

  const amount = parseAmount(formData.get("amount"));
  if (!amount) return { error: "Amount must be a number greater than zero." };
  if (amount > loan.outstanding) {
    return { error: `That's more than the ${loan.outstanding} still outstanding.` };
  }

  const account = await resolveAccount(scope, formData.get("account_id"));
  if (!account) return { error: "Pick the account the money moved through." };

  const dateRaw = String(formData.get("date") ?? "");
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return { error: "Invalid date." };

  try {
    await postTransaction(scope, {
      type: loan.direction === "given" ? "repayment_in" : "repayment_out",
      amount,
      account_id: account._id,
      person_id: loan.person_id,
      loan_id: loan._id,
      date,
      note: String(formData.get("note") ?? "").trim() || undefined,
      source: "manual",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record the repayment." };
  }

  revalidateLoans(loanId);
  redirect(`/loans/${loanId}`);
}

/** Lending more to the same person (or borrowing more from them) — appends to
 *  the open loan rather than starting a second one against the same name. */
export async function addToLoanAction(
  _prev: LoanActionResult | undefined,
  formData: FormData,
): Promise<LoanActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const loanId = String(formData.get("loan_id") ?? "");
  const scope = await forUser(session.userId);
  const loan = await loadLoan(scope, loanId);
  if (!loan) return { error: "Loan not found." };

  const amount = parseAmount(formData.get("amount"));
  if (!amount) return { error: "Amount must be a number greater than zero." };

  const account = await resolveAccount(scope, formData.get("account_id"));
  if (!account) return { error: "Pick the account the money moved through." };

  const dateRaw = String(formData.get("date") ?? "");
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return { error: "Invalid date." };

  try {
    await postTransaction(scope, {
      type: loan.direction === "given" ? "loan_given" : "loan_taken",
      amount,
      account_id: account._id,
      person_id: loan.person_id,
      loan_id: loan._id,
      date,
      note: String(formData.get("note") ?? "").trim() || undefined,
      source: "manual",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add to the loan." };
  }

  revalidateLoans(loanId);
  redirect(`/loans/${loanId}`);
}

/** Close a loan without moving money — for the remainder that was forgiven,
 *  rounded off, or settled outside the ledger. It deliberately does NOT post a
 *  repayment: no money moved, so no account balance may change. The write-off
 *  is recorded on the loan itself so the history still explains the zero. */
export async function writeOffLoanAction(
  _prev: LoanActionResult | undefined,
  formData: FormData,
): Promise<LoanActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const loanId = String(formData.get("loan_id") ?? "");
  const scope = await forUser(session.userId);
  const loan = await loadLoan(scope, loanId);
  if (!loan) return { error: "Loan not found." };
  if (loan.status === "settled") return { error: "This loan is already settled." };

  await scope.loans.updateOne(
    { _id: loan._id },
    { $set: { status: "settled", outstanding: 0, written_off: loan.outstanding, settled_at: new Date() } },
  );

  revalidateLoans(loanId);
  redirect(`/loans/${loanId}`);
}

/** Reverses every transaction attached to the loan — restoring the balances
 *  they moved — and then removes the loan itself. Same shape as deleting a
 *  holding: the transactions keep their soft-deleted record, the container
 *  goes. reverseTransaction drops the loan once its principal reaches zero, so
 *  this only has to clean up the remainder in the odd case it survives. */
export async function deleteLoanAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const loanId = String(formData.get("loan_id") ?? "");
  if (!ObjectId.isValid(loanId)) redirect("/loans");

  const scope = await forUser(session.userId);
  const id = new ObjectId(loanId);

  const txns = await scope.transactions
    .find({ loan_id: id, deleted_at: { $exists: false } } as never)
    .toArray();
  for (const txn of txns) {
    await reverseTransaction(scope, txn._id);
  }
  await scope.loans.deleteOne({ _id: id });

  revalidateLoans();
  redirect("/loans");
}
