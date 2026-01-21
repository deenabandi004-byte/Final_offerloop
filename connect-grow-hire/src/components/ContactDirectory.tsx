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
    if (contact.gmailDraftUrl) {
      window.open(contact.gmailDraftUrl, '_blank');
      return;
    }
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
    <div className="space-y-6">
      {/* Helper text */}
      <p className="text-sm text-gray-500">
        Track saved contacts, outreach status, and follow-ups.
      </p>

      {/* Top Controls - Matching Find People layout */}
      <div className="flex items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
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
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={contacts.length === 0}
            className="gap-2 border-gray-300 hover:border-gray-400"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadContacts}
            disabled={isLoading}
            className="relative overflow-hidden border-gray-300 hover:border-gray-400"
          >
            <RefreshCw className="h-4 w-4" />
            <InlineLoadingBar isLoading={isLoading} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearAllContacts}
            disabled={contacts.length === 0}
            className="text-red-600 border-gray-300 hover:border-red-300 hover:bg-red-50"
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
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
          {/* Table */}
          <div ref={tableContainerRef} className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
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
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
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
                      <td className="px-4 py-3 whitespace-nowrap">
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <select
                            value={contact.status}
                            onChange={(e) => handleCellEdit(contact.id!, 'status', e.target.value)}
                            className="text-xs bg-white border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer hover:border-gray-400 transition-colors"
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
    </div>
  );
};

export default SpreadsheetContactDirectory;
