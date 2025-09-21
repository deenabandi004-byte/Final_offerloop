import { useState } from "react";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Settings, User, MapPin } from "lucide-react";

const Index = () => {
  return <OnboardingFlow onComplete={(data) => console.log('Onboarding completed:', data)} />;
};

export default Index;
