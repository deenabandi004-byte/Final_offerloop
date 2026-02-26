import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ChevronRight, ChevronDown, X, LockKeyhole } from "lucide-react";
import { apiService } from "@/services/api";
import type { EmailTemplate, PresetOption, SavedEmailTemplate } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

const MAX_CUSTOM_LEN = 4000;

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

function getPreview(key: string, firstName: string): string {
  const raw = PREVIEWS[key];
  if (!raw) return "";
  const name = (firstName || "Deena").trim() || "Deena";
  return raw.replace(/\bDeena\b/g, name);
}

export default function EmailTemplatesPage() {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const isElite = user?.tier === "elite";
  const firstName = (user?.name?.trim().split(/\s+/)[0] || "Deena").trim() || "Deena";
  const [savedTemplate, setSavedTemplate] = useState<EmailTemplate | null>(null);
  const [presets, setPresets] = useState<{ styles: PresetOption[]; purposes: PresetOption[] } | null>(null);
  const [purpose, setPurpose] = useState<string | null>("networking");
  const [customInstructions, setCustomInstructions] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedCustomTemplates, setSavedCustomTemplates] = useState<SavedEmailTemplate[]>([]);
  const [activeSavedTemplateId, setActiveSavedTemplateId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [signoffPhrase, setSignoffPhrase] = useState("Best,");
  const [signoffPhraseCustom, setSignoffPhraseCustom] = useState("");
  const [signatureBlock, setSignatureBlock] = useState("");

  const effectivePurpose = purpose === CUSTOM_PURPOSE_ID ? "custom" : purpose;
  const effectiveSignoff = signoffPhrase === "custom" ? (signoffPhraseCustom.trim() || "Best,") : signoffPhrase;

  useEffect(() => {
    Promise.all([
      apiService.getEmailTemplate(),
      apiService.getEmailTemplatePresets(),
      apiService.getSavedEmailTemplates(),
    ])
      .then(([template, presetsData, saved]) => {
        setSavedTemplate({
          purpose: template.purpose ?? null,
          stylePreset: template.stylePreset ?? null,
          customInstructions: template.customInstructions ?? "",
          signoffPhrase: template.signoffPhrase,
          signatureBlock: template.signatureBlock,
          name: template.name,
          subject: template.subject,
          savedTemplateId: template.savedTemplateId,
        });
        setSignoffPhrase(
          ["Best,", "Thanks,", "Warm regards,", "Sincerely,", "Cheers,"].includes((template as any).signoffPhrase)
            ? (template as any).signoffPhrase
            : "custom"
        );
        setSignoffPhraseCustom(
          ["Best,", "Thanks,", "Warm regards,", "Sincerely,", "Cheers,"].includes((template as any).signoffPhrase)
            ? ""
            : ((template as any).signoffPhrase || "")
        );
        setSignatureBlock((template as any).signatureBlock ?? "");
        setPresets(presetsData);
        setSavedCustomTemplates(saved);
        const p = template.purpose;
        if (p === "custom") {
          setPurpose(CUSTOM_PURPOSE_ID);
          setCustomInstructions(template.customInstructions || "");
          setTemplateName(template.name || "");
          setSubjectLine(template.subject || "");
          setActiveSavedTemplateId(template.savedTemplateId || null);
        } else if (template.savedTemplateId) {
          const match = saved.find((s) => s.id === template.savedTemplateId);
          if (match) {
            setPurpose(CUSTOM_PURPOSE_ID);
            setTemplateName(match.name);
            setSubjectLine(match.subject);
            setCustomInstructions(match.body);
            setActiveSavedTemplateId(match.id);
          } else {
            setPurpose(p || "networking");
          }
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
      signoffPhrase: effectiveSignoff,
      signatureBlock: signatureBlock.trim().slice(0, 500),
      name: templateName.trim(),
      subject: subjectLine.trim(),
      savedTemplateId: activeSavedTemplateId || undefined,
    };
  };

  const handleReset = () => {
    setPurpose("networking");
    setCustomInstructions("");
    setTemplateName("");
    setSubjectLine("");
    setActiveSavedTemplateId(null);
    setSignoffPhrase("Best,");
    setSignoffPhraseCustom("");
    setSignatureBlock("");
  };

  const handlePurposeClick = (id: string) => {
    setPurpose(id);
    setActiveSavedTemplateId(null);
    setTemplateName("");
    setSubjectLine("");
    setCustomInstructions("");
  };

  const handleSavedTemplateClick = (t: SavedEmailTemplate) => {
    setPurpose(CUSTOM_PURPOSE_ID);
    setTemplateName(t.name);
    setSubjectLine(t.subject);
    setCustomInstructions(t.body);
    setActiveSavedTemplateId(t.id);
  };

  const expandCreateYourOwn = () => {
    setPurpose(CUSTOM_PURPOSE_ID);
    setActiveSavedTemplateId(null);
    setTemplateName("");
    setSubjectLine("");
    setCustomInstructions("");
  };

  const handleDeleteSavedTemplate = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await apiService.deleteSavedEmailTemplate(id);
      setSavedCustomTemplates((prev) => prev.filter((t) => t.id !== id));
      if (activeSavedTemplateId === id) {
        setActiveSavedTemplateId(null);
        setTemplateName("");
        setSubjectLine("");
        setCustomInstructions("");
        setPurpose("networking");
      }
      toast({ title: "Deleted", description: "Custom template removed." });
    } catch {
      toast({ title: "Failed", description: "Could not delete template.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveAsDefault = async () => {
    if (purpose === CUSTOM_PURPOSE_ID && !templateName.trim()) {
      toast({ title: "Name required", description: "Please enter a template name before saving.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      let savedId = activeSavedTemplateId;
      if (purpose === CUSTOM_PURPOSE_ID) {
        const res = await apiService.createSavedEmailTemplate({
          id: activeSavedTemplateId || undefined,
          name: templateName.trim(),
          subject: subjectLine.trim(),
          body: customInstructions.trim(),
        });
        savedId = res.id;
        setActiveSavedTemplateId(savedId);

        const newEntry: SavedEmailTemplate = {
          id: savedId,
          name: templateName.trim(),
          subject: subjectLine.trim(),
          body: customInstructions.trim(),
        };
        setSavedCustomTemplates((prev) => {
          const idx = prev.findIndex((t) => t.id === savedId);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = newEntry;
            return copy;
          }
          return [newEntry, ...prev];
        });
      }

      const template = buildTemplate();
      template.savedTemplateId = savedId || undefined;
      await apiService.saveEmailTemplate(template);
      setSavedTemplate(template);
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
                className="text-[#0F172A] mb-2 text-[28px] sm:text-[42px]"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
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

              {/* Purpose pills — defaults + saved custom templates */}
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
                        purpose === pill.id && !activeSavedTemplateId
                          ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                          : "bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-700 border-gray-200 hover:border-blue-200 hover:shadow-sm"
                      )}
                    >
                      {pill.name}
                      {pill.id === "networking" && " (default)"}
                    </button>
                  ))}
                  {isElite && savedCustomTemplates.map((t) => (
                    <div key={t.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => handleSavedTemplateClick(t)}
                        className={cn(
                          "px-4 py-2 text-xs font-medium rounded-full border transition-all duration-150 pr-7",
                          activeSavedTemplateId === t.id
                            ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                            : "bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-700 border-gray-200 hover:border-blue-200 hover:shadow-sm"
                        )}
                      >
                        {t.name}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${t.name}"?`)) {
                            handleDeleteSavedTemplate(t.id);
                          }
                        }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-red-100"
                        aria-label={`Delete ${t.name}`}
                      >
                        <X className="h-3 w-3 text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
                {hasPresetPurpose && !activeSavedTemplateId && PURPOSE_DESCRIPTIONS[purpose!] && (
                  <p className="mt-1.5 ml-1 text-[13px] text-gray-500">
                    {PURPOSE_DESCRIPTIONS[purpose!]}
                  </p>
                )}
              </div>

              {/* Create Your Own Template — expandable card (Elite only) */}
              {isElite ? (
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
                    isMakeYourOwn ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <div
                    className="mt-4 pt-4 border-t border-blue-200/60 space-y-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1">Template Name</label>
                      <Input
                        placeholder="e.g., Startup Pitch, Informational Interview Request..."
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value.slice(0, 200))}
                        className="w-full bg-white/80 border border-blue-200/60 rounded-lg text-gray-900 placeholder:text-gray-500 focus:bg-white focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1">Email Subject Line</label>
                      <Input
                        placeholder="e.g., Quick question from a fellow USC Trojan"
                        value={subjectLine}
                        onChange={(e) => setSubjectLine(e.target.value.slice(0, 500))}
                        className="w-full bg-white/80 border border-blue-200/60 rounded-lg text-gray-900 placeholder:text-gray-500 focus:bg-white focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 leading-snug mb-2">
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
              </div>
              ) : (
              <div className="w-full rounded-lg border border-gray-200 bg-gray-50 py-4 px-5 mb-8 opacity-60 cursor-default">
                <div className="flex items-center justify-center gap-2">
                  <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <h3 className="text-xs font-medium text-gray-500">Create Your Own Template</h3>
                  <span className="text-xs text-muted-foreground">Elite · Free trial available</span>
                </div>
              </div>
              )}

              {/* Sign-off & signature — always visible */}
              <div className="mb-8">
                <label className="text-sm font-semibold text-gray-700 ml-1 block mb-1.5">Sign-off & signature</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {["Best,", "Thanks,", "Warm regards,", "Sincerely,", "Cheers,"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setSignoffPhrase(preset);
                        setSignoffPhraseCustom("");
                      }}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-full border transition-all",
                        signoffPhrase === preset
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSignoffPhrase("custom")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-full border transition-all",
                      signoffPhrase === "custom"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    Custom
                  </button>
                  {signoffPhrase === "custom" && (
                    <Input
                      placeholder="e.g. Best regards,"
                      value={signoffPhraseCustom}
                      onChange={(e) => setSignoffPhraseCustom(e.target.value.slice(0, 50))}
                      className="inline-flex w-[160px] h-8 text-xs rounded-full border-gray-200"
                      maxLength={50}
                    />
                  )}
                </div>
                <div className="mb-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Signature block (name, university, email, LinkedIn…)</label>
                  <Textarea
                    placeholder="e.g. John Smith\nUSC | Class of 2025\njohn@example.com"
                    value={signatureBlock}
                    onChange={(e) => setSignatureBlock(e.target.value.slice(0, 500))}
                    className="min-h-[72px] resize-y w-full rounded-lg border border-gray-200 text-sm"
                    maxLength={500}
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 text-right mt-1">{500 - signatureBlock.length} characters left</p>
                </div>
                <p className="text-xs text-gray-500 ml-1 mt-1">Live preview:</p>
                <pre className="text-xs text-gray-700 mt-0.5 ml-1 whitespace-pre-wrap font-sans">
                  {`${effectiveSignoff}\n${signatureBlock.trim() || firstName}`}
                </pre>
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
                  {isSaving ? "Saving…" : isMakeYourOwn ? "Save Template" : "Save as default"}
                </Button>
              </div>

              {/* Preview */}
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
