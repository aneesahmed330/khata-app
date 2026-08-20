"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  X,
  Search,
  SlidersHorizontal,
  WalletCards,
  Check,
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
} from "lucide-react";
import clsx from "clsx";
import type { TxnType } from "@/lib/types";

export interface HistoryRange {
  from?: string;
  to?: string;
}

export interface AccountOption {
  id: string;
  name: string;
}

type SortDir = "asc" | "desc";

/** Groups mirror KhataMobile's HistoryScreen.tsx TYPE_FILTER_GROUPS exactly —
 *  "Loans" is one filter even though it spans four raw TxnTypes, so the web
 *  and mobile filter sheets read as the same feature. */
interface TypeFilterGroup {
  key: string;
  label: string;
  types: TxnType[];
}
const TYPE_FILTER_GROUPS: TypeFilterGroup[] = [
  { key: "expense", label: "Expense", types: ["expense"] },
  { key: "income", label: "Income", types: ["income"] },
  { key: "transfer", label: "Transfer", types: ["transfer"] },
  {
    key: "loans",
    label: "Loans",
    types: ["loan_given", "loan_taken", "repayment_in", "repayment_out"],
  },
  {
    key: "investments",
    label: "Investments",
    types: ["investment_buy", "investment_sell", "dividend"],
  },
  { key: "adjustment", label: "Adjustments", types: ["adjustment"] },
];
const ALL_TYPE_KEYS = TYPE_FILTER_GROUPS.map((g) => g.key);
// Not a real TxnType — an $in filter against this never matches a row, which
// is how "nothing selected" becomes "show nothing" without a second query
// shape on the backend.
const NONE_SENTINEL = "__none__";

const PRESETS = [
  { key: "all", label: "All" },
  { key: "30d", label: "30d" },
  { key: "month", label: "Month" },
  { key: "last", label: "Last" },
] as const;

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presetRange(key: (typeof PRESETS)[number]["key"]): HistoryRange {
  const now = new Date();
  switch (key) {
    case "30d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: isoDay(from), to: isoDay(now) };
    }
    case "month":
      return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
    case "last": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: isoDay(first), to: isoDay(last) };
    }
    default:
      return {};
  }
}

function activeRangeKey(range: HistoryRange): string | null {
  if (!range.from && !range.to) return "all";
  for (const p of PRESETS) {
    if (p.key === "all") continue;
    const r = presetRange(p.key);
    if (r.from === range.from && r.to === range.to) return p.key;
  }
  return null;
}

/** Hook for both dropdown panels — closes whichever is open on an outside
 *  click, so only one ref/listener pair is needed instead of one per menu. */
function useCloseOnOutsideClick(refs: React.RefObject<HTMLElement>[], onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [refs, onClose]);
}

const MENU_PANEL_CLASS =
  "absolute right-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-chip border border-rule bg-surface-lift py-1.5 shadow-lg";
const MENU_ROW_CLASS =
  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-surface";
const BAR_BUTTON_CLASS =
  "flex size-9 shrink-0 items-center justify-center rounded-chip border border-rule bg-surface-lift text-fg-muted transition-colors hover:text-fg";

/** Combines the date-range presets (ported from the old HistoryFilter) with
 *  the search/type/account/sort controls KhataMobile's HistoryScreen already
 *  has — one component so every control writes the SAME URLSearchParams
 *  instead of two independent `router.push` calls clobbering each other. */
