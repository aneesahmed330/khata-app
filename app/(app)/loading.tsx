import { SkeletonBlock, SkeletonRow } from "@/components/Skeleton";

export default function HomeLoading() {
  return (
    <main className="mx-auto max-w-md px-4">
      <section
        className="flex items-start justify-between gap-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
      >
        <div className="min-w-0">
          <SkeletonBlock className="h-[11px] w-20" />
          <SkeletonBlock className="mt-2.5 h-[34px] w-32" />
          <SkeletonBlock className="mt-2 h-[13px] w-24" />
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} className="h-[58px] rounded-chip" />
        ))}
      </div>

      <SkeletonBlock className="mt-3 h-[52px] rounded-chip" />

      <div className="mt-6">
        <SkeletonBlock className="h-[11px] w-16" />
        <div className="mt-4">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}
