import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { NewInvestmentForm } from "@/components/NewInvestmentForm";

export const dynamic = "force-dynamic";

export default async function NewInvestmentPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const scope = await forUser(session.userId);
  const accounts = await scope.accounts.find({ archived: { $ne: true } }).toArray();

  return (
    <>
      <header
        className="sticky top-0 z-20 border-b border-rule bg-surface/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <Link
            href="/investments"
            aria-label="Back"
            className="-ml-2 flex size-9 items-center justify-center rounded-chip text-fg-muted transition-colors hover:bg-surface-lift hover:text-fg"
          >
            <ArrowLeft size={19} strokeWidth={1.75} aria-hidden />
          </Link>
          <h1 className="t-title truncate">Add investment</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-5">
        {accounts.length === 0 ? (
          <p className="t-body text-fg-muted">Add an account first — investing needs a funding account.</p>
        ) : (
          <NewInvestmentForm accounts={accounts.map((a) => ({ id: a._id.toHexString(), name: a.name }))} />
        )}
      </main>
    </>
  );
}
