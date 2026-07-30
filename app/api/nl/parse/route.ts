import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { getDb } from "@/lib/db";
import { parseLayer1 } from "@/lib/parser";
import { parseIntent, LLMQuotaError, type UserContext } from "@/lib/llm";
import { retrieveExamples } from "@/lib/retrieval";
import type { LoanDoc, UserDoc } from "@/lib/types";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const scope = await forUser(session.userId);
  const [accounts, categories, people, tags, aliases] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.categories.find({}).toArray(),
    scope.people.find({}).toArray(),
    scope.tags.find({}).toArray(),
    scope.aliases.find({}).toArray(),
  ]);

  const db = await getDb();
  const user = await db.collection<UserDoc>("users").findOne({ _id: scope.userId });
  const defaultAccountId = user?.default_account_id ?? null;

  // Layer 1 — deterministic, zero LLM calls.
  const layer1 = parseLayer1(text, {
    now: new Date(),
    aliases,
    accounts,
    categories,
    defaultAccountId,
  });
  if (layer1) {
    return NextResponse.json({ source: "dict", parsed: layer1 });
  }

  // Layer 2 — Gemini, only reached when Layer 1 has no confident answer.
  const openLoans = await scope.loans.find({ status: "open" }).toArray();
  const loansByPerson = new Map<string, Pick<LoanDoc, "outstanding" | "direction">>(
    openLoans.map((l) => [l.person_id.toHexString(), l] as const),
  );

  const examples = await retrieveExamples(text, scope.userId);
  const ctx: UserContext = {
    now: new Date(),
    timezone: user?.timezone ?? "Asia/Karachi",
    accounts,
    categories,
    people: people.map((p) => ({ ...p, openLoan: loansByPerson.get(p._id.toHexString()) })),
    tags,
    examples,
  };

  try {
    const parsed = await parseIntent(text, ctx);
    return NextResponse.json({ source: "llm", parsed });
  } catch (err) {
    if (err instanceof LLMQuotaError) {
      return NextResponse.json(
        {
          source: "quota_exceeded",
          error: "AI parsing has hit today's limit. Use manual entry or try again tomorrow.",
        },
        { status: 429 },
      );
    }
    console.error("nl/parse failed:", err);
    return NextResponse.json(
      { error: "Couldn't parse that. Try manual entry." },
      { status: 500 },
    );
  }
}
