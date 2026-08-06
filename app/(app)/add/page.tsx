import Link from "next/link";
import { X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { AddForm } from "@/components/AddForm";

export const dynamic = "force-dynamic";

// DESIGN.md §5 wants this as a bottom sheet reachable from anywhere. It's still
// a full page (vaul is installed but not wired) — tracked in README's deferred
// table. The close affordance is a dismiss back to Home so it already behaves
// like a sheet from the user's side.
export default async function AddPage() {
  const session = await getSession();
  if (!session) return null;

  const scope = await forUser(session.userId);
  const [accounts, categories] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.categories.find({}).toArray(),
  ]);
  const categoryById = new Map(categories.map((c) => [c._id.toHexString(), c] as const));

  return (
    <main className="mx-auto max-w-md px-4">
      {/* No TopBar on this page either — same safe-area clearance as Home. */}
      <div
        className="flex items-center justify-between pb-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
      >
        <div>
          <div className="t-micro text-fg-faint">New entry</div>
          <h1 className="t-title mt-0.5">What happened?</h1>
        </div>
        <Link
          href="/"
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-chip text-fg-muted transition-colors hover:bg-surface-lift hover:text-fg"
        >
          <X size={19} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>

      <AddForm
        accounts={accounts.map((a) => ({ id: a._id.toHexString(), name: a.name }))}
        categories={categories.map((c) => ({
          id: c._id.toHexString(),
          name: c.name,
          type: c.type,
          parentName: c.parent_id ? categoryById.get(c.parent_id.toHexString())?.name : undefined,
          usageCount: c.usage_count,
        }))}
      />

      <div className="mt-6 text-center">
        <Link
          href="/add/manual"
          className="t-label text-fg-faint underline decoration-rule underline-offset-4 transition-colors hover:text-fg-muted"
        >
          Fill in manually instead
        </Link>
      </div>
    </main>
  );
}
