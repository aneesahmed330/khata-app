import Link from "next/link";
import { Mic, Plus } from "lucide-react";

// Empty states give direction, not mood (DESIGN.md §9). The previous version
// left a line of muted text floating in ~60% dead space; this is a contained,
// self-explanatory block with the actual next action in it.
export function EmptyLedger() {
  return (
    <div className="anim-rise flex flex-col items-center rounded-chip border border-dashed border-rule px-6 py-10 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-rule text-fg-faint">
        <Mic size={18} strokeWidth={1.75} aria-hidden />
      </div>

      <p className="t-body max-w-[260px] text-fg-muted">
        No entries yet. Speak or type — like{" "}
        <span className="text-fg">&ldquo;200 on petrol today&rdquo;</span>.
      </p>

      <Link
        href="/add"
        className="mt-5 inline-flex items-center gap-2 rounded-chip bg-accent px-4 py-2.5 text-[14px] font-medium text-on-accent transition-transform duration-150 active:scale-95"
      >
        <Plus size={16} strokeWidth={2.5} aria-hidden />
        Add first entry
      </Link>
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-chip border border-dashed border-rule px-4 py-8 text-center">
      <p className="t-body text-fg-muted">{children}</p>
    </div>
  );
}
