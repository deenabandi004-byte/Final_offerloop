import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, ArrowLeft, MapPin, Globe } from "lucide-react";

interface LocationPreferences {
  country: string;
  state: string;
  city: string;
  timezone: string;
  language: string;
  currency: string;
  workingHours: string;
  availability: string;
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
}

export const OnboardingLocationPreferences = ({ onNext, onBack }: OnboardingLocationPreferencesProps) => {
  const [preferences, setPreferences] = useState<LocationPreferences>({
    country: "",
    state: "",
    city: "",
    timezone: "",
    language: "en",
    currency: "usd",
    workingHours: "",
    availability: "",
    interests: [],
    notifications: {
      email: true,
      push: true,
      sms: false,
      newsletter: false,
    }
  });

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
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-gradient-to-r from-primary to-secondary/50 shadow-glow">
              <MapPin className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-foreground">Location & Preferences</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Help us personalize your experience by setting your location and preferences.
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
              <Label htmlFor="timezone" className="text-foreground font-medium">Timezone</Label>
              <Select value={preferences.timezone} onValueChange={(value) => setPreferences(prev => ({ ...prev, timezone: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="utc-8">Pacific Time (UTC-8)</SelectItem>
                  <SelectItem value="utc-7">Mountain Time (UTC-7)</SelectItem>
                  <SelectItem value="utc-6">Central Time (UTC-6)</SelectItem>
                  <SelectItem value="utc-5">Eastern Time (UTC-5)</SelectItem>
                  <SelectItem value="utc+0">UTC+0 (GMT)</SelectItem>
                  <SelectItem value="utc+1">Central European (UTC+1)</SelectItem>
                  <SelectItem value="utc+9">Japan Standard (UTC+9)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language" className="text-foreground font-medium">Language</Label>
              <Select value={preferences.language} onValueChange={(value) => setPreferences(prev => ({ ...prev, language: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                  <SelectItem value="zh">Chinese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="currency" className="text-foreground font-medium">Preferred Currency</Label>
              <Select value={preferences.currency} onValueChange={(value) => setPreferences(prev => ({ ...prev, currency: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD - US Dollar</SelectItem>
                  <SelectItem value="eur">EUR - Euro</SelectItem>
                  <SelectItem value="gbp">GBP - British Pound</SelectItem>
                  <SelectItem value="cad">CAD - Canadian Dollar</SelectItem>
                  <SelectItem value="aud">AUD - Australian Dollar</SelectItem>
                  <SelectItem value="jpy">JPY - Japanese Yen</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workingHours" className="text-foreground font-medium">Working Hours</Label>
              <Select value={preferences.workingHours} onValueChange={(value) => setPreferences(prev => ({ ...prev, workingHours: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select working hours" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9-5">9 AM - 5 PM</SelectItem>
                  <SelectItem value="8-4">8 AM - 4 PM</SelectItem>
                  <SelectItem value="10-6">10 AM - 6 PM</SelectItem>
                  <SelectItem value="flexible">Flexible</SelectItem>
                  <SelectItem value="remote">Remote/Various</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="availability" className="text-foreground font-medium">Availability</Label>
            <Select value={preferences.availability} onValueChange={(value) => setPreferences(prev => ({ ...prev, availability: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select your availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full-time">Full-time</SelectItem>
                <SelectItem value="part-time">Part-time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="freelance">Freelance</SelectItem>
                <SelectItem value="not-available">Not currently available</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <Label className="text-foreground font-medium">Interests (Select all that apply)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['Technology', 'Design', 'Business', 'Marketing', 'Finance', 'Education', 'Healthcare', 'Entertainment', 'Sports', 'Travel', 'Food', 'Music'].map((interest) => (
                <div key={interest} className="flex items-center space-x-2">
                  <Checkbox
                    id={interest}
                    checked={preferences.interests.includes(interest)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setPreferences(prev => ({
                          ...prev,
                          interests: [...prev.interests, interest]
                        }));
                      } else {
                        setPreferences(prev => ({
                          ...prev,
                          interests: prev.interests.filter(i => i !== interest)
                        }));
                      }
                    }}
                  />
                  <Label htmlFor={interest} className="text-sm font-normal">{interest}</Label>
                </div>
              ))}
            </div>
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