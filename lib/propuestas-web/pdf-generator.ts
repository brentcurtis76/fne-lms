/**
 * Client-side PDF generator — elegant print-ready proposal.
 *
 * Design: Swiss corporate style. White backgrounds, dark text, gold accents
 * used only as thin rules and small labels. Optimized for A4 printing and filing.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProposalSnapshot } from './snapshot';

// ─── Color palette (restrained — print-friendly) ────────────────────
const ink: [number, number, number] = [24, 24, 24];
const gold: [number, number, number] = [190, 150, 50]; // muted gold for print
const gray: [number, number, number] = [120, 120, 120];
const lightGray: [number, number, number] = [200, 200, 200];
const faintBg: [number, number, number] = [248, 248, 246];
const white: [number, number, number] = [255, 255, 255];

// Month names in Spanish
const MES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Extend jsPDF for autoTable
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}

export function generateProposalPDF(snapshot: ProposalSnapshot): void {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();   // 595.28
  const H = pdf.internal.pageSize.getHeight();  // 841.89
  const M = 60;                                  // generous margin
  const CW = W - M * 2;                         // content width
  const footerZone = 44;

  let Y = M;

  // TOC tracking
  const toc: { title: string; page: number }[] = [];
  const recordTOC = (title: string) => toc.push({ title, page: pdf.getNumberOfPages() });

  // ─── Helpers ──────────────────────────────────────────────────────

  /** Break to new page if not enough room */
  const need = (h: number) => {
    if (Y + h > H - M - footerZone) {
      pdf.addPage();
      Y = M;
    }
  };

  /** Thin gold rule across full width */
  const goldRule = (y: number, length?: number) => {
    pdf.setDrawColor(...gold);
    pdf.setLineWidth(0.75);
    pdf.line(M, y, M + (length ?? CW), y);
  };

  /** Thin gray rule */
  const grayRule = (y: number) => {
    pdf.setDrawColor(...lightGray);
    pdf.setLineWidth(0.5);
    pdf.line(M, y, W - M, y);
  };

  /** Section heading — elegant, restrained */
  const sectionHead = (title: string, sub?: string) => {
    need(60);
    goldRule(Y, 40);
    Y += 18;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(...ink);
    pdf.text(title, M, Y);
    Y += 6;
    if (sub) {
      Y += 10;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...gray);
      pdf.text(sub, M, Y);
    }
    Y += 22;
  };

  /** Body text — wraps to content width, returns lines used */
  const body = (text: string, maxW?: number): number => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...ink);
    const lines: string[] = pdf.splitTextToSize(text, maxW ?? CW);
    for (const line of lines) {
      need(14);
      pdf.text(line, M, Y);
      Y += 13;
    }
    Y += 5;
    return lines.length;
  };

  /** Small label text */
  const label = (text: string, x?: number) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...gray);
    pdf.text(text.toUpperCase(), x ?? M, Y);
  };

  /** Bullet list with thin gold dots */
  const bullets = (items: string[]) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    for (const item of items) {
      const lines: string[] = pdf.splitTextToSize(item, CW - 16);
      need(lines.length * 13 + 6);
      pdf.setFillColor(...gold);
      pdf.circle(M + 3, Y - 2.5, 1.5, 'F');
      pdf.setTextColor(...ink);
      for (let i = 0; i < lines.length; i++) {
        pdf.text(lines[i], M + 12, Y + i * 13);
      }
      Y += lines.length * 13 + 4;
    }
    Y += 4;
  };

  /** Add footers to all pages (called at end) */
  const addFooters = () => {
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      const fY = H - M + 12;
      // Skip footer on cover (page 1)
      if (p === 1) continue;

      pdf.setDrawColor(...lightGray);
      pdf.setLineWidth(0.5);
      pdf.line(M, fY - 14, W - M, fY - 14);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...gray);
      pdf.text('Fundación Nueva Educación', M, fY);
      pdf.text('info@nuevaeducacion.org', W / 2, fY, { align: 'center' });
      pdf.text(`${p}`, W - M, fY, { align: 'right' });
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 1. COVER PAGE — white, elegant, restrained
  // ═══════════════════════════════════════════════════════════════════

  // Top gold accent line
  goldRule(M, 50);

  // "GENERA" brand
  Y = M + 30;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...gold);
  pdf.text('FUNDACIÓN NUEVA EDUCACIÓN', M, Y);
  Y += 14;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...gray);
  pdf.text('Hub de Transformación Educativa', M, Y);

  // Main title block — centered vertically
  const programLabel =
    snapshot.type === 'evoluciona' ? 'Programa Evoluciona' : 'Programa Preparación';

  Y = H * 0.35;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...gold);
  pdf.text(programLabel.toUpperCase(), M, Y);

  Y += 24;
  goldRule(Y, 50);
  Y += 24;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(28);
  pdf.setTextColor(...ink);
  const titleLines: string[] = pdf.splitTextToSize(snapshot.serviceName, CW);
  for (const line of titleLines) {
    pdf.text(line, M, Y);
    Y += 34;
  }

  Y += 12;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(13);
  pdf.setTextColor(...gray);
  pdf.text(snapshot.schoolName, M, Y);

  Y += 24;
  pdf.setFontSize(10);
  pdf.setTextColor(...lightGray);
  pdf.text(`${snapshot.programYear}  ·  Versión ${snapshot.version}`, M, Y);

  // Destinatarios at bottom
  if (snapshot.destinatarios && snapshot.destinatarios.length > 0) {
    Y = H - M - 80;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...gray);
    pdf.text('DIRIGIDO A', M, Y);
    Y += 14;
    pdf.setFontSize(9);
    pdf.setTextColor(...ink);
    pdf.text(snapshot.destinatarios.join('  ·  '), M, Y);
  }

  // Bottom gold line
  goldRule(H - M, CW);

  // ═══════════════════════════════════════════════════════════════════
  // 2. TABLE OF CONTENTS
  // ═══════════════════════════════════════════════════════════════════

  pdf.addPage();
  Y = M;

  sectionHead('Índice');

  const tocNames = [
    'Sobre Fundación Nueva Educación',
    'Equipo de Consultoría',
    'Contenidos del Programa',
    'Propuesta Económica',
    'Documentos de Apoyo',
  ];

  const tocStartY = Y;
  for (let i = 0; i < tocNames.length; i++) {
    const yy = tocStartY + i * 26;
    // Number
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...gold);
    pdf.text(String(i + 1).padStart(2, '0'), M, yy);
    // Title
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...ink);
    pdf.text(tocNames[i], M + 24, yy);
    // Dot leader
    const tw = pdf.getTextWidth(tocNames[i]);
    pdf.setDrawColor(...lightGray);
    pdf.setLineDashPattern([1, 3], 0);
    pdf.line(M + 24 + tw + 6, yy, W - M - 24, yy);
    pdf.setLineDashPattern([], 0);
  }
  Y = tocStartY + tocNames.length * 26 + 20;

  // ═══════════════════════════════════════════════════════════════════
  // 3. ABOUT FNE
  // ═══════════════════════════════════════════════════════════════════

  pdf.addPage();
  Y = M;
  recordTOC('Sobre Fundación Nueva Educación');

  sectionHead('Sobre Fundación Nueva Educación', 'Transformando comunidades educativas desde 2018');

  body(
    'Desde 2018, la Fundación Nueva Educación trabaja por la transformación de comunidades educativas a través de la formación docente, el liderazgo escolar y la innovación pedagógica. Con más de 6 años de experiencia, acompañamos a colegios en su proceso de mejora continua.'
  );
  body(
    'Nuestro equipo de consultores expertos diseña programas a medida que responden a las necesidades específicas de cada comunidad educativa, combinando metodologías probadas con enfoques innovadores.'
  );

  // Stats — compact three-column
  need(60);
  Y += 8;
  grayRule(Y);
  Y += 18;
  const statsData = [
    { v: '6+', l: 'Años de experiencia' },
    { v: '3', l: 'Países' },
    { v: '100+', l: 'Colegios acompañados' },
  ];
  const sw = CW / 3;
  for (let i = 0; i < 3; i++) {
    const x = M + i * sw;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.setTextColor(...gold);
    pdf.text(statsData[i].v, x + sw / 2, Y, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...gray);
    pdf.text(statsData[i].l.toUpperCase(), x + sw / 2, Y + 16, { align: 'center' });
  }
  Y += 40;
  grayRule(Y);
  Y += 20;

  // ═══════════════════════════════════════════════════════════════════
  // 4. CONSULTING TEAM — compact, multi-per-page
  // ═══════════════════════════════════════════════════════════════════

  pdf.addPage();
  Y = M;
  recordTOC('Equipo de Consultoría');

  sectionHead('Equipo de Consultoría', `${snapshot.consultants.length} profesionales asignados`);

  for (const c of snapshot.consultants) {
    const bioLines: string[] = pdf.splitTextToSize(c.bio || '', CW - 4);
    const blockH = 20 + 14 + bioLines.length * 12 + (c.especialidades?.length ? 24 : 0) + 20;
    need(blockH);

    // Name
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...ink);
    pdf.text(c.nombre, M, Y);
    Y += 14;

    // Title
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...gold);
    pdf.text(c.titulo, M, Y);
    Y += 14;

    // Bio
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...gray);
    for (const line of bioLines) {
      need(13);
      pdf.text(line, M, Y);
      Y += 12;
    }

    // Specialties inline
    if (c.especialidades && c.especialidades.length > 0) {
      Y += 4;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...gray);
      const specText = c.especialidades.join('  ·  ');
      const specLines: string[] = pdf.splitTextToSize(specText, CW);
      for (const sl of specLines) {
        need(12);
        pdf.text(sl, M, Y);
        Y += 11;
      }
    }

    // Separator
    Y += 8;
    grayRule(Y);
    Y += 14;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5. CONTENT BLOCKS — continuous flow, not one-per-page
  // ═══════════════════════════════════════════════════════════════════

  pdf.addPage();
  Y = M;
  recordTOC('Contenidos del Programa');

  for (let bi = 0; bi < snapshot.contentBlocks.length; bi++) {
    const block = snapshot.contentBlocks[bi];

    // Section title for each block — but stay on same page if room
    need(60);
    if (bi > 0) {
      Y += 10;
      grayRule(Y);
      Y += 20;
    }

    // Block title with gold accent
    goldRule(Y, 30);
    Y += 16;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...ink);
    const blockTitleLines: string[] = pdf.splitTextToSize(block.titulo, CW);
    for (const line of blockTitleLines) {
      pdf.text(line, M, Y);
      Y += 16;
    }
    Y += 10;

    // Render content sections
    if (block.contenido?.sections) {
      for (const section of block.contenido.sections) {
        switch (section.type) {
          case 'heading': {
            need(28);
            Y += 6;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(section.level && section.level <= 2 ? 11 : 10);
            pdf.setTextColor(...ink);
            pdf.text(section.text || '', M, Y);
            Y += 16;
            break;
          }
          case 'paragraph': {
            body(section.text || '');
            break;
          }
          case 'list': {
            if (section.items?.length) {
              bullets(section.items);
            }
            break;
          }
          case 'image':
            // Skip images — text-focused print document
            break;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 6. ECONOMIC PROPOSAL — total only, no per-hour breakdown
  // ═══════════════════════════════════════════════════════════════════

  pdf.addPage();
  Y = M;
  recordTOC('Propuesta Económica');

  sectionHead('Propuesta Económica');

  // Calculate total without exposing per-hour rate
  let totalUf: number;
  if (snapshot.pricing.mode === 'per_hour') {
    totalUf = snapshot.pricing.precioUf * snapshot.pricing.totalHours;
  } else {
    totalUf = snapshot.pricing.fixedUf ?? 0;
  }

  // Total hours summary
  label('Programa');
  Y += 14;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...ink);
  pdf.text(`${snapshot.totalHours} horas totales de acompañamiento`, M, Y);
  Y += 26;

  // Grand total — gold bordered box, white fill
  need(60);
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(1.5);
  pdf.setFillColor(...white);
  pdf.roundedRect(M, Y, CW, 50, 4, 4, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...gray);
  pdf.text('INVERSIÓN TOTAL', M + 16, Y + 22);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(...ink);
  pdf.text(`${totalUf.toFixed(2)} UF`, W - M - 16, Y + 24, { align: 'right' });

  Y += 70;

  // Payment terms
  if (snapshot.pricing.formaPago) {
    label('Forma de pago');
    Y += 14;
    body(snapshot.pricing.formaPago);
  }

  // Payment details
  if (snapshot.pricing.formaPagoDetalle) {
    label('Detalle de pago');
    Y += 14;
    body(snapshot.pricing.formaPagoDetalle);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 8. SUPPORTING DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════

  if (snapshot.documents.length > 0) {
    pdf.addPage();
    Y = M;
    recordTOC('Documentos de Apoyo');

    sectionHead('Documentos de Apoyo', 'Disponibles para descarga en la versión web de esta propuesta');

    const dHead = [['Documento', 'Tipo']];
    const dBody = snapshot.documents.map((d) => [d.nombre, d.tipo.replace(/_/g, ' ')]);

    autoTable(pdf, {
      head: dHead,
      body: dBody,
      startY: Y,
      margin: { left: M, right: M },
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 9,
        textColor: ink,
        lineColor: lightGray,
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: faintBg,
        textColor: ink,
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: white },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 130, halign: 'center' },
      },
    });

    Y = (pdf as any).lastAutoTable.finalY + 20;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 9. FOOTERS + TOC PAGE NUMBERS
  // ═══════════════════════════════════════════════════════════════════

  addFooters();

  // Fill in TOC page numbers on page 2
  pdf.setPage(2);
  for (const entry of toc) {
    const idx = tocNames.indexOf(entry.title);
    if (idx === -1) continue;
    const yy = tocStartY + idx * 26;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...ink);
    pdf.text(String(entry.page), W - M, yy, { align: 'right' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════════════════════════

  const safeName = snapshot.schoolName
    .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '')
    .replace(/\s+/g, '_');
  const date = new Date().toISOString().slice(0, 10);
  pdf.save(`Propuesta_${safeName}_${snapshot.type}_v${snapshot.version}_${date}.pdf`);
}
