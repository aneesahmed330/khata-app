"use client";

import { useState } from "react";
import { HandCoins, LineChart } from "lucide-react";
import { setNetWorthPrefAction } from "@/actions/settings";
import { Switch } from "@/components/Switch";

type Category = "loans" | "investments";

/** Two bare rows (no own border) — rendered inside Settings' shared
 *  "Preferences" list. A Fragment doesn't add a DOM wrapper, so the parent's
 *  divide-y still draws a hairline between these and their neighbours exactly
 *  as if they were written inline.
 *
 *  Each is the OUTER layer: off zeroes the whole category everywhere (Home,
 *  /loans, /investments) regardless of any individual loan/holding's own
 *  "leave out of net worth" toggle, which sits underneath this and can only
 *  narrow further — it never turns a category this switch closed back on. */
export function NetWorthPrefsToggle({
  loansInitial,
  investmentsInitial,
}: {
  loansInitial: boolean;
  investmentsInitial: boolean;
}) {
  return (
    <>
      <Row
        category="loans"
        initial={loansInitial}
        Icon={HandCoins}
        title="Count loans"
        description="Money lent or borrowed counts toward your total assets."
      />
      <Row
        category="investments"
        initial={investmentsInitial}
        Icon={LineChart}
        title="Count investments"
        description="Stocks, gold and other holdings count toward your total assets."
      />
    </>
  );
}

function Row({
  category,
  initial,
  Icon,
  title,
  description,
}: {
  category: Category;
  initial: boolean;
  Icon: typeof HandCoins;
  title: string;
  description: string;
}) {
  const [checked, setChecked] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !checked;
    setChecked(next);
    setError(null);

    const body = new FormData();
    body.set("category", category);
    body.set("value", String(next));

    const result = await setNetWorthPrefAction(undefined, body);
    if (result?.error) {
      setChecked(!next);
      setError(result.error);
    }
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="t-body">{title}</div>
        <div className="t-label text-fg-muted">{description}</div>
        {error ? <div className="t-label mt-1 text-out">{error}</div> : null}
      </div>
      <Switch checked={checked} onChange={() => void toggle()} label={title} />
    </div>
  );
}
