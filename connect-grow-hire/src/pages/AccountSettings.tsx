import { ArrowLeft, Upload, Trash2, LogOut, CreditCard, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

export default function AccountSettings() {
  const navigate = useNavigate();
const { user } = useFirebaseAuth();
  
  // State for form data populated from onboarding
  const [personalInfo, setPersonalInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    university: "",
  });

  const [academicInfo, setAcademicInfo] = useState({
    graduationMonth: "",
    graduationYear: "",
    fieldOfStudy: "",
    currentDegree: "",
  });

  const [careerInfo, setCareerInfo] = useState({
    industriesOfInterest: [] as string[],
    preferredJobRole: "",
    preferredLocations: [] as string[],
    jobTypes: [] as string[],
  });

  // Upload-related state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<string | null>(null);

  const parseName = (fullName: string | undefined) => {
    if (!fullName || typeof fullName !== 'string') {
      return { firstName: "", lastName: "" };
    }
    const nameParts = fullName.trim().split(' ');
    if (nameParts.length === 0) {
      return { firstName: "", lastName: "" };
    } else if (nameParts.length === 1) {
      return { firstName: nameParts[0], lastName: "" };
    } else {
      return { 
        firstName: nameParts[0], 
        lastName: nameParts.slice(1).join(' ')
      };
    }
  };

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError("Please upload a PDF file");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Convert file to base64 for storage
      const fileReader = new FileReader();
      
      const readFilePromise = new Promise<string>((resolve, reject) => {
        fileReader.onload = () => resolve(fileReader.result as string);
        fileReader.onerror = reject;
        fileReader.readAsDataURL(file);
      });

      const base64File = await readFilePromise;
      
      const formData = new FormData();
      formData.append('resume', file);

      const response = await fetch('http://localhost:5001/api/parse-resume', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse resume');
      }

      // Store both the parsed data and the file
      const resumeData = {
        name: result.data.name || '',
        year: result.data.year || '',
        major: result.data.major || '',
        university: result.data.university || '',
        fileName: file.name,
        uploadDate: new Date().toISOString()
      };
      
      localStorage.setItem('resumeData', JSON.stringify(resumeData));
      localStorage.setItem('resumeFile', base64File.split(',')[1]); // Store base64 without data URL prefix

      // Update the personal info with the new data
      const { firstName, lastName } = parseName(resumeData.name);
      setPersonalInfo(prev => ({
        ...prev,
        firstName: firstName || prev.firstName,
        lastName: lastName || prev.lastName,
        university: resumeData.university || prev.university,
      }));

      setAcademicInfo(prev => ({
        ...prev,
        fieldOfStudy: resumeData.major || prev.fieldOfStudy,
        graduationYear: resumeData.year || prev.graduationYear,
      }));

      // Update resume file state
      setResumeFile(base64File.split(',')[1]);
      
      // Reset the file input
      event.target.value = '';
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setUploadError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const getUserInitials = () => {
    if (personalInfo.firstName && personalInfo.lastName) {
      return personalInfo.firstName.charAt(0) + personalInfo.lastName.charAt(0);
    }
    return "N";
  };

  const handleSignOut = async () => {
    navigate('/');
  };

  const handleManageSubscription = () => {
    navigate('/pricing');
  };

  const getMaxEmailsForTier = (tierName: string) => {
    if (tierName === 'pro') return 56;
    return 8;
  };

  const maxEmails = getMaxEmailsForTier(user?.tier || 'free');

  useEffect(() => {
    // Load data from localStorage that was saved during onboarding
    try {
      // Get professional info from onboarding
      const professionalInfo = JSON.parse(localStorage.getItem('professionalInfo') || '{}');
      
      // Get resume data if available
      const resumeDataStr = localStorage.getItem('resumeData');
      const resumeData = resumeDataStr ? JSON.parse(resumeDataStr) : null;
      
      // Get resume file if available
      const storedResumeFile = localStorage.getItem('resumeFile');
      if (storedResumeFile) {
        setResumeFile(storedResumeFile);
      }

      const { firstName, lastName } = parseName(resumeData?.name);

      setPersonalInfo({
        firstName: firstName || professionalInfo.firstName || "",
        lastName: lastName || professionalInfo.lastName || "",
        email: user?.email || "",
        university: resumeData?.university || professionalInfo.university || "",
      });

      setAcademicInfo({
        graduationMonth: professionalInfo.graduationMonth || "May",
        graduationYear: professionalInfo.graduationYear || resumeData?.year || "2027",
        fieldOfStudy: professionalInfo.fieldOfStudy || resumeData?.major || "Finance",
        currentDegree: professionalInfo.currentDegree || "BA",
      });

      setCareerInfo({
        industriesOfInterest: Array.isArray(professionalInfo.industriesOfInterest) 
          ? professionalInfo.industriesOfInterest 
          : ["Investment Banking", "Management Consulting"],
        preferredJobRole: professionalInfo.preferredJobRole || "Associate Consulting and Investment Banking Analyst",
        preferredLocations: Array.isArray(professionalInfo.preferredLocations) 
          ? professionalInfo.preferredLocations 
          : ["Los Angeles", "New York"],
        jobTypes: Array.isArray(professionalInfo.jobTypes) 
          ? professionalInfo.jobTypes 
          : ["Full-time"],
      });
    } catch (e) {
      console.error('Failed to load onboarding data', e);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/home')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Profile</h1>
            <p className="text-muted-foreground">Manage your account settings and credits</p>
          </div>
        </div>

        <div className="space-y-8">
          {/* Personal Details Section */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Picture */}
              <div className="flex items-center gap-6">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="text-xl font-semibold bg-primary text-primary-foreground">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-medium text-foreground">Profile Picture</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">PNGs, JPEGs under 10MB</p>
                  <div className="flex gap-3">
                    <Button size="sm" className="bg-primary hover:bg-primary/90">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Photo
                    </Button>
                    <Button variant="outline" size="sm">
                      Remove
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Full Name */}
              <div className="space-y-4">
                <Label className="text-sm font-medium text-foreground">Full Name</Label>
                <p className="text-sm text-muted-foreground">Your first and last name, as visible to others.</p>
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    value={personalInfo.firstName}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="First name"
                    className="bg-background border-input"
                  />
                  <Input 
                    value={personalInfo.lastName}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Last name"
                    className="bg-background border-input"
                  />
                </div>
              </div>

              <Separator />

              {/* Email */}
              <div className="space-y-4">
                <Label className="text-sm font-medium text-foreground">Email</Label>
                <div className="flex items-center gap-4">
                  <Input 
                    value={personalInfo.email}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Email address"
                    type="email"
                    className="bg-background border-input flex-1"
                  />
                  <div className="flex gap-3">
                    <Button variant="outline" size="sm">
                      Reset Password
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Graduation Date */}
              <div className="space-y-4">
                <Label className="text-sm font-medium text-foreground">Graduation Date</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Month</Label>
                    <Input 
                      value={academicInfo.graduationMonth}
                      onChange={(e) => setAcademicInfo(prev => ({ ...prev, graduationMonth: e.target.value }))}
                      placeholder="Month"
                      className="bg-background border-input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Year</Label>
                    <Input 
                      value={academicInfo.graduationYear}
                      onChange={(e) => setAcademicInfo(prev => ({ ...prev, graduationYear: e.target.value }))}
                      placeholder="Year"
                      className="bg-background border-input"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Field of Study */}
              <div className="space-y-4">
                <Label className="text-sm font-medium text-foreground">Field of Study</Label>
                <Input 
                  value={academicInfo.fieldOfStudy}
                  onChange={(e) => setAcademicInfo(prev => ({ ...prev, fieldOfStudy: e.target.value }))}
                  placeholder="Field of Study"
                  className="bg-background border-input"
                />
              </div>

              <Separator />

              {/* Current Degree */}
              <div className="space-y-4">
                <Label className="text-sm font-medium text-foreground">Current Degree</Label>
                <Input 
                  value={academicInfo.currentDegree}
                  onChange={(e) => setAcademicInfo(prev => ({ ...prev, currentDegree: e.target.value }))}
                  placeholder="Current Degree"
                  className="bg-background border-input"
                />
              </div>
            </CardContent>
          </Card>

          {/* Credit Usage Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Credit Usage Jul-Aug 2025</CardTitle>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {user ? `${user.credits ?? 0},${user.maxCredits ?? 0} credits` : "12,127 credits"}
                </p>
                {user && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Emails this month: {(user.emailsUsedThisMonth || 0)} / {maxEmails}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      Current tier: {user.tier || 'free'} 
                      {user.tier === 'free' && ' (8 emails, 120 credits)'}
                      {user.tier === 'pro' && ' (56 emails, 840 credits)'}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  Billing Period
                </Button>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  ← Jul-Aug 2025 →
                </Button>
                <Button className="bg-primary hover:bg-primary/90" size="sm">
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-muted/30 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <p className="text-muted-foreground">Credit usage chart</p>
                  <p className="text-sm text-muted-foreground">Chart visualization would go here</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resume and Career Interests Section */}
          <Card>
            <CardHeader>
              <CardTitle>Resume and Career Interests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Resume Section */}
                <div className="space-y-4">
                  <Label className="text-sm font-medium text-foreground">Resume</Label>
                  {(() => {
                    const resumeDataStr = localStorage.getItem('resumeData');
                    const hasResume = resumeDataStr && resumeDataStr !== '{}' && resumeDataStr !== 'null' && resumeDataStr !== 'undefined';
                    
                    if (hasResume) {
                      let parsedResume;
                      try {
                        parsedResume = JSON.parse(resumeDataStr);
                      } catch (e) {
                        console.error('Error parsing resume data:', e);
                        return (
                          <div className="h-48 bg-muted/30 rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center p-6">
                            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-sm text-muted-foreground text-center mb-3">
                              {isUploading ? "Processing resume..." : "No resume uploaded"}
                            </p>
                            {uploadError && (
                              <p className="text-xs text-destructive mb-3">{uploadError}</p>
                            )}
                            <label htmlFor="resume-upload" className="cursor-pointer">
                              <Button variant="outline" size="sm" disabled={isUploading} asChild>
                                <span>
                                  <Upload className="h-4 w-4 mr-2" />
                                  {isUploading ? "Uploading..." : "Upload Resume"}
                                </span>
                              </Button>
                              <input
                                id="resume-upload"
                                type="file"
                                accept=".pdf"
                                onChange={handleResumeUpload}
                                className="hidden"
                                disabled={isUploading}
                              />
                            </label>
                            {user?.tier === 'pro' && (
                              <p className="text-xs text-green-600 mt-2">✓ Resume analysis available</p>
                            )}
                          </div>
                        );
                      }
                      
                      // Check if the parsed resume actually has meaningful data
                      const hasValidData = parsedResume && (
                        parsedResume.name || 
                        parsedResume.university || 
                        parsedResume.major || 
                        parsedResume.year
                      );
                      
                      if (!hasValidData) {
                        // Show upload prompt if no valid data
                        return (
                          <div className="h-48 bg-muted/30 rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center p-6">
                            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-sm text-muted-foreground text-center mb-3">
                              {isUploading ? "Processing resume..." : "No resume uploaded"}
                            </p>
                            {uploadError && (
                              <p className="text-xs text-destructive mb-3">{uploadError}</p>
                            )}
                            <label htmlFor="resume-upload" className="cursor-pointer">
                              <Button variant="outline" size="sm" disabled={isUploading} asChild>
                                <span>
                                  <Upload className="h-4 w-4 mr-2" />
                                  {isUploading ? "Uploading..." : "Upload Resume"}
                                </span>
                              </Button>
                              <input
                                id="resume-upload"
                                type="file"
                                accept=".pdf"
                                onChange={handleResumeUpload}
                                className="hidden"
                                disabled={isUploading}
                              />
                            </label>
                            {user?.tier === 'pro' && (
                              <p className="text-xs text-green-600 mt-2">✓ Resume analysis available</p>
                            )}
                          </div>
                        );
                      }
                      
                      return (
                        <div className="h-48 bg-background rounded-lg border border-input p-4 overflow-auto">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 mb-3">
                              <FileText className="h-5 w-5 text-primary" />
                              <span className="font-medium text-sm">
                                {parsedResume.fileName || "Resume.pdf"}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p><strong>Name:</strong> {parsedResume.name || `${personalInfo.firstName} ${personalInfo.lastName}`}</p>
                              <p><strong>University:</strong> {parsedResume.university || personalInfo.university}</p>
                              <p><strong>Major:</strong> {parsedResume.major || academicInfo.fieldOfStudy}</p>
                              <p><strong>Graduation:</strong> {parsedResume.year || academicInfo.graduationYear}</p>
                              {parsedResume.uploadDate && (
                                <p><strong>Uploaded:</strong> {new Date(parsedResume.uploadDate).toLocaleDateString()}</p>
                              )}
                            </div>
                            <div className="flex gap-2 mt-3">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  if (resumeFile) {
                                    try {
                                      const byteCharacters = atob(resumeFile);
                                      const byteNumbers = new Array(byteCharacters.length);
                                      for (let i = 0; i < byteCharacters.length; i++) {
                                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                                      }
                                      const byteArray = new Uint8Array(byteNumbers);
                                      const blob = new Blob([byteArray], { type: 'application/pdf' });
                                      const url = URL.createObjectURL(blob);
                                      window.open(url, '_blank');
                                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                                    } catch (error) {
                                      console.error('Error opening resume:', error);
                                      alert('Error opening resume file. Please try re-uploading.');
                                    }
                                  } else {
                                    alert('Resume file not available. Please re-upload your resume.');
                                  }
                                }}
                                disabled={!resumeFile}
                              >
                                View Full Resume
                              </Button>
                              <label htmlFor="resume-replace" className="cursor-pointer">
                                <Button variant="outline" size="sm" asChild>
                                  <span>Replace Resume</span>
                                </Button>
                                <input
                                  id="resume-replace"
                                  type="file"
                                  accept=".pdf"
                                  onChange={handleResumeUpload}
                                  className="hidden"
                                  disabled={isUploading}
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div className="h-48 bg-muted/30 rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center p-6">
                          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                          <p className="text-sm text-muted-foreground text-center mb-3">
                            {isUploading ? "Processing resume..." : "No resume uploaded"}
                          </p>
                          {uploadError && (
                            <p className="text-xs text-destructive mb-3">{uploadError}</p>
                          )}
                          <label htmlFor="resume-upload" className="cursor-pointer">
                            <Button variant="outline" size="sm" disabled={isUploading} asChild>
                              <span>
                                <Upload className="h-4 w-4 mr-2" />
                                {isUploading ? "Uploading..." : "Upload Resume"}
                              </span>
                            </Button>
                            <input
                              id="resume-upload"
                              type="file"
                              accept=".pdf"
                              onChange={handleResumeUpload}
                              className="hidden"
                              disabled={isUploading}
                            />
                          </label>
                          {user?.tier === 'pro' && (
                            <p className="text-xs text-green-600 mt-2">✓ Resume analysis available</p>
                          )}
                        </div>
                      );
                    }
                  })()}
                </div>

                {/* Career Interests Section */}
                <div className="space-y-4">
                  <Label className="text-sm font-medium text-foreground">Career Interests</Label>
                  
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Industries of Interest</Label>
                      <p className="text-sm text-foreground mt-1">
                        {careerInfo.industriesOfInterest.length ? careerInfo.industriesOfInterest.join(", ") : "Investment Banking and Management Consulting"}
                      </p>
                    </div>
                    
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Preferred Job Roles/Titles</Label>
                      <p className="text-sm text-foreground mt-1">
                        {careerInfo.preferredJobRole || "Associate Consulting and Investment Banking Analyst"}
                      </p>
                    </div>
                    
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Preferred Locations</Label>
                      <p className="text-sm text-foreground mt-1">
                        {careerInfo.preferredLocations.length ? careerInfo.preferredLocations.join(" and ") : "Los Angeles and New York"}
                      </p>
                    </div>
                    
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Job Type(s) Interested in</Label>
                      <p className="text-sm text-foreground mt-1">
                        {careerInfo.jobTypes.length ? careerInfo.jobTypes.join(", ") : "Full-time"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Management Section */}
          <Card>
            <CardHeader>
              <CardTitle>Account Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                <div>
                  <h4 className="font-medium text-foreground mb-1">Subscription</h4>
                  <p className="text-sm text-muted-foreground">
                    Manage your subscription plan and billing settings
                  </p>
                  {user?.tier && (
                    <p className="text-xs text-muted-foreground mt-1 capitalize">
                      Current: {user.tier} tier
                    </p>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleManageSubscription}
                  className="flex items-center gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  Manage Subscription
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                <div>
                  <h4 className="font-medium text-foreground mb-1">Sign Out</h4>
                  <p className="text-sm text-muted-foreground">
                    Sign out of your account on this device
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSignOut}
                  className="flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle className="text-destructive">Danger zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-destructive/5 rounded-lg border border-destructive/20">
                <div>
                  <h4 className="font-medium text-destructive mb-1">Delete your account</h4>
                  <p className="text-sm text-muted-foreground">
                    This will permanently delete your account and all your data. This action cannot be undone.
                  </p>
                </div>
                <Button variant="destructive" size="sm" className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}