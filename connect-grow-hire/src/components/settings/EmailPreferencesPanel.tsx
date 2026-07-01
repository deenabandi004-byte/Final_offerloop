import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { BACKEND_URL } from "@/services/api";
import { Check } from "lucide-react";
import { toast } from "sonner";

type Prefs = {
  productTips: boolean;
  recruitingPlaybook: boolean;
  weeklyRecap: boolean;
  activityDigest: boolean;
};

const DEFAULT_PREFS: Prefs = {
  productTips: true,
  recruitingPlaybook: true,
  weeklyRecap: true,
  activityDigest: true,
};

const PREF_META: Array<{ key: keyof Prefs; title: string; description: string }> = [
  {
    key: "productTips",
    title: "Product tips & activation",
    description:
      "First-week welcome emails and occasional tips as you unlock new parts of Offerloop.",
  },
  {
    key: "recruitingPlaybook",
    title: "Recruiting playbook (newsletter)",
    description:
      "Twice a week during recruiting season — new roles, playbooks, and industry news from your school and target industry.",
  },
  {
    key: "weeklyRecap",
    title: "Weekly recap",
    description:
      "Sunday summary of your outreach, replies, and progress vs. peers.",
  },
  {
    key: "activityDigest",
    title: "Agent activity digest",
    description:
      "Daily summary from your Loop agent — contacts found, drafts ready, jobs discovered. Sent from your own Gmail.",
  },
];

export default function EmailPreferencesPanel() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof Prefs | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`${BACKEND_URL}/api/users/email-preferences`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        setPrefs({ ...DEFAULT_PREFS, ...(body.preferences || {}) });
      } catch (err) {
        console.warn("Failed to load email preferences", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (key: keyof Prefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSavingKey(key);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("not signed in");
      const res = await fetch(`${BACKEND_URL}/api/users/email-preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: !next[key] }));  // roll back on failure
      toast.error("Couldn't update email preferences — try again");
      console.error(err);
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-[#64748B]">Loading email preferences…</div>
    );
  }

  return (
    <div className="space-y-3">
      {PREF_META.map((meta) => {
        const checked = prefs[meta.key];
        const saving = savingKey === meta.key;
        return (
          <button
            type="button"
            key={meta.key}
            onClick={() => !saving && toggle(meta.key)}
            className="flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all"
            style={{
              borderColor: checked ? "#1E3A8A" : "#E2E8F0",
              background: checked ? "#EFF6FF" : "#FFFFFF",
              opacity: saving ? 0.7 : 1,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            <span
              className="mt-0.5 flex h-5 w-5 items-center justify-center rounded border shrink-0"
              style={{
                borderColor: checked ? "#1E3A8A" : "#CBD5E1",
                background: checked ? "#1E3A8A" : "#FFFFFF",
              }}
            >
              {checked && <Check className="h-3.5 w-3.5 text-white" />}
            </span>
            <div className="min-w-0">
              <div
                className="text-sm font-semibold"
                style={{ color: checked ? "#1E3A8A" : "#0F172A" }}
              >
                {meta.title}
              </div>
              <div className="text-xs text-[#64748B] mt-1 leading-relaxed">
                {meta.description}
              </div>
            </div>
          </button>
        );
      })}
      <p className="text-xs text-[#94A3B8] mt-3">
        Transactional emails (receipts, security notices, password resets) are
        always on and aren't controlled here.
      </p>
    </div>
  );
}
