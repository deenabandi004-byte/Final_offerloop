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
    <div className="relative">
      <div className="filter blur-sm opacity-50 pointer-events-none">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm rounded-lg">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto bg-gray-700 rounded-full flex items-center justify-center">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-white font-medium">Upgrade plan to unlock {featureName}</p>
            <p className="text-gray-400 text-sm">Available for {requiredTier} membership</p>
          </div>
          <Button
            onClick={() => navigate('/pricing')}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
          >
            Upgrade Plan
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LockedFeatureOverlay;
