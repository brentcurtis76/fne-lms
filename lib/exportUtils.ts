import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface ExportData {
  filename: string;
  title: string;
  headers: string[];
  data: any[];
  metadata?: {
    dateRange?: string;
    generatedBy?: string;
    totalRecords?: number;
  };
}

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

/**
 * Escape a value for CSV output.
 * Wraps in double-quotes if the value contains commas, quotes, or newlines.
 * Doubles any embedded double-quotes per RFC 4180.
 */
export function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export class ReportExporter {
  static exportToCSV(exportData: ExportData) {
    const { filename, headers, data } = exportData;
    
    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = this.getNestedValue(row, header);
          // Escape quotes and wrap in quotes if contains comma
          const stringValue = String(value || '');
          return stringValue.includes(',') || stringValue.includes('"') 
            ? `"${stringValue.replace(/"/g, '""')}"` 
            : stringValue;
        }).join(',')
      )
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  static exportToExcel(exportData: ExportData) {
    // For Excel export, we'll use a library like xlsx
    // For now, we'll export as CSV with .xlsx extension as a placeholder
    const { filename, headers, data } = exportData;
    
    try {
      // This is a simplified version - in production you'd use xlsx library
      const csvContent = [
        headers.join('\t'), // Use tabs for better Excel compatibility
        ...data.map(row => 
          headers.map(header => {
            const value = this.getNestedValue(row, header);
            return String(value || '');
          }).join('\t')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.xls`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Excel export error:', error);
      throw new Error('Error al exportar a Excel');
    }
  }

  static exportToPDF(exportData: ExportData) {
    const { filename, title, headers, data, metadata } = exportData;
    
    try {
      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 14, 22);
      
      // Add metadata
      if (metadata) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        let yPos = 35;
        
        if (metadata.dateRange) {
          doc.text(`Período: ${metadata.dateRange}`, 14, yPos);
          yPos += 6;
        }
        
        if (metadata.generatedBy) {
          doc.text(`Generado por: ${metadata.generatedBy}`, 14, yPos);
          yPos += 6;
        }
        
        if (metadata.totalRecords) {
          doc.text(`Total de registros: ${metadata.totalRecords}`, 14, yPos);
          yPos += 6;
        }
        
        doc.text(`Fecha de generación: ${new Date().toLocaleDateString('es-ES')}`, 14, yPos);
      }

      // Prepare table data
      const tableData = data.map(row => 
        headers.map(header => {
          const value = this.getNestedValue(row, header);
          return String(value || '');
        })
      );

      // Add table
      doc.autoTable({
        head: [headers],
        body: tableData,
        startY: metadata ? 60 : 40,
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [0, 54, 91], // FNE Navy Blue
          textColor: 255,
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [248, 249, 250],
        },
        margin: { top: 10, right: 14, bottom: 10, left: 14 },
      });

      // Save the PDF
      doc.save(`${filename}.pdf`);
    } catch (error) {
      console.error('PDF export error:', error);
      throw new Error('Error al exportar a PDF');
    }
  }

  private static getNestedValue(obj: any, path: string): any {
    // Handle nested object paths like 'user.name' or 'course.title'
    if (path.includes('.')) {
      return path.split('.').reduce((o, p) => o?.[p], obj);
    }
    return obj[path];
  }

  static async exportReport(
    type: 'csv' | 'excel' | 'pdf',
    tabName: string,
    data: any[],
    headers: string[],
    metadata?: any
  ) {
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `FNE-Reporte-${tabName}-${timestamp}`;
    
    const exportData: ExportData = {
      filename,
      title: `Reporte FNE - ${tabName}`,
      headers,
      data,
      metadata: {
        ...metadata,
        generatedBy: 'Sistema Genera',
        totalRecords: data.length,
      }
    };

    try {
      switch (type) {
        case 'csv':
          this.exportToCSV(exportData);
          break;
        case 'excel':
          this.exportToExcel(exportData);
          break;
        case 'pdf':
          this.exportToPDF(exportData);
          break;
        default:
          throw new Error('Tipo de exportación no soportado');
      }
      
      return { success: true, message: `Reporte exportado como ${type.toUpperCase()}` };
    } catch (error) {
      console.error('Export error:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Error al exportar reporte' 
      };
    }
  }
}