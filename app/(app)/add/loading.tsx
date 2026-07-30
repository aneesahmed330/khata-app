import { SkeletonBlock } from "@/components/Skeleton";

export default function AddLoading() {
  return (
    <main className="mx-auto max-w-md px-4">
      <div
        className="flex items-center justify-between pb-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
      >
        <div>
          <SkeletonBlock className="h-[11px] w-16" />
          <SkeletonBlock className="mt-1.5 h-5 w-32" />
        </div>
      </div>
      <SkeletonBlock className="h-24 rounded-sheet" />
      <div className="mt-4 flex gap-2">
        <SkeletonBlock className="h-[52px] flex-1 rounded-chip" />
        <SkeletonBlock className="h-[52px] w-[52px] rounded-full" />
      </div>
    </main>
  );
}
