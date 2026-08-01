import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { AccountDetail, type AccountDetailData } from "@/components/AccountDetail";

export const dynamic = "force-dynamic";

const BLOCKED: Record<string, string> = {
  "has-transactions":
    "This account still has entries pointing at it, so it can't be deleted. Archive it instead.",
};

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { e?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!ObjectId.isValid(params.id)) notFound();

  const scope = await forUser(session.userId);
  const accountId = new ObjectId(params.id);
  const account = await scope.accounts.findOne({ _id: accountId });
  if (!account) notFound();

  const transactionCount = await scope.transactions.countDocuments({
    $or: [{ account_id: accountId }, { to_account_id: accountId }],
    deleted_at: { $exists: false },
  } as never);

  const data: AccountDetailData = {
    id: account._id.toHexString(),
    name: account.name,
    type: account.type,
    balance: account.balance,
    archived: account.archived,
    hideBalance: account.hide_balance ?? false,
    excludeFromTotal: account.exclude_from_total ?? false,
    transactionCount,
    createdOn: account.created_at.toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    }),
  };

  return (
    <>
      <header
        className="sticky top-0 z-20 border-b border-rule bg-surface/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <Link
            href="/"
            aria-label="Back"
            className="-ml-2 flex size-9 items-center justify-center rounded-chip text-fg-muted transition-colors hover:bg-surface-lift hover:text-fg"
          >
            <ArrowLeft size={19} strokeWidth={1.75} aria-hidden />
          </Link>
          <h1 className="t-title truncate">{account.name}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-6 pt-5">
        <AccountDetail
          account={data}
          blockedReason={searchParams.e ? BLOCKED[searchParams.e] : undefined}
        />
      </main>
    </>
  );
}
