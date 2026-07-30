// Layer 2 retrieval — plan.md §2.2. Lexical $text search, not embeddings
// (see plan.md §2.2a for why that upgrade is deliberately deferred). Global
// corpus (user_id: null) plus this user's own corrections, top 15 by score.
import { getDb } from "./db";
import type { ExampleDoc } from "./types";
import { ObjectId } from "mongodb";

const TOP_N = 15;

export async function retrieveExamples(
  text: string,
  userId: ObjectId,
): Promise<ExampleDoc[]> {
  const db = await getDb();
  const col = db.collection<ExampleDoc>("examples");

  try {
    return await col
      .find(
        {
          $text: { $search: text },
          $or: [{ user_id: null }, { user_id: userId }],
        },
        { projection: { score: { $meta: "textScore" } } },
      )
      .sort({ score: { $meta: "textScore" } })
      .limit(TOP_N)
      .toArray();
  } catch {
    // No $text index yet (fresh DB before scripts/seed-examples.ts has run)
    // — degrade to zero examples rather than failing the whole parse.
    return [];
  }
}

/** For the audio path, where there is no query text to search with yet —
 *  transcription and parsing happen in the same call, so $text retrieval is a
 *  chicken-and-egg problem. A sample of the corpus still gives the model format
 *  and category-mapping calibration; it just isn't similarity-ranked. The
 *  user's own corrections are preferred over the global corpus because those
 *  reflect how this person actually talks. */
export async function sampleExamples(userId: ObjectId): Promise<ExampleDoc[]> {
  const db = await getDb();
  const col = db.collection<ExampleDoc>("examples");

  const own = await col.find({ user_id: userId }).sort({ _id: -1 }).limit(TOP_N).toArray();
  if (own.length >= TOP_N) return own;

  const global = await col
    .aggregate<ExampleDoc>([
      { $match: { user_id: null } },
      { $sample: { size: TOP_N - own.length } },
    ])
    .toArray();

  return [...own, ...global];
}

export function renderExamplesForPrompt(examples: ExampleDoc[]): string {
  if (examples.length === 0) return "(no examples yet)";
  return examples
    .map((e) => `"${e.raw_text}" -> ${JSON.stringify(e.expected)}`)
    .join("\n");
}
