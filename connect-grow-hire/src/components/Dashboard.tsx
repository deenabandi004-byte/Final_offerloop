import { useState, useEffect, useMemo } from 'react';
import { 
  Users, Building2, Coffee, Clock, ArrowRight, Briefcase, 
  Search, Mail, ChevronRight, X, FileText, TrendingUp
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { firebaseApi } from '@/services/firebaseApi';
import { type Firm, apiService, type OutboxThread } from '@/services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { calculateWeeklySummary, type WeeklySummary } from '@/utils/dashboardStats';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getTimeOfDayGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

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

const getPriorityBorderColor = (priority: string) => {
  switch(priority) {
    case 'Hot': return 'border-l-red-500';
    case 'Warm': return 'border-l-yellow-500';
    default: return 'border-l-blue-300';
  }
};

const getPriorityBadgeStyles = (priority: string) => {
  switch(priority) {
    case 'Hot': return 'bg-red-100 text-red-700';
    case 'Warm': return 'bg-yellow-100 text-yellow-700';
    default: return 'bg-blue-100 text-blue-600';
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
  const [replyStats, setReplyStats] = useState<{ totalReplies: number; responseRate: number; totalSent: number } | null>(null);
  const [activities, setActivities] = useState<Array<{ id: string; type: string; summary: string; timestamp: any }>>([]);
  const [contacts, setContacts] = useState<Array<any>>([]);
  const [followUpReminders, setFollowUpReminders] = useState<Array<{
    id: string;
    contactId: string;
    contactName: string;
    firm: string;
    daysSinceContact: number;
    lastContactDate: string;
  }>>([]);
  const [outboxThreads, setOutboxThreads] = useState<OutboxThread[]>([]);
  const [outboxLoading, setOutboxLoading] = useState(true);

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

  // Get user's first name
  const firstName = user?.name?.split(' ')[0] || 'there';

  // Fetch follow-up reminders
  useEffect(() => {
    const fetchFollowUpReminders = async () => {
      if (!user?.uid) return;
      try {
        const reminders = await firebaseApi.getFollowUpReminders(user.uid);
        console.log('📋 Follow-up reminders fetched:', reminders.length, reminders);
        setFollowUpReminders(reminders);
      } catch (error) {
        console.error('❌ Failed to fetch follow-up reminders:', error);
        setFollowUpReminders([]);
      }
    };
    fetchFollowUpReminders();
  }, [user?.uid, contacts]); // Re-fetch when contacts change

  // Map follow-up reminders to UI format with real data
  // Also include outbox threads that are waiting for replies (more actionable)
  const followUps = useMemo(() => {
    console.log('🔄 Mapping follow-ups:', {
      remindersCount: followUpReminders.length,
      contactsCount: contacts.length,
      outboxThreadsCount: outboxThreads.length,
      reminders: followUpReminders
    });
    
    // Start with reminders from getFollowUpReminders (contacts 3+ days old)
    const reminderFollowUps = followUpReminders.map((reminder) => {
      // Find the corresponding contact to get additional info
      const contact = contacts.find(c => 
        c.id === reminder.contactId || 
        c.id === reminder.id ||
        (reminder.contactId && c.id === reminder.contactId)
      );
      
      // Calculate priority based on days since contact
      // Hot = 7+ days (urgent), Warm = 4-6 days, Normal = 3 days
      let priority: 'Hot' | 'Warm' | 'Normal' = 'Normal';
      if (reminder.daysSinceContact >= 7) {
        priority = 'Hot';
      } else if (reminder.daysSinceContact >= 4) {
        priority = 'Warm';
      }
      
      // Get email opened status from contact (if available)
      // Check multiple possible fields for email tracking
      const emailOpened = contact?.emailOpened || 
                         contact?.hasUnreadReply || 
                         contact?.emailOpenedAt || 
                         false;
      
      // Extract name from contactName (which might be "First Last" or just email)
      const personName = reminder.contactName || 
                        (contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : '') ||
                        contact?.name ||
                        'Unknown Contact';
      
      return {
        id: reminder.id || reminder.contactId || `reminder-${Math.random()}`,
        personName: personName || 'Unknown Contact',
        title: contact?.jobTitle || contact?.title || contact?.job_title || 'Professional',
        company: reminder.firm || contact?.company || 'Company',
        daysSinceContact: reminder.daysSinceContact,
        priority,
        emailOpened,
      };
    }).sort((a, b) => {
      // Sort by priority (Hot first, then Warm, then Normal)
      const priorityOrder = { 'Hot': 0, 'Warm': 1, 'Normal': 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      // Then by days since contact (most urgent first)
      return b.daysSinceContact - a.daysSinceContact;
    });
    
    // Also add outbox threads that need attention:
    // 1. Waiting for replies (sent, no reply yet) - these definitely need follow-ups
    // 2. New replies (contact replied, needs response) - these need responses
    // 3. Drafts (no_reply_yet) - these are ready to send, show them as actionable items
    const outboxFollowUps = outboxThreads
      .filter(t => {
        // Include all threads that need action:
        // - Waiting for replies (sent emails)
        // - New replies (need to respond)
        // - Drafts (ready to send)
        return t.status === "waiting_on_them" || 
               t.status === "new_reply" || 
               t.status === "waiting_on_you" ||
               t.status === "no_reply_yet"; // Include drafts as actionable items
      })
      .map(thread => {
        // Calculate days since last activity
        const lastActivity = thread.lastActivityAt ? new Date(thread.lastActivityAt) : new Date();
        const daysSince = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
        
        // Determine priority based on status and days
        let priority: 'Hot' | 'Warm' | 'Normal' = 'Normal';
        
        // New replies are always high priority
        if (thread.status === "new_reply" || thread.status === "waiting_on_you") {
          priority = 'Hot';
        } else if (daysSince >= 7) {
          priority = 'Hot';
        } else if (daysSince >= 4) {
          priority = 'Warm';
        } else if (thread.status === "no_reply_yet") {
          // Drafts are "Normal" priority unless they're old
          priority = daysSince >= 2 ? 'Warm' : 'Normal';
        }
        
        return {
          id: thread.id,
          personName: thread.contactName,
          title: thread.jobTitle,
          company: thread.company,
          daysSinceContact: daysSince,
          priority,
          emailOpened: thread.status === "new_reply" || thread.status === "waiting_on_you",
        };
      });
    
    // Combine both sources and deduplicate by contact ID
    const allFollowUps = [...reminderFollowUps, ...outboxFollowUps];
    const uniqueFollowUps = Array.from(
      new Map(allFollowUps.map(f => [f.id, f])).values()
    );
    
    // Sort by priority and days
    return uniqueFollowUps.sort((a, b) => {
      const priorityOrder = { 'Hot': 0, 'Warm': 1, 'Normal': 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.daysSinceContact - a.daysSinceContact;
    });
  }, [followUpReminders, contacts, outboxThreads]);

  // Get the top follow-up for the hero card
  const topFollowUp = followUps[0];

  // Fetch outbox threads to get real draft count
  useEffect(() => {
    const fetchOutboxThreads = async () => {
      if (!user?.uid) {
        setOutboxLoading(false);
        return;
      }
      try {
        setOutboxLoading(true);
        const result = await apiService.getOutboxThreads();
        if ('error' in result) {
          console.error('❌ Error fetching outbox threads:', result.error);
          setOutboxThreads([]);
        } else {
          const threads = result.threads || [];
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Fetched outbox threads:', threads.length, 'threads');
          }
          setOutboxThreads(threads);
        }
      } catch (error) {
        console.error('❌ Failed to fetch outbox threads:', error);
        setOutboxThreads([]);
      } finally {
        setOutboxLoading(false);
      }
    };
    fetchOutboxThreads();
  }, [user?.uid]);

  // Quick wins data - using real data
  const quickWins = useMemo(() => {
    // Count actual drafts ready to send
    // Simply count threads with hasDraft=true (this is what the backend returns)
    const emailsReady = outboxThreads.filter(t => Boolean(t.hasDraft)).length;
    
    // Coffee chats that need prep
    const coffeeChatsNeedPrep = coffeeChatCount;
    
    // New company matches
    const newMatches = firmCount > 0 ? firmCount : 0;
    
    return {
      emailsReady,
      coffeeChatsNeedPrep,
      newMatches,
    };
  }, [outboxThreads, coffeeChatCount, firmCount]);

  // Fetch contacts
  useEffect(() => {
    const fetchContacts = async () => {
      if (user?.uid) {
        try {
          const fetchedContacts = await firebaseApi.getContacts(user.uid);
          setContacts(fetchedContacts);
          setContactCount(fetchedContacts.length);
        } catch (error) {
          console.error('Failed to fetch contacts:', error);
          setContactCount(0);
        }
      }
    };
    fetchContacts();
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
        
        // Fetch all searches in parallel instead of sequentially
        const searchPromises = history.map(historyItem =>
          apiService.getFirmSearchById(historyItem.id).catch(err => {
            console.error(`Failed to load search ${historyItem.id}:`, err);
            return null;
          })
        );
        
        const searchResults = await Promise.all(searchPromises);
        
        searchResults.forEach(searchData => {
          if (searchData && searchData.firms) {
            searchData.firms.forEach((firm: Firm) => {
              const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;
              firmIds.add(firmKey);
            });
          }
        });
        
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

  return (
    <div className="space-y-8">
      {/* ================================================================== */}
      {/* PERSONALIZED GREETING */}
      {/* ================================================================== */}
      <div className="animate-fadeInUp">
        <h1 className="text-2xl font-bold text-gray-900">
          {getTimeOfDayGreeting()}, {firstName} 👋
        </h1>
        <p className="text-gray-600 mt-1">
          {followUps.length > 0 ? (
            <>
              You have <span className="font-semibold text-blue-600">{followUps.length} follow-ups</span> pending
              {firmCount > 0 && (
                <> and <span className="font-semibold text-blue-600">{firmCount} companies</span> to explore</>
              )}.
            </>
          ) : (
            <>Ready to make some connections today?</>
          )}
        </p>
      </div>

      {/* ================================================================== */}
      {/* NEXT BEST ACTION HERO CARD */}
      {/* ================================================================== */}
      <div 
        className="bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl p-8 shadow-lg text-white animate-fadeInUp"
        style={{ animationDelay: '100ms' }}
      >
        <div className="mb-2">
          <span className="text-sm font-medium uppercase tracking-wide opacity-90">Recommended Action</span>
        </div>
        
        {topFollowUp ? (
          <>
            <h2 className="text-2xl font-bold mb-2">Follow up with {topFollowUp.personName}</h2>
            <p className="text-blue-100 mb-1">{topFollowUp.title} at {topFollowUp.company}</p>
            
            <div className="flex items-center gap-4 text-sm text-blue-100 mb-6 flex-wrap">
              <span>📧 Last contacted {topFollowUp.daysSinceContact} days ago</span>
              <span className="bg-white/20 px-2 py-0.5 rounded-full">{topFollowUp.priority} Priority</span>
            </div>
            
            <div className="flex items-center gap-4 flex-wrap">
              <button 
                onClick={() => navigate('/outbox')}
                className="bg-white text-blue-600 font-semibold px-6 py-3 rounded-full hover:bg-blue-50 transition-colors"
              >
                Send Follow-up →
              </button>
              <button 
                onClick={() => navigate('/contact-search')}
                className="text-white/80 hover:text-white underline text-sm"
              >
                Or find new contacts
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-2">Start building your network</h2>
            <p className="text-blue-100 mb-6">Find people at companies you're interested in and start reaching out.</p>
            
            <div className="flex items-center gap-4 flex-wrap">
              <button 
                onClick={() => navigate('/contact-search')}
                className="bg-white text-blue-600 font-semibold px-6 py-3 rounded-full hover:bg-blue-50 transition-colors"
              >
                Find People →
              </button>
              <button 
                onClick={() => navigate('/firm-search')}
                className="text-white/80 hover:text-white underline text-sm"
              >
                Or explore companies
              </button>
            </div>
          </>
        )}
      </div>

      {/* ================================================================== */}
      {/* SECONDARY WORKFLOW OPTIONS */}
      {/* ================================================================== */}
      <div className="animate-fadeInUp" style={{ animationDelay: '200ms' }}>
        <p className="text-sm text-gray-500 mb-3">Or start a new workflow</p>
        <div className="flex gap-3 flex-wrap">
          <button 
            onClick={() => navigate('/contact-search')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Search className="w-4 h-4 text-gray-500" />
            <span className="text-gray-700">Find People</span>
          </button>
          <button 
            onClick={() => navigate('/firm-search')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Building2 className="w-4 h-4 text-gray-500" />
            <span className="text-gray-700">Find Companies</span>
          </button>
          <button 
            onClick={() => navigate('/outbox')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Mail className="w-4 h-4 text-gray-500" />
            <span className="text-gray-700">Review Outreach</span>
          </button>
          <button 
            onClick={() => navigate('/coffee-chat-prep')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Coffee className="w-4 h-4 text-gray-500" />
            <span className="text-gray-700">Prep for Chat</span>
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* TWO COLUMN LAYOUT */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column - 2/3 width */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* QUICK WINS SECTION */}
          <div className="animate-fadeInUp" style={{ animationDelay: '300ms' }}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Wins</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Show cards immediately, with loading state for outbox */}
              <div 
                onClick={() => navigate('/outbox')}
                className={`bg-green-50 border border-green-200 rounded-xl p-4 hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer ${quickWins.emailsReady === 0 ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">📤</span>
                  <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">2 min</span>
                </div>
                <p className="font-semibold text-gray-900">
                  {outboxLoading ? '...' : `${quickWins.emailsReady} emails ready`}
                </p>
                <p className="text-sm text-gray-600">Review and send with one click</p>
              </div>
              
              <div 
                onClick={() => navigate('/coffee-chat-prep')}
                className={`bg-purple-50 border border-purple-200 rounded-xl p-4 hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer ${quickWins.coffeeChatsNeedPrep === 0 ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">☕</span>
                  <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">5 min</span>
                </div>
                <p className="font-semibold text-gray-900">{quickWins.coffeeChatsNeedPrep} coffee chats</p>
                <p className="text-sm text-gray-600">Need quick prep before calls</p>
              </div>
          
              <div 
                onClick={() => navigate('/firm-search')}
                className={`bg-blue-50 border border-blue-200 rounded-xl p-4 hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer ${quickWins.newMatches === 0 ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">🎯</span>
                  <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">New</span>
                </div>
                <p className="font-semibold text-gray-900">{quickWins.newMatches} companies</p>
                <p className="text-sm text-gray-600">Match your search criteria</p>
              </div>

              {quickWins.emailsReady === 0 && quickWins.coffeeChatsNeedPrep === 0 && quickWins.newMatches === 0 && (
                    <div 
                      onClick={() => navigate('/contact-search')}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer col-span-full"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">🚀</span>
                        <span className="text-xs bg-gray-200 text-gray-800 px-2 py-0.5 rounded-full">Get started</span>
                      </div>
                      <p className="font-semibold text-gray-900">Find your first contacts</p>
                      <p className="text-sm text-gray-600">Search for people at companies you're targeting</p>
                    </div>
              )}
            </div>
          </div>

          {/* FOLLOW-UP QUEUE */}
          <div className="animate-fadeInUp" style={{ animationDelay: '400ms' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Your Follow-up Queue</h2>
              {followUps.length > 0 && (
                <span className="text-sm text-gray-500">{followUps.length} pending</span>
              )}
            </div>
            
            {followUps.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
                <p className="text-sm text-gray-600 mb-2">No follow-ups needed right now</p>
                <p className="text-xs text-gray-500">
                  Follow-ups appear here when contacts haven't replied after 3+ days
                </p>
              </div>
            ) : (
              <>
              
              <div className="space-y-3">
                {followUps.slice(0, 4).map((followUp) => (
                  <div 
                    key={followUp.id}
                    onClick={() => navigate('/outbox')}
                    className={`
                      group relative flex items-center justify-between p-4 bg-white border rounded-xl
                      hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer
                      border-l-4 ${getPriorityBorderColor(followUp.priority)}
                    `}
                  >
                    <div className="flex items-center gap-4">
                      {/* Company logo placeholder */}
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-gray-400" />
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{followUp.personName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityBadgeStyles(followUp.priority)}`}>
                            {followUp.priority}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{followUp.title} at {followUp.company}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          📧 Last contacted {followUp.daysSinceContact} days ago
                          {followUp.emailOpened && <span className="ml-2 text-green-600">✓ Email opened</span>}
                        </p>
                      </div>
                    </div>
                    
                    {/* Quick actions - visible on hover */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); navigate('/outbox'); }}
                        className="p-2 hover:bg-blue-50 rounded-lg text-blue-600" 
                        title="Send Email"
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); navigate('/coffee-chat-prep'); }}
                        className="p-2 hover:bg-green-50 rounded-lg text-green-600" 
                        title="Prep"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400" 
                        title="Skip"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </div>
                ))}
              </div>
              
                {followUps.length > 4 && (
                  <button 
                    onClick={() => navigate('/outbox')}
                    className="mt-4 text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    View all {followUps.length} follow-ups <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        
        {/* Right column - 1/3 width */}
        <div className="space-y-6">
          
          {/* Stats summary card */}
          <div 
            className="bg-white border border-gray-200 rounded-xl p-6 animate-fadeInUp"
            style={{ animationDelay: '300ms' }}
          >
            <h3 className="font-semibold text-gray-900 mb-4">This Week</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Emails Sent</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{outreachSent}</span>
                  {outreachSent > 0 && (
                    <span className="text-xs text-green-600 flex items-center">
                      <TrendingUp className="w-3 h-3 mr-0.5" />+{outreachSent}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Replies Received</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{repliesReceived}</span>
                  {repliesReceived > 0 && (
                    <span className="text-xs text-green-600 flex items-center">
                      <TrendingUp className="w-3 h-3 mr-0.5" />+{repliesReceived}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Coffee Chats</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{coffeeChatCount}</span>
                  {coffeeChatCount > 0 && (
                    <span className="text-xs text-green-600 flex items-center">
                      <TrendingUp className="w-3 h-3 mr-0.5" />+{coffeeChatCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-sm text-gray-600">Time Saved</span>
                <span className="font-semibold text-gray-900">{timeSavedHours}h</span>
              </div>
            </div>
          </div>
          
          {/* Recent Activity */}
          <div 
            className="bg-white border border-gray-200 rounded-xl p-6 animate-fadeInUp"
            style={{ animationDelay: '400ms' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Recent Activity</h3>
              {activities.length > 4 && (
                <button className="text-sm text-blue-600 hover:underline">View all</button>
              )}
            </div>
            {activities.length === 0 ? (
              <p className="text-sm text-gray-400">No recent activity yet</p>
            ) : (
              <div className="space-y-3">
                {activities.slice(0, 5).map((activity) => (
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
          
          {/* Outreach Trends mini chart */}
          <div 
            className="bg-white border border-gray-200 rounded-xl p-6 animate-fadeInUp"
            style={{ animationDelay: '500ms' }}
          >
            <h3 className="font-semibold text-gray-900 mb-4">Outreach Trends</h3>
            {timeSeriesData.length > 0 ? (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeriesData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <XAxis 
                      dataKey="month" 
                      stroke="#9CA3AF" 
                      fontSize={9}
                      tickLine={false}
                      axisLine={{ stroke: '#E5E7EB' }}
                    />
                    <YAxis 
                      stroke="#9CA3AF" 
                      fontSize={9}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '10px',
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
              <div className="h-[140px] flex items-center justify-center">
                <p className="text-xs text-gray-400 text-center">Chart data will appear<br />after you send outreach</p>
              </div>
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
}
