"use client";

import { EyeOff } from "lucide-react";
import { useHideBalances } from "@/lib/use-hide-balances";
import { Switch } from "@/components/Switch";

/** A bare row, not its own bordered box — it's meant to sit inside Settings'
 *  shared "Preferences" list alongside Theme and the net-worth switches, all
 *  sharing one divide-y container rather than each getting a separate box. */
export function HideBalancesToggle() {
  const [hidden, toggle] = useHideBalances();
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <EyeOff size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="t-body">Hide balances</div>
        <div className="t-label text-fg-muted">Masks amounts across the app</div>
      </div>
      <Switch checked={hidden} onChange={toggle} label="Hide balances" />
    </div>
  );
}
