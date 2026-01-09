import * as XLSX from 'xlsx';

interface ExpenseCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  is_active: boolean;
}

interface ExpenseItem {
  id: string;
  report_id: string;
  category_id: string;
  description: string;
  amount: number;
  original_amount?: number;
  currency?: 'CLP' | 'USD' | 'EUR';
  conversion_rate?: number;
  conversion_date?: string;
  expense_date: string;
  vendor?: string;
  expense_number?: string;
  receipt_url?: string;
  receipt_filename?: string;
  notes?: string;
  expense_categories?: ExpenseCategory;
}

interface ExpenseReport {
  id: string;
  report_name: string;
  description?: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  total_amount: number;
  submitted_by: string;
  submitted_at?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_comments?: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  expense_items?: ExpenseItem[];
}

export class ExpenseReportExporter {
  private static formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  private static formatCurrency(amount: number): string {
    return `$${amount.toLocaleString('es-CL')}`;
  }

  private static getStatusText(status: string): string {
    switch (status) {
      case 'draft': return 'Borrador';
      case 'submitted': return 'Enviado';
      case 'approved': return 'Aprobado';
      case 'rejected': return 'Rechazado';
      default: return status;
    }
  }

  static async exportToPDF(report: ExpenseReport): Promise<void> {
    // Dynamic import for client-side only
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    
    const doc = new jsPDF();
    
    // FNE Brand colors
    const navyBlue: [number, number, number] = [0, 54, 91];
    const yellow: [number, number, number] = [253, 185, 51];
    const gray: [number, number, number] = [232, 229, 226];
    
    // Document header
    doc.setFillColor(...navyBlue);
    doc.rect(0, 0, 210, 40, 'F');
    
    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE GASTOS', 105, 20, { align: 'center' });
    
    // Report name
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(report.report_name.toUpperCase(), 105, 30, { align: 'center' });
    
    // Report info section
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    let yPos = 50;
    
    // Left column
    doc.setFont('helvetica', 'bold');
    doc.text('Información del Reporte', 14, yPos);
    yPos += 8;
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Estado: ${this.getStatusText(report.status)}`, 14, yPos);
    yPos += 6;
    doc.text(`Período: ${this.formatDate(report.start_date)} - ${this.formatDate(report.end_date)}`, 14, yPos);
    yPos += 6;
    doc.text(`Total: ${this.formatCurrency(report.total_amount)}`, 14, yPos);
    yPos += 6;
    if (report.description) {
      doc.text(`Descripción: ${report.description}`, 14, yPos);
      yPos += 6;
    }
    
    // Right column
    yPos = 58;
    doc.text(`Enviado por: ${report.profiles?.first_name} ${report.profiles?.last_name}`, 110, yPos);
    yPos += 6;
    doc.text(`Email: ${report.profiles?.email}`, 110, yPos);
    yPos += 6;
    doc.text(`Fecha de creación: ${this.formatDate(report.created_at)}`, 110, yPos);
    yPos += 6;
    if (report.submitted_at) {
      doc.text(`Fecha de envío: ${this.formatDate(report.submitted_at)}`, 110, yPos);
      yPos += 6;
    }
    
    // Add space before table
    yPos += 10;
    
    // Expense items table
    if (report.expense_items && report.expense_items.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Detalle de Gastos', 14, yPos);
      yPos += 8;
      
      const tableData = report.expense_items.map(item => [
        this.formatDate(item.expense_date),
        item.expense_categories?.name || 'Sin categoría',
        item.description,
        item.vendor || '-',
        item.expense_number || '-',
        this.formatCurrency(item.amount),
        item.receipt_filename ? 'Sí' : 'No'
      ]);
      
      autoTable(doc, {
        head: [['Fecha', 'Categoría', 'Descripción', 'Proveedor', 'N° Factura', 'Monto', 'Boleta']],
        body: tableData,
        startY: yPos,
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: navyBlue,
          textColor: 255,
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [248, 249, 250],
        },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 30 },
          2: { cellWidth: 45 },
          3: { cellWidth: 30 },
          4: { cellWidth: 25 },
          5: { cellWidth: 25, halign: 'right' },
          6: { cellWidth: 15, halign: 'center' }
        },
        foot: [[
          'TOTAL',
          '',
          '',
          '',
          '',
          this.formatCurrency(report.total_amount),
          ''
        ]],
        footStyles: {
          fillColor: navyBlue,
          textColor: 255,
          fontStyle: 'bold',
        },
      });
      
      // Summary by category
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      
      if (finalY < 250) { // Check if there's space on current page
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Resumen por Categoría', 14, finalY);
        
        const categoryTotals = report.expense_items.reduce((acc, item) => {
          const categoryName = item.expense_categories?.name || 'Sin categoría';
          if (!acc[categoryName]) {
            acc[categoryName] = { total: 0, count: 0 };
          }
          acc[categoryName].total += item.amount;
          acc[categoryName].count += 1;
          return acc;
        }, {} as Record<string, { total: number; count: number }>);
        
        const summaryData = Object.entries(categoryTotals).map(([category, data]) => [
          category,
          data.count.toString(),
          this.formatCurrency(data.total)
        ]);
        
        autoTable(doc, {
          head: [['Categoría', 'Cantidad', 'Total']],
          body: summaryData,
          startY: finalY + 8,
          styles: {
            fontSize: 9,
            cellPadding: 2,
          },
          headStyles: {
            fillColor: navyBlue,
            textColor: 255,
            fontStyle: 'bold',
          },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 30, halign: 'center' },
            2: { cellWidth: 40, halign: 'right' }
          }
        });
      }
    }
    
    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Página ${i} de ${pageCount} - Generado el ${new Date().toLocaleString('es-CL')}`,
        105,
        290,
        { align: 'center' }
      );
    }
    
    // Save PDF
    const filename = `Reporte_Gastos_${report.report_name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  }

  static async exportToExcel(report: ExpenseReport): Promise<void> {
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Report summary sheet
    const summaryData = [
      ['REPORTE DE GASTOS'],
      [''],
      ['Información General'],
      ['Nombre del Reporte:', report.report_name],
      ['Estado:', this.getStatusText(report.status)],
      ['Período:', `${this.formatDate(report.start_date)} - ${this.formatDate(report.end_date)}`],
      ['Total:', this.formatCurrency(report.total_amount)],
      ['Descripción:', report.description || 'N/A'],
      [''],
      ['Información del Solicitante'],
      ['Nombre:', `${report.profiles?.first_name} ${report.profiles?.last_name}`],
      ['Email:', report.profiles?.email],
      ['Fecha de Creación:', this.formatDate(report.created_at)],
      ['Fecha de Envío:', report.submitted_at ? this.formatDate(report.submitted_at) : 'N/A'],
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Set column widths
    summarySheet['!cols'] = [
      { wch: 25 },
      { wch: 40 }
    ];
    
    // Merge title cell
    summarySheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }
    ];
    
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen');
    
    // Expense items sheet
    if (report.expense_items && report.expense_items.length > 0) {
      const itemsData = [
        ['Fecha', 'Categoría', 'Descripción', 'Proveedor', 'N° Factura/Boleta', 'Monto (CLP)', 'Tiene Boleta', 'Notas']
      ];
      
      report.expense_items.forEach(item => {
        itemsData.push([
          this.formatDate(item.expense_date),
          item.expense_categories?.name || 'Sin categoría',
          item.description,
          item.vendor || '',
          item.expense_number || '',
          item.amount.toString(),
          item.receipt_filename ? 'Sí' : 'No',
          item.notes || ''
        ]);
      });
      
      // Add total row
      itemsData.push([
        'TOTAL',
        '',
        '',
        '',
        '',
        report.total_amount.toString(),
        '',
        ''
      ]);
      
      const itemsSheet = XLSX.utils.aoa_to_sheet(itemsData);
      
      // Set column widths
      itemsSheet['!cols'] = [
        { wch: 12 },  // Fecha
        { wch: 20 },  // Categoría
        { wch: 35 },  // Descripción
        { wch: 20 },  // Proveedor
        { wch: 18 },  // N° Factura
        { wch: 15 },  // Monto
        { wch: 12 },  // Tiene Boleta
        { wch: 30 }   // Notas
      ];
      
      XLSX.utils.book_append_sheet(wb, itemsSheet, 'Gastos Detallados');
      
      // Category summary sheet
      const categoryTotals = report.expense_items.reduce((acc, item) => {
        const categoryName = item.expense_categories?.name || 'Sin categoría';
        if (!acc[categoryName]) {
          acc[categoryName] = { total: 0, count: 0 };
        }
        acc[categoryName].total += item.amount;
        acc[categoryName].count += 1;
        return acc;
      }, {} as Record<string, { total: number; count: number }>);
      
      const categoryData = [
        ['Resumen por Categoría'],
        [''],
        ['Categoría', 'Cantidad de Gastos', 'Total (CLP)']
      ];
      
      Object.entries(categoryTotals).forEach(([category, data]) => {
        categoryData.push([
          category,
          data.count.toString(),
          data.total.toString()
        ]);
      });
      
      categoryData.push([
        'TOTAL GENERAL',
        report.expense_items.length.toString(),
        report.total_amount.toString()
      ]);
      
      const categorySheet = XLSX.utils.aoa_to_sheet(categoryData);
      
      // Set column widths
      categorySheet['!cols'] = [
        { wch: 30 },
        { wch: 20 },
        { wch: 20 }
      ];
      
      // Merge title cell
      categorySheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }
      ];
      
      XLSX.utils.book_append_sheet(wb, categorySheet, 'Resumen Categorías');
    }
    
    // Generate filename and save
    const filename = `Reporte_Gastos_${report.report_name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  static async exportMultipleReportsToPDF(reports: ExpenseReport[]): Promise<void> {
    // Dynamic import for client-side only
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    
    const doc = new jsPDF();
    
    // FNE Brand colors
    const navyBlue: [number, number, number] = [0, 54, 91];
    
    // Document header
    doc.setFillColor(...navyBlue);
    doc.rect(0, 0, 210, 30, 'F');
    
    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DE REPORTES DE GASTOS', 105, 20, { align: 'center' });
    
    // Report summary
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const totalAmount = reports.reduce((sum, report) => sum + report.total_amount, 0);
    doc.text(`Total de reportes: ${reports.length}`, 14, 40);
    doc.text(`Monto total: ${this.formatCurrency(totalAmount)}`, 14, 46);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString('es-CL')}`, 14, 52);
    
    // Reports table
    const tableData = reports.map(report => [
      report.report_name,
      `${this.formatDate(report.start_date)} - ${this.formatDate(report.end_date)}`,
      this.getStatusText(report.status),
      `${report.profiles?.first_name} ${report.profiles?.last_name}`,
      this.formatCurrency(report.total_amount)
    ]);
    
    autoTable(doc, {
      head: [['Nombre del Reporte', 'Período', 'Estado', 'Enviado por', 'Total']],
      body: tableData,
      startY: 60,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: navyBlue,
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250],
      },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 45 },
        2: { cellWidth: 25 },
        3: { cellWidth: 40 },
        4: { cellWidth: 30, halign: 'right' }
      },
      foot: [[
        'TOTAL GENERAL',
        '',
        '',
        '',
        this.formatCurrency(totalAmount)
      ]],
      footStyles: {
        fillColor: navyBlue,
        textColor: 255,
        fontStyle: 'bold',
      },
    });
    
    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Página ${i} de ${pageCount} - Generado el ${new Date().toLocaleString('es-CL')}`,
        105,
        290,
        { align: 'center' }
      );
    }
    
    // Save PDF
    const filename = `Resumen_Reportes_Gastos_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  }

  static async exportMultipleReportsToExcel(reports: ExpenseReport[]): Promise<void> {
    const wb = XLSX.utils.book_new();
    
    // Summary sheet
    const totalAmount = reports.reduce((sum, report) => sum + report.total_amount, 0);
    const summaryData = [
      ['RESUMEN DE REPORTES DE GASTOS'],
      [''],
      ['Total de reportes:', reports.length],
      ['Monto total:', this.formatCurrency(totalAmount)],
      ['Fecha de generación:', new Date().toLocaleDateString('es-CL')],
      [''],
      ['Nombre del Reporte', 'Período', 'Estado', 'Enviado por', 'Email', 'Total (CLP)']
    ];
    
    reports.forEach(report => {
      summaryData.push([
        report.report_name,
        `${this.formatDate(report.start_date)} - ${this.formatDate(report.end_date)}`,
        this.getStatusText(report.status),
        `${report.profiles?.first_name} ${report.profiles?.last_name}`,
        report.profiles?.email || '',
        report.total_amount.toString()
      ]);
    });
    
    summaryData.push([
      'TOTAL GENERAL',
      '',
      '',
      '',
      '',
      totalAmount.toString()
    ]);
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Set column widths
    summarySheet['!cols'] = [
      { wch: 35 },
      { wch: 25 },
      { wch: 15 },
      { wch: 25 },
      { wch: 30 },
      { wch: 15 }
    ];
    
    // Merge title cell
    summarySheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }
    ];
    
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen');
    
    // Generate filename and save
    const filename = `Resumen_Reportes_Gastos_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }
}