import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ChevronRight, ChevronDown } from "lucide-react";
import { apiService } from "@/services/api";
import type { EmailTemplate, PresetOption } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

const MAX_CUSTOM_LEN = 500;

const PREVIEWS: Record<string, string> = {
  networking:
    "Hi Alex,\n\nMy name is Deena, and I'm a junior studying Computer Science at USC. I came across your profile while researching engineering roles at Google, and your work on search infrastructure stood out. Would you be available for a brief 15–20 minute conversation at your convenience?\n\nBest regards,\nDeena",
  referral:
    "Hi Alex,\n\nMy name is Deena, and I'm a junior studying Computer Science at USC. I noticed an open Software Engineer position on your team at Google that aligns well with my experience. Would you be open to referring me or connecting me with the appropriate hiring contact?\n\nThank you for your time,\nDeena",
  follow_up:
    "Hi Alex,\n\nI wanted to follow up on my previous message. I understand you have a busy schedule, and I'd still welcome the opportunity to speak with you briefly if your availability allows. Please don't hesitate to suggest a time that works best.\n\nBest regards,\nDeena",
};

const PURPOSE_DESCRIPTIONS: Record<string, string> = {
  networking: "Request a coffee chat or informational interview to learn about their role and company.",
  referral: "Ask to be referred for a specific job opening at their company.",
  follow_up: "Follow up on a previous email or conversation that didn't get a reply.",
};

const PURPOSE_PILLS = [
  { id: "networking", name: "Networking" },
  { id: "referral", name: "Referral Request" },
  { id: "follow_up", name: "Follow-Up" },
] as const;

const CUSTOM_PURPOSE_ID = "custom";

/** Returns preview body for a purpose key with sender name substituted. Fallback name: Deena. */
function getPreview(key: string, firstName: string): string {
  const raw = PREVIEWS[key];
  if (!raw) return "";
  const name = (firstName || "Deena").trim() || "Deena";
  return raw.replace(/\bDeena\b/g, name);
}

