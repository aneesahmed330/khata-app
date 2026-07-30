import { formatPKR } from "@/lib/format";
import clsx from "clsx";

export interface AccountSummary {
  id: string;
  name: string;
  balance: number;
  type?: string;
}

// A contained 2-column grid — replaces the old horizontal-scroll strip, which
// always clipped the last card at the viewport edge (looked like an unfinished,
// "floating" row rather than a complete list of accounts). Everything fits the
// viewport width; nothing scrolls off-screen.
export function AccountGrid({ accounts }: { accounts: AccountSummary[] }) {
  if (accounts.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {accounts.map((a, i) => {
        const isTrailingOdd = i === accounts.length - 1 && accounts.length % 2 === 1;
        return (
          <div
            key={a.id}
            className={clsx(
              "anim-rise flex flex-col gap-1 rounded-chip border border-rule bg-surface-lift px-3 py-2.5",
              isTrailingOdd && "col-span-2",
            )}
            style={{ animationDelay: `${Math.min(i, 5) * 40}ms` }}
          >
            <span className="truncate text-[11px] text-fg-muted">{a.name}</span>
            <span
              className={clsx(
                "tnum font-num text-[15px] leading-none",
                a.balance < 0 && "text-out",
              )}
            >
              {formatPKR(a.balance)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
