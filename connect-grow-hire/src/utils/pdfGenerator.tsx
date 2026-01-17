import React from 'react';
import { pdf, Document, Page, Text, StyleSheet } from '@react-pdf/renderer';

// Define styles for the cover letter PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
  },
  content: {
    marginTop: 20,
    whiteSpace: 'pre-wrap',
  },
});

/**
 * Generate a PDF blob from cover letter text
 * @param content - The cover letter text content
 * @returns Promise that resolves to a Blob containing the PDF
 */
export async function generateCoverLetterPDF(content: string): Promise<Blob> {
  // Create a React PDF document
  const CoverLetterDoc = (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.content}>{content}</Text>
      </Page>
    </Document>
  );

  // Generate the PDF blob
  const blob = await pdf(CoverLetterDoc).toBlob();
  return blob;
}

/**
 * Download a cover letter as a PDF file
 * @param content - The cover letter text content
 * @param filename - The filename (without extension, .pdf will be added)
 */
export async function downloadCoverLetterAsPDF(
  content: string,
  filename: string = 'cover-letter'
): Promise<void> {
  try {
    // Generate PDF blob
    const blob = await generateCoverLetterPDF(content);
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

