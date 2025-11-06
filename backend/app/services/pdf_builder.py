"""
PDF builder service - generate coffee chat prep PDFs
"""
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak


def generate_coffee_chat_pdf_simple_fixed(prep_id, contact_data, company_news, similarity, questions):
    """Generate a simple Coffee Chat PDF"""
    try:
        print("Creating PDF buffer...")
        buffer = BytesIO()
        
        # Create PDF
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor='#1a73e8',
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        story.append(Paragraph("Coffee Chat Prep", title_style))
        story.append(Spacer(1, 0.3*inch))
        
        # Contact Info
        story.append(Paragraph(f"<b>Contact:</b> {contact_data.get('firstName', '')} {contact_data.get('lastName', '')}", styles['Heading2']))
        story.append(Paragraph(f"<b>Title:</b> {contact_data.get('jobTitle', 'N/A')}", styles['Normal']))
        story.append(Paragraph(f"<b>Company:</b> {contact_data.get('company', 'N/A')}", styles['Normal']))
        story.append(Paragraph(f"<b>Location:</b> {contact_data.get('location', 'N/A')}", styles['Normal']))
        story.append(Spacer(1, 0.3*inch))
        
        # Similarity
        story.append(Paragraph("<b>Why You're a Great Match:</b>", styles['Heading2']))
        story.append(Paragraph(similarity, styles['Normal']))
        story.append(Spacer(1, 0.3*inch))
        
        # Questions
        story.append(Paragraph("<b>Questions to Ask:</b>", styles['Heading2']))
        for i, question in enumerate(questions, 1):
            story.append(Paragraph(f"{i}. {question}", styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
        
        story.append(Spacer(1, 0.3*inch))
        
        # Company News
        if company_news:
            story.append(PageBreak())
            story.append(Paragraph("<b>Recent Company News:</b>", styles['Heading2']))
            for news in company_news[:5]:
                story.append(Paragraph(f"<b>{news.get('title', '')}</b>", styles['Normal']))
                story.append(Paragraph(news.get('summary', '')[:200] + "...", styles['Normal']))
                story.append(Spacer(1, 0.2*inch))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        
        print(f"PDF generated successfully ({buffer.getbuffer().nbytes} bytes)")
        return buffer
        
    except Exception as e:
        print(f"PDF generation failed: {e}")
        import traceback
        traceback.print_exc()
        
        # Return a minimal fallback PDF
        buffer = BytesIO()
        buffer.write(b"%PDF-1.4\nCoffee Chat Prep - Error generating PDF")
        buffer.seek(0)
        return buffer

