import { useState, useEffect, useMemo } from 'react';
import { Flame } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { AppHeader } from '@/components/AppHeader';
import { Dashboard } from '@/components/Dashboard';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { firebaseApi } from '@/services/firebaseApi';
import { apiService, type Firm } from '@/services/api';
import { calculateWeeklySummary } from '@/utils/dashboardStats';

// Stats component for the header
function DashboardHeaderStats({ 
  sent, 
  replies, 
  chats, 
  timeSaved,
  streak 
}: { 
  sent: number; 
  replies: number; 
  chats: number; 
  timeSaved: number;
  streak: number;
}) {
  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-1.5">
        <span className="text-lg font-semibold text-gray-700">{sent}</span>
        <span className="text-sm text-gray-400">sent</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-lg font-semibold text-gray-700">{replies}</span>
        <span className="text-sm text-gray-400">replies</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-lg font-semibold text-gray-700">{chats}</span>
        <span className="text-sm text-gray-400">chats</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-lg font-semibold text-gray-700">{timeSaved}h</span>
        <span className="text-sm text-gray-400">saved</span>
      </div>
      <div className="flex items-center gap-1.5 ml-2 pl-4 border-l border-gray-200">
        <Flame className="h-5 w-5 text-orange-500" />
        <span className="text-lg font-semibold text-gray-700">{streak}</span>
        <span className="text-sm text-gray-400">day streak</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  console.log("📊 [DASHBOARD PAGE] Component rendering");
  
  const { user } = useFirebaseAuth();
  
  // Stats state
  const [contactCount, setContactCount] = useState<number>(0);
  const [firmCount, setFirmCount] = useState<number>(0);
  const [coffeeChatCount, setCoffeeChatCount] = useState<number>(0);
  const [weeklySummary, setWeeklySummary] = useState<any>(null);
  const [replyStats, setReplyStats] = useState<{ totalReplies: number; totalSent: number } | null>(null);
  const [streak, setStreak] = useState<number>(0);

  // Derived values
  const timeSavedHours = useMemo(() => {
    const contactMinutes = contactCount * 20;
    const firmMinutes = firmCount * 2;
    const coffeeChatMinutes = coffeeChatCount * 30;
    const totalMinutes = contactMinutes + firmMinutes + coffeeChatMinutes;
    return Math.round((totalMinutes / 60) * 10) / 10;
  }, [contactCount, firmCount, coffeeChatCount]);

  const outreachSent = weeklySummary?.contactsGenerated || replyStats?.totalSent || 0;
  const repliesReceived = replyStats?.totalReplies || 0;
  const coffeeChatsBooked = coffeeChatCount || weeklySummary?.coffeeChatsCreated || 0;

  // Fetch contact count
  useEffect(() => {
    const fetchContactCount = async () => {
      if (user?.uid) {
        try {
          const contacts = await firebaseApi.getContacts(user.uid);
          setContactCount(contacts.length);
        } catch (error) {
          console.error('Failed to fetch contacts:', error);
        }
      }
    };
    fetchContactCount();
  }, [user?.uid]);

  // Fetch firm count
  useEffect(() => {
    const fetchFirmCount = async () => {
      if (!user) return;
      try {
        const history = await apiService.getFirmSearchHistory(50);
        const firmIds = new Set<string>();
        for (const historyItem of history) {
          try {
            const searchData = await apiService.getFirmSearchById(historyItem.id);
            if (searchData && searchData.firms) {
              searchData.firms.forEach((firm: Firm) => {
                const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;
                firmIds.add(firmKey);
              });
            }
          } catch (err) {
            // Skip failed searches
          }
        }
        setFirmCount(firmIds.size);
      } catch (error) {
        console.error('Failed to fetch firms:', error);
      }
    };
    fetchFirmCount();
  }, [user]);

  // Fetch coffee chat count
  useEffect(() => {
    const fetchCoffeeChatCount = async () => {
      if (!user) return;
      try {
        const result = await apiService.getAllCoffeeChatPreps();
        if (!('error' in result)) {
          setCoffeeChatCount(result.preps?.length || 0);
        }
      } catch (error) {
        console.error('Failed to fetch coffee chat preps:', error);
      }
    };
    fetchCoffeeChatCount();
  }, [user]);

  // Fetch weekly summary
  useEffect(() => {
    const fetchWeeklySummary = async () => {
      if (!user?.uid) return;
      try {
        const summary = await calculateWeeklySummary(user.uid);
        setWeeklySummary(summary);
      } catch (error) {
        console.error('Failed to fetch weekly summary:', error);
      }
    };
    fetchWeeklySummary();
  }, [user?.uid]);

  // Fetch reply stats
  useEffect(() => {
    const fetchDashboardStats = async () => {
      if (!user?.uid) return;
      try {
        const result = await apiService.getDashboardStats();
        if (!('error' in result)) {
          setReplyStats(result.replyStats);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      }
    };
    fetchDashboardStats();
  }, [user?.uid]);

  // Fetch/calculate streak
  useEffect(() => {
    const fetchStreak = async () => {
      if (!user?.uid) return;
      try {
        const activities = await firebaseApi.getActivities(user.uid, 100);
        if (activities.length === 0) {
          setStreak(0);
          return;
        }
        
        // Calculate streak based on consecutive days with activity
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const activityDates = new Set<string>();
        activities.forEach((activity: any) => {
          if (activity.timestamp) {
            const date = activity.timestamp.toDate ? activity.timestamp.toDate() : new Date(activity.timestamp);
            const dateStr = date.toISOString().split('T')[0];
            activityDates.add(dateStr);
          }
        });
        
        let currentStreak = 0;
        let checkDate = new Date(today);
        
        // Check today and backwards
        while (true) {
          const dateStr = checkDate.toISOString().split('T')[0];
          if (activityDates.has(dateStr)) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else if (currentStreak === 0) {
            // If no activity today, check yesterday
            checkDate.setDate(checkDate.getDate() - 1);
            const yesterdayStr = checkDate.toISOString().split('T')[0];
            if (activityDates.has(yesterdayStr)) {
              currentStreak++;
              checkDate.setDate(checkDate.getDate() - 1);
            } else {
              break;
            }
          } else {
            break;
          }
        }
        
        setStreak(currentStreak);
      } catch (error) {
        console.error('Failed to calculate streak:', error);
        setStreak(0);
      }
    };
    fetchStreak();
  }, [user?.uid]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader 
            title="" 
            centerContent={
              <DashboardHeaderStats
                sent={outreachSent}
                replies={repliesReceived}
                chats={coffeeChatsBooked}
                timeSaved={timeSavedHours}
                streak={streak}
              />
            }
          />

          <main className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-white">
            <div style={{ width: '100%', minWidth: 'fit-content' }}>
              <div style={{ maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
                {/* Dashboard Content - Greeting replaces the heading */}
                <Dashboard />
              </div>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
