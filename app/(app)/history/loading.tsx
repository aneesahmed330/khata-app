import { SkeletonBlock, SkeletonRow } from "@/components/Skeleton";

export default function HistoryLoading() {
  return (
    <>
      <header
        className="sticky top-0 z-20 border-b border-rule bg-surface/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-md items-center px-4">
          <SkeletonBlock className="h-5 w-20" />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pt-4">
        <div className="mb-2 flex items-baseline justify-between border-b border-rule pb-3">
          <SkeletonBlock className="h-[11px] w-20" />
          <SkeletonBlock className="h-[15px] w-16" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </main>
    </>
  );
}
