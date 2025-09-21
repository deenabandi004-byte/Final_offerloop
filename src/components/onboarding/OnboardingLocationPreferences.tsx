import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, MapPin, Globe, ChevronsUpDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationPreferences {
  country: string;
  state: string;
  city: string;
  jobTitle: string;
  company: string;
  interests: string[];
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
    newsletter: boolean;
  };
}

interface OnboardingLocationPreferencesProps {
  onNext: (data: LocationPreferences) => void;
  onBack: () => void;
  initialData?: LocationPreferences;
}

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

export const OnboardingLocationPreferences = ({ onNext, onBack, initialData }: OnboardingLocationPreferencesProps) => {
  const [preferences, setPreferences] = useState<LocationPreferences>({
    country: initialData?.country || "",
    state: initialData?.state || "",
    city: initialData?.city || "",
    jobTitle: initialData?.jobTitle || "",
    company: initialData?.company || "",
    interests: initialData?.interests || [],
    notifications: initialData?.notifications || {
      email: true,
      push: true,
      sms: false,
      newsletter: false,
    }
  });
  
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext(preferences);
  };

  const updateNotification = (key: keyof LocationPreferences['notifications'], value: boolean) => {
    setPreferences(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: value
      }
    }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10">
      <Card className="w-full max-w-2xl p-8 space-y-8 shadow-lg border-0 bg-card/80 backdrop-blur-sm">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-foreground">Career Preferences</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Share your goals and interests to help us match you with the right opportunities.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="country" className="text-foreground font-medium">Country</Label>
              <Select value={preferences.country} onValueChange={(value) => setPreferences(prev => ({ ...prev, country: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="uk">United Kingdom</SelectItem>
                  <SelectItem value="ca">Canada</SelectItem>
                  <SelectItem value="au">Australia</SelectItem>
                  <SelectItem value="de">Germany</SelectItem>
                  <SelectItem value="fr">France</SelectItem>
                  <SelectItem value="jp">Japan</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="state" className="text-foreground font-medium">State/Province</Label>
              <Input
                id="state"
                value={preferences.state}
                onChange={(e) => setPreferences(prev => ({ ...prev, state: e.target.value }))}
                placeholder="Enter your state/province"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city" className="text-foreground font-medium">City</Label>
              <Input
                id="city"
                value={preferences.city}
                onChange={(e) => setPreferences(prev => ({ ...prev, city: e.target.value }))}
                placeholder="Enter your city"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="jobTitle" className="text-foreground font-medium">Job Title</Label>
              <Input
                id="jobTitle"
                value={preferences.jobTitle}
                onChange={(e) => setPreferences(prev => ({ ...prev, jobTitle: e.target.value }))}
                placeholder="Enter your job title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company" className="text-foreground font-medium">Company</Label>
              <Input
                id="company"
                value={preferences.company}
                onChange={(e) => setPreferences(prev => ({ ...prev, company: e.target.value }))}
                placeholder="Enter your company name"
              />
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-foreground font-medium">Interests</Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between h-auto min-h-10 px-3 py-2"
                >
                  <span className="text-left">
                    {preferences.interests.length > 0 
                      ? `${preferences.interests.length} interest${preferences.interests.length === 1 ? '' : 's'} selected`
                      : "Start typing to find interests..."
                    }
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Start typing to find interests..." className="h-9" />
                  <CommandList className="max-h-[200px]">
                    <CommandEmpty>No interests found.</CommandEmpty>
                    <CommandGroup>
                      {interests.map((interest) => (
                        <CommandItem
                          key={interest}
                          value={interest}
                          onSelect={(currentValue) => {
                            const isSelected = preferences.interests.includes(currentValue);
                            if (isSelected) {
                              setPreferences(prev => ({
                                ...prev,
                                interests: prev.interests.filter(i => i !== currentValue)
                              }));
                            } else {
                              setPreferences(prev => ({
                                ...prev,
                                interests: [...prev.interests, currentValue]
                              }));
                            }
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              preferences.interests.includes(interest) ? "opacity-100" : "opacity-0"
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
            
            {preferences.interests.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {preferences.interests.map((interest) => (
                  <Badge key={interest} variant="secondary" className="text-xs px-2 py-1">
                    {interest}
                    <button
                      type="button"
                      onClick={() => {
                        setPreferences(prev => ({
                          ...prev,
                          interests: prev.interests.filter(i => i !== interest)
                        }));
                      }}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreferences(prev => ({ ...prev, interests: [] }))}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Label className="text-foreground font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Notification Preferences
            </Label>
            <div className="space-y-3 pl-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="email"
                  checked={preferences.notifications.email}
                  onCheckedChange={(checked) => updateNotification('email', checked as boolean)}
                />
                <Label htmlFor="email" className="text-sm font-normal">Email notifications</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="push"
                  checked={preferences.notifications.push}
                  onCheckedChange={(checked) => updateNotification('push', checked as boolean)}
                />
                <Label htmlFor="push" className="text-sm font-normal">Push notifications</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sms"
                  checked={preferences.notifications.sms}
                  onCheckedChange={(checked) => updateNotification('sms', checked as boolean)}
                />
                <Label htmlFor="sms" className="text-sm font-normal">SMS notifications</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="newsletter"
                  checked={preferences.notifications.newsletter}
                  onCheckedChange={(checked) => updateNotification('newsletter', checked as boolean)}
                />
                <Label htmlFor="newsletter" className="text-sm font-normal">Newsletter subscription</Label>
              </div>
            </div>
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
              Continue
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};