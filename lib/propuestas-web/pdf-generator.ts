/**
 * Client-side PDF generator — elegant print-ready proposal.
 *
 * Design: Swiss corporate style. White backgrounds, dark text, gold accents
 * used only as thin rules and small labels. Optimized for US Letter printing and filing.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProposalSnapshot } from './snapshot';
import { INTERNATIONAL_ADVISORS } from './constants';
import { normalizeText, significantWords } from './text-utils';

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

// Bucket label maps (Spanish, matching web view)
const DIST_LABELS: Record<string, string> = {
  bloque: 'Taller',
  cadencia: 'Sesiones regulares',
  flexible: 'Flexible',
};
const MOD_LABELS: Record<string, string> = {
  presencial: 'Presencial',
  online: 'Online',
  asincronico: 'Asincrónico',
  hibrido: 'Híbrido',
};

const PROGRAM_MONTHS = 8;
const ACTIVE_SENTINEL = '__ACTIVE__';


/**
 * Check if a content block heading is redundant with its block title.
 * Returns true when the heading is an exact match, a substring, or has
 * ≥50% word overlap (using the longer word list as denominator to avoid
 * false positives with short titles).
 */
export function isHeadingRedundant(blockTitle: string, headingText: string): boolean {
  const titleNorm = normalizeText(blockTitle);
  const headingNorm = normalizeText(headingText);

  if (!titleNorm || !headingNorm) return false;

  // Exact match
  if (headingNorm === titleNorm) return true;

  // Substring match (either direction)
  if (titleNorm.includes(headingNorm) || headingNorm.includes(titleNorm)) return true;

  // Word overlap — denominator is max of both lengths to prevent short-title false positives
  const titleWords = significantWords(titleNorm);
  const headingWords = significantWords(headingNorm);
  const titleSet = new Set(titleWords);
  const overlap = headingWords.filter(w => titleSet.has(w)).length;
  const denominator = Math.max(titleWords.length, headingWords.length);

  return denominator > 0 && overlap / denominator >= 0.5;
}

/**
 * Split text into a bold lead sentence and the remainder.
 * Returns null if no clean split point exists.
 */
export function splitBoldLead(text: string): { bold: string; rest: string } | null {
  const match = text.match(/^(.+?[.:])(\s+.+)$/s);
  if (match && match[1].length < 180 && match[2].trim().length > 30) {
    return { bold: match[1], rest: match[2].trim() };
  }
  return null;
}

// Extend jsPDF for autoTable
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}

