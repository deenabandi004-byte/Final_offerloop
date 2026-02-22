import React, { useState, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Download,
  X,
  ArrowRight,
  CreditCard,
  Sparkles,
  Check,
  Table2,
  Copy,
  CheckCircle,
  BadgeCheck,
  FileText,
  Search,
  Linkedin,
  Info,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/lib/firebase';

const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001' 
  : 'https://www.offerloop.ai';

// Our schema fields that can be mapped
const SCHEMA_FIELDS = [
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'linkedinUrl', label: 'LinkedIn URL' },
  { value: 'company', label: 'Company' },
  { value: 'jobTitle', label: 'Job Title' },
  { value: 'college', label: 'College/University' },
  { value: 'location', label: 'Location' },
  { value: 'phone', label: 'Phone' },
  { value: '_skip', label: '(Skip this column)' },
];

interface PreviewData {
  headers: string[];
  column_mapping: Record<string, string>;
  unmapped_headers: string[];
  total_rows: number;
  valid_rows: number;
  sample_contacts: any[];
  credits: {
    available: number;
    cost_per_contact: number;
    total_cost: number;
    can_afford: boolean;
    max_affordable: number;
  };
  enrichment?: {
    contacts_with_email: number;
    contacts_needing_enrichment: number;
    contacts_needing_enrichment_total: number;
    contacts_unenrichable: number;
    enrichment_cap: number;
  };
}

interface ImportResult {
  success: boolean;
  created: number;
  skipped: {
    duplicate: number;
    invalid: number;
    no_credits: number;
    total: number;
  };
  credits: {
    spent: number;
    remaining: number;
  };
  enrichment?: {
    enriched: number;
    failed: number;
    capped: number;
  };
  drafts?: {
    created: number;
    total_eligible: number;
  };
}

interface ContactImportProps {
  onImportComplete?: () => void;
  onSwitchTab?: (tab: string) => void;
}

