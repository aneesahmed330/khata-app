// Ruled date divider — a khata's page break. Encodes real grouping
// information (which day), not decoration (DESIGN.md §5).
export function DateRule({ label, total }: { label: string; total?: string }) {
  return (
    <div className="flex items-center gap-3 pb-2 pt-5 first:pt-0">
      <span className="t-micro shrink-0 text-fg-faint">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-rule" />
      {total ? <span className="tnum font-num text-[11px] text-fg-faint">{total}</span> : null}
    </div>
  );
}

/** "Today" / "Yesterday" / falls back to a short date. */
export function relativeDateLabel(date: Date, now = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
