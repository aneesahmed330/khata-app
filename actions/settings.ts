"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { getDb } from "@/lib/db";
import type { UserDoc } from "@/lib/types";

export interface SettingsActionResult {
  error?: string;
}

const NET_WORTH_FIELDS = {
  loans: "count_loans_in_net_worth",
  investments: "count_investments_in_net_worth",
} as const;

/** The two global "does this category count toward net worth at all" switches
 *  — Settings' "Net worth" section. This is the outer layer: off zeroes the
 *  WHOLE category (Home, /loans, /investments all reflect it) regardless of
 *  any individual loan/holding's own exclude_from_total, which only ever
 *  narrows further and can't turn the category back on once this is off. */
export async function setNetWorthPrefAction(
  _prev: SettingsActionResult | undefined,
  formData: FormData,
): Promise<SettingsActionResult> {
  const session = await getSession();
  if (!session) return { error: "Session expired. Please log in again." };

  const category = String(formData.get("category") ?? "");
  if (category !== "loans" && category !== "investments") {
    return { error: "Unknown setting." };
  }
  const value = String(formData.get("value") ?? "") === "true";

  const scope = await forUser(session.userId);
  const db = await getDb();
  await db
    .collection<UserDoc>("users")
    .updateOne({ _id: scope.userId }, { $set: { [NET_WORTH_FIELDS[category]]: value } });

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/loans");
  revalidatePath("/investments");
  return {};
}
