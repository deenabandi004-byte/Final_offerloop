import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, User, GraduationCap, Briefcase } from "lucide-react";
import careerIllustration from "@/assets/career-illustration.png";

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
          <div className="space-y-6">
            <h1 className="text-5xl lg:text-6xl font-bold text-foreground">
              Welcome to{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Offerloop
              </span>
            </h1>
            
            <p className="text-xl lg:text-2xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Let's get you set up with a personalized experience in just a few quick steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 my-12">
            <div className="flex flex-col items-center space-y-4 p-6">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                <User className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground">1. Profile</h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed">Complete your profile and upload resume</p>
            </div>
            
            <div className="flex flex-col items-center space-y-4 p-6">
              <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center border border-secondary/30">
                <GraduationCap className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="text-lg font-bold text-foreground">2. Academics</h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed">Add your educational background</p>
            </div>
            
            <div className="flex flex-col items-center space-y-4 p-6">
              <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30">
                <Briefcase className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-lg font-bold text-foreground">3. Career</h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed">Tell us what you're aiming for</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right side - illustration */}
      <div className="w-1/2 bg-background flex items-start justify-center p-8 pt-16">
        <div className="w-full max-w-lg">
          <img 
            src={careerIllustration} 
            alt="Career professionals illustration" 
            className="w-full h-auto object-contain"
          />
        </div>
      </div>
      
      {/* Centered Get Started button at bottom */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
        <Button 
          onClick={onNext}
          variant="gradient"
          size="lg"
          className="px-12 py-4 text-lg font-bold rounded-full group"
        >
          Get Started
          <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
};