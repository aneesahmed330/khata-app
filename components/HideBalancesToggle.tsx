"use client";

import { useHideBalances } from "@/lib/use-hide-balances";
import { Switch } from "@/components/Switch";

export function HideBalancesToggle() {
  const [hidden, toggle] = useHideBalances();
  return (
    <div className="flex items-center justify-between rounded-chip border border-rule px-4 py-3">
      <div>
        <div className="t-body">Hide balances</div>
        <div className="t-label text-fg-muted">Masks amounts across the app</div>
      </div>
      <Switch checked={hidden} onChange={toggle} label="Hide balances" />
    </div>
  );
}
