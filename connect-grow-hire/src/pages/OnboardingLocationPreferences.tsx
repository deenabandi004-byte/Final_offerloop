import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
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
  locations: z.array(z.string()).optional(),
  jobTypes: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof formSchema>;

const OnboardingLocationPreferences = () => {
  const navigate = useNavigate();
  const { user: firebaseUser } = useFirebaseAuth();
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [openLocations, setOpenLocations] = useState(false);
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      locations: [],
      jobTypes: [],
    },
  });

  const onSubmit = async (data: FormData) => {
    console.log("Location preferences form submitted:", { 
      ...data, 
      locations: selectedLocations,
      jobTypes: selectedJobTypes 
    });
    
    try {
      const update = {
        preferredLocations: selectedLocations,
        jobTypes: selectedJobTypes
      };

      if (firebaseUser) {
        const existing = await firebaseApi.getProfessionalInfo(firebaseUser.uid) || {};
        await firebaseApi.saveProfessionalInfo(firebaseUser.uid, { ...existing, ...update });
        console.log("Saved location preferences to Firestore");
      } else {
        const existing = JSON.parse(localStorage.getItem('professionalInfo') || '{}');
        localStorage.setItem('professionalInfo', JSON.stringify({ ...existing, ...update }));
        console.log("Saved location preferences to localStorage");
      }
    } catch (error) {
      console.error('Failed to save professional info:', error);
    }
    
    navigate("/onboarding/signup");
  };

  const locations = [
    "Remote",
    "New York, NY",
    "Los Angeles, CA",
    "Chicago, IL",
    "San Francisco, CA",
    "Boston, MA",
    "Seattle, WA",
    "Austin, TX",
    "Miami, FL",
    "Denver, CO",
    "Atlanta, GA",
    "Philadelphia, PA",
    "San Diego, CA",
    "Phoenix, AZ",
    "Dallas, TX",
    "Washington, DC",
    "Portland, OR",
    "Nashville, TN",
    "Charlotte, NC",
    "Minneapolis, MN",
    "Las Vegas, NV",
    "Detroit, MI",
    "Tampa, FL",
    "Orlando, FL",
    "Houston, TX",
    "San Antonio, TX",
    "Kansas City, MO",
    "Columbus, OH",
    "Cleveland, OH",
    "Cincinnati, OH",
    "Pittsburgh, PA",
    "Baltimore, MD",
    "Richmond, VA",
    "Raleigh, NC",
    "Charleston, SC",
    "Jacksonville, FL",
    "New Orleans, LA",
    "Memphis, TN",
    "Louisville, KY",
    "Indianapolis, IN",
    "Milwaukee, WI",
    "Salt Lake City, UT",
    "Albuquerque, NM",
    "Tucson, AZ",
    "Sacramento, CA",
    "Oakland, CA",
    "San Jose, CA",
    "Fresno, CA",
    "Long Beach, CA",
    "Anaheim, CA",
    "Riverside, CA",
    "Stockton, CA",
    "Bakersfield, CA",
    "Buffalo, NY",
    "Rochester, NY",
    "Syracuse, NY",
    "Albany, NY",
    "Hartford, CT",
    "Providence, RI",
    "Bridgeport, CT",
    "Newark, NJ",
    "Jersey City, NJ",
    "Virginia Beach, VA",
    "Norfolk, VA",
    "Greensboro, NC",
    "Birmingham, AL",
    "Montgomery, AL",
    "Mobile, AL",
    "Jackson, MS",
    "Little Rock, AR",
    "Tulsa, OK",
    "Oklahoma City, OK",
    "Omaha, NE",
    "Des Moines, IA",
    "Wichita, KS",
    "Boise, ID",
    "Spokane, WA",
    "Tacoma, WA",
    "Anchorage, AK",
    "Honolulu, HI",
    "Other"
  ];

  const jobTypes = [
    { id: "internship", label: "Internship" },
    { id: "part-time", label: "Part-Time" },
    { id: "full-time", label: "Full-Time" },
  ];

  const toggleLocation = (location: string) => {
    setSelectedLocations(prev => 
      prev.includes(location) 
        ? prev.filter(l => l !== location)
        : [...prev, location]
    );
  };

  const toggleJobType = (jobTypeId: string) => {
    setSelectedJobTypes(prev => 
      prev.includes(jobTypeId) 
        ? prev.filter(jt => jt !== jobTypeId)
        : [...prev, jobTypeId]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/onboarding/opportunity-preferences")}
        className="absolute top-6 left-6 flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      
      <div className="w-full max-w-2xl space-y-4">
        <Progress value={80} className="w-full" />
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Location Preferences</CardTitle>
            <p className="text-muted-foreground">Tell us where you'd like to work</p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Preferred Locations</h3>
                  <p className="text-sm text-muted-foreground">Select all locations where you'd like to work</p>
                  
                  <Popover open={openLocations} onOpenChange={setOpenLocations}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "w-full justify-between",
                          selectedLocations.length === 0 && "text-muted-foreground"
                        )}
                      >
                        {selectedLocations.length === 0
                          ? "Select locations..."
                          : `${selectedLocations.length} selected`}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput placeholder="Search locations..." />
                        <CommandList>
                          <CommandEmpty>No location found.</CommandEmpty>
                          <CommandGroup>
                            {locations.map((location) => (
                              <CommandItem
                                value={location}
                                key={location}
                                onSelect={() => {
                                  toggleLocation(location);
                                  // Don't close the dropdown to allow multiple selections
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedLocations.includes(location)
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

                  {selectedLocations.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedLocations.map((location) => (
                        <Badge 
                          key={location} 
                          variant="secondary" 
                          className="text-xs cursor-pointer hover:bg-secondary/80"
                          onClick={() => toggleLocation(location)}
                        >
                          {location} ×
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Job Type(s) Interested In</h3>
                  <p className="text-sm text-muted-foreground">Select all job types you're interested in</p>
                  <div className="space-y-3">
                    {jobTypes.map((jobType) => (
                      <div key={jobType.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={jobType.id}
                          checked={selectedJobTypes.includes(jobType.id)}
                          onCheckedChange={() => toggleJobType(jobType.id)}
                        />
                        <label
                          htmlFor={jobType.id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {jobType.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

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

export default OnboardingLocationPreferences;
