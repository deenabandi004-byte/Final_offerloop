import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { firebaseApi } from '../services/firebaseApi';
import { ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import * as z from "zod";

const formSchema = z.object({
  graduationMonth: z.string().optional(),
  graduationYear: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  degreeType: z.string().optional(),
  customDegree: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const OnboardingAcademics = () => {
  const navigate = useNavigate();
  const { user: firebaseUser } = useFirebaseAuth();
  const [showCustomDegree, setShowCustomDegree] = useState(false);
  const [openFieldOfStudy, setOpenFieldOfStudy] = useState(false);
  
  const getResumeData = () => {
    try {
      const resumeData = localStorage.getItem('resumeData');
      return resumeData ? JSON.parse(resumeData) : null;
    } catch {
      return null;
    }
  };

  const resumeData = getResumeData();
  
  const extractGraduationYear = (yearData: string | undefined): string => {
    if (!yearData || typeof yearData !== 'string') return "";
    
    // First, check if it's already a 4-digit year
    if (/^\d{4}$/.test(yearData.trim())) {
      return yearData.trim();
    }
    
    // Try to extract a 4-digit year from the string
    const yearMatch = yearData.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      return yearMatch[0];
    }
    
    // Check for class year indicators (e.g., "Senior" -> estimate year)
    const currentYear = new Date().getFullYear();
    const lowerYear = yearData.toLowerCase();
    
    if (lowerYear.includes('senior') || lowerYear.includes('fourth')) {
      return String(currentYear + 1);
    } else if (lowerYear.includes('junior') || lowerYear.includes('third')) {
      return String(currentYear + 2);
    } else if (lowerYear.includes('sophomore') || lowerYear.includes('second')) {
      return String(currentYear + 3);
    } else if (lowerYear.includes('freshman') || lowerYear.includes('first')) {
      return String(currentYear + 4);
    }
    
    return "";
  };
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      graduationMonth: "",
      graduationYear: extractGraduationYear(resumeData?.year) || "",
      fieldOfStudy: resumeData?.major || "",
      degreeType: "",
      customDegree: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    console.log("Academics form submitted:", data);
    
    try {
      const degreeText = data.customDegree?.trim() ? data.customDegree : (data.degreeType || "");
      const update = {
        fieldOfStudy: data.fieldOfStudy || "",
        currentDegree: degreeText || "",
        graduationYear: data.graduationYear || ""
      };

      if (firebaseUser) {
        const existing = await firebaseApi.getProfessionalInfo(firebaseUser.uid) || {};
        await firebaseApi.saveProfessionalInfo(firebaseUser.uid, { ...existing, ...update });
        console.log("Saved academics data to Firestore");
      } else {
        const existing = JSON.parse(localStorage.getItem('professionalInfo') || '{}');
        localStorage.setItem('professionalInfo', JSON.stringify({ ...existing, ...update }));
        console.log("Saved academics data to localStorage");
      }
    } catch (error) {
      console.error('Failed to save professional info:', error);
    }
    
    // Navigate to next onboarding step
    navigate("/onboarding/opportunity-preferences");
  };

  const fieldsOfStudy = [
    "Business Administration",
    "Accounting", 
    "Finance",
    "Economics",
    "Marketing",
    "Management",
    "Computer Science",
    "Information Technology",
    "Engineering (General)",
    "Mechanical Engineering",
    "Electrical Engineering",
    "Civil Engineering",
    "Chemical Engineering",
    "Biomedical Engineering",
    "Data Science / Analytics",
    "Mathematics / Statistics",
    "Physics",
    "Biology",
    "Chemistry",
    "Environmental Science",
    "Psychology",
    "Sociology",
    "Political Science",
    "International Relations",
    "Communications",
    "Journalism",
    "English / Literature",
    "Education",
    "History",
    "Philosophy",
    "Art / Design",
    "Film / Media Studies",
    "Music / Performing Arts",
    "Architecture",
    "Urban Planning",
    "Public Health",
    "Nursing",
    "Medicine / Pre-Med",
    "Law / Pre-Law",
    "Criminal Justice",
    "Social Work"
  ];

  const degreeOptions = [
    { category: "Undergraduate", options: [
      { value: "associate", label: "Associate's Degree (AA, AS, etc.)" },
      { value: "bachelor", label: "Bachelor's Degree (BA, BS, BBA, BFA, etc.)" },
    ]},
    { category: "Graduate", options: [
      { value: "master", label: "Master's Degree (MA, MS, MBA, MPA, MFA, etc.)" },
      { value: "doctorate", label: "Doctorate/PhD (PhD, EdD, DBA, etc.)" },
    ]},
    { category: "Other", options: [
      { value: "unsure", label: "Unsure" },
      { value: "other", label: "Other" },
    ]},
  ];

  const handleDegreeChange = (value: string) => {
    form.setValue("degreeType", value);
    setShowCustomDegree(value === "other");
    if (value !== "other") {
      form.setValue("customDegree", "");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/onboarding")}
        className="absolute top-6 left-6 flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      
      <div className="w-full max-w-md space-y-4">
        <Progress value={40} className="w-full" />
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Academics</CardTitle>
            <p className="text-muted-foreground">Tell us about your education</p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Graduation Date (Optional)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="graduationMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Month</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select month" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="01">January</SelectItem>
                              <SelectItem value="02">February</SelectItem>
                              <SelectItem value="03">March</SelectItem>
                              <SelectItem value="04">April</SelectItem>
                              <SelectItem value="05">May</SelectItem>
                              <SelectItem value="06">June</SelectItem>
                              <SelectItem value="07">July</SelectItem>
                              <SelectItem value="08">August</SelectItem>
                              <SelectItem value="09">September</SelectItem>
                              <SelectItem value="10">October</SelectItem>
                              <SelectItem value="11">November</SelectItem>
                              <SelectItem value="12">December</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="graduationYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Year</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select year" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.from({ length: 20 }, (_, i) => {
                                const year = new Date().getFullYear() + 5 - i;
                                return (
                                  <SelectItem key={year} value={year.toString()}>
                                    {year}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                </div>

                <FormField
                  control={form.control}
                  name="fieldOfStudy"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Field of Study (Optional)</FormLabel>
                      <Popover open={openFieldOfStudy} onOpenChange={setOpenFieldOfStudy}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value
                                ? fieldsOfStudy.find(
                                    (fieldOfStudy) => fieldOfStudy === field.value
                                  )
                                : "Select field of study"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0">
                          <Command>
                            <CommandInput placeholder="Search field of study..." />
                            <CommandList>
                              <CommandEmpty>No field of study found.</CommandEmpty>
                              <CommandGroup>
                                {fieldsOfStudy.map((fieldOfStudy) => (
                                  <CommandItem
                                    value={fieldOfStudy}
                                    key={fieldOfStudy}
                                    onSelect={() => {
                                      form.setValue("fieldOfStudy", fieldOfStudy);
                                      setOpenFieldOfStudy(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        fieldOfStudy === field.value
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    {fieldOfStudy}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                </div>

                <FormField
                  control={form.control}
                  name="degreeType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Degree Type (Optional)</FormLabel>
                      <Select onValueChange={handleDegreeChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select degree type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {degreeOptions.map((category) => (
                            <div key={category.category}>
                              <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                                {category.category}
                              </div>
                              {category.options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showCustomDegree && (
                  <FormField
                    control={form.control}
                    name="customDegree"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Degree Type</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your degree type" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <Button type="submit" className="w-full" size="lg">
                  Continue
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingAcademics;
