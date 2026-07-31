import Link from "next/link";

// Plain GET form — the browser does the navigation, History's server
// component re-fetches filtered. No client JS needed for filtering at all.
export function DateFilterBar({ from, to }: { from?: string; to?: string }) {
  const hasFilter = Boolean(from || to);

  return (
    <form action="/history" method="GET" className="mb-4 flex items-end gap-2">
      <label className="min-w-0 flex-1">
        <span className="t-micro mb-1 block text-fg-faint">From</span>
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="t-label w-full rounded-chip border border-rule bg-surface-sunk px-2.5 py-2 text-fg outline-none focus:border-fg-faint"
        />
      </label>
      <label className="min-w-0 flex-1">
        <span className="t-micro mb-1 block text-fg-faint">To</span>
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="t-label w-full rounded-chip border border-rule bg-surface-sunk px-2.5 py-2 text-fg outline-none focus:border-fg-faint"
        />
      </label>
      <button
        type="submit"
        className="shrink-0 rounded-chip bg-accent px-3.5 py-2 text-[13px] font-medium text-on-accent transition-transform duration-150 active:scale-95"
      >
        Go
      </button>
      {hasFilter ? (
        <Link
          href="/history"
          className="shrink-0 rounded-chip border border-rule px-3 py-2 text-[13px] text-fg-muted transition-colors hover:text-fg"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
