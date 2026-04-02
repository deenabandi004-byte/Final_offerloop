import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload } from "lucide-react";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatar?: string;
  resume?: File;
}

interface OnboardingProfileProps {
  onNext: (data: ProfileData) => void;
  initialData?: ProfileData;
}

export const OnboardingProfile = ({ onNext, initialData }: OnboardingProfileProps) => {
  const [profile, setProfile] = useState<ProfileData>({
    firstName: initialData?.firstName || "",
    lastName: initialData?.lastName || "",
    email: initialData?.email || "",
    phone: initialData?.phone || "",
    avatar: initialData?.avatar,
    resume: initialData?.resume,
  });

  const resumeInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.firstName.trim() || !profile.lastName.trim() || !profile.email.trim()) return;
    onNext(profile);
  };

  const handleResumeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isValidResumeFile(file)) {
        console.warn("Invalid resume file type:", file.name);
      }
      setProfile((prev) => ({ ...prev, resume: file }));
    }
  };

  const triggerResumeUpload = () => {
    resumeInputRef.current?.click();
  };

  return (
    <div>
      <p
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#94A3B8",
          marginBottom: 8,
        }}
      >
        Step 2 of 4
      </p>
      <h1
        className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Tell us about yourself
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8">
        Just the basics to create your account.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* First + Last name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-[#0F172A] mb-1.5 block">
              First name
            </label>
            <Input
              placeholder="Alex"
              value={profile.firstName}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, firstName: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#0F172A] mb-1.5 block">
              Last name
            </label>
            <Input
              placeholder="Chen"
              value={profile.lastName}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, lastName: e.target.value }))
              }
              required
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-1.5 block">
            Email
          </label>
          <Input
            type="email"
            placeholder="you@university.edu"
            value={profile.email}
            onChange={(e) =>
              setProfile((prev) => ({ ...prev, email: e.target.value }))
            }
            required
          />
        </div>

        {/* Phone */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-1.5 block">
            Phone{" "}
            <span className="text-[#94A3B8] font-normal">(optional)</span>
          </label>
          <Input
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={profile.phone}
            onChange={(e) =>
              setProfile((prev) => ({ ...prev, phone: e.target.value }))
            }
          />
        </div>

        {/* Resume upload — de-emphasized, optional */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-1.5 block">
            Resume{" "}
            <span className="text-[#94A3B8] font-normal">
              (optional — you can add this later)
            </span>
          </label>
          <div
            onClick={triggerResumeUpload}
            style={{
              border: "1.5px dashed #E2E8F0",
              borderRadius: 3,
              padding: "20px 16px",
              background: "#FAFBFF",
              cursor: "pointer",
              textAlign: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#3B82F6";
              e.currentTarget.style.background = "#F0F7FF";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#E2E8F0";
              e.currentTarget.style.background = "#FAFBFF";
            }}
          >
            <Upload
              size={16}
              color="#94A3B8"
              style={{ margin: "0 auto 6px" }}
            />
            <p className="text-sm text-[#0F172A]">
              {profile.resume
                ? profile.resume.name
                : "Drop your resume here or click to browse"}
            </p>
            <p className="text-xs text-[#94A3B8] mt-1">
              PDF or DOCX · max 10MB
            </p>
          </div>
          <input
            ref={resumeInputRef}
            type="file"
            accept={ACCEPTED_RESUME_TYPES.accept}
            onChange={handleResumeUpload}
            className="hidden"
          />
        </div>

        {/* Footer */}
        <div
          className="flex justify-end mt-8 pt-6"
          style={{ borderTop: "1px solid #E2E8F0" }}
        >
          <Button
            type="submit"
            variant="default"
            size="default"
            className="min-w-[120px]"
          >
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
};
