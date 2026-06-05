// LoopsPage — the fleet view at /agent.
//
// State machine:
//   - Loading   → centered spinner
//   - 0 Loops   → StartLoopHero (page variant, with marketing cards)
//   - 1+ Loops  → LoopGrid (with the LoopsCommandBar above it)
//
// The inline composer was removed in the Variation D redesign. The full
// `/agent/setup` page now owns Loop creation in every path — the fleet's
// "Start another Loop" CTA navigates there directly.

import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useLoopsList } from "@/hooks/useLoops";
import { LoopGrid } from "@/components/loop/LoopGrid";
import { StartLoopHero } from "@/components/loop/StartLoopHero";
import { LOOP_COPY } from "@/lib/loopCopy";

export default function LoopsPage() {
  const query = useLoopsList();
  const navigate = useNavigate();

  const loops = query.data?.loops ?? [];
  const limits = query.data?.limits;

  const goToSetup = () => navigate("/agent/setup");

  return (
    <SidebarProvider>
      <div
        className="flex min-h-screen w-full font-sans"
        style={{ color: "var(--ink)" }}
      >
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title={LOOP_COPY.pageTitle} />

          <div
            className="flex-1 overflow-y-auto"
            style={{
              // Scoped Variation-D blue accent. Sparkline, ring, primary CTA,
              // and the tinted icon tiles all inherit from these — pages outside
              // /agent keep their navy.
              ["--accent" as string]: "#3E5BD9",
              ["--accent-tint" as string]: "#EDF1FE",
              ["--accent-line" as string]:
                "linear-gradient(90deg, #C7D2FF, #E5EBFF 42%, transparent)",
            }}
          >
            <div
              style={{
                height: 3,
                background: "var(--accent-line)",
              }}
            />
            {query.isLoading && (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            )}

            {!query.isLoading && loops.length === 0 && (
              <StartLoopHero variant="page" />
            )}

            {!query.isLoading && loops.length > 0 && limits && (
              <LoopGrid
                loops={loops}
                limits={limits}
                onCreate={goToSetup}
              />
            )}
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
