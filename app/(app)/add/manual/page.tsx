import Link from "next/link";
import { X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { ManualEntryForm } from "@/components/ManualEntryForm";

export const dynamic = "force-dynamic";

// The fallback path when NL parsing can't handle an entry (plan.md's own
// deferred-features list flagged this gap: "Manual entry form (NL fail ho to
// fallback) — Nahi bana"). Reachable both from AddForm's error state and as a
// standing link on /add — this always works, no parsing involved at all.
export default async function ManualEntryPage() {
  const session = await getSession();
  if (!session) return null;

  const scope = await forUser(session.userId);
  const [accounts, categories, people] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.categories.find({}).toArray(),
    scope.people.find({}).toArray(),
  ]);

  const roots = categories.filter((c) => c.parent_id === null);
  const categoryOptions = roots.flatMap((root) => [
    { id: root._id.toHexString(), label: root.name, depth: 0, type: root.type },
    ...categories
      .filter((c) => c.parent_id?.equals(root._id))
      .map((child) => ({
        id: child._id.toHexString(),
        label: child.name,
        depth: 1,
        type: child.type,
      })),
  ]);

  return (
    <main className="mx-auto max-w-md px-4">
      <div
        className="flex items-center justify-between pb-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
      >
        <div>
          <div className="t-micro text-fg-faint">Manual entry</div>
          <h1 className="t-title mt-0.5">Fill it in</h1>
        </div>
        <Link
          href="/add"
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-chip text-fg-muted transition-colors hover:bg-surface-lift hover:text-fg"
        >
          <X size={19} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>

      <ManualEntryForm
        accounts={accounts.map((a) => ({ id: a._id.toHexString(), name: a.name }))}
        categories={categoryOptions}
        peopleNames={[...new Set(people.map((p) => p.name))]}
      />
    </main>
  );
}
