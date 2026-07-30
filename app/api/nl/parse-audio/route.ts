import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { getDb } from "@/lib/db";
import { parseIntentFromAudio, LLMQuotaError, type UserContext } from "@/lib/llm";
import { sampleExamples } from "@/lib/retrieval";
import type { LoanDoc, UserDoc } from "@/lib/types";

// ~10s of opus audio is well under this; the cap exists so a runaway recording
// can't be used to burn the day's Gemini quota in one request.
const MAX_AUDIO_BYTES = 2_000_000;
const ALLOWED_MIME = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
]);

// There is no Layer 1 on this path — Layer 1 is a text parser and no text
// exists until Gemini transcribes. Speech always costs one Gemini call.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const audio = typeof body?.audio === "string" ? body.audio : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";

  if (!audio) return NextResponse.json({ error: "audio is required" }, { status: 400 });
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json({ error: `unsupported mimeType: ${mimeType}` }, { status: 400 });
  }
  // base64 inflates by 4/3; compare against the decoded size
  if (audio.length * 0.75 > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Recording is too long. Keep it short (10-15 seconds)." },
      { status: 413 },
    );
  }

  const scope = await forUser(session.userId);
  const [accounts, categories, people, tags] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.categories.find({}).toArray(),
    scope.people.find({}).toArray(),
    scope.tags.find({}).toArray(),
  ]);

  const db = await getDb();
  const user = await db.collection<UserDoc>("users").findOne({ _id: scope.userId });

  const openLoans = await scope.loans.find({ status: "open" }).toArray();
  const loansByPerson = new Map<string, Pick<LoanDoc, "outstanding" | "direction">>(
    openLoans.map((l) => [l.person_id.toHexString(), l] as const),
  );

  const ctx: UserContext = {
    now: new Date(),
    timezone: user?.timezone ?? "Asia/Karachi",
    accounts,
    categories,
    people: people.map((p) => ({ ...p, openLoan: loansByPerson.get(p._id.toHexString()) })),
    tags,
    examples: await sampleExamples(scope.userId),
  };

  try {
    const parsed = await parseIntentFromAudio(audio, mimeType, ctx);
    return NextResponse.json({
      source: "llm_audio",
      parsed,
      // The client shows this as the editable raw text, so a mishearing is
      // visible and fixable before it ever reaches the ledger.
      transcript: parsed.transcript ?? "",
    });
  } catch (err) {
    if (err instanceof LLMQuotaError) {
      return NextResponse.json(
        {
          source: "quota_exceeded",
          error: "AI's daily limit is used up. Type the entry or try again tomorrow.",
        },
        { status: 429 },
      );
    }
    console.error("nl/parse-audio failed:", err);
    return NextResponse.json(
      { error: "Couldn't understand the audio. Try speaking again or type it." },
      { status: 500 },
    );
  }
}
