import { useState } from "react";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Settings, User, MapPin } from "lucide-react";

const Index = () => {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [userData, setUserData] = useState<any>(null);

  const handleOnboardingComplete = (data: any) => {
    setUserData(data);
    setShowOnboarding(false);
  };

  const handleRestartOnboarding = () => {
    setShowOnboarding(true);
    setUserData(null);
  };

  if (showOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 p-4">
      <div className="container mx-auto max-w-4xl">
        <header className="text-center py-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
            Welcome to Your Dashboard
          </h1>
          <p className="text-lg text-muted-foreground">
            Your personalized experience is ready!
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 space-y-4 bg-card/80 backdrop-blur-sm border-0 shadow-lg">
            <div className="flex items-center space-x-3">
              <User className="h-8 w-8 text-primary" />
              <h3 className="text-xl font-semibold">Profile</h3>
            </div>
            {userData?.profile && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong>Name:</strong> {userData.profile.firstName} {userData.profile.lastName}</p>
                <p><strong>Email:</strong> {userData.profile.email}</p>
                <p><strong>Role:</strong> {userData.profile.role}</p>
                <p><strong>Experience:</strong> {userData.profile.experience}</p>
                {userData.profile.resume && (
                  <p><strong>Resume:</strong> {userData.profile.resume.name}</p>
                )}
              </div>
            )}
          </Card>

          <Card className="p-6 space-y-4 bg-card/80 backdrop-blur-sm border-0 shadow-lg">
            <div className="flex items-center space-x-3">
              <MapPin className="h-8 w-8 text-secondary" />
              <h3 className="text-xl font-semibold">Location</h3>
            </div>
            {userData?.location && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong>Country:</strong> {userData.location.country}</p>
                <p><strong>City:</strong> {userData.location.city}</p>
                <p><strong>Timezone:</strong> {userData.location.timezone}</p>
                <p><strong>Language:</strong> {userData.location.language}</p>
              </div>
            )}
          </Card>

          <Card className="p-6 space-y-4 bg-card/80 backdrop-blur-sm border-0 shadow-lg">
            <div className="flex items-center space-x-3">
              <Settings className="h-8 w-8 text-accent-foreground" />
              <h3 className="text-xl font-semibold">Preferences</h3>
            </div>
            {userData?.location?.notifications && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong>Email:</strong> {userData.location.notifications.email ? 'Enabled' : 'Disabled'}</p>
                <p><strong>Push:</strong> {userData.location.notifications.push ? 'Enabled' : 'Disabled'}</p>
                <p><strong>SMS:</strong> {userData.location.notifications.sms ? 'Enabled' : 'Disabled'}</p>
              </div>
            )}
          </Card>
        </div>

        <div className="text-center">
          <Button 
            onClick={handleRestartOnboarding}
            variant="outline"
            className="px-6 py-2"
          >
            Edit Onboarding Settings
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
