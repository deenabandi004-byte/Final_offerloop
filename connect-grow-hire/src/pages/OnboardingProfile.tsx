import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowRight, ArrowLeft, User, Upload, FileText } from "lucide-react";
import profileIllustration from "@/assets/profile-setup-illustration.png";
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
  onBack: () => void;
  initialData?: ProfileData;
}

export const OnboardingProfile = ({ onNext, onBack, initialData }: OnboardingProfileProps) => {
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
    onNext(profile);
  };

  const getInitials = () => {
    return `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();
  };

  const handleResumeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isValidResumeFile(file)) {
        // File type validation - user can still proceed but will see error later
        console.warn('Invalid resume file type:', file.name);
      }
      setProfile(prev => ({ ...prev, resume: file }));
    }
  };

  const triggerResumeUpload = () => {
    resumeInputRef.current?.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
      <div className="space-y-8">
        <div className="space-y-6">
          <h2 className="text-4xl lg:text-5xl font-bold text-foreground">
            Create Your{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Profile
            </span>
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Set up your profile to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          <div className="space-y-4 mb-6">
            <Label className="text-foreground font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Resume Upload (Highly Recommended)
            </Label>
            <div className="flex items-center space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={triggerResumeUpload}
                className="flex items-center space-x-2"
              >
                <Upload className="h-4 w-4" />
                <span>Choose Resume File</span>
              </Button>
              {profile.resume && (
                <span className="text-sm text-muted-foreground">
                  {profile.resume.name}
                </span>
              )}
            </div>
            <input
              ref={resumeInputRef}
              type="file"
              accept={ACCEPTED_RESUME_TYPES.accept}
              onChange={handleResumeUpload}
              className="hidden"
            />
            <p className="text-xs text-muted-foreground">
              Accepted formats: PDF, DOCX, DOC (Max 10MB)
              <span className="text-blue-600 ml-1">(DOCX recommended for best optimization)</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Your resume allows us to create more personalized and effective outreach emails.
            </p>
          </div>

          <div className="pt-4">
            <h3 className="text-lg font-semibold text-foreground mb-4">Personal</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-foreground font-medium">First Name</Label>
              <Input
                id="firstName"
                value={profile.firstName}
                onChange={(e) => setProfile(prev => ({ ...prev, firstName: e.target.value }))}
                placeholder="Enter your first name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-foreground font-medium">Last Name</Label>
              <Input
                id="lastName"
                value={profile.lastName}
                onChange={(e) => setProfile(prev => ({ ...prev, lastName: e.target.value }))}
                placeholder="Enter your last name"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Enter your email address"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-foreground font-medium">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="Enter your phone number"
              />
            </div>
          </div>

          <div className="flex justify-between pt-8">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="px-8 py-3 rounded-full font-semibold"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            
            <Button
              type="submit"
              variant="gradient"
              className="px-12 py-3 rounded-full font-bold group"
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </form>
      </div>

      <div className="hidden lg:flex items-center justify-center">
        <img 
          src={profileIllustration} 
          alt="Profile setup illustration" 
          className="w-full max-w-md h-auto object-contain"
        />
      </div>
    </div>
  );
};