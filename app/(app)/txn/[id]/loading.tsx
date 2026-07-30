import { SkeletonBlock } from "@/components/Skeleton";

export default function TxnLoading() {
  return (
    <>
      <header
        className="sticky top-0 z-20 border-b border-rule bg-surface/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <SkeletonBlock className="size-9 shrink-0 rounded-chip" />
          <SkeletonBlock className="h-5 w-16" />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pt-5">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i}>
              <SkeletonBlock className="mb-1.5 h-[11px] w-16" />
              <SkeletonBlock className="h-[52px] rounded-chip" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
