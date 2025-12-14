/**
 * FeatureGate component - wraps features that require specific tiers
 */
import React from 'react';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { UpgradeModal } from './UpgradeModal';
import { Lock } from 'lucide-react';

interface FeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showLockIcon?: boolean;
}

export function FeatureGate({ 
  feature, 
  children, 
  fallback,
  showLockIcon = true 
}: FeatureGateProps) {
  const { allowed, reason, tier, loading } = useFeatureGate(feature);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);

  if (loading) {
    return <div className="opacity-50">{children}</div>;
  }

  if (!allowed) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <>
        <div 
          className="relative cursor-pointer group"
          onClick={() => setShowUpgradeModal(true)}
        >
          {showLockIcon && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-lg flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="text-center">
                <Lock className="h-8 w-8 text-blue-400 mx-auto mb-2" />
                <p className="text-sm text-white font-medium">Upgrade Required</p>
              </div>
            </div>
          )}
          <div className={showLockIcon ? 'opacity-50 pointer-events-none' : ''}>
            {children}
          </div>
        </div>
        <UpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          feature={feature}
          reason={reason}
          currentTier={tier}
        />
      </>
    );
  }

  return <>{children}</>;
}
