import React, { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import ResumePDF from './ResumePDF';

interface ResumePDFDownloadProps {
  resume: any;
  fileName?: string;
  className?: string;
}

const ResumePDFDownload: React.FC<ResumePDFDownloadProps> = ({
  resume,
  fileName = 'optimized_resume.pdf',
  className = '',
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    
    try {
      // Normalize resume data for PDF
      const normalizedResume = normalizeResumeForPDF(resume);
      
      if (!normalizedResume || (!normalizedResume.name && !normalizedResume.Summary && !normalizedResume.Experience?.length)) {
        throw new Error('Resume data is empty or invalid. Please ensure the resume has been optimized successfully.');
      }
      
      console.log('[ResumePDFDownload] Generating PDF with data:', normalizedResume);
      
      // Generate PDF blob
      const blob = await pdf(<ResumePDF resume={normalizedResume} />).toBlob();
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "PDF downloaded!",
        description: `Your resume has been saved as ${fileName}`,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Failed to generate PDF",
        description: error instanceof Error ? error.message : "An error occurred while generating the PDF",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={isGenerating}
      variant="outline"
      size="sm"
      className={`flex items-center gap-2 ${className}`}
    >
      {isGenerating ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <Download size={16} />
          Download PDF
        </>
      )}
    </Button>
  );
};

// Helper to normalize resume data from API response
function normalizeResumeForPDF(data: any): any {
  console.log('[ResumePDFDownload] Normalizing data:', {
    type: typeof data,
    hasContent: !!data?.content,
    hasStructured: !!data?.structured,
    keys: data ? Object.keys(data) : [],
  });

  // Handle both structured and string formats
  if (typeof data === 'string') {
    console.warn('[ResumePDFDownload] Data is a string, cannot convert to PDF');
    return null; // Can't convert plain text to structured format
  }

  if (!data) {
    console.warn('[ResumePDFDownload] Data is null/undefined');
    return null;
  }

  // Check if data has a 'structured' field (from backend API)
  // The backend now returns structured data in the 'structured' field
  const resumeData = data.structured || data;
  
  // If data only has 'content' (text format) and no structured data, we can't generate PDF
  if (data.content && typeof data.content === 'string' && !resumeData.name && !resumeData.Experience && !resumeData.experience) {
    console.error('[ResumePDFDownload] Data only contains text content, no structured data available');
    console.error('[ResumePDFDownload] Available keys:', Object.keys(data));
    throw new Error('Resume data is in text format only. The backend should return structured data in the "structured" field. Please try again or contact support.');
  }

  // Extract contact info - handle both nested and flat structures
  let contact: any = {};
  if (resumeData.contact) {
    contact = resumeData.contact;
  } else if (resumeData.Contact) {
    contact = resumeData.Contact;
  } else {
    // Build contact from flat fields
    if (resumeData.email) contact.email = resumeData.email;
    if (resumeData.phone) contact.phone = resumeData.phone;
    if (resumeData.location) contact.location = resumeData.location;
    if (resumeData.linkedin) contact.linkedin = resumeData.linkedin;
    if (resumeData.github) contact.github = resumeData.github;
    if (resumeData.website) contact.website = resumeData.website;
  }

  const normalized = {
    name: resumeData.name || resumeData.Name || '',
    contact: Object.keys(contact).length > 0 ? contact : undefined,
    Summary: resumeData.Summary || resumeData.summary || resumeData.Objective || resumeData.objective || '',
    Experience: resumeData.Experience || resumeData.experience || [],
    Education: resumeData.Education || resumeData.education || null,
    Skills: resumeData.Skills || resumeData.skills || null,
    Projects: resumeData.Projects || resumeData.projects || [],
    // Filter out empty extracurriculars
    Extracurriculars: (resumeData.Extracurriculars || resumeData.extracurriculars || [])
      .filter((e: any) => e && (e.activity || e.name)),
  };

  console.log('[ResumePDFDownload] Normalized data:', {
    hasName: !!normalized.name,
    hasContact: !!normalized.contact,
    hasSummary: !!normalized.Summary,
    experienceCount: normalized.Experience?.length || 0,
    hasEducation: !!normalized.Education,
    hasSkills: !!normalized.Skills,
    projectsCount: normalized.Projects?.length || 0,
  });

  return normalized;
}

export default ResumePDFDownload;
