import { formatPKR } from "@/lib/format";
import { Sensitive } from "@/components/Sensitive";
import clsx from "clsx";

type AmountSize = "balance" | "row" | "label";

const SIZE: Record<AmountSize, string> = {
  balance: "t-balance",
  row: "t-amount",
  label: "text-[13px] leading-none",
};

// The one place a PKR number is rendered (DESIGN.md §7.7). Direction is never
// encoded as color here — rows stay monochrome (§3); the caller passes a
// leading glyph instead, see LedgerRow.
export function Amount({
  value,
  size = "row",
  className,
  prefix,
}: {
  value: number;
  size?: AmountSize;
  className?: string;
  /** e.g. "-" for an outflow preview. Not a currency symbol — that's a separate label. */
  prefix?: string;
}) {
  return (
    <span
      className={clsx("tnum whitespace-nowrap", SIZE[size], size !== "balance" && "font-num", className)}
    >
      <Sensitive>
        {prefix}
        {formatPKR(value)}
      </Sensitive>
    </span>
  );
}
