import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const CTA = () => {
  const navigate = useNavigate();

  return (
    <section className="py-20 bg-gradient-hero text-primary-foreground">
      <div className="container px-6 mx-auto text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl lg:text-4xl font-bold mb-6">
            Ready to Transform Your Recruiting Process?
          </h2>
          <p className="text-xl opacity-90 mb-8 leading-relaxed">
            Join a community of ambitious job seekers and get on the fast track towards your dream career.
          </p>
          <div className="flex justify-center">
            <Button 
              size="lg" 
              variant="secondary" 
              className="h-12 px-8"
              onClick={() => navigate("/onboarding/resume-upload")}
            >
              Start Free Trial
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
