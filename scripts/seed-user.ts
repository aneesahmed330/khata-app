// Run once: npm run seed:user
// Creates the (only, for now — plan.md §12.A) user from SEED_USER_* in
// .env.local, via the exact same bootstrapUser() a future signup UI will call.
import path from "node:path";
import { config } from "dotenv";
import { bootstrapUser } from "../lib/bootstrap";

// tsx runs from the repo root, but be explicit about which env file — Next
// only auto-loads .env.local at runtime, a standalone script does not.
config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  const name = process.env.SEED_USER_NAME ?? "Anees";

  if (!email || !password) {
    console.error(
      "SEED_USER_EMAIL and SEED_USER_PASSWORD must be set in .env.local before seeding.",
    );
    process.exit(1);
  }

  const { userId } = await bootstrapUser({ email, password, name });
  console.log(`✓ User created: ${email} (${userId.toHexString()})`);
  console.log("  60-leaf category tree + default Cash account ready.");
  console.log("  Log in at /login with this email and password.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
