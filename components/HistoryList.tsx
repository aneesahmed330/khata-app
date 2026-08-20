"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DateRule } from "./DateRule";
import { LedgerRow } from "./LedgerRow";
import { formatPKR } from "@/lib/format";
import type { DayGroup } from "@/lib/ledger-view";

/** The last group of an already-loaded page and the first group of a newly
 *  fetched page are often the same day (the page boundary fell mid-day) —
 *  merge them so "Today" doesn't render twice back to back. */
function mergeGroups(existing: DayGroup[], incoming: DayGroup[]): DayGroup[] {
  if (incoming.length === 0) return existing;
  const [first, ...rest] = incoming;
  const last = existing[existing.length - 1];
  if (last && first && last.label === first.label) {
    return [
      ...existing.slice(0, -1),
      { label: last.label, rows: [...last.rows, ...first.rows], outflow: last.outflow + first.outflow },
      ...rest,
    ];
  }
  return [...existing, ...incoming];
}

export function HistoryList({
  initialGroups,
  initialNextCursor,
  from,
  to,
  q,
  types,
  accountIds,
  sort,
}: {
  initialGroups: DayGroup[];
  initialNextCursor: string | null;
  from?: string;
  to?: string;
  q?: string;
  types?: string;
  accountIds?: string;
  sort?: "asc" | "desc";
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const nowRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    nowRef.current ??= new Date().toISOString(); // fixed for this session's scroll — "Today" shouldn't flip mid-list

    try {
      const params = new URLSearchParams({ cursor: nextCursor, now: nowRef.current });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (q) params.set("q", q);
      if (types) params.set("types", types);
      if (accountIds) params.set("accounts", accountIds);
      if (sort === "asc") params.set("sort", "asc");
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { groups: DayGroup[]; nextCursor: string | null };
      setGroups((g) => mergeGroups(g, data.groups));
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading, from, to, q, types, accountIds, sort]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" }, // start fetching well before the user hits bottom
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <>
      {groups.map((group, i) => (
        <div key={`${group.label}-${group.rows[0]?.id ?? i}`}>
          <DateRule
            label={group.label}
            total={group.outflow > 0 ? `−${formatPKR(group.outflow)}` : undefined}
          />
          {group.rows.map((row) => (
            <LedgerRow key={row.id} row={row} redirectTo="/history" />
          ))}
        </div>
      ))}

      {nextCursor ? (
        <div ref={sentinelRef} className="py-6 text-center">
          {loading ? <span className="t-label text-fg-faint">Loading…</span> : null}
        </div>
      ) : groups.length > 0 ? (
        <p className="t-label py-6 text-center text-fg-faint">That&apos;s everything.</p>
      ) : null}
    </>
  );
}
