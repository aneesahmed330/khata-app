import { SkeletonBlock } from "@/components/Skeleton";

export default function InsightsLoading() {
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
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-6 pt-5">
        <div className="flex flex-col gap-3 rounded-chip border border-rule bg-surface-lift p-4">
          <SkeletonBlock className="h-[28px] w-32" />
          <SkeletonBlock className="h-14 rounded-chip" />
        </div>
        <div className="rounded-chip border border-rule bg-surface-lift p-4">
          <SkeletonBlock className="mb-3 h-[15px] w-28" />
          <SkeletonBlock className="h-[160px]" />
        </div>
        <div className="rounded-chip border border-rule bg-surface-lift p-4">
          <SkeletonBlock className="mb-3 h-[15px] w-24" />
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonBlock key={i} className="mb-2 h-8" />
          ))}
        </div>
      </main>
    </>
  );
}
