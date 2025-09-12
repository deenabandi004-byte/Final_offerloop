import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import * as z from "zod";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { firebaseApi } from '../services/firebaseApi';

const formSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  university: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const universities = [
  "Other",
  "Abilene Christian University",
  "Adelphi University",
  "Agnes Scott College",
  "Air Force Academy (USAFA)",
  "Alabama A&M University",
  "Alabama State University",
  "Alaska Pacific University",
  "Albany State University",
  "Alcorn State University",
  "American University",
  "Amherst College",
  "Appalachian State University",
  "Arizona State University",
  "Arkansas State University",
  "Auburn University",
  "Augsburg University",
  "Augustana College",
  "Babson College",
  "Ball State University",
  "Bard College",
  "Barnard College",
  "Barry University",
  "Baylor University",
  "Bellarmine University",
  "Belmont University",
  "Beloit College",
  "Bemidji State University",
  "Bentley University",
  "Berea College",
  "Berklee College of Music",
  "Berry College",
  "Bethune Cookman University",
  "Binghamton University (SUNY)",
  "Biola University",
  "Birmingham-Southern College",
  "Boise State University",
  "Boston College",
  "Boston University",
  "Bowdoin College",
  "Bowling Green State University",
  "Bradley University",
  "Brandeis University",
  "Brigham Young University",
  "Brown University",
  "Bryn Mawr College",
  "Bucknell University",
  "Butler University",
  "California Institute of Technology (Caltech)",
  "California Polytechnic State University, San Luis Obispo (Cal Poly)",
  "California State Polytechnic University, Pomona",
  "California State University, Bakersfield",
  "California State University, Channel Islands",
  "California State University, Chico",
  "California State University, Dominguez Hills",
  "California State University, East Bay",
  "California State University, Fresno",
  "California State University, Fullerton",
  "California State University, Long Beach",
  "California State University, Los Angeles",
  "California State University, Monterey Bay",
  "California State University, Northridge",
  "California State University, Sacramento",
  "California State University, San Bernardino",
  "California State University, San Diego",
  "California State University, San Francisco",
  "California State University, San Jose",
  "California State University, San Marcos",
  "California State University, Sonoma",
  "California State University, Stanislaus",
  "Carleton College",
  "Carnegie Mellon University",
  "Carroll College",
  "Case Western Reserve University",
  "Catholic University of America",
  "Central Michigan University",
  "Centre College",
  "Chapman University",
  "Charleston Southern University",
  "Chatham University",
  "Chicago State University",
  "Claremont McKenna College",
  "Clark Atlanta University",
  "Clark University",
  "Clemson University",
  "Cleveland State University",
  "Colby College",
  "Colgate University",
  "College of Charleston",
  "College of William & Mary",
  "Colorado College",
  "Colorado School of Mines",
  "Colorado State University",
  "Columbia College Chicago",
  "Columbia University",
  "Concordia College",
  "Connecticut College",
  "Cooper Union",
  "Cornell University",
  "Creighton University",
  "Dartmouth College",
  "Davidson College",
  "Delaware State University",
  "Denison University",
  "DePaul University",
  "DePauw University",
  "Dickinson College",
  "Drake University",
  "Drew University",
  "Drexel University",
  "Duke University",
  "Duquesne University",
  "East Carolina University",
  "East Tennessee State University",
  "Eastern Illinois University",
  "Eastern Kentucky University",
  "Eastern Michigan University",
  "Eckerd College",
  "Elmhurst University",
  "Elon University",
  "Embry Riddle Aeronautical University",
  "Emerson College",
  "Emory University",
  "Fairfield University",
  "Fairleigh Dickinson University",
  "Fayetteville State University",
  "Ferris State University",
  "Fisk University",
  "Flagler College",
  "Florida A&M University",
  "Florida Atlantic University",
  "Florida Gulf Coast University",
  "Florida International University",
  "Florida State University",
  "Fordham University",
  "Fort Valley State University",
  "Franklin & Marshall College",
  "Furman University",
  "Gallaudet University",
  "George Mason University",
  "George Washington University",
  "Georgetown University",
  "Georgia Institute of Technology (Georgia Tech)",
  "Georgia Southern University",
  "Georgia State University",
  "Gettysburg College",
  "Gonzaga University",
  "Goucher College",
  "Grambling State University",
  "Grand Valley State University",
  "Grinnell College",
  "Hamilton College",
  "Hampton University",
  "Hanover College",
  "Harvard University",
  "Harvey Mudd College",
  "Haverford College",
  "Hawaii Pacific University",
  "High Point University",
  "Hillsdale College",
  "Hofstra University",
  "Hollins University",
  "Holy Cross College",
  "Hope College",
  "Howard University",
  "Hunter College (CUNY)",
  "Idaho State University",
  "Illinois State University",
  "Illinois Wesleyan University",
  "Indiana State University",
  "Indiana University Bloomington",
  "Indiana University-Purdue University Indianapolis",
  "Iona University",
  "Iowa State University",
  "Ithaca College",
  "Jackson State University",
  "James Madison University",
  "John Carroll University",
  "Johns Hopkins University",
  "Johnson & Wales University",
  "Judson University",
  "Kalamazoo College",
  "Kansas State University",
  "Kent State University",
  "Kenyon College",
  "Knox College",
  "Lafayette College",
  "Lake Forest College",
  "Lamar University",
  "LaSalle University",
  "Lawrence University",
  "Lehigh University",
  "Lewis & Clark College",
  "Liberty University",
  "Lincoln University",
  "Lipscomb University",
  "Long Island University",
  "Louisiana State University (LSU)",
  "Loyola Marymount University",
  "Loyola University Chicago",
  "Loyola University Maryland",
  "Loyola University New Orleans",
  "Macalester College",
  "Manhattan College",
  "Marist College",
  "Marquette University",
  "Marshall University",
  "Massachusetts Institute of Technology (MIT)",
  "McGill University (USA-Canada border draw)",
  "Mercer University",
  "Meredith College",
  "Merrimack College",
  "Miami University (Ohio)",
  "Michigan State University",
  "Michigan Technological University",
  "Middlebury College",
  "Millikin University",
  "Millsaps College",
  "Mississippi State University",
  "Mississippi Valley State University",
  "Missouri State University",
  "Missouri University of Science & Technology",
  "Monmouth University",
  "Montana State University",
  "Morehouse College",
  "Morgan State University",
  "Mount Holyoke College",
  "Muhlenberg College",
  "Murray State University",
  "Naval Academy (USNA)",
  "Nebraska Wesleyan University",
  "New Jersey Institute of Technology",
  "New Mexico State University",
  "New York Institute of Technology",
  "New York University",
  "North Carolina A&T State University",
  "North Carolina State University",
  "North Dakota State University",
  "Northeastern University",
  "Northern Arizona University",
  "Northern Illinois University",
  "Northern Kentucky University",
  "Northwestern University",
  "Norwich University",
  "Notre Dame University",
  "Oberlin College",
  "Occidental College",
  "Ohio State University",
  "Ohio University",
  "Oklahoma State University",
  "Old Dominion University",
  "Oregon State University",
  "Pace University",
  "Pacific Lutheran University",
  "Pacific University",
  "Pennsylvania State University (Penn State)",
  "Pepperdine University",
  "Pitzer College",
  "Pomona College",
  "Portland State University",
  "Prairie View A&M University",
  "Princeton University",
  "Providence College",
  "Purdue University",
  "Quinnipiac University",
  "Radford University",
  "Ramapo College",
  "Reed College",
  "Rensselaer Polytechnic Institute (RPI)",
  "Rhode Island School of Design (RISD)",
  "Rice University",
  "Rider University",
  "Ripon College",
  "Rochester Institute of Technology (RIT)",
  "Rockhurst University",
  "Rollins College",
  "Roosevelt University",
  "Rowan University",
  "Rutgers University",
  "Saint Joseph's University",
  "Saint Louis University",
  "Saint Mary's College",
  "Saint Mary's College of California",
  "Sam Houston State University",
  "Samford University",
  "San Diego State University",
  "San Francisco State University",
  "San Jose State University",
  "Santa Clara University",
  "Sarah Lawrence College",
  "Savannah College of Art & Design",
  "Scripps College",
  "Seattle Pacific University",
  "Seattle University",
  "Seton Hall University",
  "Sewanee: The University of the South",
  "Siena College",
  "Simmons University",
  "Skidmore College",
  "Smith College",
  "Sonoma State University",
  "South Carolina State University",
  "South Dakota State University",
  "Southeastern Louisiana University",
  "Southern Illinois University",
  "Southern Methodist University (SMU)",
  "Spelman College",
  "St. John's University",
  "Stanford University",
  "Stetson University",
  "Stevens Institute of Technology",
  "Stony Brook University (SUNY)",
  "Suffolk University",
  "SUNY Albany",
  "SUNY Binghamton",
  "SUNY Buffalo",
  "SUNY Geneseo",
  "SUNY New Paltz",
  "SUNY Oneonta",
  "SUNY Oswego",
  "SUNY Plattsburgh",
  "SUNY Potsdam",
  "Swarthmore College",
  "Syracuse University",
  "Temple University",
  "Tennessee State University",
  "Tennessee Tech University",
  "Texas A&M University",
  "Texas Christian University",
  "Texas Southern University",
  "Texas State University",
  "Texas Tech University",
  "The College of New Jersey",
  "The New School",
  "The Ohio State University",
  "The University of Alabama",
  "The University of Arizona",
  "The University of Georgia",
  "The University of Iowa",
  "The University of Kansas",
  "The University of Kentucky",
  "The University of Memphis",
  "The University of Mississippi (Ole Miss)",
  "The University of Montana",
  "The University of New Mexico",
  "The University of North Carolina at Chapel Hill",
  "The University of North Carolina at Greensboro",
  "The University of North Dakota",
  "The University of Oklahoma",
  "The University of Oregon",
  "The University of South Carolina",
  "The University of Tennessee",
  "The University of Texas at Arlington",
  "The University of Texas at Austin",
  "The University of Texas at Dallas",
  "The University of Texas at El Paso",
  "The University of Texas at San Antonio",
  "The University of Toledo",
  "The University of Tulsa",
  "The University of Utah",
  "The University of Vermont",
  "The University of Virginia",
  "The University of Washington",
  "The University of Wisconsin-Madison",
  "Towson University",
  "Trinity College",
  "Trinity University",
  "Troy University",
  "Truman State University",
  "Tufts University",
  "Tulane University",
  "Tuskegee University",
  "Union College",
  "United States Coast Guard Academy",
  "United States Merchant Marine Academy",
  "United States Military Academy (West Point)",
  "United States Naval Academy",
  "University at Albany (SUNY)",
  "University at Buffalo (SUNY)",
  "University of Akron",
  "University of Alabama",
  "University of Alabama at Birmingham",
  "University of Alabama in Huntsville",
  "University of Alaska Anchorage",
  "University of Alaska Fairbanks",
  "University of Arizona",
  "University of Arkansas",
  "University of Arkansas at Little Rock",
  "University of Arkansas at Pine Bluff",
  "University of Baltimore",
  "University of California, Berkeley (UC Berkeley)",
  "University of California, Davis (UC Davis)",
  "University of California, Irvine (UC Irvine)",
  "University of California, Los Angeles (UCLA)",
  "University of California, Merced",
  "University of California, Riverside (UC Riverside)",
  "University of California, San Diego (UCSD)",
  "University of California, San Francisco (UCSF)",
  "University of California, Santa Barbara (UCSB)",
  "University of California, Santa Cruz (UCSC)",
  "University of Central Arkansas",
  "University of Central Florida",
  "University of Central Missouri",
  "University of Central Oklahoma",
  "University of Charleston",
  "University of Chicago",
  "University of Cincinnati",
  "University of Colorado Boulder",
  "University of Colorado Colorado Springs",
  "University of Colorado Denver",
  "University of Connecticut",
  "University of Dayton",
  "University of Delaware",
  "University of Denver",
  "University of Detroit Mercy",
  "University of Evansville",
  "University of Florida",
  "University of Georgia",
  "University of Hartford",
  "University of Hawaii at Manoa",
  "University of Houston",
  "University of Idaho",
  "University of Illinois Chicago",
  "University of Illinois Springfield",
  "University of Illinois Urbana-Champaign",
  "University of Indianapolis",
  "University of Iowa",
  "University of Kansas",
  "University of Kentucky",
  "University of Louisiana at Lafayette",
  "University of Louisiana at Monroe",
  "University of Louisville",
  "University of Maine",
  "University of Mary Hardin-Baylor",
  "University of Mary Washington",
  "University of Maryland, Baltimore County (UMBC)",
  "University of Maryland, College Park",
  "University of Massachusetts Amherst",
  "University of Massachusetts Boston",
  "University of Massachusetts Dartmouth",
  "University of Massachusetts Lowell",
  "University of Memphis",
  "University of Miami",
  "University of Michigan",
  "University of Minnesota",
  "University of Mississippi (Ole Miss)",
  "University of Missouri",
  "University of Missouri-Kansas City",
  "University of Missouri-St. Louis",
  "University of Montana",
  "University of Nebraska at Kearney",
  "University of Nebraska at Omaha",
  "University of Nebraska, Lincoln",
  "University of Nevada, Las Vegas (UNLV)",
  "University of Nevada, Reno",
  "University of New Hampshire",
  "University of New Haven",
  "University of New Mexico",
  "University of North Alabama",
  "University of North Carolina at Asheville",
  "University of North Carolina at Chapel Hill",
  "University of North Carolina at Charlotte",
  "University of North Carolina at Greensboro",
  "University of North Carolina at Pembroke",
  "University of North Carolina at Wilmington",
  "University of North Dakota",
  "University of North Florida",
  "University of North Georgia",
  "University of North Texas",
  "University of Northern Colorado",
  "University of Northern Iowa",
  "University of Notre Dame",
  "University of Oklahoma",
  "University of Oregon",
  "University of Pennsylvania",
  "University of Pittsburgh",
  "University of Portland",
  "University of Puget Sound",
  "University of Rhode Island",
  "University of Richmond",
  "University of Rochester",
  "University of San Diego",
  "University of San Francisco",
  "University of Science and Arts of Oklahoma",
  "University of Scranton",
  "University of South Alabama",
  "University of South Carolina",
  "University of South Dakota",
  "University of South Florida",
  "University of Southern California (USC)",
  "University of Southern Indiana",
  "University of Southern Mississippi",
  "University of St. Thomas",
  "University of Tampa",
  "University of Tennessee",
  "University of Texas at Arlington",
  "University of Texas at Austin",
  "University of Texas at Dallas",
  "University of Texas at El Paso",
  "University of Texas at San Antonio",
  "University of the Pacific",
  "University of Toledo",
  "University of Tulsa",
  "University of Utah",
  "University of Vermont",
  "University of Virginia",
  "University of Washington",
  "University of West Florida",
  "University of West Georgia",
  "University of Wisconsin-Eau Claire",
  "University of Wisconsin-Green Bay",
  "University of Wisconsin-La Crosse",
  "University of Wisconsin-Madison",
  "University of Wisconsin-Milwaukee",
  "University of Wisconsin-Oshkosh",
  "University of Wisconsin-Parkside",
  "University of Wisconsin-Platteville",
  "University of Wisconsin-River Falls",
  "University of Wisconsin-Stevens Point",
  "University of Wisconsin-Stout",
  "University of Wisconsin-Superior",
  "University of Wisconsin-Whitewater",
  "University of Wyoming",
  "Utah State University",
  "Utah Valley University",
  "Valdosta State University",
  "Valparaiso University",
  "Vanderbilt University",
  "Vassar College",
  "Villanova University",
  "Virginia Commonwealth University",
  "Virginia Military Institute",
  "Virginia Polytechnic Institute and State University (Virginia Tech)",
  "Virginia State University",
  "Wabash College",
  "Wake Forest University",
  "Walla Walla University",
  "Washington and Jefferson College",
  "Washington and Lee University",
  "Washington State University",
  "Washington University in St. Louis",
  "Wayne State University",
  "Wellesley College",
  "Wesleyan University",
  "West Chester University",
  "West Virginia University",
  "Western Carolina University",
  "Western Illinois University",
  "Western Kentucky University",
  "Western Michigan University",
  "Western Washington University",
  "Wheaton College (IL)",
  "Whitman College",
  "Whittier College",
  "Whitworth University",
  "Widener University",
  "Willamette University",
  "William & Mary",
  "Williams College",
  "Winthrop University",
  "Wofford College",
  "Worcester Polytechnic Institute",
  "Wright State University",
  "Xavier University",
  "Yale University",
  "York College of Pennsylvania",
  "York University (Canada)",
  "Yeshiva University",
  "American University of Beirut",
  "Australian National University",
  "ETH Zurich",
  "Imperial College London",
  "London School of Economics (LSE)",
  "McGill University",
  "Nanyang Technological University (Singapore)",
  "National University of Singapore (NUS)",
  "Peking University",
  "Sciences Po (France)",
  "Sorbonne University (France)",
  "Technical University of Munich",
  "Tsinghua University",
  "University College London (UCL)",
  "University of Amsterdam",
  "University of British Columbia",
  "University of Cambridge",
  "University of Copenhagen",
  "University of Edinburgh",
  "University of Hong Kong",
  "University of Manchester",
  "University of Melbourne",
  "University of Oxford",
  "University of Queensland",
  "University of Sydney",
  "University of Tokyo",
  "University of Toronto",
  "University of Warwick",
  "University of Zurich"
];

