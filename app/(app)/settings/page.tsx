import { LogOut, Wallet, FolderTree, Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { logoutAction } from "@/actions/auth";
import { TopBar } from "@/components/TopBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HideBalancesToggle } from "@/components/HideBalancesToggle";
import { Sensitive } from "@/components/Sensitive";
import { formatPKR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const scope = await forUser(session.userId);
  const [accounts, categoryCount, people] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.categories.countDocuments({}),
    scope.people.countDocuments({}),
  ]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <>
      <TopBar title="Settings" eyebrow={session.email} />
      <main className="mx-auto max-w-md px-4 pt-6">
        <section>
          <h2 className="t-micro mb-3 text-fg-faint">Overview</h2>
          <div className="divide-y divide-rule-soft rounded-chip border border-rule">
            <StatRow
              Icon={Wallet}
              label="Accounts"
              value={
                <>
                  {accounts.length} · <Sensitive>{formatPKR(totalBalance)}</Sensitive>
                </>
              }
            />
            <StatRow Icon={FolderTree} label="Categories" value={String(categoryCount)} />
            <StatRow Icon={Users} label="People (loans)" value={String(people)} />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="t-micro mb-3 text-fg-faint">Look</h2>
          <div className="flex items-center justify-between rounded-chip border border-rule px-4 py-3">
            <div>
              <div className="t-body">Theme</div>
              <div className="t-label text-fg-muted">Ink or Paper</div>
            </div>
            <ThemeToggle />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="t-micro mb-3 text-fg-faint">Privacy</h2>
          <HideBalancesToggle />
        </section>

        <section className="mt-8">
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-chip border border-rule px-4 py-3 text-[15px] text-out transition-colors duration-200 hover:bg-surface-lift active:scale-[0.99]"
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden />
              Logout
            </button>
          </form>
        </section>
      </main>
    </>
  );
}

function StatRow({
  Icon,
  label,
  value,
}: {
  Icon: typeof Wallet;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon size={16} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
      <span className="t-body flex-1">{label}</span>
      <span className="tnum font-num text-[13px] text-fg-muted">{value}</span>
    </div>
  );
}
