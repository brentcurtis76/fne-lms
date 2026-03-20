/**
 * Client-side PDF generator for propuestas web view.
 * Uses jsPDF + jspdf-autotable with GENERA brand kit.
 */
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { ProposalSnapshot } from './snapshot';

// Brand Kit
const primaryColor: [number, number, number] = [10, 10, 10]; // #0a0a0a
const accentColor: [number, number, number] = [251, 191, 36]; // #fbbf24
const textColor: [number, number, number] = [31, 31, 31]; // #1f1f1f
const mutedText: [number, number, number] = [107, 114, 128]; // #6b7280
const dividerColor: [number, number, number] = [209, 213, 219]; // #d1d5db
const neutralBg: [number, number, number] = [246, 247, 249]; // #f6f7f9

// Extend jsPDF type for autoTable (uses `any` to match existing declaration in jspdfWrapper.ts)
declare module 'jspdf' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}

// Month names in Spanish
const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function generateProposalPDF(snapshot: ProposalSnapshot): void {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 56;
  const contentWidth = pageWidth - margin * 2;
  const footerHeight = 50;

  let cursorY = margin;

  // Track section page numbers for TOC
  const sectionPages: { title: string; page: number }[] = [];

  // ─── Helpers ───────────────────────────────────────────

  const ensureSpace = (height: number) => {
    if (cursorY + height > pageHeight - margin - footerHeight) {
      pdf.addPage();
      cursorY = margin;
    }
  };

  const addFooter = () => {
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      const footerY = pageHeight - margin + 10;

      // Yellow accent line
      pdf.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
      pdf.setLineWidth(1.5);
      pdf.line(margin, footerY - 16, pageWidth - margin, footerY - 16);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);

      // Left
      pdf.text('GENERA — Fundación Nueva Educación', margin, footerY);
      // Center
      pdf.text('contacto@fundacionnuevaeducacion.com', pageWidth / 2, footerY, {
        align: 'center',
      });
      // Right — page number
      pdf.text(`${i} / ${totalPages}`, pageWidth - margin, footerY, {
        align: 'right',
      });
    }
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(50);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.text(title.toUpperCase(), margin, cursorY);
    cursorY += 6;

    // Yellow accent underline
    pdf.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
    pdf.setLineWidth(2);
    pdf.line(margin, cursorY, margin + 60, cursorY);
    cursorY += 20;
  };

  const drawParagraph = (text: string) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
    const lines = pdf.splitTextToSize(text, contentWidth);
    lines.forEach((line: string) => {
      ensureSpace(16);
      pdf.text(line, margin, cursorY);
      cursorY += 14;
    });
    cursorY += 6;
  };

  const drawBulletList = (items: string[]) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    items.forEach((item) => {
      const lines = pdf.splitTextToSize(item, contentWidth - 20);
      ensureSpace(lines.length * 14 + 4);
      // Yellow bullet
      pdf.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
      pdf.circle(margin + 4, cursorY - 3, 2.5, 'F');
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      lines.forEach((line: string, idx: number) => {
        pdf.text(line, margin + 14, cursorY + idx * 14);
      });
      cursorY += lines.length * 14 + 4;
    });
    cursorY += 4;
  };

  const drawDefinitionCell = (
    label: string,
    value: string,
    x: number,
    y: number,
    width: number
  ) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
    pdf.text(label.toUpperCase(), x, y);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
    const lines = pdf.splitTextToSize(value, width);
    lines.forEach((line: string, index: number) => {
      pdf.text(line, x, y + 14 + index * 13);
    });
    return 14 + (lines.length - 1) * 13 + 16;
  };

  const recordSection = (title: string) => {
    sectionPages.push({ title, page: pdf.getNumberOfPages() });
  };

  // ─── 1. COVER PAGE ────────────────────────────────────

  // Dark background
  pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  // GENERA text with manual letter-spacing
  const generaLetters = 'G E N E R A';
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(36);
  pdf.setTextColor(255, 255, 255);
  pdf.text(generaLetters, margin, pageHeight * 0.3);

  // Tagline
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  pdf.text('HUB DE TRANSFORMACIÓN EDUCATIVA', margin, pageHeight * 0.3 + 24);

  // Yellow accent line
  pdf.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
  pdf.setLineWidth(3);
  pdf.line(margin, pageHeight * 0.3 + 40, margin + 80, pageHeight * 0.3 + 40);

  // Program name
  const programLabel =
    snapshot.type === 'evoluciona' ? 'PROGRAMA EVOLUCIONA' : 'PROGRAMA PREPARACIÓN';
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  pdf.text(programLabel, margin, pageHeight * 0.45);

  // Service name
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(24);
  pdf.setTextColor(255, 255, 255);
  const serviceLines = pdf.splitTextToSize(snapshot.serviceName, contentWidth);
  serviceLines.forEach((line: string, i: number) => {
    pdf.text(line, margin, pageHeight * 0.45 + 28 + i * 28);
  });

  // School name
  const schoolY = pageHeight * 0.45 + 28 + serviceLines.length * 28 + 16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(14);
  pdf.setTextColor(200, 200, 200);
  pdf.text(snapshot.schoolName, margin, schoolY);

  // Year and version
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  pdf.text(`${snapshot.programYear}`, margin, schoolY + 22);
  pdf.text(`Versión ${snapshot.version}`, margin, schoolY + 38);

  // ─── 2. TABLE OF CONTENTS ─────────────────────────────

  pdf.addPage();
  cursorY = margin;
  recordSection('Índice');

  drawSectionTitle('Índice');

  // We'll build TOC entries as we go and fill page numbers at the end.
  // For now, define the fixed section names.
  const tocEntries = [
    'Sobre Fundación Nueva Educación',
    'Equipo de Consultoría',
    'Contenidos del Programa',
    'Distribución de Módulos y Horas',
    'Propuesta Económica',
    'Documentos de Apoyo',
  ];

  const tocStartY = cursorY;
  tocEntries.forEach((entry, idx) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
    const y = tocStartY + idx * 28;
    // Number
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    pdf.text(`${String(idx + 1).padStart(2, '0')}`, margin, y);
    // Title
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
    pdf.text(entry, margin + 30, y);
    // Dotted line
    pdf.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
    pdf.setLineDashPattern([1, 3], 0);
    pdf.line(margin + 30 + pdf.getTextWidth(entry) + 8, y, pageWidth - margin - 30, y);
    pdf.setLineDashPattern([], 0);
  });
  cursorY = tocStartY + tocEntries.length * 28 + 20;

  // ─── 3. ABOUT FNE ─────────────────────────────────────

  pdf.addPage();
  cursorY = margin;
  recordSection('Sobre Fundación Nueva Educación');

  drawSectionTitle('Sobre Fundación Nueva Educación');

  drawParagraph(
    'Desde 2018, la Fundación Nueva Educación trabaja por la transformación de comunidades educativas a través de la formación docente, el liderazgo escolar y la innovación pedagógica. Con más de 6 años de experiencia, acompañamos a colegios en su proceso de mejora continua.'
  );

  drawParagraph(
    'Nuestro equipo de consultores expertos diseña programas a medida que responden a las necesidades específicas de cada comunidad educativa, combinando metodologías probadas con enfoques innovadores.'
  );

  // Stats row
  ensureSpace(70);
  const statWidth = contentWidth / 3;
  const stats = [
    { value: '6+', label: 'Años de experiencia' },
    { value: '3', label: 'Países' },
    { value: '100+', label: 'Colegios acompañados' },
  ];
  stats.forEach((stat, idx) => {
    const x = margin + idx * statWidth;
    // Background rect
    pdf.setFillColor(neutralBg[0], neutralBg[1], neutralBg[2]);
    pdf.roundedRect(x, cursorY, statWidth - 12, 56, 6, 6, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    pdf.text(stat.value, x + (statWidth - 12) / 2, cursorY + 24, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
    pdf.text(stat.label, x + (statWidth - 12) / 2, cursorY + 42, { align: 'center' });
  });
  cursorY += 76;

  // ─── 4. CONSULTING TEAM ───────────────────────────────

  pdf.addPage();
  cursorY = margin;
  recordSection('Equipo de Consultoría');

  drawSectionTitle('Equipo de Consultoría');

  snapshot.consultants.forEach((consultant) => {
    const bioLines = pdf.splitTextToSize(consultant.bio || '', contentWidth - 20);
    const blockHeight = 24 + bioLines.length * 13 + 20;
    ensureSpace(blockHeight);

    // Name
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.text(consultant.nombre, margin, cursorY);
    cursorY += 16;

    // Title
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(10);
    pdf.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    pdf.text(consultant.titulo, margin, cursorY);
    cursorY += 16;

    // Bio
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
    bioLines.forEach((line: string) => {
      ensureSpace(16);
      pdf.text(line, margin, cursorY);
      cursorY += 13;
    });

    // Specialties
    if (consultant.especialidades && consultant.especialidades.length > 0) {
      cursorY += 4;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
      pdf.text('ESPECIALIDADES:', margin, cursorY);
      cursorY += 12;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      const specText = consultant.especialidades.join(' · ');
      const specLines = pdf.splitTextToSize(specText, contentWidth);
      specLines.forEach((line: string) => {
        ensureSpace(14);
        pdf.text(line, margin, cursorY);
        cursorY += 12;
      });
    }

    // Separator
    cursorY += 8;
    pdf.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
    pdf.setLineWidth(0.5);
    pdf.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 16;
  });

  // ─── 5. CONTENT BLOCKS ────────────────────────────────

  pdf.addPage();
  cursorY = margin;
  recordSection('Contenidos del Programa');

  snapshot.contentBlocks.forEach((block, blockIdx) => {
    if (blockIdx > 0) {
      // New page for each major block
      pdf.addPage();
      cursorY = margin;
    }

    drawSectionTitle(block.titulo);

    if (block.contenido && block.contenido.sections) {
      block.contenido.sections.forEach((section) => {
        switch (section.type) {
          case 'heading': {
            ensureSpace(30);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(section.level && section.level <= 2 ? 12 : 11);
            pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            pdf.text((section.text || '').toUpperCase(), margin, cursorY);
            cursorY += 20;
            break;
          }
          case 'paragraph': {
            drawParagraph(section.text || '');
            break;
          }
          case 'list': {
            if (section.items && section.items.length > 0) {
              drawBulletList(section.items);
            }
            break;
          }
          case 'image': {
            // Skip images in PDF — text-focused document
            break;
          }
        }
      });
    }
  });

  // ─── 6. MODULES & HOURS TABLE ─────────────────────────

  pdf.addPage();
  cursorY = margin;
  recordSection('Distribución de Módulos y Horas');

  drawSectionTitle('Distribución de Módulos y Horas');

  const tableHead = [['Módulo', 'Presencial', 'Sincrónica', 'Asincrónica', 'Total', 'Mes']];
  const tableBody = snapshot.modules.map((m) => [
    m.nombre,
    String(m.horas_presenciales),
    String(m.horas_sincronicas),
    String(m.horas_asincronicas),
    String(m.horas_presenciales + m.horas_sincronicas + m.horas_asincronicas),
    m.mes ? MONTH_NAMES[m.mes] || '' : '',
  ]);

  // Summary row
  tableBody.push([
    'TOTAL',
    String(snapshot.horasPresenciales),
    String(snapshot.horasSincronicas),
    String(snapshot.horasAsincronicas),
    String(snapshot.totalHours),
    '',
  ]);

  pdf.autoTable({
    head: tableHead,
    body: tableBody,
    startY: cursorY,
    margin: { left: margin, right: margin },
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 8,
      textColor: textColor,
      lineColor: dividerColor,
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: neutralBg,
    },
    // Style the last row (TOTAL) differently
    didParseCell: (data: { row: { index: number }; section: string; cell: { styles: Record<string, unknown> } }) => {
      if (data.section === 'body' && data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [accentColor[0], accentColor[1], accentColor[2]];
        data.cell.styles.textColor = [primaryColor[0], primaryColor[1], primaryColor[2]];
      }
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 60 },
      2: { halign: 'center', cellWidth: 60 },
      3: { halign: 'center', cellWidth: 65 },
      4: { halign: 'center', cellWidth: 50 },
      5: { halign: 'center', cellWidth: 70 },
    },
  });

  cursorY = pdf.lastAutoTable.finalY + 20;

  // Hours summary below table
  ensureSpace(80);
  const summaryItems = [
    { label: 'Horas Presenciales', value: String(snapshot.horasPresenciales) },
    { label: 'Horas Sincrónicas', value: String(snapshot.horasSincronicas) },
    { label: 'Horas Asincrónicas', value: String(snapshot.horasAsincronicas) },
    { label: 'Total Horas', value: String(snapshot.totalHours) },
  ];
  const colW = contentWidth / 4;
  summaryItems.forEach((item, idx) => {
    const x = margin + idx * colW;
    drawDefinitionCell(item.label, item.value, x, cursorY, colW - 10);
  });
  cursorY += 50;

  // ─── 7. ECONOMIC PROPOSAL ─────────────────────────────

  pdf.addPage();
  cursorY = margin;
  recordSection('Propuesta Económica');

  drawSectionTitle('Propuesta Económica');

  // Hours summary
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  pdf.text('RESUMEN DE HORAS', margin, cursorY);
  cursorY += 18;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
  pdf.text(`Total de horas del programa: ${snapshot.totalHours} horas`, margin, cursorY);
  cursorY += 28;

  // Pricing mode
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  pdf.text('MODALIDAD DE PRECIO', margin, cursorY);
  cursorY += 18;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(textColor[0], textColor[1], textColor[2]);

  let totalUf: number;
  if (snapshot.pricing.mode === 'per_hour') {
    pdf.text(`Valor por hora: ${snapshot.pricing.precioUf} UF`, margin, cursorY);
    cursorY += 16;
    totalUf = snapshot.pricing.precioUf * snapshot.pricing.totalHours;
    pdf.text(`${snapshot.pricing.precioUf} UF × ${snapshot.pricing.totalHours} horas`, margin, cursorY);
    cursorY += 28;
  } else {
    totalUf = snapshot.pricing.fixedUf ?? 0;
    pdf.text(`Valor fijo del programa: ${totalUf} UF`, margin, cursorY);
    cursorY += 28;
  }

  // Grand total with yellow background
  ensureSpace(60);
  pdf.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  pdf.roundedRect(margin, cursorY, contentWidth, 48, 6, 6, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  pdf.text('INVERSIÓN TOTAL', margin + 16, cursorY + 20);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(`${totalUf.toLocaleString('es-CL')} UF`, pageWidth - margin - 16, cursorY + 22, {
    align: 'right',
  });

  cursorY += 68;

  // Payment terms
  if (snapshot.pricing.formaPago) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
    pdf.text('FORMA DE PAGO', margin, cursorY);
    cursorY += 18;
    drawParagraph(snapshot.pricing.formaPago);
  }

  // ─── 8. SUPPORTING DOCUMENTS ──────────────────────────

  if (snapshot.documents.length > 0) {
    pdf.addPage();
    cursorY = margin;
    recordSection('Documentos de Apoyo');

    drawSectionTitle('Documentos de Apoyo');

    drawParagraph(
      'Los siguientes documentos complementan esta propuesta y están disponibles para descarga en la versión web.'
    );

    const docHead = [['Documento', 'Tipo']];
    const docBody = snapshot.documents.map((d) => [d.nombre, d.tipo]);

    pdf.autoTable({
      head: docHead,
      body: docBody,
      startY: cursorY,
      margin: { left: margin, right: margin },
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: 10,
        textColor: textColor,
        lineColor: dividerColor,
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: neutralBg,
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 120, halign: 'center' },
      },
    });

    cursorY = pdf.lastAutoTable.finalY + 20;
  }

  // ─── 9. FOOTERS ───────────────────────────────────────

  addFooter();

  // ─── UPDATE TOC PAGE NUMBERS ──────────────────────────

  // Go back to TOC page (page 2) and add page numbers
  pdf.setPage(2);
  sectionPages.forEach((section, idx) => {
    // Skip the "Índice" entry itself
    if (section.title === 'Índice') return;
    const tocIdx = tocEntries.indexOf(section.title);
    if (tocIdx === -1) return;
    const y = tocStartY + tocIdx * 28;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.text(String(section.page), pageWidth - margin, y, { align: 'right' });
  });

  // ─── SAVE ─────────────────────────────────────────────

  const sanitizedSchool = snapshot.schoolName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').replace(/\s+/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `Propuesta_${sanitizedSchool}_${snapshot.type}_v${snapshot.version}_${dateStr}.pdf`;
  pdf.save(fileName);
}
