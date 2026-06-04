// AgentSetup — thin wrapper around AgentSetupInline with app chrome.
//
// Reads an optional `location.state.seed` payload pushed by the fleet view's
// NewLoopTile quickstart chips. The seed carries a pre-written brief and the
// matching loopMode so a one-tap quickstart lands the user on a setup page
// that's already filled in. Falls through cleanly to the cold-start
// experience when there's no seed (direct navigation, "+ Start another Loop"
// header button, etc.).

import { useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AgentSetupInline } from "@/components/agent/AgentSetupInline";
import type { LoopMode } from "@/services/loops";

type QuickstartSeed = {
  id?: string;
  brief?: string;
  loopMode?: LoopMode;
  title?: string;
};

export default function AgentSetup() {
  const navigate = useNavigate();
  const location = useLocation();

  // location.state is unknown by default; narrow defensively. Anything
  // unexpected (direct nav, browser refresh) leaves seed as undefined and
  // the wizard cold-starts.
  const state = (location.state ?? {}) as { seed?: QuickstartSeed };
  const seed = state.seed;

  // Electric-blue "spark" lights the eyebrow dot, the accent-popped headline
  // word, the active stepper bar, and the preview-rail tint. Scoped to this
  // route so the rest of the app keeps its navy ink.
  const spark = "#2563EB";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Agent Setup" />
          <div
            className="flex-1 overflow-y-auto relative"
            style={{
              ["--spark" as string]: spark,
              background: "var(--paper)",
            }}
          >
            {/* Warm-peach top hairline (mirrors Loop Setup design) */}
            <div
              className="relative z-[2]"
              style={{
                height: 3,
                background:
                  "linear-gradient(90deg, #F3D9C6, #FCEDE0 40%, transparent)",
              }}
            />
            {/* Corner gradient glow — bleeds from top-right */}
            <div
              className="pointer-events-none absolute top-[3px] right-0 z-0"
              aria-hidden
              style={{
                width: "62%",
                height: 520,
                background: `radial-gradient(115% 90% at 100% 0%, ${spark}33, ${spark}14 30%, transparent 62%)`,
              }}
            />
            <div className="relative z-[1]">
              <AgentSetupInline
                onDeployed={() => navigate("/agent")}
                initialBrief={seed?.brief ?? ""}
                initialLoopMode={seed?.loopMode}
              />
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
