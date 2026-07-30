import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* pb clears the 56px nav + the FAB's upward offset + safe area */}
      <div className="pb-[calc(84px+env(safe-area-inset-bottom))]">{children}</div>
      <BottomNav />
    </div>
  );
}
