"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ScrollText, HandCoins, LineChart, ChartNoAxesColumn, Settings2, Plus } from "lucide-react";
import clsx from "clsx";

const TABS = [
  { href: "/", label: "Home", Icon: House },
  { href: "/history", label: "History", Icon: ScrollText },
  { href: "/loans", label: "Loans", Icon: HandCoins },
  { href: "/investments", label: "Invest", Icon: LineChart },
  { href: "/insights", label: "Insights", Icon: ChartNoAxesColumn },
  { href: "/settings", label: "Settings", Icon: Settings2 },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Seven slots: three tabs, the Add action, three tabs (DESIGN.md §5's original
// two-and-two, widened to keep the FAB centered once Loans/Invest joined).
// Active state is a 2px accent rule along the tab's top edge — the same
// hairline language the ledger uses, rather than a pill or a shadow (§7.4).
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-surface-lift safe-b"
    >
      <div className="mx-auto grid max-w-md grid-cols-7 items-stretch">
        {TABS.slice(0, 3).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
        ))}

        <div className="relative">
          <Link
            href="/add"
            aria-label="Add entry"
            className={clsx(
              "absolute left-1/2 top-0 flex size-14 -translate-x-1/2 -translate-y-5 items-center justify-center",
              "rounded-full bg-accent text-on-accent ring-4 ring-surface-lift",
              "transition-transform duration-150 ease-out active:scale-90",
            )}
          >
            <Plus size={26} strokeWidth={2.5} aria-hidden />
          </Link>
        </div>

        {TABS.slice(3).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
        ))}
      </div>
    </nav>
  );
}

function Tab({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: typeof House;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "relative flex min-h-[56px] flex-col items-center justify-center gap-1 transition-colors duration-200",
        active ? "text-accent-text" : "text-fg-faint",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent-text"
        />
      ) : null}
      <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
      <span className="text-[10px] tracking-[0.03em]">{label}</span>
    </Link>
  );
}
