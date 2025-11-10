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
import { db, storage } from '@/lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';



export default function AccountSettings() {
  const navigate = useNavigate();
  const { user, signOut } = useFirebaseAuth();
  
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
  const [resumeData, setResumeData] = useState<any>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  
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

  // Load resume from Firestore
  const loadResumeFromFirestore = async () => {
    try {
      const { auth } = await import('../lib/firebase');
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data() as any;
        setResumeUrl(data.resumeUrl || null);
        setResumeFileName(data.resumeFileName || null);

        // Keep your current localStorage-based UI in sync (optional)
        if (data.resumeParsed) {
          localStorage.setItem('resumeData', JSON.stringify({
            name: data.resumeParsed.name || '',
            year: data.resumeParsed.year || '',
            major: data.resumeParsed.major || '',
            university: data.resumeParsed.university || '',
            fileName: data.resumeFileName || 'Resume.pdf',
            uploadDate: data.resumeUpdatedAt || new Date().toISOString(),
          }));
          setResumeData(JSON.parse(localStorage.getItem('resumeData') || '{}'));
        } else {
          // Clear local state if no resume in Firestore
          setResumeData(null);
          localStorage.removeItem('resumeData');
        }
      } else {
        setResumeUrl(null);
        setResumeFileName(null);
        setResumeData(null);
      }
    } catch (e) {
      console.error('Failed to load resume from Firestore', e);
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
      // 1) Parse resume via backend (keeps your existing logic)
      const fileReader = new FileReader();
      const readFilePromise = new Promise<string>((resolve, reject) => {
        fileReader.onload = () => resolve(fileReader.result as string);
        fileReader.onerror = reject;
        fileReader.readAsDataURL(file);
      });
      const base64File = await readFilePromise;

      const formData = new FormData();
      formData.append('resume', file);

      const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://www.offerloop.ai';

      const { auth } = await import('../lib/firebase');
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const response = await fetch(`${API_URL}/api/parse-resume`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to parse resume');

      // 2) Upload the PDF to Firebase Storage
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');

      const ts = Date.now();
      const storagePath = `resumes/${uid}/${ts}-${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);

      // 3) Get a download URL and write to Firestore
      const downloadUrl = await getDownloadURL(storageRef);
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        resumeUrl: downloadUrl,
        resumeFileName: file.name,
        resumeUpdatedAt: new Date().toISOString(),
        resumeParsed: {
          name: result.data.name || '',
          university: result.data.university || '',
          major: result.data.major || '',
          year: result.data.year || '',
        },
      });

      // 4) Update local state immediately
      setResumeUrl(downloadUrl);
      setResumeFileName(file.name);

      // 5) Keep your current local state/localStorage (backward-compat)
      const parsed = {
        name: result.data.name || '',
        year: result.data.year || '',
        major: result.data.major || '',
        university: result.data.university || '',
        fileName: file.name,
        uploadDate: new Date().toISOString(),
      };
      localStorage.setItem('resumeData', JSON.stringify(parsed));
      localStorage.setItem('resumeFile', base64File.split(',')[1]);
      setResumeData({ ...parsed });
      setResumeFile(base64File.split(',')[1]);
      event.target.value = '';

      // 6) Reload from Firestore to ensure UI is in sync
      await loadResumeFromFirestore();
      
      // Force a tiny refresh of the UI that shows resume details
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle resume deletion
  const handleResumeDelete = async () => {
    try {
      const { auth } = await import('../lib/firebase');
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');

      // If we have a storage URL, try deleting the file
      if (resumeUrl) {
        try {
          const fileRef = ref(storage, resumeUrl);
          await deleteObject(fileRef);
        } catch (deleteErr) {
          console.warn('Could not delete file from storage (may already be deleted):', deleteErr);
        }
      }

      // Clear Firestore pointers
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        resumeUrl: null,
        resumeFileName: null,
        resumeUpdatedAt: null,
        resumeParsed: null,
      });

      // Clear local state & localStorage
      setResumeUrl(null);
      setResumeFileName(null);
      setResumeData(null);
      setResumeFile(null);
      localStorage.removeItem('resumeData');
      localStorage.removeItem('resumeFile');

      await loadResumeFromFirestore();
    } catch (e) {
      console.error('Delete resume failed', e);
      alert('Could not delete resume. Please try again.');
    }
  };

  // Load user data on mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { auth } = await import('../lib/firebase');
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          
          if (data) {
            const { firstName, lastName } = parseName(data.name);
            setPersonalInfo({
              firstName: firstName || data.firstName || "",
              lastName: lastName || data.lastName || "",
              email: data.email || user?.email || "",
              university: data.university || "",
            });

            setAcademicInfo({
              graduationMonth: data.graduationMonth || "",
              graduationYear: data.graduationYear || "",
              fieldOfStudy: data.fieldOfStudy || data.major || "",
              currentDegree: data.currentDegree || "",
            });

            setCareerInfo({
              industriesOfInterest: data.industriesOfInterest || [],
              preferredJobRole: data.preferredJobRole || "",
              preferredLocations: data.preferredLocations || [],
              jobTypes: data.jobTypes || [],
            });
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    };

    // Load resume data from localStorage
    const storedResumeData = localStorage.getItem('resumeData');
    const storedResumeFile = localStorage.getItem('resumeFile');
    
    if (storedResumeData) {
      try {
        setResumeData(JSON.parse(storedResumeData));
      } catch (error) {
        console.error('Error parsing stored resume data:', error);
      }
    }
    
    if (storedResumeFile) {
      setResumeFile(storedResumeFile);
    }

    loadUserData();
    loadResumeFromFirestore();
  }, [user?.email]);

  const handleManageSubscription = async () => {
    try {
      const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://www.offerloop.ai';

      const { auth } = await import('../lib/firebase');
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const response = await fetch(`${API_URL}/api/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error creating portal session:', error);
      alert('Unable to open billing portal. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Account Settings</h1>
                <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
              </div>
            </div>
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary">
                {personalInfo.firstName && personalInfo.lastName
                  ? `${personalInfo.firstName[0]}${personalInfo.lastName[0]}`
                  : user?.email?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Personal Information Card */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={personalInfo.firstName}
                    readOnly
                    className="bg-muted/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={personalInfo.lastName}
                    readOnly
                    className="bg-muted/30"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={personalInfo.email}
                  readOnly
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="university">University</Label>
                <Input
                  id="university"
                  value={personalInfo.university}
                  readOnly
                  className="bg-muted/30"
                />
              </div>
            </CardContent>
          </Card>

          {/* Academic Information Card */}
          <Card>
            <CardHeader>
              <CardTitle>Academic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="graduationMonth">Graduation Month</Label>
                  <Input
                    id="graduationMonth"
                    value={academicInfo.graduationMonth}
                    readOnly
                    className="bg-muted/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="graduationYear">Graduation Year</Label>
                  <Input
                    id="graduationYear"
                    value={academicInfo.graduationYear}
                    readOnly
                    className="bg-muted/30"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fieldOfStudy">Field of Study</Label>
                <Input
                  id="fieldOfStudy"
                  value={academicInfo.fieldOfStudy}
                  readOnly
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentDegree">Current Degree</Label>
                <Input
                  id="currentDegree"
                  value={academicInfo.currentDegree}
                  readOnly
                  className="bg-muted/30"
                />
              </div>
            </CardContent>
          </Card>

          {/* Professional Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle>Professional Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {/* Resume Upload Section */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Resume</Label>
                  {(() => {
                    if (resumeData) {
                      return (
                        <div className="relative bg-muted/30 rounded-lg border p-4">
                          <div className="flex items-start gap-4">
                            <FileText className="h-10 w-10 text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-foreground truncate">
                                {resumeData.fileName || 'Resume.pdf'}
                              </h4>
                              <div className="text-sm text-muted-foreground space-y-1 mt-2">
                                {resumeData.name && (
                                  <p className="flex items-center gap-2">
                                    <span className="font-medium">Name:</span>
                                    <span>{resumeData.name}</span>
                                  </p>
                                )}
                                {resumeData.university && (
                                  <p className="flex items-center gap-2">
                                    <span className="font-medium">University:</span>
                                    <span>{resumeData.university}</span>
                                  </p>
                                )}
                                {resumeData.major && (
                                  <p className="flex items-center gap-2">
                                    <span className="font-medium">Major:</span>
                                    <span>{resumeData.major}</span>
                                  </p>
                                )}
                                {resumeData.year && (
                                  <p className="flex items-center gap-2">
                                    <span className="font-medium">Year:</span>
                                    <span>{resumeData.year}</span>
                                  </p>
                                )}
                                {resumeData.uploadDate && (
                                  <p className="text-xs mt-2">
                                    Uploaded: {new Date(resumeData.uploadDate).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2 mt-4">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (resumeUrl) {
                                      // Use Firestore URL with cache-busting
                                      const bust = `${resumeUrl}${resumeUrl.includes('?') ? '&' : '?'}cb=${Date.now()}`;
                                      window.open(bust, '_blank');
                                      return;
                                    }
                                    // Fallback to base64 if resumeUrl not available
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
                                      alert('Resume file not available. Please upload your resume.');
                                    }
                                  }}
                                  disabled={!resumeUrl && !resumeFile}
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
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={handleResumeDelete}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Resume
                                </Button>
                              </div>
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