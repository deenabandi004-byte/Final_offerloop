import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Sparkles, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

interface OnboardingCompleteProps {
  onFinish: () => void;
}

export const OnboardingComplete = ({ onFinish }: OnboardingCompleteProps) => {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10">
      <Card className={`w-full max-w-2xl p-8 lg:p-12 text-center space-y-8 shadow-lg border-0 bg-card/80 backdrop-blur-sm transition-all duration-1000 ${showContent ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="relative">
              <div className="p-6 rounded-full bg-gradient-to-r from-primary to-secondary shadow-glow animate-pulse">
                <CheckCircle className="h-12 w-12 text-primary-foreground" />
              </div>
              <div className="absolute -top-2 -right-2">
                <Sparkles className="h-6 w-6 text-secondary animate-bounce" />
              </div>
            </div>
          </div>
          
          <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            You're All Set!
          </h1>
          
          <p className="text-lg lg:text-xl text-muted-foreground max-w-md mx-auto leading-relaxed">
            Your profile has been created successfully. Welcome to your personalized experience!
          </p>
        </div>

        <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-2xl p-6 space-y-4">
          <h3 className="text-xl font-semibold text-foreground">What's Next?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                <span className="text-sm font-bold text-primary">1</span>
              </div>
              <p className="text-sm text-muted-foreground">Explore your dashboard</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center mx-auto">
                <span className="text-sm font-bold text-secondary">2</span>
              </div>
              <p className="text-sm text-muted-foreground">Customize your settings</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
                <span className="text-sm font-bold text-accent-foreground">3</span>
              </div>
              <p className="text-sm text-muted-foreground">Start using the app</p>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <Button 
            onClick={onFinish}
            size="lg"
            className="px-8 py-6 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 group"
          >
            Enter App
            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </Card>
    </div>
  );
};