import clsx from "clsx";

// Loading.tsx fallbacks are pure static markup — no data, no client JS. They
// exist because every (app) route is force-dynamic (fresh DB round-trip on
// every navigation), so without a Suspense fallback a bottom-nav tap does
// nothing visible until the server responds. animate-pulse already respects
// the app's global prefers-reduced-motion override in globals.css.
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-[4px] bg-rule-soft", className)} />;
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 border-b border-rule-soft py-2.5">
      <SkeletonBlock className="size-[15px] shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <SkeletonBlock className="h-[15px] w-2/5" />
        <SkeletonBlock className="h-[13px] w-1/3" />
      </div>
      <SkeletonBlock className="h-[17px] w-14 shrink-0" />
    </div>
  );
}
