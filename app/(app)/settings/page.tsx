import { LogOut, Wallet, FolderTree, Users, Palette } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/scope";
import { getDb } from "@/lib/db";
import { logoutAction } from "@/actions/auth";
import { TopBar } from "@/components/TopBar";
import { ThemeToggle, ThemeStateLabel } from "@/components/ThemeToggle";
import { HideBalancesToggle } from "@/components/HideBalancesToggle";
import { NetWorthPrefsToggle } from "@/components/NetWorthPrefsToggle";
import { AccentPicker } from "@/components/AccentPicker";
import { TextSizePicker } from "@/components/TextSizePicker";
import { Sensitive } from "@/components/Sensitive";
import { formatPKRWhole } from "@/lib/format";
import type { UserDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const scope = await forUser(session.userId);
  const db = await getDb();
  const [accounts, categoryCount, people, user] = await Promise.all([
    scope.accounts.find({ archived: { $ne: true } }).toArray(),
    scope.categories.countDocuments({}),
    scope.people.countDocuments({}),
    db.collection<UserDoc>("users").findOne({ _id: scope.userId }),
  ]);

  // Same rule as the dashboard's net worth — an account the user has taken out
  // of their total must not quietly reappear in a different total.
  const counted = accounts.filter((a) => !a.exclude_from_total);
  const totalBalance = counted.reduce((sum, a) => sum + a.balance, 0);
  const excludedCount = accounts.length - counted.length;

  return (
    <>
      <TopBar title="Settings" eyebrow={session.email} />
      <main className="mx-auto max-w-md px-4 pb-6 pt-6">
        <section>
          <h2 className="t-micro mb-3 text-fg-faint">Overview</h2>
          <div className="divide-y divide-rule-soft rounded-chip border border-rule">
            <StatRow
              Icon={Wallet}
              label="Accounts"
              value={
                <>
                  {accounts.length} · <Sensitive>{formatPKRWhole(totalBalance)}</Sensitive>
                </>
              }
              note={excludedCount > 0 ? `${excludedCount} not counted toward net worth` : undefined}
            />
            <StatRow Icon={FolderTree} label="Categories" value={String(categoryCount)} />
            <StatRow Icon={Users} label="People (loans)" value={String(people)} />
          </div>
        </section>

        {/* One list, one visual language — Theme, privacy and the net-worth
            switches used to each sit in their own separate bordered box under
            their own header, which read as three disconnected settings pages
            stacked together rather than one. A single divide-y container
            (matching Overview's own rows) reads as one coherent screen; a
            <Fragment> from NetWorthPrefsToggle still lines up in the same
            divide-y sequence since it adds no DOM wrapper of its own. */}
        <section className="mt-8">
          <h2 className="t-micro mb-3 text-fg-faint">Preferences</h2>
          <div className="divide-y divide-rule-soft rounded-chip border border-rule">
            <div className="flex items-start gap-3 px-4 py-3">
              <Palette size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="t-body">Theme</div>
                <div className="t-label text-fg-muted">
                  <ThemeStateLabel />
                </div>
              </div>
              <ThemeToggle />
            </div>
            <AccentPicker />
            <TextSizePicker />
            <HideBalancesToggle />
            <NetWorthPrefsToggle
              loansInitial={user?.count_loans_in_net_worth ?? true}
              investmentsInitial={user?.count_investments_in_net_worth ?? true}
            />
          </div>
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
  note,
}: {
  Icon: typeof Wallet;
  label: string;
  value: React.ReactNode;
  /** A second, full-width line below the row — e.g. "N not counted toward net
   *  worth". Previously that clause lived inside `value` itself, sharing one
   *  line with the icon and label at `items-center`: on a real account (7
   *  accounts, an actual PKR total, plus the note) the combined string was
   *  long enough to wrap, and centering against a now-two-line value put the
   *  icon in the middle of nowhere and "counted" alone on its own line. */
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon size={16} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
        <span className="t-body flex-1 truncate">{label}</span>
        <span className="tnum shrink-0 whitespace-nowrap font-num text-[13px] text-fg-muted">
          {value}
        </span>
      </div>
      {note ? <div className="t-micro pl-7 text-fg-faint">{note}</div> : null}
    </div>
  );
}
