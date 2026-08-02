"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";
import { formatPKRWhole } from "@/lib/format";
import { Sensitive } from "@/components/Sensitive";

export interface RankItem {
  name: string;
  total: number;
}

export interface RankChild {
  id: string;
  name: string;
  total: number;
  /** Individual `item` names behind this child's total, current period only —
   *  see RankRow.items for why this exists one level deeper too. */
  items?: RankItem[];
}

export interface RankRow {
  id: string;
  name: string;
  total: number;
  /** Signed % vs the previous comparable period; null when there's no baseline. */
  deltaPct: number | null;
  /** Sub-categories behind this total, current period only — a root category
   *  is one aggregated number, and "Bills 8,750" alone doesn't say whether
   *  that's mostly electricity or mostly gas. Absent (not empty) for a root
   *  with no children of its own, which stays unexpandable rather than
   *  showing a dead-end arrow. */
  children?: RankChild[];
  /** Individual `item` names spent directly under this root, current period
   *  only — only ever set when `children` is absent. "Groceries 4,840" is a
   *  category total, not an answer to "which items" — that question needs
   *  the actual item names (Milk, Onion, Tomatoes...) one level below
   *  whichever node is the true leaf, root or child. */
  items?: RankItem[];
}

/** Ranked magnitude — ONE hue, length is the only variable. A colour per
 *  category would be answering "which category is this", but the question a
 *  ranking asks is "how much", which is magnitude's job.
 *
 *  Bars share a scale anchored to the largest row, so lengths are comparable
 *  across rows; share-of-total and the vs-last-period delta ride alongside as
 *  text, since neither is encoded in the length. Tapping a row with children
 *  expands its sub-categories inline, scaled against THAT row's own total
 *  (not the page max) — the question at that point is "what's driving Bills,"
 *  not "how does Bills' plumbing bill compare to my rent." */
export function RankBars({ rows, total }: { rows: RankRow[]; total: number }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div>
      {rows.map((row, i) => {
        const share = total > 0 ? (row.total / total) * 100 : 0;
        const widthPct = Math.max((row.total / max) * 100, 1.5);
        const hasChildren = Boolean(row.children && row.children.length > 0);
        const hasOwnItems = Boolean(row.items && row.items.length > 0);
        const canExpand = hasChildren || hasOwnItems;
        const isOpen = expanded === row.id;

        return (
          <div
            key={row.id}
            style={{ "--i": i } as React.CSSProperties}
            className={clsx("anim-stagger py-2.5", i > 0 && "border-t border-rule-soft")}
          >
            <button
              type="button"
              onClick={() => canExpand && setExpanded(isOpen ? null : row.id)}
              disabled={!canExpand}
              className={clsx(
                "flex w-full items-baseline justify-between gap-3 text-left",
                !canExpand && "cursor-default",
              )}
            >
              <span className="flex min-w-0 flex-1 items-center gap-1">
                {canExpand ? (
                  <ChevronRight
                    size={13}
                    strokeWidth={2}
                    className={clsx(
                      "shrink-0 text-fg-faint transition-transform duration-200",
                      isOpen && "rotate-90",
                    )}
                    aria-hidden
                  />
                ) : null}
                <span className="t-body min-w-0 truncate">{row.name}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2.5">
                {row.deltaPct !== null && Math.round(row.deltaPct) !== 0 ? (
                  <span
                    className={clsx(
                      "tnum text-[11px]",
                      row.deltaPct > 0 ? "text-out" : "text-in",
                    )}
                  >
                    {row.deltaPct > 0 ? "+" : "−"}
                    {Math.abs(Math.round(row.deltaPct))}%
                  </span>
                ) : null}
                <span className="tnum text-[11px] text-fg-faint">{Math.round(share)}%</span>
                <span className="tnum font-num text-[14px]">
                  <Sensitive>{formatPKRWhole(row.total)}</Sensitive>
                </span>
              </span>
            </button>

            {/* square baseline, 4px rounded data-end, grows in on mount */}
            <div className="mt-1.5 h-1.5 w-full bg-rule-soft">
              <div
                className="anim-bar-grow h-1.5 rounded-r-[4px] bg-chart-mag"
                style={{ "--bar-w": `${widthPct}%` } as React.CSSProperties}
              />
            </div>

            {isOpen && hasChildren ? (
              <div className="anim-rise mt-3 flex flex-col gap-2.5 border-l border-rule-soft pl-3">
                {row.children!
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map((child) => (
                    <ChildRow key={child.id} child={child} parentTotal={row.total} />
                  ))}
              </div>
            ) : isOpen && hasOwnItems ? (
              <div className="anim-rise mt-3 border-l border-rule-soft pl-3">
                <ItemRows items={row.items!} parentTotal={row.total} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** A category child (e.g. "Groceries" under "Food") — same mini-bar-row as
 *  before, plus its own expand for the individual items behind it, since
 *  "Groceries 4,840" doesn't say whether that's milk or onions. */
function ChildRow({ child, parentTotal }: { child: RankChild; parentTotal: number }) {
  const [open, setOpen] = useState(false);
  const hasItems = Boolean(child.items && child.items.length > 0);
  const childShare = parentTotal > 0 ? (child.total / parentTotal) * 100 : 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasItems && setOpen((v) => !v)}
        disabled={!hasItems}
        className={clsx("mb-1 flex w-full items-baseline justify-between gap-3 text-left", !hasItems && "cursor-default")}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1">
          {hasItems ? (
            <ChevronRight
              size={11}
              strokeWidth={2}
              className={clsx(
                "shrink-0 text-fg-faint transition-transform duration-200",
                open && "rotate-90",
              )}
              aria-hidden
            />
          ) : null}
          <span className="t-label min-w-0 flex-1 truncate text-fg-muted">{child.name}</span>
        </span>
        <span className="flex shrink-0 items-baseline gap-2">
          <span className="tnum text-[10px] text-fg-faint">{Math.round(childShare)}%</span>
          <span className="tnum font-num text-[12px] text-fg-muted">
            <Sensitive>{formatPKRWhole(child.total)}</Sensitive>
          </span>
        </span>
      </button>
      <div className="h-1 w-full bg-rule-soft">
        <div
          className="h-1 rounded-r-[3px] bg-chart-mag opacity-60"
          style={{ width: `${Math.max(childShare, 2)}%` }}
        />
      </div>
      {open && hasItems ? (
        <div className="anim-rise mt-2.5 border-l border-rule-soft pl-3">
          <ItemRows items={child.items!} parentTotal={child.total} />
        </div>
      ) : null}
    </div>
  );
}

/** The deepest level — actual item names ("Milk", "Onions", "Ginger"), the
 *  answer to "what specifically was this spent on" that a category total
 *  alone can never give. No further expand: an item is always the leaf. */
function ItemRows({ items, parentTotal }: { items: RankItem[]; parentTotal: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items
        .slice()
        .sort((a, b) => b.total - a.total)
        .map((item) => {
          const share = parentTotal > 0 ? (item.total / parentTotal) * 100 : 0;
          return (
            <div key={item.name} className="flex items-baseline justify-between gap-3">
              <span className="t-label min-w-0 flex-1 truncate text-[11px] text-fg-faint">
                {item.name}
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="tnum text-[10px] text-fg-faint">{Math.round(share)}%</span>
                <span className="tnum font-num text-[11px] text-fg-faint">
                  <Sensitive>{formatPKRWhole(item.total)}</Sensitive>
                </span>
              </span>
            </div>
          );
        })}
    </div>
  );
}
