import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** The one section-header device, reused on every dashboard section: a micro
 *  uppercase label, a hairline running to the right edge, and an optional
 *  count or link. It deliberately borrows DateRule's grammar (label + rule)
 *  so a section break and a day break read as the same system, one page apart.
 *
 *  The rule carries information: it's what tells you the label above belongs
 *  to everything below it until the next one. */
export function SectionHead({
  label,
  meta,
  href,
  hrefLabel = "View all",
}: {
  label: string;
  meta?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <span className="t-micro shrink-0 text-fg-faint">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-rule" />
      {meta ? <span className="t-micro shrink-0 tabular-nums text-fg-faint">{meta}</span> : null}
      {href ? (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-0.5 text-[12px] text-fg-muted transition-colors hover:text-fg"
        >
          {hrefLabel}
          <ChevronRight size={13} strokeWidth={2} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
