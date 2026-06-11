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

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useLoopsList } from "@/hooks/useLoops";
import { LoopGrid } from "@/components/loop/LoopGrid";
import { StartLoopHero } from "@/components/loop/StartLoopHero";
import { LOOP_COPY } from "@/lib/loopCopy";
import { useTour } from "@/contexts/TourContext";
import type { Loop, LoopLimits } from "@/services/loops";

export default function LoopsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { demoSurface } = useTour();
  const loopsDemoActive = demoSurface === 'loops';

  // Suppress the real fetch (and the 20s refetchInterval) while the tour's
  // Loops demo is live. React Query returns the cached data we seeded via
  // setQueryData in the orchestration effect below, so the seeded Loop
  // renders normally; only the live refresh is gated.
  const query = useLoopsList({ enabled: !loopsDemoActive });

  const loops = query.data?.loops ?? [];
  const limits = query.data?.limits;

  const goToSetup = () => {
    if (loopsDemoActive) return;
    navigate("/agent/setup");
  };

  // ── Tour Loops demo orchestration ─────────────────────────────────────
  // Seed one running "Networking Loop" with mid-funnel metrics into the
  // React Query cache so the user sees the "works while you sleep"
  // proposition through live numbers on the seeded card. Cleanup removes
  // the seeded entries; React Query's `enabled` flips back to true and the
  // existing query fires once to restore the real fleet.
  useEffect(() => {
    if (!loopsDemoActive) return;

    const recentIso = new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString();
    const demoLoop: Loop = {
      id: 'demo-networking-loop',
      name: 'Networking Loop',
      briefText: 'Product designers at Series A and B startups in NYC',
      briefParsed: null,
      reviewBeforeSend: true,
      weeklyTarget: 15,
      smsEnabled: false,
      status: 'running',
      shortCode: 'DEMO-NET',
      createdAt: recentIso,
      lastRunAt: recentIso,
      nextRunAt: null,
      lastSmsAt: null,
      totalContactsFound: 12,
      totalEmailsDrafted: 8,
      totalRepliesReceived: 2,
      totalJobsFound: 0,
      totalHmsContacted: 0,
      totalCompaniesDiscovered: 0,
      pendingDrafts: 3,
      unreadReplies: 1,
      cadence: 'daily',
      creditBudgetPerWeek: 250,
      automationEnabled: true,
      lastReviewedAt: recentIso,
      weekCreditsSpent: 86,
      weekStartedAt: recentIso,
      pauseReason: null,
      cycleRunning: false,
    };
    const demoLimits: LoopLimits = { used: 1, cap: 3, canCreate: true };

    // Cancel any in-flight fetch BEFORE seeding. `enabled: false` (set
    // above via useLoopsList({ enabled: !loopsDemoActive })) prevents new
    // fetches from starting, but a fetch already in flight from the cross-
    // route mount keeps running and would write its result into the cache,
    // overwriting the seed. Same race shape we fixed for the inbox surface.
    queryClient.cancelQueries({ queryKey: ['loops', 'list'] });
    queryClient.setQueryData<{ loops: Loop[]; limits: LoopLimits }>(
      ['loops', 'list'],
      { loops: [demoLoop], limits: demoLimits },
    );

    return () => {
      // Remove the seeded cache. Re-enable flips on the next render and
      // React Query fires one clean fetch to populate the real fleet.
      queryClient.removeQueries({ queryKey: ['loops', 'list'] });
    };
  }, [loopsDemoActive, queryClient]);

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
            <div data-tour="tour-loops-grid">
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
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
