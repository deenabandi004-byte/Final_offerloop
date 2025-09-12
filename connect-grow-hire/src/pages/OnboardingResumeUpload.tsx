import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { firebaseApi } from '../services/firebaseApi';
import { ArrowLeft, ArrowRight, Upload, Check, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

const OnboardingResumeUpload = () => {
  const navigate = useNavigate();
  const { user: firebaseUser } = useFirebaseAuth();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('resume', selectedFile);

      const response = await fetch('http://localhost:5001/api/parse-resume', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse resume');
      }

      // Store the parsed data in localStorage with the correct structure
      const resumeData = {
        name: result.data.name || '',
        year: result.data.year || '',
        major: result.data.major || '',
        university: result.data.university || ''
      };
      
      if (firebaseUser) {
        await firebaseApi.saveResumeData(firebaseUser.uid, resumeData);
        console.log("Saved resume data to Firestore");
      } else {
        localStorage.setItem('resumeData', JSON.stringify(resumeData));
        console.log("Saved resume data to localStorage");
      }

      toast({
        title: "Resume Uploaded Successfully!",
        description: "Your information has been extracted and will pre-fill the forms.",
      });

      // Navigate to the main onboarding page
      navigate("/onboarding");

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSkip = () => {
    // Clear any existing resume data when skipping
    localStorage.removeItem('resumeData');
    navigate("/onboarding");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleSkip}
        className="absolute bottom-6 right-6 flex items-center gap-2"
      >
        Skip
        <ArrowRight className="h-4 w-4" />
      </Button>
      
      <div className="w-full max-w-md space-y-4">
        <Progress value={5} className="w-full" />
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Upload Your Resume</CardTitle>
            <p className="text-muted-foreground">
              Optional: We'll extract your information to speed up the process
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <Alert className="border-destructive bg-destructive/10">
                <X className="h-4 w-4" />
                <AlertDescription className="text-destructive">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8">
                <div className="text-center">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <div className="mt-4">
                    <label htmlFor="resume-upload" className="cursor-pointer">
                      <span className="text-sm font-medium text-primary hover:text-primary/80">
                        Choose your resume
                      </span>
                      <input
                        id="resume-upload"
                        type="file"
                        accept=".pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">PDF files only</p>
                  </div>
                  {selectedFile && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-center gap-2 text-sm text-green-800">
                        <Check className="h-4 w-4" />
                        {selectedFile.name}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {selectedFile && (
                <Button 
                  onClick={handleUpload} 
                  disabled={isUploading} 
                  className="w-full" 
                  size="lg"
                >
                  {isUploading ? "Processing Resume..." : "Upload & Continue"}
                </Button>
              )}

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Don't have a resume? You can skip this step and fill out the forms manually.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingResumeUpload;