export function generateProposalPDF(snapshot: ProposalSnapshot): void {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = pdf.internal.pageSize.getWidth();   // 612
  const H = pdf.internal.pageSize.getHeight();  // 792
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

  /** Body text with bold first sentence for better scanning. */
  const bodyWithBoldLead = (text: string): void => {
    const split = splitBoldLead(text);
    if (split) {
      // Bold first sentence
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(...ink);
      const boldLines: string[] = pdf.splitTextToSize(split.bold, CW);
      for (const line of boldLines) {
        need(14);
        pdf.text(line, M, Y);
        Y += 13;
      }
      // Normal remainder
      body(split.rest);
    } else {
      body(text);
    }
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

  /** Render a person block: name → title → bio → separator.
   *  Optionally runs afterBio() between bio and separator for extra fields.
   *  extraHeight is added to the need() check for the initial block. */
  const renderPerson = (
    p: { nombre: string; titulo: string; bio: string },
    extraHeight?: number,
    afterBio?: () => void,
  ) => {
    const bioLines: string[] = pdf.splitTextToSize(p.bio || '', CW - 4);
    const blockH = 20 + 14 + bioLines.length * 12 + (extraHeight ?? 0) + 20;
    need(blockH);

    // Name
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...ink);
    pdf.text(p.nombre, M, Y);
    Y += 14;

    // Title
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...gold);
    pdf.text(p.titulo, M, Y);
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

    if (afterBio) afterBio();

    // Separator
    Y += 8;
    grayRule(Y);
    Y += 14;
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

  const hasBuckets = !!(snapshot.buckets && snapshot.buckets.length > 0);
  const hasFichaOrLic = !!(snapshot.ficha || snapshot.licitacion);
  const hasDocs = snapshot.documents.length > 0;

  const tocNames: string[] = [
    'Sobre Fundación Nueva Educación',
    'Modelo de Consultoría',
    'Equipo de Consultoría',
    'Asesores Internacionales',
    'Contenidos del Programa',
    ...(hasBuckets ? ['Distribución de Actividades', 'Línea de Tiempo del Programa'] : []),
    'Propuesta Económica',
    ...(hasFichaOrLic ? ['Datos de Referencia'] : []),
    ...(hasDocs ? ['Documentos de Apoyo'] : []),
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
  Y += 30;
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
  // 4. MODELO DE CONSULTORÍA — three-phase approach
  // ═══════════════════════════════════════════════════════════════════

  pdf.addPage();
  Y = M;
  recordTOC('Modelo de Consultoría');

  sectionHead('Modelo de Consultoría', 'Nuestro Enfoque');

  body(
    'Nuestro modelo de acompañamiento se estructura en tres fases progresivas que aseguran un proceso de transformación sostenible y contextualizado a las necesidades de cada comunidad educativa.'
  );

  Y += 6;

  const phases = [
    {
      title: 'Inicia',
      number: '01',
      description:
        'Diagnóstico y levantamiento de necesidades. Identificamos las áreas de mejora y establecemos la línea base.',
    },
    {
      title: 'Inspira',
      number: '02',
      description:
        'Formación y acompañamiento. Implementamos programas de desarrollo profesional contextualizados.',
    },
    {
      title: 'Evoluciona',
      number: '03',
      description:
        'Consolidación y autonomía. Aseguramos la sostenibilidad de los cambios y la transferencia de capacidades.',
    },
  ];

  for (const phase of phases) {
    need(70);
    // Phase number + title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...gold);
    pdf.text(phase.number, M, Y);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(...ink);
    pdf.text(phase.title, M + 20, Y);
    Y += 16;
    // Description
    body(phase.description);
    Y += 4;
    grayRule(Y);
    Y += 14;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5. CONSULTING TEAM — compact, multi-per-page
  // ═══════════════════════════════════════════════════════════════════

  pdf.addPage();
  Y = M;
  recordTOC('Equipo de Consultoría');

  sectionHead('Equipo de Consultoría', `${snapshot.consultants.length} profesionales asignados`);

  for (const c of snapshot.consultants) {
    renderPerson(
      c,
      c.especialidades?.length ? 24 : 0,
      () => {
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

        // Formación
        if (c.formacion && c.formacion.length > 0) {
          Y += 6;
          need(14 + c.formacion.length * 13);
          label('FORMACIÓN');
          Y += 12;
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(...ink);
          for (const f of c.formacion) {
            need(13);
            pdf.text(`${f.degree} — ${f.institution} (${f.year})`, M + 8, Y);
            Y += 12;
          }
        }

        // Experiencia
        if (c.experiencia && c.experiencia.length > 0) {
          Y += 6;
          need(14 + c.experiencia.length * 13);
          label('EXPERIENCIA');
          Y += 12;
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(...ink);
          for (const e of c.experiencia) {
            need(13);
            pdf.text(`${e.cargo} en ${e.empresa}`, M + 8, Y);
            Y += 12;
          }
        }
      },
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // 6. ASESORES INTERNACIONALES
  // ═══════════════════════════════════════════════════════════════════

  pdf.addPage();
  Y = M;
  recordTOC('Asesores Internacionales');

  sectionHead('Asesores Internacionales', `${INTERNATIONAL_ADVISORS.length} asesores del comité internacional`);

  for (const advisor of INTERNATIONAL_ADVISORS) {
    renderPerson(advisor);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 7. CONTENT BLOCKS — continuous flow, not one-per-page
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
            // Skip headings that are redundant with the block title
            if (isHeadingRedundant(block.titulo, section.text || '')) break;

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
            bodyWithBoldLead(section.text || '');
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
  // 8. DISTRIBUCIÓN DE ACTIVIDADES (conditional)
  // ═══════════════════════════════════════════════════════════════════

  if (hasBuckets) {
    const buckets = snapshot.buckets!;

    need(160);
    recordTOC('Distribución de Actividades');

    sectionHead('Distribución de Actividades');

    const grandTotal = buckets.reduce((sum, b) => sum + b.hours, 0);

    const distHead = [['Actividad', 'Horas', 'Modalidad', 'Tipo', 'Notas']];
    const distBody = buckets.map((b) => [
      b.label,
      String(b.hours),
      MOD_LABELS[b.modalidad] ?? b.modalidad,
      DIST_LABELS[b.distributionType] ?? b.distributionType,
      b.notes ?? '',
    ]);
    distBody.push([
      'TOTAL',
      String(grandTotal),
      '',
      '',
      '',
    ]);

    autoTable(pdf, {
      head: distHead,
      body: distBody,
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
      didParseCell: (data) => {
        // Bold the total row
        if (data.row.index === distBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = faintBg;
        }
      },
    });

    Y = (pdf as any).lastAutoTable.finalY + 20;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 9. LÍNEA DE TIEMPO DEL PROGRAMA (conditional)
  // ═══════════════════════════════════════════════════════════════════

  if (hasBuckets) {
    const buckets = snapshot.buckets!;

    need(160);
    recordTOC('Línea de Tiempo del Programa');

    sectionHead('Línea de Tiempo del Programa');

    const monthCols = Array.from({ length: PROGRAM_MONTHS }, (_, i) => `Mes ${i + 1}`);
    const tlHead = [['Actividad', ...monthCols]];
    const tlBody = buckets.map((b) => {
      const cells = [b.label];
      for (let m = 1; m <= PROGRAM_MONTHS; m++) {
        if (b.distributionType === 'bloque') {
          cells.push(b.mes === m ? `${b.hours}h` : '');
        } else {
          // cadencia + flexible span all months
          cells.push(ACTIVE_SENTINEL);
        }
      }
      return cells;
    });

    autoTable(pdf, {
      head: tlHead,
      body: tlBody,
      startY: Y,
      margin: { left: M, right: M },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 6,
        textColor: ink,
        lineColor: lightGray,
        lineWidth: 0.5,
        halign: 'center',
      },
      headStyles: {
        fillColor: faintBg,
        textColor: ink,
        fontStyle: 'bold',
        fontSize: 7,
      },
      alternateRowStyles: { fillColor: white },
      columnStyles: {
        0: { halign: 'left', cellWidth: 120 },
        ...Object.fromEntries(
          Array.from({ length: PROGRAM_MONTHS }, (_, i) => [
            i + 1,
            { cellWidth: (CW - 120) / PROGRAM_MONTHS },
          ])
        ),
      },
      willDrawCell: (data) => {
        // Suppress text for sentinel cells — circle drawn in didDrawCell
        if (data.section === 'body' && data.column.index > 0 && data.cell.raw === ACTIVE_SENTINEL) {
          data.cell.text = [''];
        }
      },
      didDrawCell: (data) => {
        // Draw a filled gold circle for active months
        if (data.section === 'body' && data.column.index > 0 && data.cell.raw === ACTIVE_SENTINEL) {
          const cx = data.cell.x + data.cell.width / 2;
          const cy = data.cell.y + data.cell.height / 2;
          pdf.setFillColor(...gold);
          pdf.circle(cx, cy, 3, 'F');
        }
      },
    });

    Y = (pdf as any).lastAutoTable.finalY + 20;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 10. ECONOMIC PROPOSAL — total only, no per-hour breakdown
  // ═══════════════════════════════════════════════════════════════════

  need(200);
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
  // 11. FICHA / LICITACIÓN METADATA (conditional)
  // ═══════════════════════════════════════════════════════════════════

  if (hasFichaOrLic) {
    need(100);
    recordTOC('Datos de Referencia');
    sectionHead('Datos de Referencia');

    if (snapshot.ficha) {
      const f = snapshot.ficha;
      label('FICHA DEL SERVICIO');
      Y += 14;
      body(`${f.nombre_servicio} — ${f.dimension} · ${f.categoria} · Folio ${f.folio}`);
    }

    if (snapshot.licitacion) {
      const l = snapshot.licitacion;
      label('LICITACIÓN');
      Y += 14;
      body(`Licitación ${l.numero} — ${l.nombre} (${l.year})`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 12. SUPPORTING DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════

  if (snapshot.documents.length > 0) {
    need(160);
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
  // FOOTERS + TOC PAGE NUMBERS
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
