import { Bell, Calendar, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ScoutHeaderButton from './ScoutHeaderButton';
import { useNavigate } from 'react-router-dom';

interface PageHeaderActionsProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

export function PageHeaderActions({ onJobTitleSuggestion }: PageHeaderActionsProps) {
  const navigate = useNavigate();

  const handleBellClick = () => {
    // Always navigate to the outbox tab on the home page
    navigate('/home?tab=outbox');
  };

  const handleOpenTour = () => {
    window.dispatchEvent(new CustomEvent('openOnboardingTour'));
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
      {/* Tour button - opens onboarding walkthrough */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpenTour}
        className="h-9 w-9 hover:bg-blue-100 hover:text-blue-600 flex-shrink-0"
        aria-label="Take a tour"
        title="Take a tour"
      >
        <HelpCircle className="h-5 w-5" />
      </Button>

      {/* Bell icon - links to outbox */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBellClick}
        className="h-9 w-9 hover:bg-blue-100 hover:text-blue-600 flex-shrink-0"
        aria-label="View outbox"
      >
        <Bell className="h-5 w-5" />
      </Button>

      {/* Calendar button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate('/home?tab=calendar')}
        className="h-9 w-9 hover:bg-blue-100 hover:text-blue-600 flex-shrink-0"
        aria-label="View calendar"
      >
        <Calendar className="h-5 w-5" />
      </Button>

      {/* Ask Scout button - rightmost */}
      <ScoutHeaderButton onJobTitleSuggestion={onJobTitleSuggestion} />
    </div>
  );
}

