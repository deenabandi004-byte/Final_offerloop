import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ArrowLeft, GraduationCap } from "lucide-react";

interface AcademicData {
  university: string;
  degree: string;
  major: string;
  graduationMonth: string;
  graduationYear: string;
}

interface OnboardingAcademicsProps {
  onNext: (data: AcademicData) => void;
  onBack: () => void;
  initialData?: AcademicData;
}

export const OnboardingAcademics = ({ onNext, onBack, initialData }: OnboardingAcademicsProps) => {
  const [academics, setAcademics] = useState<AcademicData>({
    university: initialData?.university || "",
    degree: initialData?.degree || "",
    major: initialData?.major || "",
    graduationMonth: initialData?.graduationMonth || "",
    graduationYear: initialData?.graduationYear || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext(academics);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => currentYear - 10 + i);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10">
      <Card className="w-full max-w-2xl p-8 space-y-8 shadow-lg border-0 bg-card/80 backdrop-blur-sm">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold text-foreground">Academics</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Tell us about your educational background to help us understand your qualifications.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="university" className="text-foreground font-medium">University/College</Label>
              <Input
                id="university"
                value={academics.university}
                onChange={(e) => setAcademics(prev => ({ ...prev, university: e.target.value }))}
                placeholder="Enter your university name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="degree" className="text-foreground font-medium">Degree Level</Label>
              <Select value={academics.degree} onValueChange={(value) => setAcademics(prev => ({ ...prev, degree: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select degree level" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="associate">Associate's Degree</SelectItem>
                  <SelectItem value="bachelor">Bachelor's Degree</SelectItem>
                  <SelectItem value="master">Master's Degree</SelectItem>
                  <SelectItem value="doctoral">Doctoral Degree</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="graduationMonth" className="text-foreground font-medium">Graduation Month</Label>
              <Select value={academics.graduationMonth} onValueChange={(value) => setAcademics(prev => ({ ...prev, graduationMonth: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select graduation month" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  {months.map((month) => (
                    <SelectItem key={month} value={month.toLowerCase()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="graduationYear" className="text-foreground font-medium">Graduation Year</Label>
              <Select value={academics.graduationYear} onValueChange={(value) => setAcademics(prev => ({ ...prev, graduationYear: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select graduation year" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="major" className="text-foreground font-medium">Major/Field of Study</Label>
            <Input
              id="major"
              value={academics.major}
              onChange={(e) => setAcademics(prev => ({ ...prev, major: e.target.value }))}
              placeholder="Enter your major"
              required
            />
          </div>


          <div className="flex justify-between pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="px-6 py-2"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            
            <Button
              type="submit"
              className="px-6 py-2 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 group"
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};