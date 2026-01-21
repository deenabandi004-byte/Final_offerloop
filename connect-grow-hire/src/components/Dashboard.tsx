import { useState, useEffect, useMemo } from 'react';
import { Users, Building2, Coffee, Clock, ArrowRight, Briefcase, ChevronDown, ChevronUp, Send, MessageSquare } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { firebaseApi } from '@/services/firebaseApi';
import { type Firm, apiService } from '@/services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { calculateWeeklySummary, type WeeklySummary } from '@/utils/dashboardStats';
import { Button } from './ui/button';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
};

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'firmSearch':
      return <Building2 size={14} className="text-gray-500" />;
    case 'contactSearch':
      return <Users size={14} className="text-gray-500" />;
    case 'coffeePrep':
      return <Coffee size={14} className="text-gray-500" />;
    case 'interviewPrep':
      return <Briefcase size={14} className="text-gray-500" />;
    default:
      return <Clock size={14} className="text-gray-500" />;
  }
};

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
      return '/dashboard';
  }
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export function Dashboard() {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // State
  const [contactCount, setContactCount] = useState<number>(0);
  const [firmCount, setFirmCount] = useState<number>(0);
  const [coffeeChatCount, setCoffeeChatCount] = useState<number>(0);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<Array<{ month: string; outreach: number; replies: number }>>([]);
  const [recommendations, setRecommendations] = useState<Array<{ type: string; title: string; description: string; action: string; contactId?: string; contactIds?: string[] }>>([]);
  const [replyStats, setReplyStats] = useState<{ totalReplies: number; responseRate: number; totalSent: number } | null>(null);
  const [unreadReplyCount, setUnreadReplyCount] = useState<number>(0);
  const [activities, setActivities] = useState<Array<{ id: string; type: string; summary: string; timestamp: any }>>([]);
  const [isActivityExpanded, setIsActivityExpanded] = useState(false);

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

  // Check if user has pending outreach to review
  const hasPendingOutreach = unreadReplyCount > 0 || outreachSent > 0;

  // Fetch contact count
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

  // Fetch firm count
  useEffect(() => {
    const fetchFirmCount = async () => {
      if (!user) {
        setFirmCount(0);
        return;
      }
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
            console.error(`Failed to load search ${historyItem.id}:`, err);
          }
        }
        setFirmCount(firmIds.size);
      } catch (error) {
        console.error('Failed to fetch firms:', error);
        setFirmCount(0);
      }
    };
    fetchFirmCount();
  }, [user]);

  // Fetch coffee chat count
  useEffect(() => {
    const fetchCoffeeChatCount = async () => {
      if (!user) {
        setCoffeeChatCount(0);
        return;
      }
      try {
        const result = await apiService.getAllCoffeeChatPreps();
        if ('error' in result) {
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

  // Fetch dashboard stats
  useEffect(() => {
    const fetchDashboardStats = async () => {
      if (!user?.uid) return;
      try {
        const result = await apiService.getDashboardStats();
        if (!('error' in result)) {
          setTimeSeriesData(result.outreachByMonth);
          setReplyStats(result.replyStats);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      }
    };
    fetchDashboardStats();
  }, [user?.uid]);

  // Fetch recommendations
  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!user?.uid) return;
      try {
        const result = await apiService.getRecommendations();
        if (!('error' in result)) {
          const mappedRecs = result.recommendations.map(rec => ({
            type: rec.type,
            title: rec.title,
            description: rec.description,
            action: rec.action,
            contactId: rec.contactId,
            contactIds: rec.contactIds,
          }));
          setRecommendations(mappedRecs);
        }
      } catch (error) {
        console.error('Failed to fetch recommendations:', error);
      }
    };
    fetchRecommendations();
  }, [user?.uid]);

  // Fetch unread replies
  useEffect(() => {
    const fetchUnreadReplies = async () => {
      if (!user?.uid) return;
      try {
        const result = await apiService.getOutboxThreads();
        if (!('error' in result)) {
          const unreadCount = result.threads?.filter((t: any) => t.hasUnreadReply).length || 0;
          setUnreadReplyCount(unreadCount);
        }
      } catch (error) {
        console.error('Failed to fetch unread replies:', error);
      }
    };
    fetchUnreadReplies();
  }, [user?.uid]);

  // Fetch activities
  useEffect(() => {
    const fetchActivities = async () => {
      if (!user?.uid) return;
      try {
        const fetchedActivities = await firebaseApi.getActivities(user.uid, 10);
        setActivities(fetchedActivities);
      } catch (error) {
        console.error('Failed to fetch activities:', error);
        setActivities([]);
      }
    };
    fetchActivities();
  }, [user?.uid, location.pathname]);

  const displayedActivities = isActivityExpanded ? activities : activities.slice(0, 4);

  // Get action icon based on recommendation type
  const getActionIcon = (type: string) => {
    switch (type) {
      case 'follow_up':
        return <Send size={14} className="text-blue-500" />;
      case 'unread_replies':
        return <MessageSquare size={14} className="text-green-500" />;
      default:
        return <ArrowRight size={14} className="text-gray-400" />;
    }
  };

  // Get action route based on recommendation
  const getActionRoute = (rec: typeof recommendations[0]): string => {
    if (rec.contactId || rec.contactIds) {
      return '/outbox';
    }
    if (rec.action.includes('firms') || rec.action.includes('company')) {
      return '/firm-search';
    }
    if (rec.action.includes('contact') || rec.action.includes('people')) {
      return '/contact-search';
    }
    return '/outbox';
  };

  return (
    <div className="space-y-6">
      {/* ================================================================== */}
      {/* ACTION ROUTER - Simple, direct CTA block */}
      {/* ================================================================== */}
      <div className="pb-6 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-900 mb-1">
          What do you want to do?
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Choose a workflow to continue.
        </p>
        
        {/* Primary CTAs - Two equally weighted buttons */}
        <div className="flex items-center gap-3 mb-4">
          <Button
            onClick={() => navigate('/contact-search')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
            size="lg"
          >
            Find People
          </Button>
          <Button
            onClick={() => navigate('/firm-search')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
            size="lg"
          >
            Find Companies
          </Button>
        </div>
        
        <p className="text-xs text-gray-400">
          Most users start here.
        </p>

        {/* Conditional secondary CTA - Only if user has pending outreach */}
        {hasPendingOutreach && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Or continue where you left off</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/outbox')}
                className="border-gray-300 hover:border-gray-400"
              >
                Review Outreach
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* QUICK ACTIONS - What to do next */}
      {/* ================================================================== */}
      {recommendations.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">What to do next</h2>
          <div className="space-y-2">
            {recommendations.slice(0, 3).map((rec, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-3 px-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                onClick={() => navigate(getActionRoute(rec))}
              >
                <div className="flex items-center gap-3">
                  {getActionIcon(rec.type)}
                  <span className="text-sm text-gray-700">{rec.title}</span>
                </div>
                <ArrowRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* STATS ROW - De-emphasized, contextual only */}
      {/* ================================================================== */}
      <div className="flex items-center gap-6 flex-wrap py-4 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-medium text-gray-700">{outreachSent}</span>
          <span className="text-xs text-gray-400">sent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-medium text-gray-700">{repliesReceived}</span>
          <span className="text-xs text-gray-400">replies</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-medium text-gray-700">{coffeeChatsBooked}</span>
          <span className="text-xs text-gray-400">chats</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-medium text-gray-700">{timeSavedHours}h</span>
          <span className="text-xs text-gray-400">saved</span>
        </div>
      </div>

      {/* ================================================================== */}
      {/* BELOW THE FOLD: Activity & Analytics */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4">
        {/* Recent Activity */}
        <div className="lg:col-span-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">Recent Activity</h2>
            {activities.length > 4 && (
              <button
                onClick={() => setIsActivityExpanded(!isActivityExpanded)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                {isActivityExpanded ? (
                  <>Less <ChevronUp size={12} /></>
                ) : (
                  <>More <ChevronDown size={12} /></>
                )}
              </button>
            )}
          </div>
          {activities.length === 0 ? (
            <p className="text-sm text-gray-400">No recent activity yet</p>
          ) : (
            <div className="space-y-2">
              {displayedActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-2.5 cursor-pointer hover:bg-gray-50 p-2 -mx-2 rounded-lg transition-colors"
                  onClick={() => navigate(getActivityRoute(activity.type))}
                >
                  <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 line-clamp-2">{activity.summary}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{formatTimeAgo(activity.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Outreach Chart */}
        <div className="lg:col-span-8">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Outreach Trends</h2>
          {timeSeriesData.length > 0 ? (
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis 
                    dataKey="month" 
                    stroke="#9CA3AF" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#E5E7EB' }}
                  />
                  <YAxis 
                    stroke="#9CA3AF" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="outreach" 
                    stroke="#3B82F6" 
                    strokeWidth={2} 
                    dot={{ fill: '#3B82F6', r: 2 }}
                    name="Outreach"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="replies" 
                    stroke="#10B981" 
                    strokeWidth={2} 
                    dot={{ fill: '#10B981', r: 2 }}
                    name="Replies"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center">
              <p className="text-xs text-gray-400">Chart data will appear after you send outreach</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
