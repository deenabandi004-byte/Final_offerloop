import { Bell, Calendar, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileMenuButton } from '@/components/ui/sidebar';
import ScoutHeaderButton from './ScoutHeaderButton';
import { useNavigate } from 'react-router-dom';

interface AppHeaderProps {
  title?: string;
  /** Optional icon to display next to the title */
  titleIcon?: React.ReactNode;
  /** Callback when job title suggestion is received from Scout */
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

/**
 * AppHeader - Standardized header component for all app pages
 * 
 * Layout:
 * - Left: Mobile menu button, notification icons, page title
 * - Right: Scout button
 */
export function AppHeader({ 
  title, 
  titleIcon,
  onJobTitleSuggestion
}: AppHeaderProps) {
  const navigate = useNavigate();

  const handleBellClick = () => {
    navigate('/home?tab=outbox');
  };

  const handleCalendarClick = () => {
    navigate('/home?tab=calendar');
  };

  const handleSettingsClick = () => {
    navigate('/account-settings');
  };

  return (
    <header className="h-16 flex items-center justify-between px-4 lg:px-6 bg-white flex-shrink-0 relative z-20">
      {/* Left Section: Mobile menu, icons, title */}
      <div className="flex items-center gap-2 lg:gap-3">
        <MobileMenuButton />
        
        {/* Header Icons */}
        <div className="hidden sm:flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBellClick}
            className="h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="View outbox"
          >
            <Bell className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleCalendarClick}
            className="h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="View calendar"
          >
            <Calendar className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleSettingsClick}
            className="h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Account settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        {/* Page Title */}
        <div className="flex items-center gap-2">
          {titleIcon && <span className="text-gray-600">{titleIcon}</span>}
          <h1 className="text-lg lg:text-xl font-semibold text-gray-900 truncate max-w-[150px] sm:max-w-none">
            {title}
          </h1>
        </div>
      </div>

      {/* Right Section: Scout button */}
      <div className="flex items-center gap-2 lg:gap-3">
        {/* Scout Button */}
        <ScoutHeaderButton />
      </div>
    </header>
  );
}