const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  
  const [open, setOpen] = useState(false);
  
  const getResumeData = () => {
    try {
      const resumeData = localStorage.getItem('resumeData');
      return resumeData ? JSON.parse(resumeData) : null;
    } catch {
      return null;
    }
  };

  const resumeData = getResumeData();
  
  // Better name parsing
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
  
  const { firstName, lastName } = parseName(resumeData?.name);
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: firstName,
      lastName: lastName,
      university: resumeData?.university || "",
    },
  });

  const onSubmit = async (data: FormData) => {
    console.log("Form submitted:", data);
    
    try {
      const update = {
        firstName: data.firstName,
        lastName: data.lastName,
        university: data.university || "",
      };

      if (user) {
        const existing = await firebaseApi.getProfessionalInfo(user.uid) || {};
        await firebaseApi.saveProfessionalInfo(user.uid, { ...existing, ...update });
        console.log("Saved profile data to Firestore:", { ...existing, ...update });
      } else {
        const existing = JSON.parse(localStorage.getItem('professionalInfo') || '{}');
        localStorage.setItem('professionalInfo', JSON.stringify({ ...existing, ...update }));
        console.log("Saved profile data to localStorage:", { ...existing, ...update });
      }
    } catch (error) {
      console.error('Failed to save profile info:', error);
    }
    
    navigate("/onboarding/academics");
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
      
      <div className="w-full max-w-md space-y-4">
        <Progress value={15} className="w-full" />
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Welcome to Offerloop.ai</CardTitle>
            <p className="text-muted-foreground">Let's get started with your profile</p>
          </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">What's your name?</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="First name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Last name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              <FormField
                control={form.control}
                name="university"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>University (Optional)</FormLabel>
                    <Popover open={open} onOpenChange={setOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? universities.find((university) => university === field.value)
                              : "Select university..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search university..." className="h-9" />
                          <CommandList>
                            <CommandEmpty>No university found.</CommandEmpty>
                            <CommandGroup>
                              {universities.map((university) => (
                                <CommandItem
                                  key={university}
                                  value={university}
                                  onSelect={(currentValue) => {
                                    field.onChange(currentValue === field.value ? "" : currentValue)
                                    setOpen(false)
                                  }}
                                >
                                  {university}
                                  <Check
                                    className={cn(
                                      "ml-auto h-4 w-4",
                                      field.value === university ? "opacity-100" : "opacity-0"
                                    )}
                                  />
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

export default Onboarding;