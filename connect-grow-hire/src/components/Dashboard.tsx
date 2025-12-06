import React, { useState, useEffect, cloneElement, isValidElement } from 'react';
import { Users, Building2, Coffee, Mail, Clock, TrendingUp, Target, ArrowRight, Plus, Briefcase, Flame } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { firebaseApi } from '@/services/firebaseApi';
import { type Firm, apiService } from '@/services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { calculateWeeklySummary, calculateStreak, calculateGoalProgress, getDefaultMonthlyGoals, type WeeklySummary, type StreakData, type Goal, type GoalProgress } from '@/utils/dashboardStats';
import { Timestamp } from 'firebase/firestore';
import { logActivity } from '@/utils/activityLogger';
import { PersonalizedRecruitingTimeline } from './PersonalizedRecruitingTimeline';

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

const timelineData = [
  { month: 'Jan', description: 'Research & Target Firms', isActive: false },
  { month: 'Feb', description: 'Networking & Coffee Chats', isActive: false },
  { month: 'Mar', description: 'Submit 30 Applications', isActive: true },
  { month: 'Apr', description: 'Interview Prep & Practice', isActive: false },
  { month: 'May', description: 'Final Round Interviews', isActive: false },
  { month: 'Jun', description: 'Offer Evaluation', isActive: false },
];

// Firm locations now fetched from backend

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
    <div className="bg-white border border-gray-200 rounded-xl p-8 hover:border-gray-300 transition-colors h-[180px] flex flex-col overflow-visible shadow-sm">
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
              <div className="text-xl font-bold text-gray-900">{value}</div>
            </div>
          </div>
            <div className="text-center mt-1">
            <div className="text-sm text-gray-600">{label}</div>
            {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
          </div>
        </div>
      ) : (
        // Regular layout
        <div className="space-y-1.5 flex-1">
          <div className="text-3xl font-bold text-gray-900">{value}</div>
          <div className="text-sm text-gray-600">{label}</div>
          {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
        </div>
      )}
    </div>
  );
}

function ActivityFeed() {
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-8 h-full flex flex-col shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <Clock size={18} className="text-purple-600" />
        <h3 className="text-gray-900">Recent Activity</h3>
      </div>
      
      <div className="space-y-5 flex-1">
        {isLoading ? (
          <div className="text-sm text-gray-500">Loading activities...</div>
        ) : activities.length === 0 ? (
          <div className="text-sm text-gray-500">No recent activity</div>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="flex gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => handleActivityClick(activity)}
            >
              <div className="w-8 h-8 rounded-lg bg-purple-soft flex items-center justify-center text-purple flex-shrink-0">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 leading-relaxed">{activity.summary}</div>
                <div className="text-xs text-gray-500 mt-1">{formatTimeAgo(activity.timestamp)}</div>
              </div>
            </div>
          ))
        )}
      </div>
      
      <button className="w-full mt-6 text-sm text-purple-600 hover:text-cyan-400 transition-colors pt-4 border-t border-gray-200">
        View all activity
      </button>
    </div>
  );
}

