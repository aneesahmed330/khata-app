import { MongoClient, type Db } from "mongodb";

// Cached on globalThis so dev hot-reload and serverless warm invocations
// reuse one connection instead of exhausting the pool. plan.md §8.
//
// The connection is created lazily, inside getClientPromise() — NOT as a
// top-level module side effect. `next build` statically imports every route
// module to collect its metadata, so a throw at module-evaluation time
// (e.g. "MONGODB_URI is not set") fails the build even though no request
// was ever served. Deferring the throw into the async call site means the
// build succeeds without credentials, and the real error still surfaces
// clearly the moment a route actually needs the database.

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (globalThis._mongoClientPromise) return globalThis._mongoClientPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.");
  }
  // ignoreUndefined: by default the driver serialises an undefined field as
  // null, so an optional field the code never set still exists in the document
  // holding null. That silently contradicts the `field?: string` types (real
  // values are `string | null`, not `string | undefined`) and breaks any
  // `{ field: { $exists: false } }` query. Omitting undefined keys instead makes
  // stored documents match the declared types.
  const client = new MongoClient(uri, { ignoreUndefined: true });
  globalThis._mongoClientPromise = client.connect();
  return globalThis._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db();
}

/** For multi-document transactions (ledger.ts) — Atlas clusters are always
 *  replica sets, even on the M0 free tier, so sessions work unmodified. */
export async function getClient(): Promise<MongoClient> {
  return getClientPromise();
}
