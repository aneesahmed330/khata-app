"use client";

import Link from "next/link";
import { EyeOff, MinusCircle, Landmark, Wallet, Smartphone } from "lucide-react";
import clsx from "clsx";
import { formatPKR } from "@/lib/format";
import { useHideBalances } from "@/lib/use-hide-balances";

export interface AccountSummary {
  id: string;
  name: string;
  balance: number;
  type?: string;
  /** Per-account mask, independent of the global privacy toggle. */
  hideBalance?: boolean;
  /** Balance doesn't count toward net worth. */
  excludeFromTotal?: boolean;
}

const ACCOUNT_ICONS: Record<string, typeof Landmark> = {
  bank: Landmark,
  cash: Wallet,
  wallet: Smartphone,
};

// A contained 2-column grid — replaces the old horizontal-scroll strip, which
// always clipped the last card at the viewport edge (looked like an unfinished,
// "floating" row rather than a complete list of accounts). Everything fits the
// viewport width; nothing scrolls off-screen.
export function AccountGrid({ accounts }: { accounts: AccountSummary[] }) {
  const [globallyHidden] = useHideBalances();
  if (accounts.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {accounts.map((a, i) => {
        const isTrailingOdd = i === accounts.length - 1 && accounts.length % 2 === 1;
        const masked = globallyHidden || a.hideBalance;
        // Negative-balance red is itself a signal — suppressed along with the
        // number so hiding balances doesn't leave "this one's overdrawn" visible.
        const negative = !masked && a.balance < 0;
        const Icon = a.type ? ACCOUNT_ICONS[a.type] : undefined;
        return (
          <Link
            key={a.id}
            href={`/accounts/${a.id}`}
            style={{ "--i": i } as React.CSSProperties}
            className={clsx(
              "anim-stagger flex flex-col gap-1 rounded-chip border bg-surface-lift px-3 py-2.5 transition-colors hover:border-fg-faint",
              // A dashed edge for "doesn't count" — the card is still fully
              // legible, it just stops looking like part of the total.
              a.excludeFromTotal ? "border-dashed border-rule" : "border-rule",
              isTrailingOdd && "col-span-2",
            )}
          >
            <span className="flex items-center gap-1 truncate text-[11px] text-fg-muted">
              {Icon ? (
                <Icon size={10} strokeWidth={2} className="shrink-0 text-fg-faint" aria-hidden />
              ) : null}
              <span className="truncate">{a.name}</span>
              {a.hideBalance ? (
                <EyeOff size={10} strokeWidth={2} className="shrink-0 text-fg-faint" aria-label="Balance hidden" />
              ) : null}
              {a.excludeFromTotal ? (
                <MinusCircle
                  size={10}
                  strokeWidth={2}
                  className="shrink-0 text-fg-faint"
                  aria-label="Not counted in net worth"
                />
              ) : null}
            </span>
            <span
              className={clsx("tnum font-num text-[15px] leading-none", negative && "text-out")}
            >
              {masked ? "••••••" : formatPKR(a.balance)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
