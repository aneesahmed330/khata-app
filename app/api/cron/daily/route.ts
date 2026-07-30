import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Vercel Hobby allows exactly one cron job — recurring transactions and the
// category-hygiene merge-suggestion job (plan.md §4.5) both belong here,
// but neither is implemented yet (recurring txns are Phase 4; hygiene is a
// deferred nice-to-have). What IS live: resetting each user's daily Gemini
// call counter, since §8.3's quota safety net depends on that reset firing.
export async function GET(req: Request) {
  // Vercel Cron issues a GET and signs it with this exact header —
  // https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const result = await db
    .collection("users")
    .updateMany({}, { $set: { llm_calls_today: 0, llm_calls_reset_at: new Date() } });

  return NextResponse.json({
    ok: true,
    usersReset: result.modifiedCount,
    note: "Recurring transactions and category hygiene are not implemented yet.",
  });
}
