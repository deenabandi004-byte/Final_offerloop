import React, { useState, useCallback } from 'react';
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
}

const ContactImport: React.FC<ContactImportProps> = ({ onImportComplete }) => {
  const { user, updateCredits } = useFirebaseAuth();
  const navigate = useNavigate();

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

  // ==================== UPLOAD STEP ====================
  if (step === 'upload') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Import Contacts</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a CSV or Excel file to add contacts to your library
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Download Template
          </Button>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
            ${isDragging 
              ? 'border-blue-500 bg-blue-500/10' 
              : 'border-border hover:border-blue-400 hover:bg-muted/50'
            }
          `}
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">
            {file ? file.name : 'Drop your spreadsheet here'}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            or click to browse
          </p>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          <Button variant="outline" className="pointer-events-none">
            <Upload className="h-4 w-4 mr-2" />
            Choose File
          </Button>
        </div>

        {/* File Selected */}
        {file && (
          <div className="flex items-center justify-between bg-muted rounded-lg p-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-blue-500" />
              <div>
                <p className="font-medium text-foreground">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                onClick={handlePreview}
                disabled={isLoading}
                className="text-white"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Preview Import
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Guidelines */}
        <div className="bg-muted/50 rounded-lg p-4">
          <h3 className="font-medium text-foreground mb-2">Import Guidelines</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Each contact costs 15 credits to import</li>
            <li>• Duplicates (matching email or LinkedIn) are automatically skipped</li>
            <li>• Contacts must have at least a name, email, or LinkedIn URL</li>
            <li>• Supported formats: CSV, XLSX, XLS</li>
          </ul>
        </div>

        {/* Upgrade Dialog */}
        <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Upgrade to Import Contacts</AlertDialogTitle>
              <AlertDialogDescription>
                Contact import is available for Pro and Elite tier users. Upgrade your plan to import contacts from spreadsheets.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => navigate('/pricing')}
                className="text-white"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Preview Import</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Review column mappings and confirm import
            </p>
          </div>
          <Button variant="outline" onClick={resetImport}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-muted rounded-lg p-4">
            <p className="text-2xl font-bold text-foreground">{previewData.total_rows}</p>
            <p className="text-sm text-muted-foreground">Total rows</p>
          </div>
          <div className="bg-muted rounded-lg p-4">
            <p className="text-2xl font-bold text-green-500">{previewData.valid_rows}</p>
            <p className="text-sm text-muted-foreground">Valid contacts</p>
          </div>
          <div className="bg-muted rounded-lg p-4">
            <p className="text-2xl font-bold text-blue-500">{previewData.credits.available}</p>
            <p className="text-sm text-muted-foreground">Credits available</p>
          </div>
        </div>

        {/* Credit Cost */}
        <div className={`rounded-lg p-4 ${previewData.credits.can_afford ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
          <div className="flex items-center gap-3">
            <CreditCard className={`h-5 w-5 ${previewData.credits.can_afford ? 'text-blue-500' : 'text-yellow-500'}`} />
            <div>
              <p className="font-medium text-foreground">
                {previewData.credits.can_afford 
                  ? `This import will use ${previewData.credits.total_cost} credits`
                  : `Not enough credits for all contacts`
                }
              </p>
              <p className="text-sm text-muted-foreground">
                {previewData.credits.can_afford 
                  ? `${previewData.valid_rows} contacts × ${previewData.credits.cost_per_contact} credits each`
                  : `You can import up to ${previewData.credits.max_affordable} contacts with your current credits`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Column Mapping */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h3 className="font-medium text-foreground">Column Mapping</h3>
            <p className="text-sm text-muted-foreground">Adjust how your spreadsheet columns map to contact fields</p>
          </div>
          <div className="p-4 space-y-3">
            {previewData.headers.map((header, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="w-1/3">
                  <p className="text-sm font-medium text-foreground truncate" title={header}>
                    {header || `(Column ${idx + 1})`}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="w-1/2">
                  <Select
                    value={columnMapping[idx.toString()] || '_skip'}
                    onValueChange={(value) => handleColumnMappingChange(idx.toString(), value)}
                  >
                    <SelectTrigger className="w-full">
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
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted">
              <h3 className="font-medium text-foreground">Sample Preview</h3>
              <p className="text-sm text-muted-foreground">First {previewData.sample_contacts.length} contacts</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Company</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Title</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previewData.sample_contacts.map((contact, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm text-foreground">
                        {contact.firstName} {contact.lastName}
                      </td>
                      <td className="px-4 py-2 text-sm text-foreground">{contact.email || '—'}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{contact.company || '—'}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{contact.jobTitle || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={resetImport}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isLoading || previewData.valid_rows === 0}
            className="text-white"
            style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Import {previewData.credits.can_afford ? previewData.valid_rows : previewData.credits.max_affordable} Contacts
          </Button>
        </div>
      </div>
    );
  }

  // ==================== RESULT STEP ====================
  if (step === 'result' && importResult) {
    return (
      <div className="space-y-6">
        {/* Success Header */}
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Import Complete!</h2>
          <p className="text-muted-foreground">
            Successfully imported {importResult.created} contacts
          </p>
        </div>

        {/* Result Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{importResult.created}</p>
            <p className="text-sm text-muted-foreground">Imported</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{importResult.skipped.duplicate}</p>
            <p className="text-sm text-muted-foreground">Duplicates</p>
          </div>
          <div className="bg-muted rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{importResult.skipped.invalid}</p>
            <p className="text-sm text-muted-foreground">Invalid</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">{importResult.credits.remaining}</p>
            <p className="text-sm text-muted-foreground">Credits Left</p>
          </div>
        </div>

        {/* Credits Spent */}
        <div className="bg-muted rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Credits spent</span>
            <span className="font-medium text-foreground">{importResult.credits.spent}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={resetImport}>
            Import More
          </Button>
          <Button
            onClick={() => {
              // If we have a callback, use it, otherwise navigate
              if (onImportComplete) {
                onImportComplete();
              }
            }}
            className="text-white"
            style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
          >
            View Contact Library
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

export default ContactImport;
