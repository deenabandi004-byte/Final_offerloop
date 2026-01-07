import React, { useState, useEffect, cloneElement, isValidElement } from 'react';
import { Users, Building2, Coffee, Mail, Clock, TrendingUp, Target, ArrowRight, Plus, Briefcase, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { firebaseApi } from '@/services/firebaseApi';
import { type Firm, apiService } from '@/services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { calculateWeeklySummary, calculateStreak, calculateGoalProgress, getDefaultMonthlyGoals, type WeeklySummary, type StreakData, type Goal, type GoalProgress } from '@/utils/dashboardStats';
import { Timestamp } from 'firebase/firestore';
import { logActivity } from '@/utils/activityLogger';
import { RecommendedJobs } from './RecommendedJobs';

// ============================================================================
// DATA - Now fetched from backend
// ============================================================================

// Helper function to format time ago
const formatTimeAgo = (timestamp: any): string => {
  if (!timestamp) return 'Just now';
  
  const now = Date.now();
  const timeMs = timestamp.toMillis ? timestamp.toMillis() : timestamp;
  const diffMs = now - timeMs;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
};

// Helper function to get icon based on activity type
const getActivityIcon = (type: string) => {
  switch (type) {
    case 'firmSearch':
      return <Building2 size={16} />;
    case 'contactSearch':
      return <Users size={16} />;
    case 'coffeePrep':
      return <Coffee size={16} />;
    case 'interviewPrep':
      return <Briefcase size={16} />;
    default:
      return <Clock size={16} />;
  }
};

// Helper function to get route based on activity type
const getActivityRoute = (type: string): string => {
  switch (type) {
    case 'firmSearch':
      return '/firm-search';
    case 'contactSearch':
      return '/contact-search';
    case 'coffeePrep':
      return '/coffee-chat-prep';
    case 'interviewPrep':
      return '/interview-prep';
    default:
      return '/home';
  }
};


// Recommendations now fetched from backend

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function KPICard({ icon, label, value, subtitle, progress, showProgress }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  progress?: number;
  showProgress?: boolean;
}) {
  // Calculate circle progress for circular indicator
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const progressValue = progress !== undefined ? Math.min(100, Math.max(0, progress)) : 0;
  const offset = circumference - (progressValue / 100) * circumference;

  return (
    <div className="bg-card border border-border rounded-xl p-6 transition-all h-[180px] flex flex-col overflow-visible shadow-sm transform hover:scale-[1.02]">
      <div className="flex items-start justify-between mb-2">
        <div className={`rounded-lg bg-purple-soft flex items-center justify-center ${isValidElement(icon) && icon.type === 'div' ? 'px-3 py-2' : 'w-10 h-10'}`}>
          {isValidElement(icon) && icon.type === 'div' ? (
            // Handle multiple icons in a div
            <div className="flex items-center gap-1">
              {React.Children.map(icon.props.children, (child: React.ReactElement) => {
                if (isValidElement(child)) {
                  return cloneElement(child as React.ReactElement<any>, {
                    stroke: 'url(#kpi-icon-gradient)',
                  });
                }
                return child;
              })}
            </div>
          ) : isValidElement(icon) ? (
            cloneElement(icon as React.ReactElement<any>, {
              className: 'w-5 h-5',
              stroke: 'url(#kpi-icon-gradient)',
            })
          ) : (
            icon
          )}
        </div>
      </div>
      
      {showProgress && progress !== undefined ? (
        // Circular progress layout - centered
        <div className="flex-1 flex flex-col items-center justify-center -mt-2">
          <div className="relative flex items-center justify-center mb-2" style={{ width: '90px', height: '90px' }}>
            {/* Circular progress ring */}
            <svg className="transform -rotate-90 absolute inset-0" width="90" height="90" viewBox="0 0 90 90" style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="circular-progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06B6D4" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
              {/* Background circle */}
              <circle
                cx="45"
                cy="45"
                r={radius}
                stroke="currentColor"
                strokeWidth="10"
                fill="none"
                className="text-border"
              />
              {/* Progress circle */}
              <circle
                cx="45"
                cy="45"
                r={radius}
                stroke="url(#circular-progress-gradient)"
                strokeWidth="10"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            {/* Centered number */}
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-xl font-bold text-foreground">{value}</div>
            </div>
          </div>
            <div className="text-center mt-1">
            <div className="text-sm text-muted-foreground">{label}</div>
            {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
        </div>
      ) : (
        // Regular layout
        <div className="space-y-1.5 flex-1">
          <div className="text-3xl font-bold text-foreground">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      )}
    </div>
  );
}

function ActivityFeed({ isExpanded, onToggle }: { isExpanded: boolean; onToggle: () => void }) {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activities, setActivities] = useState<Array<{
    id: string;
    type: string;
    summary: string;
    timestamp: any;
    metadata?: any;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      if (!user?.uid) {
        setIsLoading(false);
        return;
      }

      try {
        console.log('🔄 Fetching activities for user:', user.uid);
        const fetchedActivities = await firebaseApi.getActivities(user.uid, 10);
        console.log('✅ Fetched activities:', fetchedActivities);
        setActivities(fetchedActivities);
      } catch (error) {
        console.error('❌ Failed to fetch activities:', error);
        setActivities([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchActivities();
  }, [user?.uid, location.pathname]); // Refresh when user changes or when navigating to dashboard

  const handleActivityClick = (activity: { type: string }) => {
    const route = getActivityRoute(activity.type);
    navigate(route);
  };

  const displayedActivities = isExpanded ? activities : activities.slice(0, 3);

  return (
    <div className="glass-card border border-border rounded-xl p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-blue-600" />
          <h3 className="text-sm font-medium text-foreground">Recent Activity</h3>
        </div>
        {activities.length > 3 && (
          <button
            onClick={onToggle}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp size={14} />
                Show less
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                Show more
              </>
            )}
          </button>
        )}
      </div>
      
      <div className="space-y-3 flex-1">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading activities...</div>
        ) : activities.length === 0 ? (
          <div className="text-xs text-muted-foreground">No recent activity</div>
        ) : (
          displayedActivities.map((activity) => (
            <div
              key={activity.id}
              className="flex gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => handleActivityClick(activity)}
            >
              <div className="w-6 h-6 rounded-lg bg-purple-soft flex items-center justify-center text-purple flex-shrink-0">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-foreground leading-relaxed break-words line-clamp-2">{activity.summary}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{formatTimeAgo(activity.timestamp)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export function Dashboard() {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const firstName = user?.name?.split(' ')[0] || 'Your';
  const [contactCount, setContactCount] = useState<number>(0);
  const [firmCount, setFirmCount] = useState<number>(0);
  const [coffeeChatCount, setCoffeeChatCount] = useState<number>(0);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [goalProgress, setGoalProgress] = useState<GoalProgress[]>([]);
  
  // New state for backend data
  const [timeSeriesData, setTimeSeriesData] = useState<Array<{ month: string; outreach: number; replies: number }>>([]);
  const [topFirms, setTopFirms] = useState<Array<{ name: string; city?: string; industry?: string; contacts: number; replyRate?: number }>>([]);
  const [recommendations, setRecommendations] = useState<Array<{ icon: React.ReactNode; title: string; description: string; action: string; contactId?: string; contactIds?: string[] }>>([]);
  const [replyStats, setReplyStats] = useState<{ totalReplies: number; responseRate: number; totalSent: number } | null>(null);
  const [interviewPrepStats, setInterviewPrepStats] = useState<{ total: number; completedThisMonth: number } | null>(null);
  const [unreadReplyCount, setUnreadReplyCount] = useState<number>(0);
  const [isActivityFeedExpanded, setIsActivityFeedExpanded] = useState<boolean>(false);
  const [isChartExpanded, setIsChartExpanded] = useState<boolean>(false);

  // Calculate total time saved in hours
  // Each contact + email: 20 minutes
  // Each firm searched: 2 minutes
  // Each coffee chat: 30 minutes
  const calculateTimeSaved = () => {
    const contactMinutes = contactCount * 20;
    const firmMinutes = firmCount * 2;
    const coffeeChatMinutes = coffeeChatCount * 30;
    const totalMinutes = contactMinutes + firmMinutes + coffeeChatMinutes;
    const totalHours = totalMinutes / 60;
    // Round to nearest tenth
    return Math.round(totalHours * 10) / 10;
  };

  const timeSavedHours = calculateTimeSaved();

  useEffect(() => {
    const fetchContactCount = async () => {
      if (user?.uid) {
        try {
          const contacts = await firebaseApi.getContacts(user.uid);
          setContactCount(contacts.length);
        } catch (error) {
          console.error('Failed to fetch contacts:', error);
          setContactCount(0);
        }
      }
    };

    fetchContactCount();
  }, [user?.uid]);

  useEffect(() => {
    const fetchFirmCount = async () => {
      if (!user) {
        setFirmCount(0);
        return;
      }

      try {
        const history = await apiService.getFirmSearchHistory(50); // Get more history items
        
        // Extract all unique firms from all searches
        const allFirms: Firm[] = [];
        const firmIds = new Set<string>();
        
        for (const historyItem of history) {
          try {
            // Fetch the full search data to get the firms
            const searchData = await apiService.getFirmSearchById(historyItem.id);
            if (searchData && searchData.firms) {
              searchData.firms.forEach((firm: Firm) => {
                // Use firm ID or name+location as unique key
                const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;
                if (!firmIds.has(firmKey)) {
                  firmIds.add(firmKey);
                  allFirms.push(firm);
                }
              });
            }
          } catch (err) {
            console.error(`Failed to load search ${historyItem.id}:`, err);
          }
        }
        
        setFirmCount(allFirms.length);
      } catch (error) {
        console.error('Failed to fetch firms:', error);
        setFirmCount(0);
      }
    };

    fetchFirmCount();
  }, [user]);

  useEffect(() => {
    const fetchCoffeeChatCount = async () => {
      if (!user) {
        setCoffeeChatCount(0);
        return;
      }

      try {
        const result = await apiService.getAllCoffeeChatPreps();
        if ('error' in result) {
          console.error('Failed to fetch coffee chat preps:', result.error);
          setCoffeeChatCount(0);
        } else {
          setCoffeeChatCount(result.preps?.length || 0);
        }
      } catch (error) {
        console.error('Failed to fetch coffee chat preps:', error);
        setCoffeeChatCount(0);
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

  // Log dashboard visit and fetch streak data
  useEffect(() => {
    const logDashboardVisit = async () => {
      if (!user?.uid) return;
      
      try {
        // Log a "login" activity when user visits dashboard
        // This ensures streak tracks consecutive days logged on
        const today = new Date().toISOString().split('T')[0];
        const lastActivity = await firebaseApi.getUserStreak(user.uid);
        
        // Only log if we haven't logged today yet
        if (!lastActivity?.lastActivityDate || lastActivity.lastActivityDate !== today) {
          await logActivity(user.uid, 'contactSearch', 'Logged in', {
            type: 'dashboard_visit',
            date: today,
          });
        }
      } catch (error) {
        console.error('Failed to log dashboard visit:', error);
      }
    };
    
    const fetchStreak = async () => {
      if (!user?.uid) return;
      try {
        // First try to get from user profile (faster)
        const cachedStreak = await firebaseApi.getUserStreak(user.uid);
        if (cachedStreak) {
          setStreakData(cachedStreak);
        }
        
        // Then calculate fresh streak (may update if needed)
        const calculatedStreak = await calculateStreak(user.uid);
        setStreakData(calculatedStreak);
      } catch (error) {
        console.error('Failed to fetch streak:', error);
      }
    };
    
    logDashboardVisit();
    fetchStreak();
  }, [user?.uid]);

  // Initialize and fetch goals
  useEffect(() => {
    const initializeGoals = async () => {
      if (!user?.uid) return;
      
      try {
        // Check if user has goals
        let goals = await firebaseApi.getGoals(user.uid);
        
        // If no goals, create default monthly goals
        if (goals.length === 0) {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
          
          const defaultGoals = getDefaultMonthlyGoals();
          for (const goalTemplate of defaultGoals) {
            const goalId = await firebaseApi.createGoal(user.uid, {
              ...goalTemplate,
              startDate: Timestamp.fromDate(startOfMonth),
              endDate: Timestamp.fromDate(endOfMonth),
            });
            goals.push({
              id: goalId,
              type: goalTemplate.type,
              target: goalTemplate.target,
              period: goalTemplate.period,
              startDate: Timestamp.fromDate(startOfMonth),
              endDate: Timestamp.fromDate(endOfMonth),
            });
          }
        }
        
        // Deduplicate goals by type - keep only the most recent one for each type
        // Also filter to only show the three main goal types: contacts, firms, coffeeChats
        const mainGoalTypes: Array<'contacts' | 'firms' | 'coffeeChats'> = ['contacts', 'firms', 'coffeeChats'];
        const filteredGoals = goals.filter(goal => mainGoalTypes.includes(goal.type as any));
        
        const uniqueGoals = filteredGoals.reduce((acc, goal) => {
          const existingGoal = acc.find(g => g.type === goal.type);
          if (!existingGoal) {
            acc.push(goal);
          } else {
            // Keep the one with the most recent start date
            const existingDate = existingGoal.startDate?.toMillis?.() || 0;
            const currentDate = goal.startDate?.toMillis?.() || 0;
            if (currentDate > existingDate) {
              const index = acc.indexOf(existingGoal);
              acc[index] = goal;
            }
          }
          return acc;
        }, [] as typeof goals);
        
        // Calculate progress for each unique goal
        const progressPromises = uniqueGoals.map(async (goal) => {
          const goalObj: Goal = {
            id: goal.id,
            type: goal.type as Goal['type'],
            target: goal.target,
            period: goal.period as Goal['period'],
            startDate: goal.startDate,
            endDate: goal.endDate,
          };
          return await calculateGoalProgress(user.uid, goalObj);
        });
        
        const progressResults = await Promise.all(progressPromises);
        setGoalProgress(progressResults);
      } catch (error) {
        console.error('Failed to initialize goals:', error);
      }
    };
    
    initializeGoals();
  }, [user?.uid]);

  // Fetch dashboard stats from backend
  useEffect(() => {
    const fetchDashboardStats = async () => {
      if (!user?.uid) return;
      
      try {
        const result = await apiService.getDashboardStats();
        if ('error' in result) {
          console.error('Failed to fetch dashboard stats:', result.error);
          return;
        }
        
        setTimeSeriesData(result.outreachByMonth);
        setTopFirms(result.topFirms.map(f => ({
          name: f.name,
          contacts: f.contacts,
          replyRate: f.replyRate
        })));
        setReplyStats(result.replyStats);
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      }
    };
    
    fetchDashboardStats();
  }, [user?.uid]);

  // Fetch recommendations from backend
  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!user?.uid) return;
      
      try {
        const result = await apiService.getRecommendations();
        if ('error' in result) {
          console.error('Failed to fetch recommendations:', result.error);
          return;
        }
        
        // Map backend recommendations to frontend format with icons
        const mappedRecs = result.recommendations.map(rec => {
          let icon = <Target size={16} />;
          if (rec.type === 'follow_up') icon = <Mail size={16} />;
          else if (rec.type === 'unread_replies') icon = <Users size={16} />;
          else if (rec.type === 'explore_firms') icon = <Target size={16} />;
          
          return {
            icon,
            title: rec.title,
            description: rec.description,
            action: rec.action,
            contactId: rec.contactId,
            contactIds: rec.contactIds,
          };
        });
        
        setRecommendations(mappedRecs);
      } catch (error) {
        console.error('Failed to fetch recommendations:', error);
      }
    };
    
    fetchRecommendations();
  }, [user?.uid]);


  // Fetch interview prep stats
  useEffect(() => {
    const fetchInterviewPrepStats = async () => {
      if (!user?.uid) return;
      
      try {
        const result = await apiService.getInterviewPrepStats();
        if ('error' in result) {
          console.error('Failed to fetch interview prep stats:', result.error);
          return;
        }
        
        setInterviewPrepStats(result);
      } catch (error) {
        console.error('Failed to fetch interview prep stats:', error);
      }
    };
    
    fetchInterviewPrepStats();
  }, [user?.uid]);

  // Fetch unread reply count
  useEffect(() => {
    const fetchUnreadReplies = async () => {
      if (!user?.uid) return;
      
      try {
        const result = await apiService.getOutboxThreads();
        if ('error' in result) {
          console.error('Failed to fetch outbox threads:', result.error);
          return;
        }
        
        const unreadCount = result.threads?.filter((t: any) => t.hasUnreadReply).length || 0;
        setUnreadReplyCount(unreadCount);
      } catch (error) {
        console.error('Failed to fetch unread replies:', error);
      }
    };
    
    fetchUnreadReplies();
  }, [user?.uid]);
  
  // Calculate outreach sent (this week or month)
  const outreachSent = weeklySummary?.contactsGenerated || replyStats?.totalSent || 0;
  const repliesReceived = replyStats?.totalReplies || 0;
  const coffeeChatsBooked = coffeeChatCount || weeklySummary?.coffeeChatsCreated || 0;
  
  // Hero Section logic
  const hasReplies = unreadReplyCount > 0 || repliesReceived > 0;
  const showMotivationCopy = replyStats && replyStats.totalSent > 0 && repliesReceived === 0;

  return (
    <div className="space-y-6">
      {/* SVG Gradient Definitions */}
      <svg className="absolute w-0 h-0">
        <defs>
          <linearGradient id="kpi-icon-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>

      {/* Hero Section */}
      <div className="glass-card p-8 rounded-xl border-2 border-primary/20 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {hasReplies ? (
              <>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  You have {unreadReplyCount > 0 ? unreadReplyCount : repliesReceived} message{(unreadReplyCount > 0 ? unreadReplyCount : repliesReceived) !== 1 ? 's' : ''} to respond to
                </h2>
                <button
                  onClick={() => navigate('/home?tab=outbox')}
                  className="mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                  View Outbox
                </button>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  No replies yet — follow up with your last 3 contacts
                </h2>
                <button
                  onClick={() => navigate('/home?tab=outbox')}
                  className="mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                  Send Follow-ups
                </button>
              </>
            )}
            {showMotivationCopy && (
              <p className="text-sm text-muted-foreground mt-3">
                {replyStats.totalSent >= 10 ? (
                  <>Replies typically come 7–14 days after outreach. Keep going!</>
                ) : (
                  <>Most users see replies after {Math.max(10, replyStats.totalSent + 5)} outreaches. You're on your way!</>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Progress Strip */}
      <div className="glass-card p-5 rounded-xl border border-border">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">{outreachSent}</span>
            <span className="text-sm text-muted-foreground">Outreach sent</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">{repliesReceived}</span>
            <span className="text-sm text-muted-foreground">Replies received</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">{coffeeChatsBooked}</span>
            <span className="text-sm text-muted-foreground">Coffee chats</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">{timeSavedHours}h</span>
            <span className="text-sm text-muted-foreground">Time saved</span>
          </div>
          {streakData && (
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-orange-500" />
              <span className="text-xl font-bold text-foreground">{streakData.currentStreak}</span>
              <span className="text-sm text-muted-foreground">day streak</span>
            </div>
          )}
        </div>
      </div>

      {/* Recommended Jobs Section */}
      <RecommendedJobs />

      {/* Monthly Goals Section */}
      {goalProgress.length > 0 && (
        <div className="pt-4">
          <div className="mb-4">
            <h3 className="text-lg text-foreground">Monthly Goals</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {goalProgress.map((progress) => {
              const goalLabel = {
                contacts: 'Contacts',
                firms: 'Firms Searched',
                coffeeChats: 'Coffee Chats',
                outreach: 'Outreach',
              }[progress.goal.type];
              
              return (
                <div key={progress.goal.id} className="glass-card p-4 rounded-xl border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Target size={14} className="text-blue-600" />
                    <h4 className="text-sm font-medium text-foreground">{goalLabel}</h4>
                  </div>
                  <div className="mb-2">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-xl font-bold text-foreground">{progress.current}</span>
                      <span className="text-sm text-muted-foreground">/ {progress.target}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full transition-all duration-500"
                        style={{ 
                          background: 'linear-gradient(135deg, #3B82F6, #60A5FA)',
                          width: `${progress.percentage}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommended Next Actions */}
      {recommendations.length > 0 && (
        <div className="pt-4">
          <div className="mb-4">
            <h3 className="text-lg text-foreground">Recommended Next Actions</h3>
          </div>
          <div className="glass-card p-5 rounded-xl border border-border">
            <div className="space-y-3">
              {recommendations.map((rec, index) => (
                <div 
                  key={index}
                  className="p-3 rounded-lg bg-background/50 border border-border transition-all cursor-pointer hover:bg-background/80 hover:border-primary/30"
                  onClick={() => {
                    if (rec.contactId) {
                      navigate('/home?tab=outbox');
                    } else if (rec.contactIds) {
                      navigate('/home?tab=outbox');
                    } else if (rec.action.includes('firms')) {
                      navigate('/firm-search');
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-soft flex items-center justify-center text-purple flex-shrink-0">
                      {rec.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground leading-snug">{rec.title}</div>
                    </div>
                    <ArrowRight size={14} className="text-muted-foreground flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Activity & Analytics Section */}
      <div className="pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4">
            <ActivityFeed isExpanded={isActivityFeedExpanded} onToggle={() => setIsActivityFeedExpanded(!isActivityFeedExpanded)} />
          </div>

          <div className="lg:col-span-8">
            <div className="glass-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-blue-600" />
                  <h3 className="text-sm font-medium text-foreground">Outreach vs Replies</h3>
                </div>
                {timeSeriesData.length > 0 && (
                  <button
                    onClick={() => setIsChartExpanded(!isChartExpanded)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    {isChartExpanded ? (
                      <>
                        <ChevronUp size={14} />
                        Collapse
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} />
                        Expand
                      </>
                    )}
                  </button>
                )}
              </div>
              {timeSeriesData.length > 0 ? (
                <div className="w-full overflow-x-auto overflow-y-visible" style={{ paddingBottom: '10px' }}>
                  <div style={{ minWidth: `${Math.max(100, timeSeriesData.length * 80)}px`, height: isChartExpanded ? '280px' : '180px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timeSeriesData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          stroke="hsl(214.3, 31.8%, 91.4%)" 
                        />
                        <XAxis 
                          dataKey="month" 
                          stroke="hsl(215.4, 16.3%, 46.9%)" 
                          style={{ fontSize: '11px' }}
                          tick={{ fill: 'hsl(215.4, 16.3%, 46.9%)' }}
                        />
                        <YAxis 
                          stroke="hsl(215.4, 16.3%, 46.9%)" 
                          style={{ fontSize: '11px' }}
                          tick={{ fill: 'hsl(215.4, 16.3%, 46.9%)' }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: `1px solid hsl(var(--border))`,
                            borderRadius: '8px',
                            fontSize: '11px',
                            color: 'hsl(var(--card-foreground))'
                          }}
                        />
                        <Line type="monotone" dataKey="outreach" stroke="#8B5CF6" strokeWidth={2} dot={{ fill: '#8B5CF6', r: 3 }} />
                        <Line type="monotone" dataKey="replies" stroke="#D946EF" strokeWidth={2} dot={{ fill: '#D946EF', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
                  Loading chart data...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
