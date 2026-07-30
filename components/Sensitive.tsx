"use client";

import { useHideBalances } from "@/lib/use-hide-balances";

// Wraps an already-formatted amount (children, not a raw number) so every
// call site that builds its own "-Rs 1,234.00"-style string can mask it
// without restructuring how that string gets built. The one client boundary
// for the whole privacy feature — everything importing this (Amount,
// AccountGrid, StatTile, Insights' numbers) stays a plain server component
// otherwise.
export function Sensitive({ children }: { children: React.ReactNode }) {
  const [hidden] = useHideBalances();
  if (hidden) return <span aria-label="Hidden">••••••</span>;
  return <>{children}</>;
}
