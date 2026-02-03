import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mail,
  Search,
  RefreshCw,
  Trash2,
  ExternalLink,
  Download,
  User,
} from "lucide-react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { useNavigate } from "react-router-dom";
import { InlineLoadingBar } from "@/components/ui/LoadingBar";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { firebaseApi } from '../services/firebaseApi';
import type { Contact as ContactApi } from '../services/firebaseApi';
import { useFirebaseMigration } from '../hooks/useFirebaseMigration';
import { NotificationBell } from '../components/NotificationBell';
import { apiService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

type Contact = ContactApi;

const STATUS_OPTIONS = [
  { value: 'Not Contacted', color: '#6B7280', label: 'Not Contacted' },
  { value: 'Contacted', color: '#3B82F6', label: 'Contacted' },
  { value: 'Followed Up', color: '#F59E0B', label: 'Followed Up' },
  { value: 'Responded', color: '#10B981', label: 'Responded' },
  { value: 'Call Scheduled', color: '#8B5CF6', label: 'Call Scheduled' },
  { value: 'Rejected', color: '#EF4444', label: 'Rejected' },
  { value: 'Hired', color: '#F59E0B', label: 'Hired' }
];

const SpreadsheetContactDirectory: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useFirebaseAuth();
  const { isLoading: migrationLoading } = useFirebaseMigration();
  const { toast } = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [mailAppDialogOpen, setMailAppDialogOpen] = useState(false);
  const [selectedContactForEmail, setSelectedContactForEmail] = useState<Contact | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const [replyStatuses, setReplyStatuses] = useState<Record<string, any>>({});
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const isCheckingRepliesRef = useRef(false);
  const lastCheckTimeRef = useRef<number>(0);

  const getStorageKey = () => {
    return currentUser ? `contacts_${currentUser.uid}` : 'contacts_anonymous';
  };

  const normalizeFromServer = (serverContact: any): Contact => {
    // Helper to get value from multiple possible field names, preserving undefined/null
    const getField = (...fieldNames: string[]): string | undefined => {
      for (const fieldName of fieldNames) {
        const value = serverContact[fieldName];
        if (value !== undefined && value !== null && value !== '') {
          return String(value).trim();
        }
      }
      return undefined;
    };

    // DEBUG: Log raw server contact data
    console.log('[DEBUG] Raw server contact:', JSON.stringify(serverContact, null, 2));
    
    // DEBUG: Log normalized email fields
    const normalizedEmailSubject = getField('emailSubject', 'email_subject');
    const normalizedEmailBody = getField('emailBody', 'email_body', 'emailContent', 'email_content');
    console.log('[DEBUG] Normalized emailSubject:', normalizedEmailSubject);
    console.log('[DEBUG] Normalized emailBody:', normalizedEmailBody ? `${normalizedEmailBody.substring(0, 100)}...` : 'MISSING');

    // DIAGNOSTIC: Log raw server contact data for email fields
    const isDev = import.meta.env.DEV;
    if (isDev && (serverContact.emailSubject || serverContact.email_subject || serverContact.emailBody || serverContact.email_body || serverContact.emailContent || serverContact.email_content)) {
      console.log('[ContactDirectory] normalizeFromServer - Raw email fields:', {
        id: serverContact.id,
        name: `${serverContact.firstName || ''} ${serverContact.lastName || ''}`,
        emailSubject: serverContact.emailSubject || 'MISSING',
        email_subject: serverContact.email_subject || 'MISSING',
        emailBody: serverContact.emailBody ? `${serverContact.emailBody.substring(0, 100)}...` : 'MISSING',
        email_body: serverContact.email_body ? `${serverContact.email_body.substring(0, 100)}...` : 'MISSING',
        emailContent: serverContact.emailContent ? `${serverContact.emailContent.substring(0, 100)}...` : 'MISSING',
        email_content: serverContact.email_content ? `${serverContact.email_content.substring(0, 100)}...` : 'MISSING',
        allEmailKeys: Object.keys(serverContact).filter(k => k.toLowerCase().includes('email')),
      });
    }

    const normalized = {
      id: serverContact.id,
      firstName: serverContact.firstName || serverContact.first_name || '',
      lastName: serverContact.lastName || serverContact.last_name || '',
      linkedinUrl: serverContact.linkedinUrl || serverContact.linkedin_url || '',
      email: serverContact.email || '',
      company: serverContact.company || '',
      jobTitle: serverContact.jobTitle || serverContact.job_title || '',
      college: serverContact.college || '',
      location: serverContact.location || '',
      firstContactDate: serverContact.firstContactDate || serverContact.first_contact_date || '',
      status: serverContact.status || 'Not Contacted',
      lastContactDate: serverContact.lastContactDate || serverContact.last_contact_date || '',
      // SOURCE OF TRUTH: emailSubject/emailBody are the generated outreach emails from backend
      // Check both camelCase (emailSubject) and snake_case (email_subject) variants
      // Also check emailContent (legacy field name from linkedin_import bug - now fixed)
      // Preserve undefined if not present (don't default to empty string)
      emailSubject: normalizedEmailSubject,
      emailBody: normalizedEmailBody,
      gmailDraftId: serverContact.gmailDraftId || serverContact.gmail_draft_id || '',
      gmailDraftUrl: serverContact.gmailDraftUrl || serverContact.gmail_draft_url || '',
      createdAt: serverContact.createdAt || serverContact.created_at,
      updatedAt: serverContact.updatedAt || serverContact.updated_at,
      gmailThreadId: serverContact.gmailThreadId || serverContact.gmail_thread_id,
      gmailMessageId: serverContact.gmailMessageId || serverContact.gmail_message_id,
      hasUnreadReply: serverContact.hasUnreadReply || serverContact.has_unread_reply || false,
      notificationsMuted: serverContact.notificationsMuted || serverContact.notifications_muted || false,
      draftCreatedAt: serverContact.draftCreatedAt,
      lastChecked: serverContact.lastChecked,
      mutedAt: serverContact.mutedAt,
    };

    if (isDev) {
      console.log('[ContactDirectory] normalizeFromServer - Normalized email fields:', {
        id: normalized.id,
        name: `${normalized.firstName || ''} ${normalized.lastName || ''}`,
        emailSubject: normalized.emailSubject ? `${normalized.emailSubject.substring(0, 100)}...` : 'MISSING',
        emailBody: normalized.emailBody ? `${normalized.emailBody.substring(0, 100)}...` : 'MISSING',
        emailSubjectLength: normalized.emailSubject?.length || 0,
        emailBodyLength: normalized.emailBody?.length || 0,
      });
    }

    return normalized;
  };

  const loadContacts = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (currentUser) {
        const firebaseContacts = await firebaseApi.getContacts(currentUser.uid);
        const normalizedContacts = firebaseContacts.map(normalizeFromServer);
        setContacts(normalizedContacts);
      } else {
        const stored = localStorage.getItem(getStorageKey());
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setContacts(Array.isArray(parsed) ? parsed : []);
          } catch (e) {
            console.error('Error parsing stored contacts:', e);
            setContacts([]);
          }
        } else {
          setContacts([]);
        }
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
      setError('Failed to load contacts');
      setContacts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveContacts = async (newContacts: Contact[]) => {
    try {
      if (!currentUser) {
        localStorage.setItem(getStorageKey(), JSON.stringify(newContacts));
      }
    } catch (err) {
      console.error('Error saving contacts:', err);
    }
  };

  const stripUndefined = <T extends Record<string, any>>(obj: T) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

  const addContactsToDirectory = async (contactsToAdd: any[]) => {
    try {
      const today = new Date().toLocaleDateString('en-US');

      const mapped: Omit<Contact, 'id'>[] = contactsToAdd.map((c: any) =>
        stripUndefined({
          firstName: c.FirstName ?? c.firstName ?? '',
          lastName: c.LastName ?? c.lastName ?? '',
          linkedinUrl: c.LinkedIn ?? c.linkedinUrl ?? '',
          email: c.Email ?? c.email ?? '',
          company: c.Company ?? c.company ?? '',
          jobTitle: c.Title ?? c.jobTitle ?? '',
          college: c.College ?? c.college ?? '',
          location:
            `${c.City ?? ''}${c.City && c.State ? ', ' : ''}${c.State ?? ''}`.trim() ||
            c.location ||
            '',
          firstContactDate: today,
          status: 'Not Contacted',
          lastContactDate: today,
          emailSubject: c.email_subject ?? c.emailSubject ?? undefined,
          emailBody: c.email_body ?? c.emailBody ?? undefined,
          gmailThreadId: c.gmailThreadId ?? c.gmail_thread_id ?? undefined,
          gmailMessageId: c.gmailMessageId ?? c.gmail_message_id ?? undefined,
          hasUnreadReply: false,
          notificationsMuted: false,
        })
      );

      if (currentUser) {
        await firebaseApi.bulkCreateContacts(currentUser.uid, mapped);
        await loadContacts();
      } else {
        const updatedContacts: Contact[] = [...contacts];
        mapped.forEach((newContact) => {
          const isDuplicate = updatedContacts.some(
            (existing) =>
              existing.email &&
              newContact.email &&
              existing.email.toLowerCase() === newContact.email.toLowerCase()
          );
          if (!isDuplicate) {
            updatedContacts.push({
              ...newContact,
              id: `local_${Date.now()}_${Math.random()}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as Contact);
          }
        });
        setContacts(updatedContacts);
        await saveContacts(updatedContacts);
      }
    } catch (err) {
      console.error('Error adding contacts:', err);
      setError('Failed to add contacts');
    }
  };

  const checkRepliesForAllContacts = useCallback(async () => {
    // Debounce: Don't check more than once every 30 seconds
    const now = Date.now();
    if (now - lastCheckTimeRef.current < 30000) {
      return;
    }
    
    if (isCheckingRepliesRef.current || !currentUser) return;
    
    isCheckingRepliesRef.current = true;
    setIsCheckingReplies(true);
    lastCheckTimeRef.current = now;

    try {
      // Access contacts directly - don't need it in deps since we read current value
      const contactsWithThreads = contacts
        .filter((c) => c.gmailThreadId && !c.notificationsMuted && c.id)
        .map((c) => c.id!)
        .filter(Boolean);

      if (contactsWithThreads.length === 0) {
        return;
      }

      const result = await apiService.batchCheckReplies(contactsWithThreads);
      if ('results' in result) setReplyStatuses(result.results);
    } catch (error) {
      console.error('Error checking replies:', error);
    } finally {
      isCheckingRepliesRef.current = false;
      setIsCheckingReplies(false);
    }
  }, [currentUser, contacts]); // Keep contacts but we'll fix the useEffect

  useEffect(() => {
    if (!currentUser || contacts.length === 0) return;
    
    // Initial check with delay to avoid rapid fire on mount
    const initialTimeout = setTimeout(() => {
      checkRepliesForAllContacts();
    }, 2000);
    
    // Set up polling interval (2 minutes)
    const interval = setInterval(() => {
      checkRepliesForAllContacts();
    }, 120000);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, contacts.length]); // Intentionally exclude checkRepliesForAllContacts to prevent infinite loop

  useEffect(() => {
    (window as any).addContactsToDirectory = addContactsToDirectory;
    return () => {
      delete (window as any).addContactsToDirectory;
    };
  }, [addContactsToDirectory]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredContacts(contacts);
      return;
    }
    const filtered = contacts.filter((contact) =>
      Object.values(contact).some((value) =>
        value?.toString().toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
    setFilteredContacts(filtered);
  }, [searchQuery, contacts]);

  const handleCellEdit = async (contactId: string, field: keyof Contact, value: string) => {
    try {
      setContacts((prev) =>
        prev.map((contact) => {
          if (contact.id === contactId) {
            const updated: Contact = { ...contact, [field]: value } as Contact;
            if (field === 'status' && value !== contact.status) {
              updated.lastContactDate = new Date().toLocaleDateString('en-US');
            }
            return updated;
          }
          return contact;
        })
      );

      if (currentUser && contactId && !contactId.startsWith('local_')) {
        const updates: Partial<Contact> = { [field]: value } as Partial<Contact>;
        if (field === 'status') {
          updates.lastContactDate = new Date().toLocaleDateString('en-US');
        }
        await firebaseApi.updateContact(currentUser.uid, contactId, updates);
      }
    } catch (error) {
      console.error('Error updating contact:', error);
      setError('Failed to update contact');
    }
  };

  const handleCellClick = (row: number, col: string) => {
    if (col === 'status' || col === 'actions') return;
    setEditingCell({ row, col });
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const handleDeleteContact = async (contactId: string, contactName: string) => {
    // Show confirmation dialog
    if (!window.confirm(`Are you sure you want to delete ${contactName}? This action cannot be undone.`)) {
      return;
    }

    try {
      if (currentUser && contactId && !contactId.startsWith('local_')) {
        // Delete from Firestore via backend API
        await firebaseApi.deleteContact(currentUser.uid, contactId);
      }
      
      // Update local state
      setContacts((prev) => prev.filter((contact) => contact.id !== contactId));
      
      // Save to localStorage for anonymous users
      if (!currentUser) {
        const updatedContacts = contacts.filter((contact) => contact.id !== contactId);
        localStorage.setItem(getStorageKey(), JSON.stringify(updatedContacts));
      }
      
      toast({
        title: 'Contact Deleted',
        description: `${contactName} has been removed from your contacts.`,
      });
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete contact. Please try again.',
        variant: 'destructive',
      });
    }
  };

  /**
   * Get email subject/body with strict precedence order:
   * 1. Most recent generated email (emailSubject/emailBody) - SOURCE OF TRUTH
   * 2. Fallback template (only if no generated email exists)
   * 
   * This ensures we always use the high-quality generated outreach emails
   * that match what users see elsewhere in the app.
   */
  const getEmailContent = (contact: Contact): { subject: string; body: string } => {
    // DIAGNOSTIC: Log contact email fields to debug why fallback is used
    const isDev = import.meta.env.DEV;
    if (isDev) {
      const generatedSubject = contact.emailSubject?.trim();
      const generatedBody = contact.emailBody?.trim();
      console.log('[ContactDirectory] getEmailContent - Contact data:', {
        id: contact.id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`,
        email: contact.email || 'MISSING',
        emailSubject: contact.emailSubject || 'MISSING',
        emailBody: contact.emailBody ? `${contact.emailBody.substring(0, 100)}...` : 'MISSING',
        emailSubjectType: typeof contact.emailSubject,
        emailBodyType: typeof contact.emailBody,
        emailSubjectLength: contact.emailSubject?.length || 0,
        emailBodyLength: contact.emailBody?.length || 0,
        emailSubjectTrimmed: generatedSubject || 'EMPTY_AFTER_TRIM',
        emailBodyTrimmed: generatedBody ? `${generatedBody.substring(0, 100)}...` : 'EMPTY_AFTER_TRIM',
        willUseGeneratedSubject: !!(generatedSubject && generatedSubject.length > 0),
        willUseGeneratedBody: !!(generatedBody && generatedBody.length > 0),
      });
    }

    // PRECEDENCE 1: Use generated email content if present (non-empty after trimming)
    // emailSubject/emailBody are the source of truth - they contain the actual
    // generated outreach emails saved by the backend (see emails.py, runs.py, etc.)
    const generatedSubject = contact.emailSubject?.trim();
    const generatedBody = contact.emailBody?.trim();
    
    const subject = generatedSubject && generatedSubject.length > 0
      ? generatedSubject
      : `Question about your work at ${contact.company || 'your company'}`;
    
    const body = generatedBody && generatedBody.length > 0
      ? generatedBody
      : `Hi ${contact.firstName || 'there'},\n\nI'd love to connect and learn more about your work.\n\nBest regards`;
    
    if (isDev) {
      console.log('[ContactDirectory] getEmailContent - Result:', {
        usingGeneratedSubject: generatedSubject && generatedSubject.length > 0,
        usingGeneratedBody: generatedBody && generatedBody.length > 0,
        finalSubject: subject.substring(0, 150),
        finalBody: body.substring(0, 200),
        finalSubjectLength: subject.length,
        finalBodyLength: body.length,
        isFallbackSubject: !(generatedSubject && generatedSubject.length > 0),
        isFallbackBody: !(generatedBody && generatedBody.length > 0),
      });
    }
    
    return { subject, body };
  };

  const buildMailto = (contact: Contact) => {
    const to = contact.email;
    if (!to) return '#';
    const { subject, body } = getEmailContent(contact);
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
  };

  const buildGmailLink = (contact: Contact) => {
    // Always build a new Gmail compose URL with pre-filled fields
    // Do NOT attempt to open existing drafts via URL (unreliable)
    const to = contact.email;
    if (!to) return '#';
    const { subject, body } = getEmailContent(contact);
    // Use the reliable Gmail compose URL format with proper encoding
    return `https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1&to=${encodeURIComponent(
      to
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleEmailClick = (contact: Contact) => {
    // DIAGNOSTIC: Log full contact data when email icon is clicked
    const isDev = import.meta.env.DEV;
    if (isDev) {
      console.log('[ContactDirectory] handleEmailClick - Full contact object:', {
        id: contact.id,
        name: `${contact.firstName} ${contact.lastName}`,
        email: contact.email,
        emailSubject: contact.emailSubject,
        emailBody: contact.emailBody ? `${contact.emailBody.substring(0, 100)}...` : 'MISSING',
        emailSubjectType: typeof contact.emailSubject,
        emailBodyType: typeof contact.emailBody,
        emailSubjectLength: contact.emailSubject?.length || 0,
        emailBodyLength: contact.emailBody?.length || 0,
        allEmailFields: Object.keys(contact).filter(k => k.toLowerCase().includes('email')),
        rawContact: contact,
      });
      
      // Also log what getEmailContent will return
      const { subject, body } = getEmailContent(contact);
      console.log('[ContactDirectory] handleEmailClick - getEmailContent result:', {
        subject: subject.substring(0, 150),
        body: body.substring(0, 200),
        subjectLength: subject.length,
        bodyLength: body.length,
        subjectStartsWith: subject.substring(0, 30),
        bodyStartsWith: body.substring(0, 50),
      });
    }
    
    // Always show the mail app selection dialog
    // Do NOT attempt to open existing Gmail drafts via URL (unreliable)
    // The gmailDraftId/gmailDraftUrl are kept for backend tracking but not used for opening
    setSelectedContactForEmail(contact);
    setMailAppDialogOpen(true);
  };

  const handleMailAppSelect = (app: 'apple' | 'gmail') => {
    if (!selectedContactForEmail) return;
    
    if (app === 'apple') {
      window.open(buildMailto(selectedContactForEmail), '_blank');
      // Note: Apple Mail can't attach files via mailto: URL
      toast({
        title: 'Reminder',
        description: 'Please attach your resume before sending.',
      });
    } else {
      // Check if we have a Gmail draft URL (has resume attached)
      // Prefer message ID format (more reliable) over draft ID
      const messageId = selectedContactForEmail.gmailMessageId;
      const draftId = selectedContactForEmail.gmailDraftId;
      let draftUrl = selectedContactForEmail.gmailDraftUrl;
      
      if (messageId || draftId || draftUrl) {
        // Open the actual draft (has resume attached)
        // Option A: Use message ID format (most reliable)
        if (messageId) {
          draftUrl = `https://mail.google.com/mail/u/0/#drafts?compose=${messageId}`;
          window.open(draftUrl, '_blank');
        } else if (draftUrl) {
          // Use stored URL (should already be in correct format)
          window.open(draftUrl, '_blank');
        } else if (draftId) {
          // Fallback: Construct draft URL from draft ID
          draftUrl = `https://mail.google.com/mail/u/0/#draft/${draftId}`;
          window.open(draftUrl, '_blank');
        }
        
        toast({
          title: 'Opening Draft',
          description: 'Opening your saved draft with resume attached.',
        });
      } else {
        // No draft exists - fall back to compose URL (no attachment)
        window.open(buildGmailLink(selectedContactForEmail), '_blank');
        
        toast({
          title: 'Reminder',
          description: 'Please attach your resume before sending.',
        });
      }
    }
    
    setMailAppDialogOpen(false);
    setSelectedContactForEmail(null);
  };

  const getDisplayName = (contact: Contact) => {
    if (contact.firstName && contact.lastName) return `${contact.firstName} ${contact.lastName}`;
    if (contact.firstName) return contact.firstName;
    if (contact.lastName) return contact.lastName;
    if (contact.email) return contact.email.split('@')[0];
    if (contact.linkedinUrl) {
      const match = contact.linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
      return match ? match[1] : 'Unknown Contact';
    }
    return 'Unknown Contact';
  };

  const handleExportCsv = () => {
    if (!contacts || contacts.length === 0) {
      return;
    }

    if (currentUser?.tier === 'free') {
      setShowUpgradeDialog(true);
      return;
    }

    const headers = [
      'First Name',
      'Last Name',
      'Email',
      'LinkedIn',
      'Job Title',
      'Company',
      'Location',
      'College',
      'Status',
      'First Contact Date',
      'Last Contact Date',
      'Email Subject',
      'Email Body',
      'Gmail Draft URL'
    ] as const;

    const headerRow = headers.join(',');

    const rows = contacts.map((contact) => {
      const escapeCsv = (val: string | undefined | null) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(contact.firstName),
        escapeCsv(contact.lastName),
        escapeCsv(contact.email),
        escapeCsv(contact.linkedinUrl),
        escapeCsv(contact.jobTitle),
        escapeCsv(contact.company),
        escapeCsv(contact.location),
        escapeCsv(contact.college),
        escapeCsv(contact.status),
        escapeCsv(contact.firstContactDate),
        escapeCsv(contact.lastContactDate),
        escapeCsv(contact.emailSubject),
        escapeCsv(contact.emailBody),
        escapeCsv(contact.gmailDraftUrl)
      ].join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `contact_library_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearAllContacts = async () => {
    if (window.confirm('Are you sure you want to delete all contacts? This action cannot be undone.')) {
      try {
        if (currentUser) {
          await firebaseApi.clearAllContacts(currentUser.uid);
          setContacts([]);
        } else {
          localStorage.removeItem(getStorageKey());
          setContacts([]);
        }
      } catch (err) {
        console.error('Error clearing contacts:', err);
        setError('Failed to clear contacts');
      }
    }
  };

  useEffect(() => {
    if (!migrationLoading) {
      loadContacts();
    }
  }, [currentUser, migrationLoading]);

  if (migrationLoading || isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton variant="contacts" count={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6 contact-directory-page">
      {/* Top Controls - Matching Find People layout */}
      <div className="flex items-center justify-between gap-4 contact-directory-controls-row">
        {/* Search */}
        <div className="relative flex-1 max-w-sm contact-directory-search">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 hover:border-gray-400 transition-colors"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 contact-directory-actions">
          <span className="text-sm text-gray-500 contact-directory-count">
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={contacts.length === 0}
            className="gap-2 border-gray-300 hover:border-gray-400 contact-directory-export-btn"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadContacts}
            disabled={isLoading}
            className="relative overflow-hidden border-gray-300 hover:border-gray-400 contact-directory-refresh-btn"
          >
            <RefreshCw className="h-4 w-4" />
            <InlineLoadingBar isLoading={isLoading} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearAllContacts}
            disabled={contacts.length === 0}
            className="text-red-600 border-gray-300 hover:border-red-300 hover:bg-red-50 contact-directory-delete-btn"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Empty State */}
      {contacts.length === 0 ? (
        <div className="border border-gray-200 rounded-lg p-12 text-center bg-white">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-gray-900 font-medium mb-2">No contacts saved yet</p>
          <p className="text-sm text-gray-500 mb-6">
            Use the Find People search to discover and save contacts
          </p>
          <Button
            onClick={() => navigate('/contact-search')}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Find People
          </Button>
        </div>
      ) : (
        /* Table Container - Flat styling like Find People */
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden contact-directory-table-wrapper">
          {/* Table */}
          <div ref={tableContainerRef} className="overflow-x-auto overflow-y-visible contact-directory-table-container" style={{ maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table className="min-w-[1400px] w-full contact-directory-table">
              <thead>
                <tr className="border-b border-gray-200">
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide contact-directory-name-header">
                    Contact
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    LinkedIn
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Company
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Location
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide min-w-[180px]">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredContacts.map((contact, index) => {
                  const statusOption = STATUS_OPTIONS.find(opt => opt.value === contact.status);

                  return (
                    <tr
                      key={contact.id}
                      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 transition-colors"
                    >
                      {/* Contact Name */}
                      <td className="px-4 py-3 whitespace-nowrap contact-directory-name-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-blue-500" />
                          </div>
                          {editingCell?.row === index && editingCell?.col === 'name' ? (
                            <div className="space-y-1">
                              <Input
                                value={contact.firstName}
                                onChange={(e) => handleCellEdit(contact.id!, 'firstName', e.target.value)}
                                onBlur={handleCellBlur}
                                placeholder="First name"
                                className="text-sm h-7 border-gray-300"
                                autoFocus
                              />
                              <Input
                                value={contact.lastName}
                                onChange={(e) => handleCellEdit(contact.id!, 'lastName', e.target.value)}
                                onBlur={handleCellBlur}
                                placeholder="Last name"
                                className="text-sm h-7 border-gray-300"
                              />
                            </div>
                          ) : (
                            <div
                              onClick={() => handleCellClick(index, 'name')}
                              className="cursor-pointer"
                            >
                              <span className="text-sm font-medium text-gray-900">
                                {getDisplayName(contact)}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* LinkedIn */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {contact.linkedinUrl ? (
                          <a
                            href={
                              contact.linkedinUrl.startsWith('http')
                                ? contact.linkedinUrl
                                : `https://${contact.linkedinUrl}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {contact.email ? (
                          <span className="text-sm text-gray-700 truncate max-w-[180px] block">{contact.email}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Company */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {editingCell?.row === index && editingCell?.col === 'company' ? (
                          <Input
                            value={contact.company}
                            onChange={(e) => handleCellEdit(contact.id!, 'company', e.target.value)}
                            onBlur={handleCellBlur}
                            className="text-sm h-7 border-gray-300"
                            autoFocus
                          />
                        ) : (
                          <div
                            onClick={() => handleCellClick(index, 'company')}
                            className="cursor-pointer text-sm text-gray-700"
                          >
                            {contact.company || <span className="text-gray-300">—</span>}
                          </div>
                        )}
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {editingCell?.row === index && editingCell?.col === 'jobTitle' ? (
                          <Input
                            value={contact.jobTitle}
                            onChange={(e) => handleCellEdit(contact.id!, 'jobTitle', e.target.value)}
                            onBlur={handleCellBlur}
                            className="text-sm h-7 border-gray-300"
                            autoFocus
                          />
                        ) : (
                          <div
                            onClick={() => handleCellClick(index, 'jobTitle')}
                            className="cursor-pointer text-sm text-gray-700"
                          >
                            {contact.jobTitle || <span className="text-gray-300">—</span>}
                          </div>
                        )}
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {editingCell?.row === index && editingCell?.col === 'location' ? (
                          <Input
                            value={contact.location}
                            onChange={(e) => handleCellEdit(contact.id!, 'location', e.target.value)}
                            onBlur={handleCellBlur}
                            className="text-sm h-7 border-gray-300"
                            autoFocus
                          />
                        ) : (
                          <div
                            onClick={() => handleCellClick(index, 'location')}
                            className="cursor-pointer text-sm text-gray-700"
                          >
                            {contact.location || <span className="text-gray-300">—</span>}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap min-w-[180px]">
                        <div className="flex items-center gap-2 min-w-[180px]">
                          <select
                            value={contact.status}
                            onChange={(e) => handleCellEdit(contact.id!, 'status', e.target.value)}
                            className="text-xs bg-white border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer hover:border-gray-400 transition-colors flex-shrink-0 min-w-[150px]"
                            style={{ color: statusOption?.color }}
                          >
                            {STATUS_OPTIONS.map(option => (
                              <option
                                key={option.value}
                                value={option.value}
                                style={{ color: option.color }}
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>

                          {contact.gmailThreadId && contact.id && (
                            <NotificationBell
                              contactId={contact.id}
                              contactEmail={contact.email}
                              gmailThreadId={contact.gmailThreadId}
                              hasUnreadReply={replyStatuses[contact.id]?.isUnread || false}
                              notificationsMuted={contact.notificationsMuted || false}
                              onStateChange={() => {
                                loadContacts();
                                checkRepliesForAllContacts();
                              }}
                            />
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          {contact.email ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEmailClick(contact)}
                              className="text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent row selection
                              handleDeleteContact(contact.id!, getDisplayName(contact));
                            }}
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50"
                            title="Delete contact"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Empty search results */}
          {filteredContacts.length === 0 && contacts.length > 0 && searchQuery && (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-500 mb-2">No contacts match your search.</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Clear search
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mail App Selection Dialog */}
      {mailAppDialogOpen && selectedContactForEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Choose Email App</h3>
            <p className="text-gray-600 mb-6 text-sm">
              Send email to {getDisplayName(selectedContactForEmail)}
            </p>

            <div className="flex gap-3">
              <Button
                onClick={() => handleMailAppSelect('apple')}
                variant="outline"
                className="flex-1 py-6"
              >
                <div className="flex flex-col items-center gap-2">
                  <Mail className="h-5 w-5" />
                  <span className="text-sm">Apple Mail</span>
                </div>
              </Button>

              <Button
                onClick={() => handleMailAppSelect('gmail')}
                className="flex-1 py-6 bg-blue-600 hover:bg-blue-700"
              >
                <div className="flex flex-col items-center gap-2">
                  <Mail className="h-5 w-5" />
                  <span className="text-sm">Gmail</span>
                </div>
              </Button>
            </div>

            <Button
              onClick={() => {
                setMailAppDialogOpen(false);
                setSelectedContactForEmail(null);
              }}
              variant="ghost"
              className="w-full mt-4 text-gray-500"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Upgrade Dialog for CSV Export */}
      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upgrade to Export CSV</AlertDialogTitle>
            <AlertDialogDescription>
              CSV export is available for Pro and Elite tier users. Upgrade your plan to export your contacts to CSV.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => navigate('/pricing')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Upgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. PAGE HEADER SECTION - Width 100%, padding 16px */
          .contact-directory-page {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            box-sizing: border-box;
            padding: 0;
          }

          .contact-directory-header-text {
            width: 100%;
            max-width: 100%;
            padding: 0 16px;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.875rem !important;
            margin: 0;
          }

          /* 2. CONTROLS ROW - Separate from table, fixed width */
          .contact-directory-controls-row {
            width: 100%;
            max-width: 100%;
            padding: 0 16px;
            box-sizing: border-box;
            flex-wrap: wrap;
            gap: 8px;
            position: relative;
            z-index: 10;
            background: white;
            margin: 0;
            overflow: hidden;
          }

          .contact-directory-search {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            flex: 1 1 100%;
          }

          .contact-directory-search input {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .contact-directory-actions {
            width: 100%;
            max-width: 100%;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-start;
            box-sizing: border-box;
            display: flex;
            margin: 0;
          }

          .contact-directory-count {
            width: 100%;
            flex-basis: 100%;
            flex-shrink: 0;
            white-space: nowrap;
            margin-bottom: 4px;
            box-sizing: border-box;
          }

          /* Buttons - reduce padding or use icon-only on mobile */
          .contact-directory-export-btn {
            flex: 1 1 auto;
            min-width: fit-content;
            padding: 8px 10px !important;
            font-size: 0.75rem;
            box-sizing: border-box;
            max-width: 100%;
            white-space: nowrap;
          }

          /* Make "Export CSV" button smaller - reduce text if needed */
          .contact-directory-export-btn svg {
            width: 14px;
            height: 14px;
          }

          .contact-directory-refresh-btn,
          .contact-directory-delete-btn {
            min-width: 44px;
            min-height: 44px;
            padding: 8px !important;
            box-sizing: border-box;
            flex-shrink: 0;
          }

          /* Hide text in icon buttons, keep icons */
          .contact-directory-refresh-btn > span:not(.lucide),
          .contact-directory-delete-btn > span:not(.lucide) {
            display: none;
          }

          /* 3. TABLE CONTAINER - Separate scroll container */
          .contact-directory-table-wrapper {
            width: 100%;
            max-width: 100vw;
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          .contact-directory-table-container {
            width: 100%;
            overflow-x: auto;
            overflow-y: visible;
            -webkit-overflow-scrolling: touch;
            box-sizing: border-box;
          }

          /* 4. TABLE STRUCTURE - Horizontal scroll, sticky first column */
          .contact-directory-table {
            min-width: 800px;
            width: 100%;
            box-sizing: border-box;
          }

          .contact-directory-name-header {
            position: sticky;
            left: 0;
            background: white;
            z-index: 5;
            box-shadow: 2px 0 4px rgba(0, 0, 0, 0.05);
          }

          .contact-directory-name-cell {
            position: sticky;
            left: 0;
            background: white;
            z-index: 4;
            box-shadow: 2px 0 4px rgba(0, 0, 0, 0.05);
          }

          /* Ensure sticky cells have proper background on hover */
          .contact-directory-table tbody tr:hover .contact-directory-name-cell {
            background: #f9fafb;
          }

          /* 5. SEARCH INPUT - Full width */
          .contact-directory-search {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            margin: 0;
          }

          .contact-directory-search input {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            margin: 0;
          }

          /* 6. GENERAL - Prevent page-level horizontal scroll */
          .contact-directory-page {
            overflow-x: hidden;
            max-width: 100vw;
            width: 100%;
          }

          .contact-directory-page > * {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Ensure all header elements use box-sizing */
          .contact-directory-page * {
            box-sizing: border-box;
          }

          /* Remove any negative margins or transforms that cause overflow */
          .contact-directory-page * {
            margin-left: 0;
            margin-right: 0;
          }

          .contact-directory-controls-row *,
          .contact-directory-actions *,
          .contact-directory-search * {
            transform: none;
            position: static;
          }
        }
      `}</style>
    </div>
  );
};

export default SpreadsheetContactDirectory;
