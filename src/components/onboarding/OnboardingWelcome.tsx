import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, User, GraduationCap, Briefcase } from "lucide-react";

interface OnboardingWelcomeProps {
  onNext: () => void;
  userName?: string;
}

export const OnboardingWelcome = ({ onNext, userName = "there" }: OnboardingWelcomeProps) => {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side content */}
      <div className="w-1/2 p-4 pt-12 flex flex-col">
        <div className="w-full max-w-2xl p-8 lg:p-12 text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl lg:text-5xl font-bold text-foreground">
              Welcome
            </h1>
            
            <p className="text-lg lg:text-xl text-muted-foreground max-w-md mx-auto leading-relaxed">
              Let's get you set up with a personalized experience in just a few quick steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
            <div className="flex flex-col items-center space-y-3 p-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-6 h-6 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground">Profile</h3>
              <p className="text-sm text-muted-foreground text-center">Complete your profile and upload resume</p>
            </div>
            
            <div className="flex flex-col items-center space-y-3 p-4">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground">Academics</h3>
              <p className="text-sm text-muted-foreground text-center">Add your educational background</p>
            </div>
            
            <div className="flex flex-col items-center space-y-3 p-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="font-semibold text-foreground">Career</h3>
              <p className="text-sm text-muted-foreground text-center">Tell us what you're aiming for</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right side - white space */}
      <div className="w-1/2 bg-background"></div>
      
      {/* Centered Get Started button at bottom */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
        <Button 
          onClick={onNext}
          size="lg"
          className="px-8 py-6 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 group"
        >
          Get Started
          <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
};