export default function EmailTemplatesPage() {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const firstName = (user?.name?.trim().split(/\s+/)[0] || "Deena").trim() || "Deena";
  const [savedTemplate, setSavedTemplate] = useState<EmailTemplate | null>(null);
  const [presets, setPresets] = useState<{ styles: PresetOption[]; purposes: PresetOption[] } | null>(null);
  const [purpose, setPurpose] = useState<string | null>("networking");
  const [customInstructions, setCustomInstructions] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const effectivePurpose = purpose === CUSTOM_PURPOSE_ID ? "custom" : purpose;

  useEffect(() => {
    Promise.all([
      apiService.getEmailTemplate(),
      apiService.getEmailTemplatePresets(),
    ])
      .then(([template, presetsData]) => {
        setSavedTemplate({
          purpose: template.purpose ?? null,
          stylePreset: template.stylePreset ?? null,
          customInstructions: template.customInstructions ?? "",
        });
        setPresets(presetsData);
        const t = template;
        const p = t.purpose;
        if (p === "custom") {
          setPurpose(CUSTOM_PURPOSE_ID);
          setCustomInstructions(t.customInstructions || "");
        } else {
          setPurpose(p || "networking");
          setCustomInstructions("");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const buildTemplate = (): EmailTemplate => {
    const custom = customInstructions.trim().slice(0, MAX_CUSTOM_LEN);
    return {
      purpose: effectivePurpose,
      stylePreset: null,
      customInstructions: custom,
    };
  };

  const handleReset = () => {
    setPurpose("networking");
    setCustomInstructions("");
  };

  const handlePurposeClick = (id: string) => {
    setPurpose(id);
  };

  const expandCreateYourOwn = () => setPurpose(CUSTOM_PURPOSE_ID);

  const handleSaveAsDefault = async () => {
    setIsSaving(true);
    try {
      await apiService.saveEmailTemplate(buildTemplate());
      setSavedTemplate(buildTemplate());
      toast({ title: "Saved", description: "Email template saved as your default." });
    } catch {
      toast({ title: "Failed to save", description: "Could not save template.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyToSearch = () => {
    const template = buildTemplate();
    try {
      sessionStorage.setItem("offerloop_applied_email_template", JSON.stringify(template));
    } catch {
      // ignore
    }
    navigate("/contact-search", { state: { appliedEmailTemplate: template } });
    toast({ title: "Applied", description: "Template will be used for your next search." });
  };

  const hasPresetPurpose = purpose && purpose !== CUSTOM_PURPOSE_ID;
  const isMakeYourOwn = purpose === CUSTOM_PURPOSE_ID;
  const previewKey = hasPresetPurpose && purpose ? purpose : null;
  const previewBody = previewKey && PREVIEWS[previewKey] ? getPreview(previewKey, firstName) : null;

  if (loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-[#FAFAFA]">
          <AppSidebar />
          <MainContentWrapper>
            <AppHeader />
            <main className="flex-1 flex items-center justify-center p-8">
              <p className="text-gray-500">Loading…</p>
            </main>
          </MainContentWrapper>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#FAFAFA] text-foreground font-sans">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader />
          <main className="flex-1 overflow-y-auto bg-[#F8FAFF]" style={{ padding: "48px 24px 96px" }}>
            <div className="max-w-[900px] mx-auto" data-tour="tour-templates">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/contact-search")}
                className="mb-6 -ml-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Find People
              </Button>

              <h1
                className="text-[#0F172A] mb-2"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: "42px",
                  fontWeight: 400,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.1,
                }}
              >
                Email template
              </h1>
              <p
                className="text-[#64748B] mb-8"
                style={{
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: "16px",
                  lineHeight: 1.5,
                }}
              >
                This controls how your outreach emails are written. Pick what you're asking for and how you want it to sound — check the preview below to see exactly what you'll get.
              </p>

              {/* Purpose — three preset pills only */}
              <div className="mb-6">
                <label className="text-sm font-semibold text-gray-700 ml-1 block mb-1.5">What kind of email?</label>
                <div className="flex flex-wrap gap-2">
                  {PURPOSE_PILLS.map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => handlePurposeClick(pill.id)}
                      className={cn(
                        "px-4 py-2 text-xs font-medium rounded-full border transition-all duration-150",
                        purpose === pill.id
                          ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                          : "bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-700 border-gray-200 hover:border-blue-200 hover:shadow-sm"
                      )}
                    >
                      {pill.name}
                      {pill.id === "networking" && " (default)"}
                    </button>
                  ))}
                </div>
                {hasPresetPurpose && PURPOSE_DESCRIPTIONS[purpose!] && (
                  <p className="mt-1.5 ml-1 text-[13px] text-gray-500">
                    {PURPOSE_DESCRIPTIONS[purpose!]}
                  </p>
                )}
              </div>

              {/* Create Your Own Template — button-like card */}
              <div
                role="button"
                tabIndex={0}
                onClick={isMakeYourOwn ? undefined : expandCreateYourOwn}
                onKeyDown={(e) => {
                  if (!isMakeYourOwn && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    expandCreateYourOwn();
                  }
                }}
                className={cn(
                  "w-full rounded-lg border py-4 px-5 transition-all duration-150 mb-8",
                  "cursor-pointer text-xs font-medium",
                  isMakeYourOwn
                    ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 hover:shadow-sm"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center gap-2",
                    isMakeYourOwn && "cursor-pointer"
                  )}
                  onClick={isMakeYourOwn ? (e) => { e.stopPropagation(); setPurpose("networking"); } : undefined}
                  role={isMakeYourOwn ? "button" : undefined}
                  tabIndex={isMakeYourOwn ? 0 : undefined}
                  onKeyDown={
                    isMakeYourOwn
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setPurpose("networking");
                          }
                        }
                      : undefined
                  }
                >
                  <h3 className="text-xs font-medium">Create Your Own Template</h3>
                  {isMakeYourOwn ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                  )}
                </div>
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200 ease-out",
                    isMakeYourOwn ? "max-h-[360px] opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <div
                    className="mt-4 pt-4 border-t border-blue-200/60"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-sm text-gray-600 leading-snug mb-3">
                      Describe exactly what you want your emails to say — in plain English. Want to pitch your startup? Ask for an intro to their manager? Request a campus speaking slot? Just type it out.
                    </p>
                    <Textarea
                      placeholder="e.g., Write a 3-sentence email pitching my startup to university career center directors and asking for a 15-minute demo call..."
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value.slice(0, MAX_CUSTOM_LEN))}
                      className="min-h-[72px] resize-y w-full bg-white/80 border border-blue-200/60 rounded-lg text-gray-900 placeholder:text-gray-500 focus:bg-white focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400"
                      maxLength={MAX_CUSTOM_LEN}
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 text-right mt-1">
                      {MAX_CUSTOM_LEN - customInstructions.length} characters left
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-4 mb-8">
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Reset
                </button>
                <Button variant="outline" onClick={handleApplyToSearch} disabled={isSaving} className="rounded-xl">
                  Apply to this search
                </Button>
                <Button onClick={handleSaveAsDefault} disabled={isSaving} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                  {isSaving ? "Saving…" : "Save as default"}
                </Button>
              </div>

              {/* Preview — preset: sample body; Make Your Own: instruction note */}
              <div className="border-l-4 border-blue-200 bg-gray-50/80 rounded-r-xl py-4 pl-5 pr-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Preview</p>
                {isMakeYourOwn ? (
                  <p className="text-sm text-gray-600">
                    Your emails will be generated based on your instructions above. Each email will be personalized to the contact.
                  </p>
                ) : previewBody ? (
                  <>
                    <p className="text-xs text-gray-500 mb-3">Actual emails will be personalized to each contact.</p>
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                      {previewBody}
                    </pre>
                  </>
                ) : null}
              </div>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
