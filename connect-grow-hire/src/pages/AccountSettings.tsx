import { ArrowLeft, Upload, Trash2, LogOut, CreditCard, FileText, User, GraduationCap, Briefcase, Rocket, Settings, AlertTriangle, Lock, Eye, RefreshCw, X, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { db, storage, auth } from '@/lib/firebase';
import { signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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

// Section navigation items
const sections = [
  { id: 'personal', label: 'Personal Information', icon: User },
  { id: 'academic', label: 'Academic Information', icon: GraduationCap },
  { id: 'professional', label: 'Professional Profile', icon: Briefcase },
  { id: 'career', label: 'Career Interests', icon: Rocket },
  { id: 'account', label: 'Account Management', icon: Settings },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
];

// Settings Section Component
interface SettingsSectionProps {
  id: string;
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ id, icon: Icon, title, description, children, variant = 'default' }) => (
  <div id={id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden scroll-mt-6 ${variant === 'danger' ? 'border-red-200' : 'border-gray-200'}`}>
    {/* Section Header */}
    <div className={`px-6 py-5 border-b ${variant === 'danger' ? 'border-red-100 bg-red-50/50' : 'border-gray-100 bg-gray-50/50'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 bg-white rounded-xl border flex items-center justify-center ${variant === 'danger' ? 'border-red-200' : 'border-gray-200'}`}>
          <Icon className={`w-5 h-5 ${variant === 'danger' ? 'text-red-600' : 'text-gray-600'}`} />
        </div>
        <div>
          <h2 className={`text-lg font-semibold ${variant === 'danger' ? 'text-red-600' : 'text-gray-900'}`}>{title}</h2>
          {description && <p className={`text-sm ${variant === 'danger' ? 'text-red-500' : 'text-gray-500'}`}>{description}</p>}
        </div>
      </div>
    </div>
    
    {/* Section Content */}
    <div className="p-6">
      {children}
    </div>
  </div>
);

export default function AccountSettings() {
  console.log("⚙️ [ACCOUNT SETTINGS] Component rendering");
  const navigate = useNavigate();
  const { user, signOut } = useFirebaseAuth();
  console.log("⚙️ [ACCOUNT SETTINGS] User state:", { hasUser: !!user, email: user?.email || "none" });
  
  // Active section for sidebar
  const [activeSection, setActiveSection] = useState('personal');
  
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
  const [showSaveToast, setShowSaveToast] = useState(false);

  // State for multi-select popovers
  const [industriesOpen, setIndustriesOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);

  // Upload-related state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<string | null>(null);
  const [resumeData, setResumeData] = useState<any>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  // User initials for avatar
  const userInitials = `${personalInfo.firstName.charAt(0) || ''}${personalInfo.lastName.charAt(0) || ''}`.toUpperCase() || 'U';
  
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

        if (data.resumeParsed) {
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
          setResumeData(null);
          localStorage.removeItem('resumeData');
        }
      } else {
        setResumeUrl(null);
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

      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');

      const ts = Date.now();
      const storagePath = `resumes/${uid}/${ts}-${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);

      const downloadUrl = await getDownloadURL(storageRef);
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        resumeUrl: downloadUrl,
        resumeFileName: file.name,
        resumeUpdatedAt: new Date().toISOString(),
      });

      setResumeUrl(downloadUrl);

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

      await loadResumeFromFirestore();
      
      toast({
        title: "Success",
        description: "Resume uploaded successfully",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleResumeDelete = async () => {
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

      setResumeUrl(null);
      setResumeData(null);
      setResumeFile(null);
      localStorage.removeItem('resumeData');
      localStorage.removeItem('resumeFile');

      await loadResumeFromFirestore();

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

    try {
      const userRef = doc(db, 'users', user.uid);
      
      const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://www.offerloop.ai';
      
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      
      const preferenceUpdates: any = {
        location: {
          preferredLocation: careerInfo.preferredLocations,
          jobTypes: careerInfo.jobTypes,
          interests: careerInfo.industriesOfInterest,
        },
        academics: {
          graduationYear: academicInfo.graduationYear,
          graduationMonth: academicInfo.graduationMonth,
          degree: academicInfo.currentDegree,
          university: personalInfo.university,
        },
      };
      
      let intentChanged = false;
      try {
        const invalidationResponse = await fetch(`${API_URL}/api/users/update-preferences`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ updates: preferenceUpdates })
        });
        
        if (invalidationResponse.ok) {
          const invalidationResult = await invalidationResponse.json();
          intentChanged = invalidationResult.intentChanged || false;
          if (intentChanged) {
            console.log('✅ Intent changed - job board cache invalidated');
          }
        }
      } catch (invalidationError) {
        console.warn('Failed to call preference update endpoint (non-critical):', invalidationError);
      }
      
      const updates: any = {
        firstName: personalInfo.firstName,
        lastName: personalInfo.lastName,
        name: `${personalInfo.firstName} ${personalInfo.lastName}`.trim(),
        university: personalInfo.university,
        phone: personalInfo.phone,
        graduationMonth: academicInfo.graduationMonth,
        graduationYear: academicInfo.graduationYear,
        fieldOfStudy: academicInfo.fieldOfStudy,
        major: academicInfo.fieldOfStudy,
        currentDegree: academicInfo.currentDegree,
        degree: academicInfo.currentDegree,
        industriesOfInterest: careerInfo.industriesOfInterest,
        interests: careerInfo.industriesOfInterest,
        careerInterests: careerInfo.industriesOfInterest,
        preferredJobRole: careerInfo.preferredJobRole,
        preferredJobRolesOrTitles: careerInfo.preferredJobRole,
        preferredLocations: careerInfo.preferredLocations,
        preferredLocation: careerInfo.preferredLocations,
        jobTypes: careerInfo.jobTypes,
        jobTypesInterestedIn: careerInfo.jobTypes,
      };

      const userDoc = await getDoc(userRef);
      const existingData = userDoc.data();
      const existingLocation = existingData?.location || {};
      
      updates.location = {
        ...existingLocation,
        preferredLocation: careerInfo.preferredLocations,
        jobTypes: careerInfo.jobTypes,
        interests: careerInfo.industriesOfInterest,
        careerInterests: careerInfo.industriesOfInterest,
      };
      
      const existingAcademics = existingData?.academics || {};
      updates.academics = {
        ...existingAcademics,
        graduationYear: academicInfo.graduationYear,
        graduationMonth: academicInfo.graduationMonth,
        degree: academicInfo.currentDegree,
        university: personalInfo.university,
      };

      Object.keys(updates).forEach(key => {
        if (updates[key] === undefined) {
          delete updates[key];
        }
      });

      await updateDoc(userRef, updates);

      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 5000);
      
      if (intentChanged) {
        toast({
          title: "Preferences Updated",
          description: "Your job recommendations will refresh automatically.",
        });
      } else {
        toast({
          title: "Success",
          description: "Your profile information has been saved.",
        });
      }
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
      window.history.replaceState({}, '', '/?signedOut=true');
      navigate('/?signedOut=true', { replace: true });
      
      await signOut();
      await firebaseSignOut(auth);
      
      await new Promise<void>((resolve) => {
        let authStateChecked = false;
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
          if (firebaseUser === null && !authStateChecked) {
            authStateChecked = true;
            unsubscribe();
            resolve();
          }
        });
        
        setTimeout(() => {
          if (!authStateChecked) {
            authStateChecked = true;
            unsubscribe();
            resolve();
          }
        }, 2000);
      });
      
      try {
        const keys = Object.keys(localStorage);
        const firebaseKeys = keys.filter(key => 
          key.startsWith('firebase:authUser:') || 
          key.startsWith('firebase:host:') || 
          key.includes('firebase')
        );
        firebaseKeys.forEach(key => {
          localStorage.removeItem(key);
        });
      } catch (e) {
        console.warn("Could not clear localStorage:", e);
      }
      
      window.location.replace('/?signedOut=true');
    } catch (error) {
      console.error("Error in sign out process:", error);
      try {
        await signOut();
        await firebaseSignOut(auth);
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('firebase:authUser:') || key.startsWith('firebase:host:') || key.includes('firebase')) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {
        console.error("Error during cleanup:", e);
      }
      window.location.replace('/?signedOut=true');
    }
  };

  // Scroll spy for sidebar
  useEffect(() => {
    const handleScroll = () => {
      const sectionElements = sections.map(s => document.getElementById(s.id));
      const scrollPosition = window.scrollY + 100;
      
      for (let i = sectionElements.length - 1; i >= 0; i--) {
        const section = sectionElements[i];
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(sections[i].id);
          break;
        }
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          
          <main className="bg-gray-50 min-h-screen">
            <div className="max-w-5xl mx-auto px-6 py-10">
              
              {/* Back Navigation */}
              <div className="mb-6 animate-fadeInUp">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group"
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  <span className="font-medium">Back to Dashboard</span>
                </button>
              </div>

              {/* Header with Avatar */}
              <div className="flex items-center gap-6 mb-10 animate-fadeInUp" style={{ animationDelay: '50ms' }}>
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  {userInitials}
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
                  <p className="text-gray-500 mt-1">Manage your account and preferences</p>
                </div>
              </div>

              {/* Main Content with Sidebar */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                
                {/* Sidebar Navigation - Desktop Only */}
                <div className="hidden lg:block lg:col-span-1">
                  <nav className="sticky top-6 space-y-1 animate-fadeInUp" style={{ animationDelay: '100ms' }}>
                    {sections.map((section) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className={`
                          flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
                          ${activeSection === section.id 
                            ? section.id === 'danger' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          }
                        `}
                      >
                        <section.icon className="w-5 h-5" />
                        {section.label}
                      </a>
                    ))}
                  </nav>
                </div>
                
                {/* Settings Sections */}
                <div className="lg:col-span-3 space-y-8 animate-fadeInUp" style={{ animationDelay: '150ms' }}>
                  
                  {/* Personal Information Section */}
                  <SettingsSection
                    id="personal"
                    icon={User}
                    title="Personal Information"
                    description="Your basic contact details"
                  >
                    <div className="space-y-6">
                      {/* Name Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                          <input
                            type="text"
                            value={personalInfo.firstName}
                            onChange={(e) => setPersonalInfo({ ...personalInfo, firstName: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900
                                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                       hover:border-gray-300 transition-all"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                          <input
                            type="text"
                            value={personalInfo.lastName}
                            onChange={(e) => setPersonalInfo({ ...personalInfo, lastName: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900
                                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                       hover:border-gray-300 transition-all"
                          />
                        </div>
                      </div>
                      
                      {/* Email Field - Read Only */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <div className="relative">
                          <input
                            type="email"
                            value={personalInfo.email}
                            disabled
                            className="w-full px-4 py-3 pr-10 border border-gray-200 rounded-xl text-gray-500 bg-gray-50 cursor-not-allowed"
                          />
                          <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                            <Lock className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Contact support to change your email address</p>
                      </div>
                      
                      {/* University */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">University</label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <GraduationCap className="w-5 h-5 text-gray-400" />
                          </div>
                          <input
                            type="text"
                            value={personalInfo.university}
                            onChange={(e) => setPersonalInfo({ ...personalInfo, university: e.target.value })}
                            placeholder="e.g. University of Southern California"
                            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl text-gray-900
                                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                       hover:border-gray-300 transition-all"
                          />
                        </div>
                      </div>
                      
                      {/* Phone */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                        <input
                          type="tel"
                          value={personalInfo.phone}
                          onChange={(e) => setPersonalInfo({ ...personalInfo, phone: e.target.value })}
                          placeholder="(555) 123-4567"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900
                                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                     hover:border-gray-300 transition-all"
                        />
                      </div>
                    </div>
                  </SettingsSection>

                  {/* Academic Information Section */}
                  <SettingsSection
                    id="academic"
                    icon={GraduationCap}
                    title="Academic Information"
                    description="Your education details"
                  >
                    <div className="space-y-6">
                      {/* Graduation Date */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Graduation Month</label>
                          <Select
                            value={academicInfo.graduationMonth}
                            onValueChange={(value) => setAcademicInfo({ ...academicInfo, graduationMonth: value })}
                          >
                            <SelectTrigger className="w-full px-4 py-3 border border-gray-200 rounded-xl">
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
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Graduation Year</label>
                          <input
                            type="text"
                            value={academicInfo.graduationYear}
                            onChange={(e) => setAcademicInfo({ ...academicInfo, graduationYear: e.target.value })}
                            placeholder="2027"
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900
                                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                       hover:border-gray-300 transition-all"
                          />
                        </div>
                      </div>
                      
                      {/* Field of Study */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Field of Study</label>
                        <input
                          type="text"
                          value={academicInfo.fieldOfStudy}
                          onChange={(e) => setAcademicInfo({ ...academicInfo, fieldOfStudy: e.target.value })}
                          placeholder="e.g. Data Science, Computer Science"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900
                                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                     hover:border-gray-300 transition-all"
                        />
                      </div>
                      
                      {/* Current Degree */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Current Degree</label>
                        <Select
                          value={academicInfo.currentDegree}
                          onValueChange={(value) => setAcademicInfo({ ...academicInfo, currentDegree: value })}
                        >
                          <SelectTrigger className="w-full px-4 py-3 border border-gray-200 rounded-xl">
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
                  </SettingsSection>

                  {/* Professional Profile Section */}
                  <SettingsSection
                    id="professional"
                    icon={Briefcase}
                    title="Professional Profile"
                    description="Your resume and professional documents"
                  >
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">Resume</label>
                        
                        {resumeData ? (
                          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-5">
                            <div className="flex items-start gap-4">
                              {/* File Icon */}
                              <div className="w-14 h-14 bg-white rounded-xl border border-blue-200 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-7 h-7 text-blue-600" />
                              </div>
                              
                              {/* File Info */}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 truncate">{resumeData.fileName || 'Resume.pdf'}</h4>
                                <div className="mt-2 space-y-1 text-sm text-gray-600">
                                  {resumeData.name && (
                                    <p><span className="text-gray-400">Name:</span> {resumeData.name}</p>
                                  )}
                                  {resumeData.university && (
                                    <p><span className="text-gray-400">University:</span> {resumeData.university}</p>
                                  )}
                                  {resumeData.major && (
                                    <p><span className="text-gray-400">Major:</span> {resumeData.major}</p>
                                  )}
                                  {resumeData.year && (
                                    <p><span className="text-gray-400">Year:</span> {resumeData.year}</p>
                                  )}
                                </div>
                                {resumeData.uploadDate && (
                                  <p className="text-xs text-gray-400 mt-2">
                                    Uploaded: {new Date(resumeData.uploadDate).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center gap-3 mt-5 pt-5 border-t border-blue-200">
                              <button 
                                onClick={() => {
                                  if (resumeUrl) {
                                    const bust = `${resumeUrl}${resumeUrl.includes('?') ? '&' : '?'}cb=${Date.now()}`;
                                    window.open(bust, '_blank');
                                    return;
                                  }
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
                                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
                              >
                                <Eye className="w-4 h-4" />
                                View Full Resume
                              </button>
                              
                              <label className="cursor-pointer">
                                <span className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all">
                                  <RefreshCw className="w-4 h-4" />
                                  Replace Resume
                                </span>
                                <input
                                  type="file"
                                  accept={ACCEPTED_RESUME_TYPES.accept}
                                  onChange={handleResumeUpload}
                                  className="hidden"
                                  disabled={isUploading}
                                />
                              </label>
                              
                              <button 
                                onClick={handleResumeDelete}
                                className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-600 hover:bg-red-100 hover:border-red-300 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete Resume
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="cursor-pointer">
                            <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all">
                              <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                                {isUploading ? (
                                  <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Upload className="w-7 h-7 text-gray-400" />
                                )}
                              </div>
                              <p className="font-medium text-gray-700 mb-1">
                                {isUploading ? "Processing resume..." : "Upload your resume"}
                              </p>
                              <p className="text-sm text-gray-500">PDF, DOC, or DOCX up to 10MB</p>
                              {uploadError && (
                                <p className="text-sm text-red-600 mt-2">{uploadError}</p>
                              )}
                            </div>
                            <input
                              type="file"
                              accept={ACCEPTED_RESUME_TYPES.accept}
                              onChange={handleResumeUpload}
                              className="hidden"
                              disabled={isUploading}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </SettingsSection>

                  {/* Career Interests Section */}
                  <SettingsSection
                    id="career"
                    icon={Rocket}
                    title="Career Interests"
                    description="Help us personalize your experience"
                  >
                    <div className="space-y-6">
                      {/* Industries of Interest */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Industries of Interest</label>
                        <Popover open={industriesOpen} onOpenChange={setIndustriesOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between border-gray-200 rounded-xl py-3 h-auto"
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
                          <div className="flex flex-wrap gap-2 mt-3">
                            {careerInfo.industriesOfInterest.map((industry) => (
                              <span 
                                key={industry}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 text-sm font-medium rounded-full"
                              >
                                {industry}
                                <button 
                                  onClick={() => setCareerInfo({
                                    ...careerInfo,
                                    industriesOfInterest: careerInfo.industriesOfInterest.filter(i => i !== industry)
                                  })}
                                  className="hover:bg-blue-200 rounded-full p-0.5"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Preferred Job Roles */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Job Roles/Titles</label>
                        <input
                          type="text"
                          value={careerInfo.preferredJobRole}
                          onChange={(e) => setCareerInfo({ ...careerInfo, preferredJobRole: e.target.value })}
                          placeholder="e.g. Associate Consultant, Analyst"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900
                                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                     hover:border-gray-300 transition-all"
                        />
                      </div>
                      
                      {/* Preferred Locations */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Locations</label>
                        <Popover open={locationsOpen} onOpenChange={setLocationsOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between border-gray-200 rounded-xl py-3 h-auto"
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
                          <div className="flex flex-wrap gap-2 mt-3">
                            {careerInfo.preferredLocations.map((location) => (
                              <span 
                                key={location}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 text-sm font-medium rounded-full"
                              >
                                {location}
                                <button 
                                  onClick={() => setCareerInfo({
                                    ...careerInfo,
                                    preferredLocations: careerInfo.preferredLocations.filter(l => l !== location)
                                  })}
                                  className="hover:bg-blue-200 rounded-full p-0.5"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Job Types */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">Job Type(s) Interested in</label>
                        <div className="space-y-3">
                          {jobTypesOptions.map((jobType) => (
                            <label 
                              key={jobType}
                              className="flex items-center gap-3 cursor-pointer group"
                            >
                              <div className={`
                                w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                                ${careerInfo.jobTypes.includes(jobType)
                                  ? 'bg-blue-600 border-blue-600'
                                  : 'border-gray-300 group-hover:border-blue-400'
                                }
                              `}>
                                {careerInfo.jobTypes.includes(jobType) && (
                                  <Check className="w-3.5 h-3.5 text-white" />
                                )}
                              </div>
                              <span className="text-gray-700">{jobType}</span>
                              <input
                                type="checkbox"
                                checked={careerInfo.jobTypes.includes(jobType)}
                                onChange={(e) => {
                                  if (e.target.checked) {
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
                                className="sr-only"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                      
                      {/* Save Button */}
                      <div className="pt-4 flex justify-end">
                        <button 
                          onClick={handleSaveOnboardingData}
                          disabled={isSaving}
                          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {isSaving ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save changes'
                          )}
                        </button>
                      </div>
                    </div>
                  </SettingsSection>

                  {/* Account Management Section */}
                  <SettingsSection
                    id="account"
                    icon={Settings}
                    title="Account Management"
                    description="Manage your subscription and account"
                  >
                    <div className="space-y-4">
                      {/* Subscription */}
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-5 bg-gray-50 rounded-xl gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                            <CreditCard className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Subscription</h4>
                            <p className="text-sm text-gray-500">Manage your subscription plan and billing settings</p>
                            {user?.tier && (
                              <p className="text-sm text-gray-400 mt-0.5">Current: <span className="font-medium text-gray-700 capitalize">{user.tier} Tier</span></p>
                            )}
                          </div>
                        </div>
                        
                        <button 
                          onClick={handleManageSubscription}
                          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
                        >
                          <CreditCard className="w-4 h-4" />
                          Manage Subscription
                        </button>
                      </div>
                      
                      {/* Sign Out */}
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-5 bg-gray-50 rounded-xl gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center">
                            <LogOut className="w-6 h-6 text-gray-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Sign Out</h4>
                            <p className="text-sm text-gray-500">Sign out of your account on this device</p>
                          </div>
                        </div>
                        
                        <button 
                          onClick={handleSignOut}
                          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </SettingsSection>

                  {/* Danger Zone Section */}
                  <SettingsSection
                    id="danger"
                    icon={AlertTriangle}
                    title="Danger Zone"
                    description="Irreversible actions"
                    variant="danger"
                  >
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <h4 className="font-semibold text-red-600">Delete your account</h4>
                        <p className="text-sm text-gray-600 mt-1 max-w-md">
                          This will permanently delete your account and all your data. This action cannot be undone.
                        </p>
                      </div>
                      
                      <button 
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/30 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete account
                      </button>
                    </div>
                  </SettingsSection>

                </div>
              </div>
              
            </div>
          </main>
        </MainContentWrapper>
      </div>

      {/* Success Toast */}
      {showSaveToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fadeInUp">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Changes saved!</p>
              <p className="text-sm text-gray-500">Your settings have been updated</p>
            </div>
            <button 
              onClick={() => setShowSaveToast(false)}
              className="p-1 hover:bg-gray-100 rounded-lg ml-2"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
      )}
    </SidebarProvider>
  );
}
