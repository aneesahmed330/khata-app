import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { TxnEditForm, type TxnEditData } from "@/components/TxnEditForm";

export const dynamic = "force-dynamic";

export default async function TransactionPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!ObjectId.isValid(params.id)) notFound();

  const scope = await forUser(session.userId);
  const txn = await scope.transactions.findOne({ _id: new ObjectId(params.id) });
  if (!txn || txn.deleted_at) notFound();

  const [accounts, categories, person, holding, toAccount, tags] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.categories.find({}).toArray(),
    txn.person_id ? scope.people.findOne({ _id: txn.person_id }) : Promise.resolve(null),
    txn.holding_id ? scope.holdings.findOne({ _id: txn.holding_id }) : Promise.resolve(null),
    txn.to_account_id ? scope.accounts.findOne({ _id: txn.to_account_id }) : Promise.resolve(null),
    txn.tag_ids.length ? scope.tags.find({ _id: { $in: txn.tag_ids } }).toArray() : Promise.resolve([]),
  ]);

  const roots = categories.filter((c) => c.parent_id === null);
  const categoryOptions = roots.flatMap((root) => [
    { id: root._id.toHexString(), label: root.name, depth: 0 },
    ...categories
      .filter((c) => c.parent_id?.equals(root._id))
      .map((child) => ({ id: child._id.toHexString(), label: child.name, depth: 1 })),
  ]);
  const category = txn.category_id ? categories.find((c) => c._id.equals(txn.category_id!)) : undefined;
  const categoryRoot = category?.parent_id ? categories.find((c) => c._id.equals(category.parent_id!)) : undefined;

  // Same "most identifying field" priority as KhataMobile's detailTitle() —
  // a person or holding name beats the generic type label, "Transfer" beats
  // an implied category, and only a plain expense/income falls back to its
  // item/category the way the old static "Entry" header effectively always did.
  const title =
    person?.name ||
    holding?.name ||
    (txn.type === "transfer" ? "Transfer" : undefined) ||
    txn.item ||
    (category ? (categoryRoot ? `${categoryRoot.name} › ${category.name}` : category.name) : undefined) ||
    "Entry";

  const data: TxnEditData = {
    id: txn._id.toHexString(),
    type: txn.type,
    amount: txn.amount,
    item: txn.item ?? "",
    note: txn.note ?? "",
    date: txn.date.toISOString().slice(0, 10),
    categoryId: txn.category_id?.toHexString() ?? "",
    accountId: txn.account_id?.toHexString() ?? "",
    rawText: txn.raw_text ?? "",
    source: txn.source,
    // Amount/account are locked for loan, transfer, and investment rows —
    // updateTransaction refuses those edits because the loan balance, the
    // paired account, or the holding's invested_total/quantity would also
    // have to be reworked (lib/ledger.ts). The form disables them rather
    // than letting the user submit something that will be rejected.
    financialsLocked: Boolean(txn.loan_id || txn.to_account_id || txn.holding_id),
    personName: person?.name,
    holdingName: holding?.name,
    toAccountName: toAccount?.name,
    quantityDelta: txn.quantity_delta,
    tags: tags.map((t) => ({ id: t._id.toHexString(), name: t.name })),
  };

  return (
    <>
      <header
        className="sticky top-0 z-20 border-b border-rule bg-surface/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <Link
            href="/history"
            aria-label="Back"
            className="-ml-2 flex size-9 items-center justify-center rounded-chip text-fg-muted transition-colors hover:bg-surface-lift hover:text-fg"
          >
            <ArrowLeft size={19} strokeWidth={1.75} aria-hidden />
          </Link>
          <h1 className="t-title truncate">{title}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-5">
        <TxnEditForm
          data={data}
          accounts={accounts.map((a) => ({ id: a._id.toHexString(), name: a.name }))}
          categories={categoryOptions}
        />
      </main>
    </>
  );
}