const ContactImport: React.FC<ContactImportProps> = ({ onImportComplete, onSwitchTab }) => {
  const { user, updateCredits } = useFirebaseAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  
  // Preview data
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  
  // Import result
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  
  // Upgrade dialog
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const getIdToken = async (): Promise<string> => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      throw new Error('Not authenticated');
    }
    return await firebaseUser.getIdToken(true);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  }, []);

  const validateAndSetFile = (file: File) => {
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(extension)) {
      setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }
    
    setError(null);
    setFile(file);
  };

  const handlePreview = async () => {
    if (!file || !user) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE}/api/contacts/import/preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.upgrade_required) {
          setShowUpgradeDialog(true);
          return;
        }
        throw new Error(data.error || 'Failed to preview file');
      }
      
      setPreviewData(data);
      setColumnMapping(data.column_mapping);
      setStep('preview');
      
    } catch (err: any) {
      setError(err.message || 'Failed to preview file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !user || !previewData) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('column_mapping', JSON.stringify(columnMapping));
      
      const response = await fetch(`${API_BASE}/api/contacts/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.upgrade_required) {
          setShowUpgradeDialog(true);
          return;
        }
        throw new Error(data.error || 'Failed to import contacts');
      }
      
      setImportResult(data);
      setStep('result');
      
      // Update user's credits in context
      if (updateCredits && data.credits?.remaining !== undefined) {
        await updateCredits(data.credits.remaining);
      }
      
      if (onImportComplete) {
        onImportComplete();
      }
      
    } catch (err: any) {
      setError(err.message || 'Failed to import contacts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!user) return;
    
    try {
      const token = await getIdToken();
      const response = await fetch(`${API_BASE}/api/contacts/import/template`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to download template');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contact_import_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
    } catch (err: any) {
      setError(err.message || 'Failed to download template');
    }
  };

  const handleColumnMappingChange = (headerIndex: string, field: string) => {
    setColumnMapping(prev => {
      const newMapping = { ...prev };
      if (field === '_skip') {
        delete newMapping[headerIndex];
      } else {
        newMapping[headerIndex] = field;
      }
      return newMapping;
    });
  };

  const resetImport = () => {
    setFile(null);
    setPreviewData(null);
    setColumnMapping({});
    setImportResult(null);
    setError(null);
    setStep('upload');
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
  };

  // Guidelines expandable state
  const [showGuidelines, setShowGuidelines] = useState(false);

  // ==================== UPLOAD STEP ====================
  if (step === 'upload') {
    return (
      <div>
        {/* Main Upload Card — matches LinkedIn tab card styling */}
        <div 
          style={{
            background: '#FFFFFF',
            border: '1px solid rgba(37, 99, 235, 0.08)',
            borderRadius: '14px',
            padding: '48px 40px',
            maxWidth: '900px',
            margin: '0 auto',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            textAlign: 'center',
          }}
          className="overflow-hidden"
        >
          {/* Centered icon */}
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Upload className="w-8 h-8 text-blue-600" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Contacts</h2>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            Upload a CSV or Excel file to find emails, generate drafts, and save contacts to your library.
          </p>

          {/* Drop zone — clean, no dashed border */}
          <div className="max-w-xl mx-auto">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative rounded-xl p-10 text-center cursor-pointer
                transition-all duration-200
                ${isDragging 
                  ? 'bg-blue-50 ring-2 ring-blue-500 ring-offset-2' 
                  : file 
                    ? 'bg-gray-50' 
                    : 'bg-gray-50 hover:bg-blue-50/50'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {!file ? (
                <>
                  <Table2 className={`w-8 h-8 mx-auto mb-3 ${isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {isDragging ? 'Drop it here!' : 'Drop your spreadsheet here'}
                  </p>
                  <p className="text-xs text-gray-500 mb-4">or click to browse your files</p>
                  <Button
                    className="h-12 px-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all pointer-events-none"
                  >
                    Choose File
                  </Button>
                  <p className="text-xs text-gray-400 mt-4">Supports CSV, XLSX, XLS</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-green-100 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-0.5">{file.name}</p>
                  <p className="text-xs text-gray-500 mb-3">{(file.size / 1024).toFixed(1)} KB</p>
                  <button 
                    onClick={(e) => { e.stopPropagation(); clearFile(); }}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Choose a different file
                  </button>
                </>
              )}
            </div>

            {/* Secondary links row */}
            <div className="flex items-center justify-center gap-4 mt-4 text-sm">
              <button
                onClick={handleDownloadTemplate}
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Download template
              </button>
              <span className="text-gray-300">·</span>
              <button
                onClick={() => setShowGuidelines(!showGuidelines)}
                className="text-gray-500 hover:text-gray-700 hover:underline inline-flex items-center gap-1"
              >
                <Info className="w-3.5 h-3.5" />
                Import guidelines
              </button>
            </div>

            {/* Expandable guidelines */}
            {showGuidelines && (
              <div className="mt-4 text-left bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-1.5">
                <p><span className="font-medium text-gray-700">15 credits per contact</span> — includes email lookup & AI draft</p>
                <p><span className="font-medium text-gray-700">Duplicates auto-skipped</span> — matching email or LinkedIn URL</p>
                <p><span className="font-medium text-gray-700">Minimum requirements</span> — name, email, or LinkedIn URL</p>
                <p><span className="font-medium text-gray-700">Supported formats</span> — CSV, XLSX, XLS files</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 justify-center">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* CTA Button (when file uploaded) */}
            {file && (
              <div className="mt-6">
                <Button
                  onClick={handlePreview}
                  disabled={isLoading}
                  className="h-12 px-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Preview Import'
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Alternative actions — subtle text links */}
          <div className="mt-10 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">Or try another way</p>
            <div className="flex items-center justify-center gap-4 text-sm">
              <button 
                onClick={() => onSwitchTab?.('contact-search')}
                className="text-gray-500 hover:text-blue-600 hover:underline transition-colors"
              >
                Search for people
              </button>
              <span className="text-gray-300">·</span>
              <button 
                onClick={() => onSwitchTab?.('linkedin-email')}
                className="text-gray-500 hover:text-blue-600 hover:underline transition-colors"
              >
                Import from LinkedIn
              </button>
            </div>
          </div>
        </div>

        {/* Upgrade Dialog */}
        <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Upgrade to Import Contacts</AlertDialogTitle>
              <AlertDialogDescription>
                Contact import is available for Pro and Elite tier users. Upgrade your plan to import contacts from spreadsheets.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => navigate('/pricing')}
                className="text-white rounded-full bg-gradient-to-r from-blue-600 to-blue-500"
              >
                Upgrade to Pro/Elite
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ==================== PREVIEW STEP ====================
  if (step === 'preview' && previewData) {
    return (
      <div className="space-y-6">
        {/* Main Preview Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp">
          {/* Gradient accent at top */}
          <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600"></div>
          
          <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Preview Import</h2>
                <p className="text-gray-600 mt-1">Review column mappings and confirm import</p>
              </div>
              <button 
                onClick={resetImport}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-all"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{previewData.total_rows}</p>
                <p className="text-sm text-gray-500">Total rows</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{previewData.valid_rows}</p>
                <p className="text-sm text-gray-500">Valid contacts</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{previewData.credits.available}</p>
                <p className="text-sm text-gray-500">Credits available</p>
              </div>
            </div>

            {/* Credit Cost */}
            <div className={`rounded-xl p-4 mb-6 ${previewData.credits.can_afford ? 'bg-blue-50 border border-blue-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${previewData.credits.can_afford ? 'bg-blue-100' : 'bg-yellow-100'}`}>
                  <CreditCard className={`h-5 w-5 ${previewData.credits.can_afford ? 'text-blue-600' : 'text-yellow-600'}`} />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {previewData.credits.can_afford 
                      ? `This import will use ${previewData.credits.total_cost} credits`
                      : `Not enough credits for all contacts`
                    }
                  </p>
                  <p className="text-sm text-gray-600">
                    {previewData.credits.can_afford 
                      ? `${previewData.valid_rows} contacts × ${previewData.credits.cost_per_contact} credits each — includes email lookup & AI draft`
                      : `You can import up to ${previewData.credits.max_affordable} contacts with your current credits`
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Enrichment stats (when available) */}
            {previewData.enrichment && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
                <h3 className="font-medium text-gray-900 mb-2">What we&apos;ll do</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>{previewData.enrichment.contacts_with_email} contacts already have emails</li>
                  <li>{previewData.enrichment.contacts_needing_enrichment_total} contacts will be enriched via LinkedIn (email lookup)</li>
                  <li>{previewData.enrichment.contacts_unenrichable} contacts have no email or LinkedIn — imported as-is</li>
                  {previewData.enrichment.contacts_needing_enrichment_total > (previewData.enrichment.enrichment_cap ?? 50) && (
                    <li className="text-amber-700 font-medium">Up to {previewData.enrichment.enrichment_cap ?? 50} contacts will be enriched per import</li>
                  )}
                </ul>
              </div>
            )}

            {/* Column Mapping */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-slate-100 to-gray-100">
                <h3 className="font-medium text-gray-900">Column Mapping</h3>
                <p className="text-sm text-gray-500">Adjust how your spreadsheet columns map to contact fields</p>
              </div>
              <div className="p-4 space-y-3 bg-white">
                {previewData.headers.map((header, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <div className="w-1/3">
                      <p className="text-sm font-medium text-gray-700 truncate" title={header}>
                        {header || `(Column ${idx + 1})`}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <div className="w-1/2">
                      <Select
                        value={columnMapping[idx.toString()] || '_skip'}
                        onValueChange={(value) => handleColumnMappingChange(idx.toString(), value)}
                      >
                        <SelectTrigger className="w-full rounded-lg border-gray-300">
                          <SelectValue placeholder="Select field..." />
                        </SelectTrigger>
                        <SelectContent>
                          {SCHEMA_FIELDS.map(field => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample Preview Table */}
            {previewData.sample_contacts.length > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-slate-100 to-gray-100">
                  <h3 className="font-medium text-gray-900">Sample Preview</h3>
                  <p className="text-sm text-gray-500">First {previewData.sample_contacts.length} contacts</p>
                </div>
                <div className="overflow-x-auto bg-white">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {previewData.sample_contacts.map((contact, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {contact.firstName} {contact.lastName}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{contact.email || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{contact.company || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{contact.jobTitle || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-6 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Loading note when importing */}
            {isLoading && (
              <p className="text-sm text-gray-500 text-center mb-4">
                This may take a minute — we&apos;re looking up emails and drafting messages.
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <button 
                onClick={resetImport}
                className="px-6 py-3 bg-white border border-gray-200 rounded-full text-gray-700 font-medium hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={isLoading || previewData.valid_rows === 0}
                className={`
                  px-8 py-3 rounded-full font-semibold flex items-center justify-center gap-2
                  transition-all duration-200 transform
                  ${isLoading || previewData.valid_rows === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 active:scale-100'
                  }
                `}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Importing & generating drafts...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Import {previewData.credits.can_afford ? previewData.valid_rows : previewData.credits.max_affordable} Contacts
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== RESULT STEP ====================
  if (step === 'result' && importResult) {
    return (
      <div className="space-y-6">
        {/* Success Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-scaleIn">
          {/* Gradient accent at top */}
          <div className="h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500"></div>
          
          <div className="p-8">
            {/* Success Header */}
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete!</h2>
              <p className="text-gray-600">
                Successfully imported {importResult.created} contacts
              </p>
            </div>

            {/* Result Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{importResult.created}</p>
                <p className="text-sm text-gray-500">Imported</p>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-amber-100 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-yellow-600">{importResult.skipped.duplicate}</p>
                <p className="text-sm text-gray-500">Duplicates</p>
              </div>
              <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-500">{importResult.skipped.invalid}</p>
                <p className="text-sm text-gray-500">Invalid</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{importResult.credits.remaining}</p>
                <p className="text-sm text-gray-500">Credits Left</p>
              </div>
            </div>

            {/* Enrichment & draft summary */}
            {(importResult.enrichment || importResult.drafts) && (
              <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2">
                {importResult.enrichment && importResult.enrichment.enriched > 0 && (
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">{importResult.enrichment.enriched}</span> emails found via LinkedIn lookup
                  </p>
                )}
                {importResult.drafts && (
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">{importResult.drafts.created}</span> email drafts created
                  </p>
                )}
                {importResult.enrichment && importResult.enrichment.failed > 0 && (
                  <p className="text-sm text-amber-700">
                    {importResult.enrichment.failed} LinkedIn lookup(s) didn&apos;t return an email
                  </p>
                )}
                {importResult.enrichment && importResult.enrichment.capped > 0 && (
                  <p className="text-sm text-amber-700">
                    {importResult.enrichment.capped} contacts exceeded the enrichment limit (50 per import)
                  </p>
                )}
              </div>
            )}

            {/* Credits Spent */}
            <div className="bg-gray-50 rounded-xl p-4 mb-8">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Credits spent</span>
                <span className="font-semibold text-gray-900">{importResult.credits.spent}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <button 
                onClick={resetImport}
                className="px-6 py-3 bg-white border border-gray-200 rounded-full text-gray-700 font-medium hover:bg-gray-50 transition-all"
              >
                Import More
              </button>
              <button
                onClick={() => {
                  if (onImportComplete) {
                    onImportComplete();
                  }
                }}
                className="px-8 py-3 rounded-full font-semibold bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 active:scale-100 transition-all duration-200 transform flex items-center justify-center gap-2"
              >
                View in Tracker
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ContactImport;
