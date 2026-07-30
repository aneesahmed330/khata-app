import { ArrowDown, ArrowUp } from "lucide-react";
import { formatPKR } from "@/lib/format";

// A single-number form — a stat tile, not a chart (DESIGN.md §11.1). Colour is
// allowed here because this is summary/state, which is one of the three places
// §3 permits it; per-row identity stays monochrome.
export function StatPair({
  outLabel,
  outValue,
  inLabel,
  inValue,
}: {
  outLabel: string;
  outValue: number;
  inLabel: string;
  inValue: number;
}) {
  return (
    <div className="grid grid-cols-2 divide-x divide-rule overflow-hidden rounded-chip border border-rule">
      <Tile Icon={ArrowDown} label={outLabel} value={outValue} tone="text-out" />
      <Tile Icon={ArrowUp} label={inLabel} value={inValue} tone="text-in" />
    </div>
  );
}

function Tile({
  Icon,
  label,
  value,
  tone,
}: {
  Icon: typeof ArrowDown;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Icon size={12} strokeWidth={2} className={`shrink-0 ${tone}`} aria-hidden />
        <span className="t-micro text-fg-faint">{label}</span>
      </div>
      <span className="tnum truncate font-num text-[17px] leading-none">{formatPKR(value)}</span>
    </div>
  );
}