function RecruitingTimeline() {
  const currentMonthIndex = 2;
  const progressWithinMonth = 0.4;
  const totalMonths = timelineData.length;
  const youAreHerePosition = ((currentMonthIndex + progressWithinMonth) / totalMonths) * 100;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-8 py-8">
        <div className="relative" style={{ height: '220px' }}>
          <div className="absolute top-[70px] left-0 right-0 h-[2px]">
            <div 
              className="w-full h-full rounded-full" 
              style={{ background: 'linear-gradient(to right, rgba(139, 92, 246, 0.3), rgba(217, 70, 239, 0.3))' }}
            />
          </div>

          <div className="relative flex justify-between items-start h-full">
            {timelineData.map((phase, index) => {
              const position = (index / (totalMonths - 1)) * 100;
              
              return (
                <div 
                  key={phase.month}
                  className="flex flex-col items-center"
                  style={{ position: 'absolute', left: `${position}%`, transform: 'translateX(-50%)', width: '150px' }}
                >
                  <div className="font-medium text-gray-900 mb-3">{phase.month}</div>

                  <div className="relative z-10 mb-3">
                    {phase.isActive ? (
                      <motion.div
                        className="w-[10px] h-[10px] rounded-full gradient-bg"
                        style={{ boxShadow: '0 0 12px rgba(139, 92, 246, 0.6), 0 0 24px rgba(217, 70, 239, 0.4)' }}
                        initial={{ scale: 0.8 }}
                        animate={{ scale: [0.8, 1.1, 0.8] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      />
                    ) : (
                      <div className="w-[10px] h-[10px] rounded-full bg-white border-2 border-gray-300" />
                    )}
                  </div>

                  <div className="w-[1px] h-10 bg-gray-200" />

                  <motion.div
                    className={`mt-2 px-4 py-3 rounded-xl border text-center text-sm transition-all ${
                      phase.isActive
                        ? 'bg-gradient-to-r from-purple/10 to-cyan-400/10 border-purple/30 shadow-sm'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                  >
                    <div className={phase.isActive ? 'text-gray-900 font-medium' : 'text-gray-500'}>
                      {phase.description}
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>

          <motion.div
            className="absolute top-0 z-20"
            style={{ left: `${youAreHerePosition}%` }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <div className="flex flex-col items-center" style={{ transform: 'translateX(-50%)' }}>
              <motion.div 
                className="mb-2 px-3 py-1.5 rounded-full gradient-bg text-white text-xs font-medium shadow-lg"
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                You Are Here
              </motion.div>

              <div 
                className="w-[2px] h-[66px] rounded-full"
                style={{ background: 'linear-gradient(to bottom, #8B5CF6, #D946EF)' }}
              />

              <motion.div
                className="relative"
                animate={{ 
                  boxShadow: [
                    '0 0 0 0 rgba(139, 92, 246, 0.6)',
                    '0 0 0 10px rgba(139, 92, 246, 0)',
                    '0 0 0 0 rgba(139, 92, 246, 0)'
                  ]
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <div 
                  className="w-4 h-4 rounded-full gradient-bg"
                  style={{ boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)' }}
                />
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="h-[1px] bg-border" />
    </div>
  );
}

function USMap({ locations }: { locations: Array<{ id: number; name: string; city: string; state: string; contacts: number; x: number; y: number }> }) {
  // United States outline SVG path (simplified continental US)
  // This is a simplified but recognizable outline of the mainland United States
  const usOutlinePath = `M 5 25 
    L 6 20 L 8 16 L 12 12 L 18 9 L 25 7 L 32 6 L 40 5.5 L 48 5 L 56 4.8 
    L 64 4.5 L 72 4.2 L 80 4.5 L 85 6 L 88 8 L 90 11 L 91.5 15 L 92.5 20 
    L 93 25 L 92.5 30 L 91.5 35 L 89.5 40 L 87 44 L 83.5 47 L 79 49 
    L 74 50.5 L 69 51.5 L 64 52 L 59 52.5 L 54 53 L 49 53.5 L 44 54 
    L 39 54.5 L 34 55 L 29 55.5 L 24 56 L 19 56.5 L 14 57 L 9 57.5 
    L 6 58 L 4 56 L 3 52 L 2.5 48 L 2.5 44 L 3 40 L 3.5 36 L 4 32 
    L 4.5 28 Z`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
      <div className="relative bg-gray-50 rounded-lg p-10 border border-gray-200">
        <svg 
          viewBox="0 0 100 65" 
          className="w-full h-auto" 
          style={{ filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.2))' }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* United States outline */}
          <path
            d={usOutlinePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.7"
            className="text-border"
            vectorEffect="non-scaling-stroke"
          />
          
          {/* Firm location markers */}
          {locations.map((location) => (
            <g key={location.id}>
              <circle
                cx={location.x}
                cy={location.y}
                r="1.5"
                fill="url(#location-gradient)"
                stroke="white"
                strokeWidth="0.3"
                style={{ filter: 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.6))' }}
              >
                <title>{location.name} - {location.city}, {location.state} ({location.contacts} contacts)</title>
              </circle>
            </g>
          ))}
          
          <defs>
            <linearGradient id="location-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06B6D4" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex items-center gap-6 mt-6 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple"></div>
          <span>Firms searched</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-pink"></div>
          <span>Active locations ({locations.length})</span>
        </div>
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
  const [firmLocations, setFirmLocations] = useState<Array<{ id: number; name: string; city: string; state: string; contacts: number; x: number; y: number }>>([]);

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
        
        // Calculate progress for each goal
        const progressPromises = goals.map(async (goal) => {
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

  // Fetch firm locations from backend
  useEffect(() => {
    const fetchFirmLocations = async () => {
      if (!user?.uid) return;
      
      try {
        const result = await apiService.getFirmLocations();
        if ('error' in result) {
          console.error('Failed to fetch firm locations:', result.error);
          return;
        }
        
        const mappedLocations = result.locations.map((loc, index) => ({
          id: index + 1,
          name: loc.name,
          city: loc.city,
          state: loc.state,
          contacts: loc.contacts,
          x: loc.coordinates.x,
          y: loc.coordinates.y,
        }));
        
        setFirmLocations(mappedLocations);
      } catch (error) {
        console.error('Failed to fetch firm locations:', error);
      }
    };
    
    fetchFirmLocations();
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
  
  return (
    <div className="space-y-16">
      {/* SVG Gradient Definitions */}
      <svg className="absolute w-0 h-0">
        <defs>
          <linearGradient id="kpi-icon-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      {/* Header Section */}
      <div className="pt-6 text-center">
        <h2 className="text-gray-900">{firstName}'s Recruiting Snapshot</h2>
        <p className="text-gray-600 mt-1">Track your progress and stay on top of your recruiting pipeline</p>
      </div>

      {/* Weekly Summary & Streak Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Summary Card */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">This Week</h3>
          </div>
          {weeklySummary ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-gray-900">{weeklySummary.contactsGenerated}</div>
                <div className="text-sm text-gray-600">Contacts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{weeklySummary.firmsSearched}</div>
                <div className="text-sm text-gray-600">Firms</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{weeklySummary.coffeeChatsCreated}</div>
                <div className="text-sm text-gray-600">Coffee Chats</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{weeklySummary.totalActivities}</div>
                <div className="text-sm text-gray-600">Total Activities</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-text-muted">Loading weekly summary...</div>
          )}
        </div>

        {/* Streak Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={18} className="text-orange-500" />
            <h3 className="text-lg font-semibold text-gray-900">Streak</h3>
          </div>
          {streakData ? (
            <div>
              <div className="text-3xl font-bold mb-1 text-gray-900">{streakData.currentStreak}</div>
              <div className="text-sm text-gray-600 mb-4">days in a row!</div>
              {streakData.longestStreak > streakData.currentStreak && (
                <div className="text-xs text-gray-500">
                  Best: {streakData.longestStreak} days
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-text-muted">Loading streak...</div>
          )}
        </div>
      </div>

      {/* Goal Progress Section */}
      {goalProgress.length > 0 && (
        <div className="pt-6">
          <div className="mb-6">
            <h3 className="text-lg text-gray-900">Monthly Goals</h3>
            <p className="text-gray-600 text-sm mt-1">Track your progress toward this month's targets</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {goalProgress.map((progress) => {
              const goalLabel = {
                contacts: 'Contacts',
                firms: 'Firms Searched',
                coffeeChats: 'Coffee Chats',
                outreach: 'Outreach',
              }[progress.goal.type];
              
              return (
                <div key={progress.goal.id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Target size={16} className="text-purple-600" />
                    <h4 className="font-medium text-gray-900">{goalLabel}</h4>
                  </div>
                  <div className="mb-2">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-2xl font-bold text-gray-900">{progress.current}</span>
                      <span className="text-sm text-gray-600">/ {progress.target}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-500"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {Math.round(progress.percentage)}% complete
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <KPICard 
          icon={
            <div className="flex items-center gap-1">
              <Users size={20} />
              <Plus size={20} />
              <Mail size={20} />
            </div>
          } 
          label="Contacts Found + Emails" 
          value={contactCount} 
        />
        <KPICard icon={<Building2 size={20} />} label="Firms Searched" value={firmCount} />
        <KPICard icon={<Coffee size={20} />} label="Coffee Chats" value={coffeeChatCount} />
        <KPICard 
          icon={<Mail size={20} />} 
          label="Replies Received" 
          value={replyStats?.totalReplies ?? 0} 
          subtitle={replyStats ? `${Math.round(replyStats.responseRate)}% response rate` : undefined} 
        />
        <KPICard icon={<Clock size={20} />} label="Total Time Saved" value={`${timeSavedHours}h`} subtitle="vs manual research" />
        <KPICard 
          icon={<Briefcase size={20} />} 
          label="Interview Preps" 
          value={interviewPrepStats?.total ?? 0} 
          subtitle={interviewPrepStats ? `${interviewPrepStats.completedThisMonth} completed this month` : undefined} 
        />
      </div>

      {/* Activity & Analytics Section */}
      <div className="pt-6">
        <div className="mb-6">
          <h3 className="text-lg text-gray-900">Activity & Analytics</h3>
          <p className="text-gray-600 text-sm mt-1">Your recent activity and performance trends</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <ActivityFeed />
          </div>

          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp size={18} className="text-purple-600" />
                <h3 className="text-gray-900">Outreach vs Replies</h3>
              </div>
              {timeSeriesData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" stroke="#a3a3a3" style={{ fontSize: '12px' }} />
                    <YAxis stroke="#a3a3a3" style={{ fontSize: '12px' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#ffffff', 
                        border: '1px solid #e5e5e5',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Line type="monotone" dataKey="outreach" stroke="#8B5CF6" strokeWidth={2} dot={{ fill: '#8B5CF6' }} />
                    <Line type="monotone" dataKey="replies" stroke="#D946EF" strokeWidth={2} dot={{ fill: '#D946EF' }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-sm text-gray-500">
                  Loading chart data...
                </div>
              )}
            </div>

            {/* AI Recommendations */}
            <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
              <div className="mb-6">
                <h3 className="text-lg mb-1 text-gray-900">AI Recommendations</h3>
                <p className="text-gray-600 text-sm">Personalized insights to accelerate your search</p>
              </div>
              <div className="space-y-4">
                {recommendations.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-4">
                    No recommendations at this time
                  </div>
                ) : (
                  recommendations.map((rec, index) => (
                    <div 
                      key={index}
                      className="p-4 rounded-xl bg-gray-50 border border-gray-200 hover:border-purple-300 transition-all cursor-pointer group"
                      onClick={() => {
                        if (rec.contactId) {
                          navigate('/outbox');
                        } else if (rec.contactIds) {
                          navigate('/outbox');
                        } else if (rec.action.includes('firms')) {
                          navigate('/firm-search');
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-soft flex items-center justify-center text-purple flex-shrink-0">
                          {rec.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm mb-1 leading-snug">{rec.title}</div>
                          <div className="text-xs text-gray-500 mb-3 leading-relaxed">{rec.description}</div>
                          <button className="text-xs text-purple-600 hover:text-cyan-400 transition-colors flex items-center gap-1 group-hover:gap-2">
                            {rec.action}
                            <ArrowRight size={12} className="transition-all" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recruiting Timeline Section */}
      <div className="py-16">
        <div className="mb-6">
          <h3 className="text-lg text-gray-900">Recruiting Timeline</h3>
          <p className="text-gray-600 text-sm mt-1">Track your progress through recruiting season</p>
        </div>
        <PersonalizedRecruitingTimeline />
      </div>

    </div>
  );
}
