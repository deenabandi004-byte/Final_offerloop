import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Sparkles } from "lucide-react";

interface OnboardingWelcomeProps {
  onNext: () => void;
  userName?: string;
}

export const OnboardingWelcome = ({ onNext, userName = "there" }: OnboardingWelcomeProps) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10">
      <Card className="w-full max-w-2xl p-8 lg:p-12 text-center space-y-8 shadow-lg border-0 bg-card/80 backdrop-blur-sm">
        <div className="space-y-4">
          <h1 className="text-4xl lg:text-5xl font-bold text-foreground">
            Welcome {userName}!
          </h1>
          
          <p className="text-lg lg:text-xl text-muted-foreground max-w-md mx-auto leading-relaxed">
            Let's get you set up with a personalized experience in just a few quick steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
          <div className="flex flex-col items-center space-y-3 p-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              1
            </div>
            <h3 className="font-semibold text-foreground">Profile</h3>
            <p className="text-sm text-muted-foreground text-center">Complete your profile and upload resume</p>
          </div>
          
          <div className="flex flex-col items-center space-y-3 p-4">
            <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold text-lg">
              2
            </div>
            <h3 className="font-semibold text-foreground">Preferences</h3>
            <p className="text-sm text-muted-foreground text-center">Set your location and preferences</p>
          </div>
          
          <div className="flex flex-col items-center space-y-3 p-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent-foreground font-bold text-lg">
              3
            </div>
            <h3 className="font-semibold text-foreground">Ready!</h3>
            <p className="text-sm text-muted-foreground text-center">Start using your personalized app</p>
          </div>
        </div>

        <div className="pt-4">
          <Button 
            onClick={onNext}
            size="lg"
            className="px-8 py-6 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 group"
          >
            Get Started
            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </Card>
    </div>
  );
};