export function HistoryControls({
  range,
  q: initialQ,
  types: initialTypes,
  accountIds: initialAccountIds,
  sort: initialSort,
  accounts,
}: {
  range: HistoryRange;
  q?: string;
  types?: string;
  accountIds?: string;
  sort?: SortDir;
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const activeKey = activeRangeKey(range);
  const [showCustom, setShowCustom] = useState(activeKey === null);
  const [searchInput, setSearchInput] = useState(initialQ ?? "");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const sortDir: SortDir = initialSort === "asc" ? "asc" : "desc";

  useCloseOnOutsideClick([typeMenuRef, accountMenuRef], () => {
    setTypeMenuOpen(false);
    setAccountMenuOpen(false);
  });

  const selectedTypeKeys = useMemo(() => {
    if (!initialTypes) return new Set(ALL_TYPE_KEYS);
    const raw = new Set(initialTypes.split(","));
    return new Set(TYPE_FILTER_GROUPS.filter((g) => g.types.some((t) => raw.has(t))).map((g) => g.key));
  }, [initialTypes]);
  const allTypesSelected = selectedTypeKeys.size === ALL_TYPE_KEYS.length;
  const noTypesSelected = selectedTypeKeys.size === 0;

  const selectedAccountIds = useMemo(
    () => new Set(initialAccountIds ? initialAccountIds.split(",").filter(Boolean) : []),
    [initialAccountIds],
  );

  function pushState(overrides: {
    from?: string;
    to?: string;
    q?: string;
    types?: string;
    accounts?: string;
    sort?: SortDir;
  }) {
    const state = {
      from: range.from,
      to: range.to,
      q: initialQ,
      types: initialTypes,
      accounts: initialAccountIds,
      sort: sortDir,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (state.from) params.set("from", state.from);
    if (state.to) params.set("to", state.to);
    if (state.q) params.set("q", state.q);
    if (state.types) params.set("types", state.types);
    if (state.accounts) params.set("accounts", state.accounts);
    if (state.sort === "asc") params.set("sort", "asc");
    const qs = params.toString();
    router.push(qs ? `/history?${qs}` : "/history");
  }

  useEffect(() => {
    searchDebounce.current = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== (initialQ ?? "")) pushState({ q: trimmed || undefined });
    }, 300);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function toggleType(key: string) {
    const base = allTypesSelected ? new Set<string>() : new Set(selectedTypeKeys);
    if (base.has(key)) base.delete(key);
    else base.add(key);
    const raw =
      base.size === 0
        ? NONE_SENTINEL
        : base.size === ALL_TYPE_KEYS.length
          ? undefined
          : TYPE_FILTER_GROUPS.filter((g) => base.has(g.key))
              .flatMap((g) => g.types)
              .join(",");
    pushState({ types: raw });
  }

  function toggleAccount(id: string) {
    const base = new Set(selectedAccountIds);
    if (base.has(id)) base.delete(id);
    else base.add(id);
    pushState({ accounts: base.size ? Array.from(base).join(",") : undefined });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-chip border border-rule bg-surface-lift px-3">
          <Search size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search entries…"
            aria-label="Search entries"
            className="t-label min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-faint"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="shrink-0 text-fg-faint transition-colors hover:text-fg"
            >
              <X size={13} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => pushState({ sort: sortDir === "desc" ? "asc" : "desc" })}
          aria-label={sortDir === "desc" ? "Sorted newest first — tap for oldest first" : "Sorted oldest first — tap for newest first"}
          className={clsx(BAR_BUTTON_CLASS, sortDir === "asc" && "border-accent text-accent-text")}
        >
          {sortDir === "desc" ? (
            <ArrowDownNarrowWide size={16} strokeWidth={2} />
          ) : (
            <ArrowUpNarrowWide size={16} strokeWidth={2} />
          )}
        </button>

        <div ref={typeMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setAccountMenuOpen(false);
              setTypeMenuOpen((v) => !v);
            }}
            aria-label="Filter by type"
            aria-expanded={typeMenuOpen}
            className={clsx(BAR_BUTTON_CLASS, "relative", !allTypesSelected && "border-accent text-accent-text")}
          >
            <SlidersHorizontal size={15} strokeWidth={2} />
            {!allTypesSelected ? (
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent" />
            ) : null}
          </button>
          {typeMenuOpen ? (
            <div className={MENU_PANEL_CLASS}>
              <p className="t-micro px-3 py-2 text-fg-faint">Show entry types</p>
              <button type="button" onClick={() => pushState({ types: undefined })} className={MENU_ROW_CLASS}>
                <span className="t-label text-fg">All types</span>
                {allTypesSelected ? <Check size={14} strokeWidth={2.5} className="text-accent-text" /> : null}
              </button>
              {TYPE_FILTER_GROUPS.map((g) => {
                const checked = !allTypesSelected && selectedTypeKeys.has(g.key);
                return (
                  <button key={g.key} type="button" onClick={() => toggleType(g.key)} className={MENU_ROW_CLASS}>
                    <span className="t-label text-fg">{g.label}</span>
                    {checked ? <Check size={14} strokeWidth={2.5} className="text-accent-text" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div ref={accountMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setTypeMenuOpen(false);
              setAccountMenuOpen((v) => !v);
            }}
            aria-label="Filter by account"
            aria-expanded={accountMenuOpen}
            className={clsx(BAR_BUTTON_CLASS, "relative", selectedAccountIds.size > 0 && "border-accent text-accent-text")}
          >
            <WalletCards size={15} strokeWidth={2} />
            {selectedAccountIds.size > 0 ? (
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent" />
            ) : null}
          </button>
          {accountMenuOpen ? (
            <div className={MENU_PANEL_CLASS}>
              <p className="t-micro px-3 py-2 text-fg-faint">Filter by account</p>
              <button
                type="button"
                onClick={() => pushState({ accounts: undefined })}
                className={MENU_ROW_CLASS}
              >
                <span className="t-label text-fg">All accounts</span>
                {selectedAccountIds.size === 0 ? <Check size={14} strokeWidth={2.5} className="text-accent-text" /> : null}
              </button>
              {accounts.map((a) => {
                const checked = selectedAccountIds.has(a.id);
                return (
                  <button key={a.id} type="button" onClick={() => toggleAccount(a.id)} className={MENU_ROW_CLASS}>
                    <span className="t-label truncate text-fg">{a.name}</span>
                    {checked ? <Check size={14} strokeWidth={2.5} className="shrink-0 text-accent-text" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {noTypesSelected ? (
        <p className="t-label rounded-chip border border-rule-soft bg-surface-lift px-3 py-2 text-fg-faint">
          No entry types selected — nothing will show below.
        </p>
      ) : null}

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setShowCustom(false);
              pushState(presetRange(p.key));
            }}
            className={clsx(
              "shrink-0 rounded-chip border px-3 py-1.5 text-[13px] transition-colors",
              activeKey === p.key
                ? "border-accent bg-accent text-on-accent"
                : "border-rule bg-surface-lift text-fg-muted hover:text-fg",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          aria-expanded={showCustom}
          className={clsx(
            "flex shrink-0 items-center gap-1.5 rounded-chip border px-3 py-1.5 text-[13px] transition-colors",
            activeKey === null
              ? "border-accent bg-accent text-on-accent"
              : "border-rule bg-surface-lift text-fg-muted hover:text-fg",
          )}
        >
          <CalendarRange size={13} strokeWidth={1.75} aria-hidden />
          Range
        </button>
      </div>

      {showCustom ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const from = (form.elements.namedItem("from") as HTMLInputElement).value;
            const to = (form.elements.namedItem("to") as HTMLInputElement).value;
            pushState({ from: from || undefined, to: to || undefined });
          }}
          className="anim-rise flex flex-col gap-2 rounded-chip border border-rule bg-surface-lift p-3"
        >
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="t-micro mb-1 block text-fg-faint">From</span>
              <input
                type="date"
                name="from"
                defaultValue={range.from ?? ""}
                className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-2.5 py-2 font-num text-[13px] text-fg outline-none focus:border-accent"
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="t-micro mb-1 block text-fg-faint">To</span>
              <input
                type="date"
                name="to"
                defaultValue={range.to ?? ""}
                className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-2.5 py-2 font-num text-[13px] text-fg outline-none focus:border-accent"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-chip bg-accent py-2 text-[13px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98]"
            >
              Apply range
            </button>
            {range.from || range.to ? (
              <button
                type="button"
                onClick={() => {
                  setShowCustom(false);
                  pushState({ from: undefined, to: undefined });
                }}
                aria-label="Clear range"
                className="flex size-[34px] shrink-0 items-center justify-center rounded-chip border border-rule text-fg-muted transition-colors hover:text-fg"
              >
                <X size={14} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
