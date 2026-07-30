import { SkeletonBlock } from "@/components/Skeleton";

export default function ManualEntryLoading() {
  return (
    <main className="mx-auto max-w-md px-4">
      <div
        className="flex items-center justify-between pb-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
      >
        <div>
          <SkeletonBlock className="h-[11px] w-24" />
          <SkeletonBlock className="mt-1.5 h-5 w-28" />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i}>
            <SkeletonBlock className="mb-1.5 h-[11px] w-16" />
            <SkeletonBlock className="h-[52px] rounded-chip" />
          </div>
        ))}
      </div>
    </main>
  );
}
