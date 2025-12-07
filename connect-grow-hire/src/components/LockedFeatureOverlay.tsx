import React from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface LockedFeatureOverlayProps {
  featureName: string;
  requiredTier: string;
  children: React.ReactNode;
}

const LockedFeatureOverlay: React.FC<LockedFeatureOverlayProps> = ({
  featureName,
  requiredTier,
  children
}) => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[800px]">
      <div className="filter blur-sm opacity-50 pointer-events-none min-h-[800px]">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm rounded-lg min-h-[800px]">
        <div className="text-center -mt-[400px]">
          <div className="mt-[400px] space-y-4">
            <Lock className="w-32 h-32 text-white mx-auto mb-6" />
            <p className="text-white font-medium text-6xl mb-4">
              Upgrade to <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">Pro</span> to Unlock
            </p>
            <p className="text-gray-400 text-base max-w-2xl mx-auto mb-6">
              {featureName === "Interview Prep" ? (
                <>Interview Prep scans real candidate reports, recent company developments, role-specific expectations, and division-level insights to give you a personalized briefing for your interview. It highlights the key skills interviewers look for, the structure of the interview process, and the types of behavioral, technical, or case questions you'll likely face. You also get tailored talking points and context about the team and industry trends, helping you walk into your interview confident, informed, and prepared to perform at your best.</>
              ) : (
                <>Coffee Chat Prep analyzes your contact's background, recent news, shared interests, and industry insights to generate a personalized conversation roadmap. It also highlights the projects they've recently worked on and company or industry developments directly tied to their role, giving you extremely specific talking points that make it look like you did your homework. Walk into every chat confident, prepared, and ready to build a real connection.</>
              )}
            </p>
             <Button
               onClick={() => navigate('/pricing')}
               className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 mt-2"
             >
               Upgrade Plan
             </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LockedFeatureOverlay;