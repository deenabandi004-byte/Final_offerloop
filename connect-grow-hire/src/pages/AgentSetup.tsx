// AgentSetup — thin wrapper around AgentSetupInline with app chrome.

import { useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AgentSetupInline } from "@/components/agent/AgentSetupInline";
import type { InitialBriefParsed } from "@/components/loop/LoopsEmptyState";

interface AgentSetupNavState {
  initialBrief?: string;
  initialBriefParsed?: InitialBriefParsed;
}

export default function AgentSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  // LoopsEmptyState navigates here with the brief the user edited inline
  // PLUS the proposal's parsed chips. Both are forwarded so the wizard
  // can (a) seed the textarea, (b) show real chips on Step 02's review
  // even when the brief text doesn't explicitly name a role, and
  // (c) decide to skip Step 01 because the student already handled it
  // on the empty-state screen.
  const state = (location.state as AgentSetupNavState | null) ?? {};
  const initialBrief = state.initialBrief?.trim() || undefined;
  const initialBriefParsed = state.initialBriefParsed;

  // Back from Step 02 when the user skipped Step 01 should return them
  // to the empty-state surface they came from. The empty state lives at
  // /agent (when there are zero Loops); if they've created one in the
  // meantime, /agent shows the fleet. Either way, navigating up matches
  // their mental model better than dumping them into Step 01 they never
  // saw.
  const onBackToEntry = initialBrief
    ? () => navigate("/agent")
    : undefined;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Agent Setup" />
          <div className="flex-1 overflow-y-auto">
            <AgentSetupInline
              onDeployed={() => navigate("/agent")}
              initialBrief={initialBrief}
              initialBriefParsed={initialBriefParsed}
              onBackToEntry={onBackToEntry}
            />
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
