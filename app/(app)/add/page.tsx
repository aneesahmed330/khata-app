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
  const accounts = await scope.accounts.find({ archived: { $ne: true } }).toArray();

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

      <AddForm accounts={accounts.map((a) => ({ id: a._id.toHexString(), name: a.name }))} />
    </main>
  );
}
