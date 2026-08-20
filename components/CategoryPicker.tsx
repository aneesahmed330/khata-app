"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { normalizeName } from "@/lib/taxonomy";

export interface CategoryOption {
  id: string;
  name: string;
  type: "expense" | "income";
  /** Absent for a root. */
  parentName?: string;
  /** Commit count — how often this one actually gets used. */
  usageCount?: number;
}

/** How many "most used" shortcuts sit above the tree. Small on purpose: the
 *  point of the shortcut row is that the answer is usually already in it, and
 *  a 10-chip row is just the flat list again with extra steps. */
const SUGGESTED_COUNT = 4;

/** Category picker for the "what category is this?" confirmation.
 *
 *  The previous version rendered every category as a flat chip row — with a
 *  ~65-leaf seed tree that's a wall of 65 chips in no order, which is worse
 *  than no picker: you can't scan it, the parent context is stuck in
 *  parentheses, and the one you want is usually off-screen. Three things fix
 *  that, in the order a person actually reaches for them:
 *
 *    1. Most-used shortcuts — the answer for the overwhelming majority of
 *       entries, one tap, no scrolling. Ranked by real commit count.
 *    2. Search — for when you know the name. Matches the child AND its
 *       parent, so "food" surfaces every Food leaf.
 *    3. The tree itself, collapsed to roots. A root is a real answer too (a
 *       tap on the root row picks it), so the drill-down is optional rather
 *       than mandatory scrolling.
 *
 *  Roots stay visible while searching — collapsing is only for the idle
 *  state, since a search that hides its own matches behind a chevron is
 *  pointless. */
export function CategoryPicker({
  categories,
  onPick,
}: {
  categories: CategoryOption[];
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [openRoot, setOpenRoot] = useState<string | null>(null);

  const roots = useMemo(() => categories.filter((c) => !c.parentName), [categories]);

  const childrenByRoot = useMemo(() => {
    const map = new Map<string, CategoryOption[]>();
    for (const c of categories) {
      if (!c.parentName) continue;
      const list = map.get(c.parentName) ?? [];
      list.push(c);
      map.set(c.parentName, list);
    }
    return map;
  }, [categories]);

  const suggested = useMemo(
    () =>
      categories
        .filter((c) => (c.usageCount ?? 0) > 0)
        .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
        .slice(0, SUGGESTED_COUNT),
    [categories],
  );

  // A leaf matches on its own name or its parent's, so "transport" lists every
  // Transport child even though none of them contain that word.
  const matches = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return null;
    return categories.filter(
      (c) =>
        normalizeName(c.name).includes(q) ||
        (c.parentName ? normalizeName(c.parentName).includes(q) : false),
    );
  }, [categories, query]);

  return (
    <div className="rounded-chip border border-rule bg-surface-lift">
      {suggested.length > 0 && !query ? (
        <div className="border-b border-rule-soft p-3">
          <p className="t-micro mb-2 text-fg-faint">Most used</p>
          <div className="flex flex-wrap gap-1.5">
            {suggested.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c.id)}
                className="anim-stamp rounded-chip border border-rule bg-surface-sunk px-3 py-1.5 text-[13px] text-fg transition-transform duration-150 hover:border-fg-faint active:scale-95"
              >
                {c.name}
                {c.parentName ? (
                  <span className="text-fg-faint"> · {c.parentName}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-b border-rule-soft px-3 py-2.5">
        <Search size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories…"
          aria-label="Search categories"
          className="t-label min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-faint"
        />
      </div>

      {/* Capped height with its own scroll — the sheet below must stay
          reachable no matter how many categories exist. */}
      <div className="max-h-[280px] overflow-y-auto overscroll-contain">
        {matches ? (
          matches.length === 0 ? (
            <p className="t-label px-3 py-6 text-center text-fg-faint">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          ) : (
            matches.map((c) => (
              <Row
                key={c.id}
                label={c.name}
                sub={c.parentName}
                onClick={() => onPick(c.id)}
              />
            ))
          )
        ) : roots.length === 0 ? (
          <p className="t-label px-3 py-6 text-center text-fg-faint">No categories yet.</p>
        ) : (
          roots.map((root) => {
            const kids = childrenByRoot.get(root.name) ?? [];
            const isOpen = openRoot === root.id;
            return (
              <div key={root.id} className="border-b border-rule-soft last:border-b-0">
                <div className="flex items-stretch">
                  {/* Split target: the row picks the root, the chevron opens
                      it. Tapping "Bills" to MEAN Bills shouldn't force you
                      through a submenu first. */}
                  <button
                    type="button"
                    onClick={() => onPick(root.id)}
                    className="t-label flex min-w-0 flex-1 items-center px-3 py-2.5 text-left text-fg transition-colors hover:bg-surface"
                  >
                    <span className="truncate">{root.name}</span>
                  </button>
                  {kids.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setOpenRoot(isOpen ? null : root.id)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Hide" : "Show"} ${root.name} subcategories`}
                      className="flex w-11 shrink-0 items-center justify-center text-fg-faint transition-colors hover:text-fg"
                    >
                      <ChevronRight
                        size={14}
                        strokeWidth={2}
                        className={clsx("transition-transform duration-200", isOpen && "rotate-90")}
                        aria-hidden
                      />
                    </button>
                  ) : null}
                </div>
                {isOpen
                  ? kids.map((kid) => (
                      <Row key={kid.id} label={kid.name} indent onClick={() => onPick(kid.id)} />
                    ))
                  : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  sub,
  indent,
  onClick,
}: {
  label: string;
  sub?: string;
  indent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2 border-b border-rule-soft px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface",
        indent && "pl-7",
      )}
    >
      <span className="t-label min-w-0 flex-1 truncate text-fg">{label}</span>
      {sub ? <span className="t-label shrink-0 text-fg-faint">{sub}</span> : null}
    </button>
  );
}
