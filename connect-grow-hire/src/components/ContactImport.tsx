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

  // ==================== UPLOAD STEP ====================
  if (step === 'upload') {
    return (
      <div className="space-y-6">
        {/* Main Upload Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
          {/* Gradient accent at top */}
          <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600"></div>
          
          <div className="p-8">
            {/* Card Header with Template Download */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Import Contacts</h2>
                <p className="text-gray-600 mt-1">Upload a CSV or Excel file to add contacts to your library</p>
              </div>
              
              <button 
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-all"
              >
                <Download className="w-4 h-4" />
                Download Template
              </button>
            </div>

            {/* Enhanced Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
                transition-all duration-300 ease-out
                ${isDragging 
                  ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
                  : file 
                    ? 'border-green-500 bg-green-50' 
                    : 'border-gray-300 bg-gradient-to-b from-slate-50 to-white hover:border-blue-400 hover:bg-blue-50/50'
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
                  {/* Icon */}
                  <div className={`
                    w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center
                    transition-all duration-300
                    ${isDragging 
                      ? 'bg-blue-100 scale-110' 
                      : 'bg-white shadow-sm border border-gray-100'
                    }
                  `}>
                    <Table2 className={`w-8 h-8 ${isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
                  </div>
                  
                  {/* Text */}
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {isDragging ? 'Drop it here!' : 'Drop your spreadsheet here'}
                  </h3>
                  <p className="text-gray-500 mb-4">or click to browse your files</p>
                  
                  {/* Button */}
                  <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm pointer-events-none">
                    <Upload className="w-4 h-4" />
                    Choose File
                  </button>
                  
                  {/* Supported formats */}
                  <p className="text-xs text-gray-400 mt-4">
                    Supports CSV, XLSX, XLS
                  </p>
                </>
              ) : (
                <>
                  {/* File uploaded state */}
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-100 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">File Ready</h3>
                  <p className="text-gray-600 mb-2">{file.name}</p>
                  <p className="text-sm text-gray-500 mb-4">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); clearFile(); }}
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    Choose a different file
                  </button>
                </>
              )}
            </div>

            {/* Import Guidelines - Redesigned */}
            <div className="mt-6 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Import Guidelines</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">15 credits per contact</p>
                    <p className="text-xs text-gray-500">Includes email lookup & AI draft</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Copy className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Duplicates auto-skipped</p>
                    <p className="text-xs text-gray-500">Matching email or LinkedIn URL</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                    <BadgeCheck className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Minimum requirements</p>
                    <p className="text-xs text-gray-500">Name, email, or LinkedIn URL</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Supported formats</p>
                    <p className="text-xs text-gray-500">CSV, XLSX, XLS files</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-6 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* CTA Button (when file uploaded) */}
            {file && (
              <div className="mt-8">
                <button
                  onClick={handlePreview}
                  disabled={isLoading}
                  className={`
                    w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                    flex items-center justify-center gap-3 mx-auto
                    transition-all duration-200 transform
                    ${isLoading
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 active:scale-100'
                    }
                  `}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Preview Import
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
                
                {/* Value props */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-500" />
                    Email lookup included
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-500" />
                    AI-personalized drafts
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-500" />
                    Auto-saved to Tracker
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Tips Section */}
        <div className="text-center animate-fadeInUp" style={{ animationDelay: '300ms' }}>
          <p className="text-sm text-gray-500 mb-3">Don't have a spreadsheet ready?</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button 
              onClick={() => onSwitchTab?.('contact-search')}
              className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 
                         hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 
                         transition-all duration-200 shadow-sm hover:shadow flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Search for people instead
            </button>
            <button 
              onClick={() => onSwitchTab?.('linkedin-email')}
              className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 
                         hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 
                         transition-all duration-200 shadow-sm hover:shadow flex items-center gap-2"
            >
              <Linkedin className="w-4 h-4" />
              Import from LinkedIn
            </button>
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
                      ? `${previewData.valid_rows} contacts × ${previewData.credits.cost_per_contact} credits each`
                      : `You can import up to ${previewData.credits.max_affordable} contacts with your current credits`
                    }
                  </p>
                </div>
              </div>
            </div>

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
                    Importing...
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
