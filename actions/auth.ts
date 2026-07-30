"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { verifyPassword, createSessionCookie, clearSessionCookie } from "@/lib/auth";
import type { UserDoc } from "@/lib/types";

export interface LoginResult {
  error?: string;
}

export async function loginAction(
  _prev: LoginResult | undefined,
  formData: FormData,
): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are both required." };
  }

  const db = await getDb();
  const user = await db.collection<UserDoc>("users").findOne({ email });

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Incorrect email or password." };
  }

  await createSessionCookie({ userId: user._id.toHexString(), email: user.email });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
