import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ChevronRight, ChevronDown, X, LockKeyhole, Sparkles } from "lucide-react";
import { apiService } from "@/services/api";
import type { EmailTemplate, PresetOption, SavedEmailTemplate } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { ResultActionButton } from "@/components/find/ResultActionButton";

const MAX_CUSTOM_LEN = 4000;

const PREVIEWS: Record<string, string> = {
  networking:
    "Hi Alex,\n\nMy name is Deena, and I'm a junior studying Computer Science at USC. I came across your profile while researching engineering roles at Google, and your work on search infrastructure stood out. Would you be available for a brief 15-20 minute conversation at your convenience?\n\nBest regards,\nDeena",
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

const SIGNOFF_PRESETS = ["Best,", "Thanks,", "Warm regards,", "Sincerely,", "Cheers,"];

// Uppercase eyebrow label used above each left column section (SAVED, SIGN OFF,
// SIGNATURE). Navy heading color comes from the existing --heading token.
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.14em",
  fontWeight: 700,
  color: "var(--heading, #1E2D4D)",
  textTransform: "uppercase",
  marginBottom: 12,
};

// Shared pill selector for the SAVED and SIGN OFF rows. Active state uses the
// unified app accent (var(--accent)) so these match the redesigned Find pills.
// Styling only: it owns no state, the parent passes active + onClick.
function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 16px",
        fontSize: 12.5,
        fontWeight: 500,
        borderRadius: 999,
        border: active ? "1px solid var(--accent, #4A60A8)" : "1px solid var(--line, #E5E5E0)",
        background: active ? "var(--accent, #4A60A8)" : "var(--paper, #FFFFFF)",
        color: active ? "#fff" : "var(--ink-2, #4A4F5B)",
        cursor: "pointer",
        transition: "all .15s",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

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
  const userEmail = (user?.email || "").trim() || "youremail@gmail.com";
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
          SIGNOFF_PRESETS.includes((template as any).signoffPhrase)
            ? (template as any).signoffPhrase
            : "custom"
        );
        setSignoffPhraseCustom(
          SIGNOFF_PRESETS.includes((template as any).signoffPhrase)
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

      // Try to save named custom template (non-blocking for default save)
      if (purpose === CUSTOM_PURPOSE_ID) {
        try {
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
        } catch (err) {
          console.error("Failed to save named template, continuing with default save:", err);
        }
      }

      // ALWAYS save the default template (this is the critical save)
      const template = buildTemplate();
      template.savedTemplateId = savedId || undefined;
      await apiService.saveEmailTemplate(template);
      setSavedTemplate(template);
      toast({ title: "Saved", description: "Email template saved as your default." });
    } catch (err) {
      console.error("Save template error:", err);
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
    navigate("/find", { state: { appliedEmailTemplate: template } });
    toast({ title: "Applied", description: "Template will be used for your next search." });
  };

  const hasPresetPurpose = purpose && purpose !== CUSTOM_PURPOSE_ID;
  const isMakeYourOwn = purpose === CUSTOM_PURPOSE_ID;
  const previewKey = hasPresetPurpose && purpose ? purpose : null;
  const previewBody = previewKey && PREVIEWS[previewKey] ? getPreview(previewKey, firstName) : null;

  if (loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full" style={{ background: "var(--surface, #F5F6F8)" }}>
          <AppSidebar />
          <MainContentWrapper>
            <AppHeader />
            <main className="flex-1 flex items-center justify-center p-8" style={{ background: "var(--paper, #FFFFFF)" }}>
              <p style={{ color: "var(--ink-3, #8A8F9A)" }}>Loading...</p>
            </main>
          </MainContentWrapper>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ background: "var(--surface, #F5F6F8)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Email Template" />
          <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper, #FFFFFF)", padding: "32px 40px 80px" }}>
            <div className="max-w-[1080px] mx-auto" data-tour="tour-templates">
              <h1
                style={{
                  fontFamily: "'Lora', Georgia, serif",
                  fontWeight: 600,
                  fontSize: 28,
                  color: "#0F172A",
                  letterSpacing: "-0.01em",
                  marginBottom: 6,
                }}
              >
                Email template
              </h1>
              <p
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "var(--ink-3, #8A8F9A)",
                  marginBottom: 28,
                  maxWidth: 640,
                }}
              >
                This controls how your outreach emails are written. Pick what you're asking for and how you want it to
                sound, then check the live preview to see exactly what you'll get.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* LEFT: controls */}
                <div>
                  <button
                    type="button"
                    onClick={() => navigate("/find")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 24,
                      fontSize: 13,
                      color: "var(--ink-3, #8A8F9A)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      padding: 0,
                      fontWeight: 500,
                      transition: "color .12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent, #4A60A8)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-3, #8A8F9A)"; }}
                  >
                    <ArrowLeft style={{ width: 14, height: 14 }} />
                    Back to Find
                  </button>

                  {/* SAVED: purpose presets + saved custom templates */}
                  <div style={{ marginBottom: 26 }}>
                    <div style={SECTION_LABEL}>Saved</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {PURPOSE_PILLS.map((pill) => {
                        const isActive = purpose === pill.id && !activeSavedTemplateId;
                        return (
                          <Pill key={pill.id} active={isActive} onClick={() => handlePurposeClick(pill.id)}>
                            {pill.name}
                            {pill.id === "networking" && " (default)"}
                          </Pill>
                        );
                      })}
                      {isElite && savedCustomTemplates.map((t) => {
                        const isActive = activeSavedTemplateId === t.id;
                        return (
                          <div key={t.id} className="relative group">
                            <button
                              type="button"
                              onClick={() => handleSavedTemplateClick(t)}
                              style={{
                                padding: "7px 16px",
                                paddingRight: 28,
                                fontSize: 12.5,
                                fontWeight: 500,
                                borderRadius: 999,
                                border: isActive ? "1px solid var(--accent, #4A60A8)" : "1px solid var(--line, #E5E5E0)",
                                background: isActive ? "var(--accent, #4A60A8)" : "var(--paper, #FFFFFF)",
                                color: isActive ? "#fff" : "var(--ink-2, #4A4F5B)",
                                cursor: "pointer",
                                transition: "all .15s",
                                fontFamily: "inherit",
                              }}
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
                        );
                      })}
                    </div>
                    {hasPresetPurpose && !activeSavedTemplateId && PURPOSE_DESCRIPTIONS[purpose!] && (
                      <p style={{ marginTop: 8, fontSize: 12, color: "var(--ink-3, #8A8F9A)" }}>
                        {PURPOSE_DESCRIPTIONS[purpose!]}
                      </p>
                    )}
                  </div>

                  {/* Create Your Own Template: expandable card (Elite only) */}
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
                      style={{
                        width: "100%",
                        borderRadius: 12,
                        border: isMakeYourOwn ? "1px solid var(--accent, #4A60A8)" : "1px solid var(--line, #E5E5E0)",
                        padding: "16px 20px",
                        marginBottom: 26,
                        cursor: isMakeYourOwn ? "default" : "pointer",
                        background: isMakeYourOwn ? "var(--paper, #FFFFFF)" : "var(--paper-2, #FAFBFF)",
                        transition: "all .15s",
                      }}
                    >
                      <div
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
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
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2, #4A4F5B)" }}>Create Your Own Template</span>
                        {isMakeYourOwn ? (
                          <ChevronDown style={{ width: 14, height: 14, color: "var(--ink-3, #8A8F9A)" }} />
                        ) : (
                          <ChevronRight style={{ width: 14, height: 14, color: "var(--ink-3, #8A8F9A)" }} />
                        )}
                      </div>
                      <div
                        className={cn(
                          "overflow-hidden transition-all duration-200 ease-out",
                          isMakeYourOwn ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                        )}
                      >
                        <div
                          style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line, #E5E5E0)", display: "flex", flexDirection: "column", gap: 16 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div>
                            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2, #4A4F5B)", display: "block", marginBottom: 6 }}>Template Name</label>
                            <Input
                              placeholder="e.g., Startup Pitch, Informational Interview Request..."
                              value={templateName}
                              onChange={(e) => setTemplateName(e.target.value.slice(0, 200))}
                              className="w-full rounded-lg border-[#E5E5E0] bg-[#FAFBFF] text-[#111318] placeholder:text-[#8A8F9A] focus:bg-white focus:ring-2 focus:ring-[#4A60A8]/15 focus:border-[#4A60A8]"
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2, #4A4F5B)", display: "block", marginBottom: 6 }}>Email Subject Line</label>
                            <Input
                              placeholder="e.g., Quick question from a fellow USC Trojan"
                              value={subjectLine}
                              onChange={(e) => setSubjectLine(e.target.value.slice(0, 500))}
                              className="w-full rounded-lg border-[#E5E5E0] bg-[#FAFBFF] text-[#111318] placeholder:text-[#8A8F9A] focus:bg-white focus:ring-2 focus:ring-[#4A60A8]/15 focus:border-[#4A60A8]"
                            />
                          </div>
                          <div>
                            <p style={{ fontSize: 12, color: "var(--ink-3, #8A8F9A)", lineHeight: 1.5, marginBottom: 8 }}>
                              Describe exactly what you want your emails to say, in plain English. Want to pitch your startup? Ask for an intro to their manager? Request a campus speaking slot? Just type it out.
                            </p>
                            <Textarea
                              placeholder="e.g., Write a 3-sentence email pitching my startup to university career center directors and asking for a 15-minute demo call..."
                              value={customInstructions}
                              onChange={(e) => setCustomInstructions(e.target.value.slice(0, MAX_CUSTOM_LEN))}
                              className="min-h-[72px] resize-y w-full rounded-lg border-[#E5E5E0] bg-[#FAFBFF] text-[#111318] placeholder:text-[#8A8F9A] focus:bg-white focus:ring-2 focus:ring-[#4A60A8]/15 focus:border-[#4A60A8]"
                              maxLength={MAX_CUSTOM_LEN}
                              rows={3}
                            />
                            <p style={{ fontSize: 11, color: "var(--ink-3, #8A8F9A)", textAlign: "right", marginTop: 4 }}>
                              {MAX_CUSTOM_LEN - customInstructions.length} characters left
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid var(--line, #E5E5E0)",
                      background: "var(--paper-2, #FAFBFF)",
                      padding: "16px 20px",
                      marginBottom: 26,
                      opacity: 0.6,
                      cursor: "default",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <LockKeyhole style={{ width: 14, height: 14, color: "var(--ink-3, #8A8F9A)" }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-3, #8A8F9A)" }}>Create Your Own Template</span>
                        <span style={{ fontSize: 11, color: "var(--ink-3, #8A8F9A)" }}>Elite, free trial available</span>
                      </div>
                    </div>
                  )}

                  {/* SIGN OFF */}
                  <div style={{ marginBottom: 26 }}>
                    <div style={SECTION_LABEL}>Sign Off</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {SIGNOFF_PRESETS.map((preset) => (
                        <Pill
                          key={preset}
                          active={signoffPhrase === preset}
                          onClick={() => {
                            setSignoffPhrase(preset);
                            setSignoffPhraseCustom("");
                          }}
                        >
                          {preset}
                        </Pill>
                      ))}
                      <Pill active={signoffPhrase === "custom"} onClick={() => setSignoffPhrase("custom")}>
                        Custom
                      </Pill>
                      {signoffPhrase === "custom" && (
                        <Input
                          placeholder="e.g. Best regards,"
                          value={signoffPhraseCustom}
                          onChange={(e) => setSignoffPhraseCustom(e.target.value.slice(0, 50))}
                          className="inline-flex w-[160px] h-8 text-xs rounded-full border-[#E5E5E0]"
                          maxLength={50}
                        />
                      )}
                    </div>
                  </div>

                  {/* SIGNATURE */}
                  <div style={{ marginBottom: 26 }}>
                    <div style={SECTION_LABEL}>Signature</div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2, #4A4F5B)", display: "block", marginBottom: 6 }}>Name, university, email, LinkedIn...</label>
                    <Textarea
                      placeholder={"e.g. John Smith\nUSC | Class of 2025\njohn@example.com"}
                      value={signatureBlock}
                      onChange={(e) => setSignatureBlock(e.target.value.slice(0, 500))}
                      className="min-h-[90px] resize-y w-full rounded-lg border-[#E5E5E0] bg-[#FAFBFF] text-sm text-[#111318] placeholder:text-[#8A8F9A] focus:bg-white focus:ring-2 focus:ring-[#4A60A8]/15 focus:border-[#4A60A8]"
                      maxLength={500}
                      rows={3}
                    />
                    <p style={{ fontSize: 11, color: "var(--ink-3, #8A8F9A)", textAlign: "right", marginTop: 4 }}>{500 - signatureBlock.length} characters left</p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                    <ResultActionButton variant="primary" onClick={handleApplyToSearch} disabled={isSaving}>
                      Apply to this search
                    </ResultActionButton>
                    <ResultActionButton variant="secondary" onClick={handleSaveAsDefault} disabled={isSaving}>
                      {isSaving ? "Saving..." : isMakeYourOwn ? "Save Template" : "Save as default"}
                    </ResultActionButton>
                    <button
                      type="button"
                      onClick={handleReset}
                      style={{ fontSize: 13, color: "var(--ink-3, #8A8F9A)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* RIGHT: live email preview */}
                <div className="md:sticky md:top-6 self-start" style={{ borderLeft: "1px solid var(--line, #E5E5E0)", paddingLeft: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, letterSpacing: "0.14em", fontWeight: 700, color: "var(--heading, #1E2D4D)", textTransform: "uppercase" }}>Preview</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--action-fg, #E07A3E)", background: "var(--action-bg, #FBE6D6)", fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 5 }}>
                      <Sparkles style={{ width: 11, height: 11 }} /> AI Draft
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--ink-3, #8A8F9A)", marginBottom: 18 }}>
                    This is a preview. Actual emails will be personalized to each contact.
                  </p>

                  {([
                    ["To", (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--primary-50, #EEF1F9)", color: "var(--accent, #4A60A8)", borderRadius: 999, padding: "3px 9px", fontSize: 12, fontWeight: 500 }}>
                        <span style={{ width: 21, height: 21, borderRadius: "50%", background: "var(--accent, #4A60A8)", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>CN</span>
                        Contact Name
                      </span>
                    )],
                    ["From", <span style={{ color: "var(--ink-2, #4A4F5B)", fontSize: 12 }}>{userEmail}</span>],
                    ["Subject", <span style={{ color: "var(--ink-2, #4A4F5B)", fontSize: 12 }}>{subjectLine.trim() || "Auto-generated subject line"}</span>],
                  ] as [string, React.ReactNode][]).map(([label, value]) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "60px 1fr", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line-2, #F0F0ED)", fontSize: 13.5 }}>
                      <div style={{ color: "var(--ink-3, #8A8F9A)", fontWeight: 500, fontSize: 12 }}>{label}</div>
                      <div>{value}</div>
                    </div>
                  ))}

                  <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.7, color: "var(--ink-2, #4A4F5B)", whiteSpace: "pre-wrap" }}>
                    {isMakeYourOwn
                      ? "Your emails will be generated based on your instructions above. Each email will be personalized to the contact."
                      : previewBody
                        ? previewBody
                        : "Select a template to preview a sample email."}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
