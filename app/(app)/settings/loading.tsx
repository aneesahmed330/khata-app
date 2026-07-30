import { SkeletonBlock } from "@/components/Skeleton";

export default function SettingsLoading() {
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
      <main className="mx-auto max-w-md px-4 pt-6">
        <SkeletonBlock className="mb-3 h-[11px] w-20" />
        <div className="divide-y divide-rule-soft rounded-chip border border-rule">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <SkeletonBlock className="size-4 shrink-0 rounded-full" />
              <SkeletonBlock className="h-[15px] flex-1" />
              <SkeletonBlock className="h-[13px] w-10 shrink-0" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
