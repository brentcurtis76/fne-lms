import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface ChartExportOptions {
  filename?: string;
  format: 'png' | 'pdf';
  quality?: number;
  includeTitle?: boolean;
  title?: string;
}

export class ChartExporter {
  static async exportChart(
    chartElement: HTMLElement,
    options: ChartExportOptions
  ): Promise<{ success: boolean; message: string }> {
    try {
      const {
        filename = 'chart-export',
        format,
        quality = 1,
        includeTitle = true,
        title = 'FNE Analytics Chart'
      } = options;

      // Create canvas from chart element
      const canvas = await html2canvas(chartElement, {
        scale: 2, // Higher resolution
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: chartElement.offsetWidth,
        height: chartElement.offsetHeight
      });

      if (format === 'png') {
        // Export as PNG
        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = canvas.toDataURL('image/png', quality);
        link.click();
        
        return { success: true, message: 'Chart exported as PNG successfully' };
      } else if (format === 'pdf') {
        // Export as PDF
        const imgData = canvas.toDataURL('image/png', quality);
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
        });

        // Add title if requested
        if (includeTitle && title) {
          pdf.setFontSize(16);
          pdf.setFont('helvetica', 'bold');
          pdf.text(title, 20, 20);
        }

        // Calculate dimensions to fit the chart
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        
        const maxWidth = pdfWidth - 40; // Margins
        const maxHeight = pdfHeight - (includeTitle ? 60 : 40); // Space for title and margins
        
        const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
        const scaledWidth = imgWidth * ratio;
        const scaledHeight = imgHeight * ratio;
        
        const x = (pdfWidth - scaledWidth) / 2;
        const y = includeTitle ? 40 : 20;

        pdf.addImage(imgData, 'PNG', x, y, scaledWidth, scaledHeight);
        
        // Add metadata
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Generated: ${new Date().toLocaleDateString('es-ES')} | FNE LMS Analytics`, 20, pdfHeight - 10);
        
        pdf.save(`${filename}.pdf`);
        
        return { success: true, message: 'Chart exported as PDF successfully' };
      }
      
      throw new Error('Unsupported format');
    } catch (error) {
      console.error('Chart export error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error exporting chart'
      };
    }
  }

  static async exportMultipleCharts(
    chartElements: HTMLElement[],
    titles: string[],
    filename: string = 'analytics-report'
  ): Promise<{ success: boolean; message: string }> {
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Add title page
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('FNE Analytics Report', 20, 30);
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Generated: ${new Date().toLocaleDateString('es-ES')}`, 20, 45);
      pdf.text(`Total Charts: ${chartElements.length}`, 20, 55);

      for (let i = 0; i < chartElements.length; i++) {
        const chartElement = chartElements[i];
        const title = titles[i] || `Chart ${i + 1}`;

        // Add new page for each chart (except first one)
        if (i > 0) {
          pdf.addPage();
        } else {
          // For first chart, just move down from title page
          pdf.text('', 20, 80);
        }

        // Add chart title
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, 20, i === 0 ? 80 : 20);

        // Generate canvas for chart
        const canvas = await html2canvas(chartElement, {
          scale: 1.5,
          backgroundColor: '#ffffff',
          useCORS: true,
          allowTaint: true,
          logging: false
        });

        const imgData = canvas.toDataURL('image/png', 0.9);
        
        // Calculate dimensions
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const maxWidth = pdfWidth - 40;
        const maxHeight = pdfHeight - 80;
        
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
        
        const scaledWidth = imgWidth * ratio;
        const scaledHeight = imgHeight * ratio;
        
        const x = (pdfWidth - scaledWidth) / 2;
        const y = i === 0 ? 90 : 35;

        pdf.addImage(imgData, 'PNG', x, y, scaledWidth, scaledHeight);
      }

      pdf.save(`${filename}.pdf`);
      
      return { success: true, message: `${chartElements.length} charts exported successfully` };
    } catch (error) {
      console.error('Multiple chart export error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error exporting charts'
      };
    }
  }
}