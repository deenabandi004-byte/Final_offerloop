import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Mail,
  Search,
  RefreshCw,
  Trash2,
  ExternalLink,
  ArrowLeft,
  Download,
  User
} from "lucide-react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { firebaseApi } from '../services/firebaseApi';
import type { Contact as ContactApi } from '../services/firebaseApi';
import { useFirebaseMigration } from '../hooks/useFirebaseMigration';
import { NotificationBell } from '../components/NotificationBell'; // adjust if your bell lives elsewhere
import { apiService } from '@/services/api';

// Reuse the Contact shape from firebaseApi so types stay in sync
type Contact = ContactApi;

const STATUS_OPTIONS = [
  { value: 'Not Contacted', color: '#A0A0A0', label: 'Not Contacted' },
  { value: 'Contacted', color: '#4285F4', label: 'Contacted' },
  { value: 'Followed Up', color: '#FB8C00', label: 'Followed Up' },
  { value: 'Responded', color: '#34A853', label: 'Responded' },
  { value: 'Call Scheduled', color: '#9C27B0', label: 'Call Scheduled' },
  { value: 'Rejected', color: '#EA4335', label: 'Rejected' },
  { value: 'Hired', color: '#FFD700', label: 'Hired' }
];

const SpreadsheetContactDirectory: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useFirebaseAuth();
  const { isLoading: migrationLoading } = useFirebaseMigration();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [mailAppDialogOpen, setMailAppDialogOpen] = useState(false);
  const [selectedContactForEmail, setSelectedContactForEmail] = useState<Contact | null>(null);

  // 🔔 Reply check state
  const [replyStatuses, setReplyStatuses] = useState<Record<string, any>>({});
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);

  const getStorageKey = () => {
    return currentUser ? `contacts_${currentUser.uid}` : 'contacts_anonymous';
  };

  const normalizeFromServer = (serverContact: any): Contact => ({
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
    emailSubject: serverContact.emailSubject || serverContact.email_subject || '',
    emailBody: serverContact.emailBody || serverContact.email_body || '',
    gmailDraftId: serverContact.gmailDraftId || serverContact.gmail_draft_id || '',
    gmailDraftUrl: serverContact.gmailDraftUrl || serverContact.gmail_draft_url || '',
    createdAt: serverContact.createdAt || serverContact.created_at,
    updatedAt: serverContact.updatedAt || serverContact.updated_at,
    // Gmail tracking fields
    gmailThreadId: serverContact.gmailThreadId || serverContact.gmail_thread_id,
    gmailMessageId: serverContact.gmailMessageId || serverContact.gmail_message_id,
    hasUnreadReply: serverContact.hasUnreadReply || serverContact.has_unread_reply || false,
    notificationsMuted: serverContact.notificationsMuted || serverContact.notifications_muted || false,
    draftCreatedAt: serverContact.draftCreatedAt,
    lastChecked: serverContact.lastChecked,
    mutedAt: serverContact.mutedAt,
  });

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

  // ✅ Build a strictly typed array for bulkCreateContacts
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

          // required
          firstContactDate: today,
          status: 'Not Contacted',
          lastContactDate: today,

          // optional (only include if present)
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


  // 🔔 Check replies for all contacts
  const checkRepliesForAllContacts = useCallback(async () => {
    if (!contacts || contacts.length === 0 || isCheckingReplies || !currentUser) return;
    setIsCheckingReplies(true);

    try {
      const contactsWithThreads = contacts
        .filter((c) => c.gmailThreadId && !c.notificationsMuted && c.id)
        .map((c) => c.id!)
        .filter(Boolean);

      if (contactsWithThreads.length === 0) {
        setIsCheckingReplies(false);
        return;
      }

      const result = await apiService.batchCheckReplies(contactsWithThreads);
      if ('results' in result) setReplyStatuses(result.results);
    } catch (error) {
      console.error('Error checking replies:', error);
    } finally {
      setIsCheckingReplies(false);
    }
  }, [contacts, isCheckingReplies, currentUser]);

  useEffect(() => {
    if (currentUser && contacts.length > 0) {
      checkRepliesForAllContacts();
      const interval = setInterval(() => checkRepliesForAllContacts(), 120000);
      return () => clearInterval(interval);
    }
  }, [currentUser, contacts.length, checkRepliesForAllContacts]);

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

  const buildMailto = (contact: Contact) => {
    const to = contact.email;
    if (!to) return '#';
    const subject =
      contact.emailSubject || `Question about your work at ${contact.company || 'your company'}`;
    const body =
      contact.emailBody ||
      `Hi ${contact.firstName || 'there'},\n\nI'd love to connect and learn more about your work.\n\nBest regards`;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
  };

  const buildGmailLink = (contact: Contact) => {
    // If a Gmail draft exists, open that instead (has resume attached)
    if (contact.gmailDraftUrl) {
      return contact.gmailDraftUrl;
    }
    
    const to = contact.email;
    if (!to) return '#';
    const subject =
      contact.emailSubject || `Question about your work at ${contact.company || 'your company'}`;
    const body =
      contact.emailBody ||
      `Hi ${contact.firstName || 'there'},\n\nI'd love to connect and learn more about your work.\n\nBest regards`;
    return `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(
      to
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleEmailClick = (contact: Contact) => {
    // If Gmail draft exists, open it directly (has resume attached)
    if (contact.gmailDraftUrl) {
      window.open(contact.gmailDraftUrl, '_blank');
      return;
    }
    
    // Otherwise, show dialog to choose mail app
    setSelectedContactForEmail(contact);
    setMailAppDialogOpen(true);
  };

  const handleMailAppSelect = (app: 'apple' | 'gmail') => {
    if (!selectedContactForEmail) return;
    if (app === 'apple') {
      window.open(buildMailto(selectedContactForEmail), '_blank');
    } else {
      window.open(buildGmailLink(selectedContactForEmail), '_blank');
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

    // Define CSV headers based on Contact interface
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

    // Map contacts to CSV rows
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
    <div className="space-y-4">
      {/* Export CSV Card */}
      {contacts.length > 0 && (
        <div className="flex justify-between items-center bg-card rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              {contacts.length} contact{contacts.length !== 1 ? 's' : ''} saved
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Export your contacts to CSV for further analysis
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleExportCsv}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadContacts}
              disabled={isLoading}
              className="border-border text-foreground hover:bg-accent"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllContacts}
              className="text-destructive border-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-6 py-3 rounded-lg">
          {error}
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground mb-2">No contacts to display yet</p>
          <p className="text-sm text-muted-foreground">
            Switch to the "Contact Search" tab to find contacts
          </p>
        </div>
      ) : (
        <div className="bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border overflow-hidden">
          {/* Results Header */}
          <div className="px-6 py-4 border-b border-border bg-muted">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mail className="h-5 w-5 text-blue-400" />
                <span className="font-medium text-foreground">
                  {filteredContacts.length} {filteredContacts.length === 1 ? 'contact' : 'contacts'}
                  {searchQuery && ` (filtered from ${contacts.length})`}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Click on cells to edit contact information
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-6 py-4 border-b border-border bg-background">
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted border-border text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary"
              />
            </div>
          </div>

          {/* Empty State for No Search Results */}
          {filteredContacts.length === 0 && contacts.length > 0 && searchQuery && (
            <div className="px-6 py-12 text-center">
              <p className="text-muted-foreground mb-2">No contacts match your search.</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-sm text-blue-600 hover:text-blue-700 underline"
              >
                Clear search
              </button>
            </div>
          )}

          {/* Table */}
          {filteredContacts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Contact
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      LinkedIn
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Email
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Company
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Role
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Location
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-background divide-y divide-border">
                  {filteredContacts.map((contact, index) => {
                    const statusOption = STATUS_OPTIONS.find(opt => opt.value === contact.status);

                    return (
                      <tr
                        key={contact.id}
                        className="hover:bg-accent transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                              <User className="h-5 w-5 text-blue-400" />
                            </div>
                            <div className="ml-4 flex-1">
                              {editingCell?.row === index && editingCell?.col === 'name' ? (
                                <div className="space-y-1">
                                  <Input
                                    value={contact.firstName}
                                    onChange={(e) => handleCellEdit(contact.id!, 'firstName', e.target.value)}
                                    onBlur={handleCellBlur}
                                    placeholder="First name"
                                    className="text-sm h-8 bg-background border-input text-foreground"
                                    autoFocus
                                  />
                                  <Input
                                    value={contact.lastName}
                                    onChange={(e) => handleCellEdit(contact.id!, 'lastName', e.target.value)}
                                    onBlur={handleCellBlur}
                                    placeholder="Last name"
                                    className="text-sm h-8 bg-background border-input text-foreground"
                                  />
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleCellClick(index, 'name')}
                                  className="cursor-text"
                                >
                                  <div className="text-sm font-medium text-foreground">
                                    {getDisplayName(contact)}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          {contact.linkedinUrl ? (
                            <a
                              href={
                                contact.linkedinUrl.startsWith('http')
                                  ? contact.linkedinUrl
                                  : `https://${contact.linkedinUrl}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline text-sm"
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span className="truncate max-w-[200px]">{contact.linkedinUrl.replace(/^https?:\/\//g, '')}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          {contact.email ? (
                            <span className="text-sm text-foreground">{contact.email}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingCell?.row === index && editingCell?.col === 'company' ? (
                            <Input
                              value={contact.company}
                              onChange={(e) => handleCellEdit(contact.id!, 'company', e.target.value)}
                              onBlur={handleCellBlur}
                              className="text-sm h-8 bg-background border-input text-foreground"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => handleCellClick(index, 'company')}
                              className="cursor-text hover:bg-muted rounded px-2 py-1 text-sm text-foreground"
                            >
                              {contact.company || <span className="text-muted-foreground">—</span>}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingCell?.row === index && editingCell?.col === 'jobTitle' ? (
                            <Input
                              value={contact.jobTitle}
                              onChange={(e) => handleCellEdit(contact.id!, 'jobTitle', e.target.value)}
                              onBlur={handleCellBlur}
                              className="text-sm h-8 bg-background border-input text-foreground"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => handleCellClick(index, 'jobTitle')}
                              className="cursor-text hover:bg-muted rounded px-2 py-1 text-sm text-foreground"
                            >
                              {contact.jobTitle || <span className="text-muted-foreground">—</span>}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingCell?.row === index && editingCell?.col === 'location' ? (
                            <Input
                              value={contact.location}
                              onChange={(e) => handleCellEdit(contact.id!, 'location', e.target.value)}
                              onBlur={handleCellBlur}
                              className="text-sm h-8 bg-background border-input text-foreground"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => handleCellClick(index, 'location')}
                              className="cursor-text hover:bg-muted rounded px-2 py-1 text-sm text-foreground"
                            >
                              {contact.location || <span className="text-muted-foreground">—</span>}
                            </div>
                          )}
                        </td>

                        {/* Status + Bell */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <select
                              value={contact.status}
                              onChange={(e) => handleCellEdit(contact.id!, 'status', e.target.value)}
                              className="flex-1 text-xs bg-background border-input text-foreground focus:ring-1 focus:ring-blue-500 cursor-pointer rounded px-2 py-1"
                              style={{ color: statusOption?.color }}
                            >
                              {STATUS_OPTIONS.map(option => (
                                <option
                                  key={option.value}
                                  value={option.value}
                                  style={{ color: option.color, backgroundColor: '#ffffff' }}
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

                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {contact.email ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEmailClick(contact)}
                              className="hover:bg-muted text-muted-foreground hover:text-foreground"
                              title={`Email ${getDisplayName(contact)}${
                                contact.emailSubject ? ' (Generated email available)' : ''
                              }`}
                            >
                              <Mail
                                className={`h-4 w-4 ${
                                  contact.emailSubject ? 'text-blue-600' : 'text-blue-600'
                                }`}
                              />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {filteredContacts.length > 0 && (
            <div className="px-6 py-4 border-t border-border bg-muted">
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <p className="text-center flex-1">
                  Click on cells to edit contact information
                </p>
                <p className="text-xs">
                  {(filteredContacts || contacts).filter(c => c.emailSubject).length} contacts have generated emails
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mail App Selection Dialog */}
      {mailAppDialogOpen && selectedContactForEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 border border-border shadow-lg">
            <h3 className="text-xl font-semibold text-foreground mb-4">Choose Email App</h3>
            <p className="text-muted-foreground mb-6">
              Send email to {getDisplayName(selectedContactForEmail)}
            </p>

            <div className="flex gap-3">
              <Button
                onClick={() => handleMailAppSelect('apple')}
                className="flex-1 bg-muted hover:bg-muted/80 text-foreground py-6"
              >
                <div className="flex flex-col items-center gap-2">
                  <Mail className="h-6 w-6" />
                  <span>Apple Mail</span>
                </div>
              </Button>

              <Button
                onClick={() => handleMailAppSelect('gmail')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-6"
              >
                <div className="flex flex-col items-center gap-2">
                  <Mail className="h-6 w-6" />
                  <span>Gmail</span>
                </div>
              </Button>
            </div>

            <Button
              onClick={() => {
                setMailAppDialogOpen(false);
                setSelectedContactForEmail(null);
              }}
              variant="ghost"
              className="w-full mt-4 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpreadsheetContactDirectory;