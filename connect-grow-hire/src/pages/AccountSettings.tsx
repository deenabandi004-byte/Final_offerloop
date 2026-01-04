import { ArrowLeft, Upload, Trash2, LogOut, CreditCard, FileText, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/GlassCard";
import { PageWrapper } from "@/components/PageWrapper";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { db, storage, auth } from '@/lib/firebase';
import { signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";

// Constants for dropdowns
const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const degrees = [
  "High School", "Associate's", "Bachelor's", "Master's", "PhD", "JD", "MD", "Other"
];

const jobTypesOptions = ["Internship", "Part-Time", "Full-Time"];

const interests = [
  "Accounting", "Advertising (Traditional Media)", "Advertising Technology (AdTech)", "Aerospace & Aviation",
  "Agriculture & Agribusiness", "Animation", "Apparel & Footwear Retail", "Architecture",
  "Artificial Intelligence / Machine Learning", "Auditing", "Automotive Industry", "Banking",
  "Beauty & Cosmetics", "Biotech Research", "Biotechnology", "Blockchain & Web3",
  "Childcare & Early Education", "Chemical Engineering", "Civil Engineering", "Cloud Computing",
  "Commercial Real Estate", "Construction Management", "Consumer Packaged Goods (CPG)", "Corporate Training",
  "Cyber-Physical Systems (IoT)", "Cybersecurity", "Data Science & Analytics", "Defense Contracting",
  "Digital Media & Streaming", "E-commerce", "EdTech", "Educational Technology", "Electrical Engineering",
  "Energy (Oil, Gas, Renewables)", "Entertainment (Film & TV Production)", "Environmental Consulting",
  "Event Planning", "Fashion & Apparel", "Film & Television Production",
  "Finance (Wealth Management, Private Equity, Hedge Funds)", "FinTech", "Fitness & Wellness",
  "Food & Beverage Production", "Food & Restaurants", "Freight & Shipping Services", "Gaming & Esports",
  "Government Administration", "Graphic Design", "Green Technology", "Health Insurance", "HealthTech",
  "Hedge Funds", "Higher Education / Universities", "Homeland Security", "Hospitals & Clinical Care",
  "Hospitality Management", "Human Resources / Recruiting", "Humanitarian Aid & Relief", "Immigration Services",
  "Industrial Manufacturing", "Influencer Marketing", "Insurance", "Intelligence & National Security",
  "International Development", "International Relations", "Investment Banking", "Journalism",
  "K–12 Education", "Law (Corporate, Criminal, Civil)", "Legal Tech", "Logistics & Transportation",
  "Luxury Goods", "Management Consulting", "Manufacturing Automation", "Marine & Shipping Industry",
  "Marketing & Advertising", "Mechanical Engineering", "Medical Devices", "Mental Health Services",
  "Military & Defense", "Mining & Natural Resources", "Music Industry", "Nonprofit Management",
  "Nursing", "Performing Arts", "Pharmaceuticals", "Philanthropy", "Physical Therapy & Rehabilitation",
  "Photography", "Political Campaigns", "Policy & Advocacy", "Private Equity", "Property Management",
  "Public Health", "Public Policy", "Public Transit Systems", "Publishing & Writing",
  "Real Estate Development", "Real Estate Finance", "Renewable Energy (Solar, Wind, Hydro)",
  "Residential Real Estate", "Retail & Consumer Services", "Robotics", "Social Media Management",
  "Social Work", "Software Development", "Space Exploration & Commercial Space", "Sports Management",
  "Strategy Consulting", "Supply Chain & Logistics", "Sustainability & Climate Tech", "Tax Services",
  "Telecommunications", "Telemedicine", "Transportation Infrastructure", "Travel & Tourism",
  "Urban Planning", "UX/UI Design", "Venture Capital", "Veterinary Services",
  "Virtual & Augmented Reality", "Waste Management & Recycling", "Wealth Management",
  "Wholesale & Distribution", "Wine, Beer & Spirits"
];

const locations = [
  "Akron, OH", "Albany, NY", "Albuquerque, NM", "Alexandria, VA", "Allentown, PA", "Anaheim, CA",
  "Ann Arbor, MI", "Arlington, TX", "Arlington, VA", "Atlanta, GA", "Austin, TX", "Bakersfield, CA",
  "Baltimore, MD", "Baton Rouge, LA", "Birmingham, AL", "Boise, ID", "Boston, MA", "Boulder, CO",
  "Buffalo, NY", "Burlington, VT", "Chapel Hill, NC", "Charleston, SC", "Charleston, WV", "Charlotte, NC",
  "Chattanooga, TN", "Chicago, IL", "Cincinnati, OH", "Cleveland, OH", "College Station, TX", "Colorado Springs, CO",
  "Columbia, MO", "Columbia, SC", "Columbus, OH", "Dallas, TX", "Dayton, OH", "Denver, CO",
  "Des Moines, IA", "Detroit, MI", "Durham, NC", "El Paso, TX", "Evansville, IN", "Evanston, IL",
  "Fayetteville, AR", "Fort Collins, CO", "Fort Lauderdale, FL", "Fort Worth, TX", "Fresno, CA", "Gainesville, FL",
  "Grand Rapids, MI", "Greensboro, NC", "Greenville, SC", "Harrisburg, PA", "Hartford, CT", "Houston, TX",
  "Huntsville, AL", "Indianapolis, IN", "Irvine, CA", "Ithaca, NY", "Jacksonville, FL", "Jersey City, NJ",
  "Kansas City, MO", "Knoxville, TN", "Lafayette, IN", "Lancaster, PA", "Lansing, MI", "Las Vegas, NV",
  "Lexington, KY", "Lincoln, NE", "Little Rock, AR", "Long Beach, CA", "Los Angeles, CA", "Louisville, KY",
  "Madison, WI", "Manchester, NH", "Memphis, TN", "Mesa, AZ", "Miami, FL", "Milwaukee, WI",
  "Minneapolis, MN", "Mobile, AL", "Morgantown, WV", "Nashville, TN", "Naples, FL", "Naperville, IL",
  "New Haven, CT", "New Orleans, LA", "New York, NY", "Newark, NJ", "Norfolk, VA", "Oakland, CA",
  "Oklahoma City, OK", "Omaha, NE", "Orlando, FL", "Pasadena, CA", "Peoria, IL", "Philadelphia, PA",
  "Phoenix, AZ", "Pittsburgh, PA", "Plano, TX", "Portland, OR", "Providence, RI", "Provo, UT",
  "Raleigh, NC", "Reno, NV", "Richmond, VA", "Riverside, CA", "Rochester, NY", "Sacramento, CA",
  "Salt Lake City, UT", "San Antonio, TX", "San Diego, CA", "San Francisco, CA", "San Jose, CA", "San Luis Obispo, CA",
  "Santa Ana, CA", "Santa Barbara, CA", "Santa Clara, CA", "Sarasota, FL", "Savannah, GA", "Scottsdale, AZ",
  "Seattle, WA", "Shreveport, LA", "Springfield, IL", "Springfield, MA", "Springfield, MO", "Stamford, CT",
  "State College, PA", "St. Louis, MO", "St. Paul, MN", "St. Petersburg, FL", "Syracuse, NY", "Tallahassee, FL",
  "Tampa, FL", "Tempe, AZ", "Toledo, OH", "Topeka, KS", "Tucson, AZ", "Tulsa, OK",
  "Virginia Beach, VA", "Washington, DC", "West Palm Beach, FL", "White Plains, NY", "Wichita, KS", "Wilmington, DE",
  "Winston-Salem, NC", "Worcester, MA", "Ypsilanti, MI", "San Bernardino, CA", "Glendale, AZ", "Alexandria, LA"
];

export default function AccountSettings() {
  console.log("⚙️ [ACCOUNT SETTINGS] Component rendering");
  const navigate = useNavigate();
  const { user, signOut } = useFirebaseAuth();
  console.log("⚙️ [ACCOUNT SETTINGS] User state:", { hasUser: !!user, email: user?.email || "none" });
  
  // State for form data populated from onboarding
  const [personalInfo, setPersonalInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    university: "",
    phone: "",
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

  // State for saving
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // State for multi-select popovers
  const [industriesOpen, setIndustriesOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
 
  

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
          // Handle both old format (flat) and new format (nested education)
          const parsed = data.resumeParsed;
          const education = parsed.education || {};
          const year = parsed.year || (education.graduation ? education.graduation.match(/20\d{2}/)?.[0] : '') || '';
          const major = parsed.major || education.major || '';
          const university = parsed.university || education.university || '';
          
          localStorage.setItem('resumeData', JSON.stringify({
            name: parsed.name || '',
            year: year,
            major: major,
            university: university,
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

    if (!isValidResumeFile(file)) {
      setUploadError("Please upload a PDF, DOCX, or DOC file");
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
      // NOTE: Backend already saves the complete parsed structure to Firestore
      // We only need to update the URL and filename here, not overwrite the parsed data
      const downloadUrl = await getDownloadURL(storageRef);
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        resumeUrl: downloadUrl,
        resumeFileName: file.name,
        resumeUpdatedAt: new Date().toISOString(),
        // DO NOT overwrite resumeParsed - backend already saved the complete structure
        // The backend saves: experience, projects, education, skills, etc. in v2 format
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
      setRefreshKey((k: number) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle resume deletion
  const handleResumeDelete = async () => {
    // Confirm with user
    const confirmed = window.confirm(
      'Are you sure you want to delete your resume? This cannot be undone.'
    );
    
    if (!confirmed) return;

    try {
      const { auth } = await import('../lib/firebase');
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not signed in');

      const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://www.offerloop.ai';

      // Call the backend DELETE endpoint
      const response = await fetch(`${API_URL}/api/resume`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete resume');
      }

      // Clear local state & localStorage
      setResumeUrl(null);
      setResumeFileName(null);
      setResumeData(null);
      setResumeFile(null);
      localStorage.removeItem('resumeData');
      localStorage.removeItem('resumeFile');

      // Reload resume data from Firestore to ensure UI is in sync
      await loadResumeFromFirestore();

      // Show success message
      toast({
        title: "Success",
        description: "Resume deleted successfully",
      });
    } catch (e) {
      console.error('Delete resume failed', e);
      const errorMessage = e instanceof Error ? e.message : 'Could not delete resume. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Save onboarding data handler
  const handleSaveOnboardingData = async () => {
    if (!user?.uid) {
      toast({
        title: "Error",
        description: "You must be signed in to save changes.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const userRef = doc(db, 'users', user.uid);
      
      // Prepare update payload - only update the fields we're editing
      const updates: any = {
        // Personal info
        firstName: personalInfo.firstName,
        lastName: personalInfo.lastName,
        name: `${personalInfo.firstName} ${personalInfo.lastName}`.trim(),
        university: personalInfo.university,
        phone: personalInfo.phone,
        
        // Academic info
        graduationMonth: academicInfo.graduationMonth,
        graduationYear: academicInfo.graduationYear,
        fieldOfStudy: academicInfo.fieldOfStudy,
        major: academicInfo.fieldOfStudy, // Also update major for backward compatibility
        currentDegree: academicInfo.currentDegree,
        degree: academicInfo.currentDegree, // Also update degree for backward compatibility
        
        // Career info
        industriesOfInterest: careerInfo.industriesOfInterest,
        interests: careerInfo.industriesOfInterest, // Also update interests for backward compatibility
        careerInterests: careerInfo.industriesOfInterest, // Also update careerInterests
        preferredJobRole: careerInfo.preferredJobRole,
        preferredJobRolesOrTitles: careerInfo.preferredJobRole, // Also update preferredJobRolesOrTitles
        preferredLocations: careerInfo.preferredLocations,
        preferredLocation: careerInfo.preferredLocations, // Also update preferredLocation
        jobTypes: careerInfo.jobTypes,
        jobTypesInterestedIn: careerInfo.jobTypes, // Also update jobTypesInterestedIn
      };

      // Remove undefined values
      Object.keys(updates).forEach(key => {
        if (updates[key] === undefined) {
          delete updates[key];
        }
      });

      await updateDoc(userRef, updates);

      setSaveSuccess(true);
      toast({
        title: "Success",
        description: "Your profile information has been saved.",
      });

      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving onboarding data:", error);
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
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
              firstName: firstName || data.firstName || data.profile?.firstName || "",
              lastName: lastName || data.lastName || data.profile?.lastName || "",
              email: data.email || user?.email || "",
              university: data.university || data.academics?.university || data.college || "",
              phone: data.phone || data.profile?.phone || "",
            });

            setAcademicInfo({
              graduationMonth: data.graduationMonth || data.academics?.graduationMonth || "",
              graduationYear: data.graduationYear || data.academics?.graduationYear || "",
              fieldOfStudy: data.fieldOfStudy || data.major || data.academics?.major || "",
              currentDegree: data.currentDegree || data.degree || data.academics?.degree || "",
            });

            setCareerInfo({
              industriesOfInterest: data.industriesOfInterest || data.interests || data.careerInterests || data.location?.interests || [],
              preferredJobRole: data.preferredJobRole || data.preferredJobRolesOrTitles || "",
              preferredLocations: data.preferredLocations || data.preferredLocation || data.location?.preferredLocation || [],
              jobTypes: data.jobTypes || data.jobTypesInterestedIn || data.location?.jobTypes || [],
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
      console.log("🔐 [SIGN OUT] Starting sign out process...");
      console.log("🔐 [SIGN OUT] Current user:", user?.email || "none");
      console.log("🔐 [SIGN OUT] Current path:", window.location.pathname);
      
      // CRITICAL: Update URL synchronously BEFORE clearing state
      // This ensures ProtectedRoute sees the signedOut flag and doesn't redirect to /signin
      console.log("🔐 [SIGN OUT] Step 0: Updating URL with signedOut flag...");
      window.history.replaceState({}, '', '/?signedOut=true');
      // Also update React Router's location immediately
      navigate('/?signedOut=true', { replace: true });
      console.log("✅ [SIGN OUT] Step 0 complete: URL updated synchronously");
      
      // Clear React context (ProtectedRoute will now see signedOut flag and redirect to / instead of /signin)
      console.log("🔐 [SIGN OUT] Step 1: Clearing React context...");
      await signOut();
      console.log("✅ [SIGN OUT] Step 1 complete: Context state cleared");
      
      // Sign out from Firebase
      console.log("🔐 [SIGN OUT] Step 2: Signing out from Firebase...");
      await firebaseSignOut(auth);
      console.log("✅ [SIGN OUT] Step 2 complete: Firebase signOut() called");
      
      // Wait for Firebase auth state to actually be null
      // This ensures Firebase doesn't re-authenticate from persisted storage
      console.log("🔐 [SIGN OUT] Step 3: Waiting for Firebase auth state to clear...");
      await new Promise<void>((resolve) => {
        let authStateChecked = false;
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
          console.log("🔐 [SIGN OUT] Auth state changed:", firebaseUser ? `User: ${firebaseUser.email}` : "null");
          if (firebaseUser === null && !authStateChecked) {
            authStateChecked = true;
            console.log("✅ [SIGN OUT] Step 3 complete: Firebase auth state confirmed null");
            unsubscribe();
            resolve();
          }
        });
        
        // Timeout after 2 seconds if auth state doesn't clear
        setTimeout(() => {
          if (!authStateChecked) {
            console.warn("⚠️ [SIGN OUT] Step 3 timeout: Auth state clear timeout, proceeding anyway");
            authStateChecked = true;
            unsubscribe();
            resolve();
          }
        }, 2000);
      });
      
      // Clear any Firebase auth persistence from localStorage
      console.log("🔐 [SIGN OUT] Step 4: Clearing Firebase auth from localStorage...");
      try {
        const keys = Object.keys(localStorage);
        const firebaseKeys = keys.filter(key => 
          key.startsWith('firebase:authUser:') || 
          key.startsWith('firebase:host:') || 
          key.includes('firebase')
        );
        console.log("🔐 [SIGN OUT] Found Firebase keys in localStorage:", firebaseKeys);
        firebaseKeys.forEach(key => {
          localStorage.removeItem(key);
          console.log("🔐 [SIGN OUT] Removed localStorage key:", key);
        });
        console.log("✅ [SIGN OUT] Step 4 complete: Cleared Firebase auth from localStorage");
      } catch (e) {
        console.warn("⚠️ [SIGN OUT] Step 4 error: Could not clear localStorage:", e);
      }
      
      // Final step: Force a full page reload to ensure clean state
      // Use replace to avoid adding to browser history
      // This prevents any race conditions with route guards and ensures a clean state
      console.log("🔐 [SIGN OUT] Step 5: Performing final page reload...");
      window.location.replace('/?signedOut=true');
    } catch (error) {
      console.error("❌ [SIGN OUT] Error in sign out process:", error);
      console.error("❌ [SIGN OUT] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      // Even on error, try to clear and redirect
      try {
        console.log("🔐 [SIGN OUT] Attempting cleanup after error...");
        await signOut();
        await firebaseSignOut(auth);
        // Clear localStorage on error too
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('firebase:authUser:') || key.startsWith('firebase:host:') || key.includes('firebase')) {
            localStorage.removeItem(key);
          }
        });
        console.log("✅ [SIGN OUT] Cleanup complete, redirecting...");
      } catch (e) {
        console.error("❌ [SIGN OUT] Error during cleanup:", e);
      }
      console.log("🔐 [SIGN OUT] Redirecting to /?signedOut=true (error path)");
      window.location.replace('/?signedOut=true');
    }
  };

  return (
    <PageWrapper>
      {/* Header */}
      <div className="border-b border-white/10 glass-nav">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="gap-2 text-gray-300 text-slate-700 hover:text-blue-400"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Account Settings</h1>
                <p className="text-sm text-gray-400 text-slate-600">Manage your account and preferences</p>
              </div>
            </div>
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-blue-500/20 text-blue-400 border border-blue-500/30">
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
          {/* Career & Profile Info Card */}
          <GlassCard className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white text-slate-900">Career & Profile Info</h2>
              <Button
                onClick={handleSaveOnboardingData}
                disabled={isSaving}
                className="relative overflow-hidden gap-2"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
              >
                {isSaving ? (
                  'Saving...'
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save changes
                  </>
                )}
                <InlineLoadingBar isLoading={isSaving} />
              </Button>
            </div>
            {saveSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">✓ Changes saved successfully!</p>
              </div>
            )}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4 text-white text-slate-900">Personal Information</h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-gray-300 text-slate-700">First Name</Label>
                  <Input
                    id="firstName"
                    value={personalInfo.firstName}
                    onChange={(e) => setPersonalInfo({ ...personalInfo, firstName: e.target.value })}
                    className="bg-white/5 border border-white/10 focus:border-blue-400/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={personalInfo.lastName}
                    onChange={(e) => setPersonalInfo({ ...personalInfo, lastName: e.target.value })}
                    className="bg-white/5 border border-white/10 focus:border-blue-400/50"
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
                  onChange={(e) => setPersonalInfo({ ...personalInfo, university: e.target.value })}
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={personalInfo.phone}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, phone: e.target.value })}
                  className="bg-muted/30"
                  placeholder="(555) 123-4567"
                />
              </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 text-white text-slate-900">Academic Information</h3>
                <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="graduationMonth">Graduation Month</Label>
                  <Select
                    value={academicInfo.graduationMonth}
                    onValueChange={(value) => setAcademicInfo({ ...academicInfo, graduationMonth: value })}
                  >
                    <SelectTrigger className="bg-white/5 border border-white/10 focus:border-blue-400/50">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month) => (
                        <SelectItem key={month} value={month}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="graduationYear">Graduation Year</Label>
                  <Input
                    id="graduationYear"
                    type="number"
                    value={academicInfo.graduationYear}
                    onChange={(e) => setAcademicInfo({ ...academicInfo, graduationYear: e.target.value })}
                    className="bg-white/5 border border-white/10 focus:border-blue-400/50"
                    placeholder="2024"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fieldOfStudy">Field of Study</Label>
                <Input
                  id="fieldOfStudy"
                  value={academicInfo.fieldOfStudy}
                  onChange={(e) => setAcademicInfo({ ...academicInfo, fieldOfStudy: e.target.value })}
                  className="bg-muted/30"
                  placeholder="e.g. Computer Science, Business Administration"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentDegree">Current Degree</Label>
                <Select
                  value={academicInfo.currentDegree}
                  onValueChange={(value) => setAcademicInfo({ ...academicInfo, currentDegree: value })}
                >
                  <SelectTrigger className="bg-muted/30">
                    <SelectValue placeholder="Select degree" />
                  </SelectTrigger>
                  <SelectContent>
                    {degrees.map((degree) => (
                      <SelectItem key={degree} value={degree}>
                        {degree}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 text-white text-slate-900">Professional Profile</h3>
                <div className="space-y-6">
              <div className="space-y-4">
                {/* Resume Upload Section */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-white text-slate-900">Resume</Label>
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
                                    accept={ACCEPTED_RESUME_TYPES.accept}
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
                          <div className="w-full max-w-xs space-y-2">
                            <p className="text-sm text-muted-foreground text-center">
                              {isUploading ? "Processing resume..." : "No resume uploaded"}
                            </p>
                            {isUploading && (
                              <LoadingBar variant="indeterminate" size="sm" />
                            )}
                          </div>
                          {uploadError && (
                            <p className="text-xs text-destructive mb-3">{uploadError}</p>
                          )}
                          <label htmlFor="resume-upload" className="cursor-pointer">
                            <Button variant="outline" size="sm" disabled={isUploading} className="relative overflow-hidden" asChild>
                              <span>
                                <Upload className="h-4 w-4 mr-2" />
                                {isUploading ? "Uploading..." : "Upload Resume"}
                                <InlineLoadingBar isLoading={isUploading} />
                              </span>
                            </Button>
                            <input
                              id="resume-upload"
                              type="file"
                              accept={ACCEPTED_RESUME_TYPES.accept}
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
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Industries of Interest</Label>
                      <Popover open={industriesOpen} onOpenChange={setIndustriesOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between bg-muted/30"
                          >
                            {careerInfo.industriesOfInterest.length > 0
                              ? `${careerInfo.industriesOfInterest.length} selected`
                              : "Select industries..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search industries..." />
                            <CommandList>
                              <CommandEmpty>No industry found.</CommandEmpty>
                              <CommandGroup>
                                {interests.map((interest) => (
                                  <CommandItem
                                    key={interest}
                                    value={interest}
                                    onSelect={() => {
                                      const isSelected = careerInfo.industriesOfInterest.includes(interest);
                                      setCareerInfo({
                                        ...careerInfo,
                                        industriesOfInterest: isSelected
                                          ? careerInfo.industriesOfInterest.filter(i => i !== interest)
                                          : [...careerInfo.industriesOfInterest, interest]
                                      });
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        careerInfo.industriesOfInterest.includes(interest)
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    {interest}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {careerInfo.industriesOfInterest.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {careerInfo.industriesOfInterest.map((industry) => (
                            <Badge key={industry} variant="secondary" className="text-xs">
                              {industry}
                              <button
                                onClick={() => {
                                  setCareerInfo({
                                    ...careerInfo,
                                    industriesOfInterest: careerInfo.industriesOfInterest.filter(i => i !== industry)
                                  });
                                }}
                                className="ml-1 hover:text-destructive"
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Preferred Job Roles/Titles</Label>
                      <Input
                        value={careerInfo.preferredJobRole}
                        onChange={(e) => setCareerInfo({ ...careerInfo, preferredJobRole: e.target.value })}
                        className="bg-muted/30"
                        placeholder="e.g. Investment Banking Analyst, Software Engineer"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Preferred Locations</Label>
                      <Popover open={locationsOpen} onOpenChange={setLocationsOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between bg-muted/30"
                          >
                            {careerInfo.preferredLocations.length > 0
                              ? `${careerInfo.preferredLocations.length} selected`
                              : "Select locations..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search locations..." />
                            <CommandList>
                              <CommandEmpty>No location found.</CommandEmpty>
                              <CommandGroup>
                                {locations.map((location) => (
                                  <CommandItem
                                    key={location}
                                    value={location}
                                    onSelect={() => {
                                      const isSelected = careerInfo.preferredLocations.includes(location);
                                      setCareerInfo({
                                        ...careerInfo,
                                        preferredLocations: isSelected
                                          ? careerInfo.preferredLocations.filter(l => l !== location)
                                          : [...careerInfo.preferredLocations, location]
                                      });
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        careerInfo.preferredLocations.includes(location)
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    {location}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {careerInfo.preferredLocations.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {careerInfo.preferredLocations.map((location) => (
                            <Badge key={location} variant="secondary" className="text-xs">
                              {location}
                              <button
                                onClick={() => {
                                  setCareerInfo({
                                    ...careerInfo,
                                    preferredLocations: careerInfo.preferredLocations.filter(l => l !== location)
                                  });
                                }}
                                className="ml-1 hover:text-destructive"
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Job Type(s) Interested in</Label>
                      <div className="space-y-2">
                        {jobTypesOptions.map((jobType) => (
                          <div key={jobType} className="flex items-center space-x-2">
                            <Checkbox
                              id={`jobType-${jobType}`}
                              checked={careerInfo.jobTypes.includes(jobType)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setCareerInfo({
                                    ...careerInfo,
                                    jobTypes: [...careerInfo.jobTypes, jobType]
                                  });
                                } else {
                                  setCareerInfo({
                                    ...careerInfo,
                                    jobTypes: careerInfo.jobTypes.filter(type => type !== jobType)
                                  });
                                }
                              }}
                            />
                            <Label htmlFor={`jobType-${jobType}`} className="text-sm font-normal cursor-pointer">
                              {jobType}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>
            </div>
          </GlassCard>
          
          {/* Account Management Section */}
          <GlassCard className="p-6 rounded-2xl">
            <h2 className="text-xl font-semibold mb-6 text-white text-slate-900">Account Management</h2>
            <div className="space-y-4">
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
            </div>
          </GlassCard>

          {/* Danger Zone */}
          <GlassCard className="p-6 rounded-2xl border-red-500/30">
            <h2 className="text-xl font-semibold mb-6 text-red-400">Danger zone</h2>
            <div>
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
            </div>
          </GlassCard>
        </div>
      </div>
    </PageWrapper>
  );
}