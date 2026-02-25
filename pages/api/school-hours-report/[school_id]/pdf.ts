/**
 * GET /api/school-hours-report/[school_id]/pdf
 *
 * Generates a PDF report for a school's hour usage.
 *
 * Auth: same as index.ts (admin any school, equipo_directivo own school only)
 *
 * Response: application/pdf with Content-Disposition: attachment
 */

import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';
import { fetchSchoolReportData } from '../../../../lib/services/school-hours-report';

// Brand colours
const NAVY = '#003A5B';
const STATUS_COLORS: Record<string, string> = {
  consumida: '#16a34a',
  reservada: '#2563eb',
  penalizada: '#dc2626',
  devuelta: '#ea580c',
};

// ============================================================
// Helper: hex to [r, g, b]
// ============================================================

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

// ============================================================
// Main handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'school-hours-report-pdf');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { school_id } = req.query;

  if (!school_id || typeof school_id !== 'string') {
    return sendAuthError(res, 'ID de escuela inválido', 400);
  }

  const parsedSchoolId = parseInt(school_id, 10);
  if (isNaN(parsedSchoolId)) {
    return sendAuthError(res, 'ID de escuela inválido', 400);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // RBAC
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (highestRole === 'equipo_directivo') {
      const userSchoolIds = userRoles
        .filter((r) => r.school_id !== undefined && r.school_id !== null)
        .map((r) => String(r.school_id));

      if (!userSchoolIds.includes(String(parsedSchoolId))) {
        return sendAuthError(res, 'No tiene permisos para ver el reporte de esta escuela', 403);
      }
    } else if (highestRole !== 'admin') {
      return sendAuthError(res, 'Acceso denegado', 403);
    }

    // Fetch report data via shared service
    const reportData = await fetchSchoolReportData(serviceClient, parsedSchoolId);
    if (!reportData) {
      return sendAuthError(res, 'Escuela no encontrada', 404);
    }

    // Generate PDF using jsPDF
    // Dynamic import to avoid SSR issues
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // ---- Logo ----
    try {
      const logoPath = path.join(process.cwd(), 'public', 'genera', 'logo-horizontal-transparent-400.png');
      const logoData = fs.readFileSync(logoPath);
      const base64Logo = `data:image/png;base64,${logoData.toString('base64')}`;
      doc.addImage(base64Logo, 'PNG', margin, 8, 50, 15);
    } catch {
      // Logo not critical — skip if unavailable
    }

    // ---- Header ----
    const [nr, ng, nb] = hexToRgb(NAVY);
    doc.setFillColor(nr, ng, nb);
    doc.rect(0, 0, pageWidth, 6, 'F');

    doc.setFontSize(14);
    doc.setTextColor(nr, ng, nb);
    doc.setFont('helvetica', 'bold');
    doc.text(reportData.school_name, pageWidth - margin, 14, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Reporte de Horas', pageWidth - margin, 20, { align: 'right' });
    doc.text(`Generado: ${new Date().toLocaleDateString('es-CL')}`, pageWidth - margin, 25, { align: 'right' });

    // ---- Summary section ----
    let cursorY = 35;

    // Compute grand totals
    const allContracts = reportData.programs.flatMap((p) => p.contracts);
    const grandContracted = allContracts.reduce((s, c) => s + c.total_contracted_hours, 0);
    const grandConsumed = allContracts.reduce((s, c) => s + c.total_consumed, 0);
    const grandReserved = allContracts.reduce((s, c) => s + c.total_reserved, 0);
    const grandAvailable = allContracts.reduce((s, c) => s + c.total_available, 0);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(nr, ng, nb);
    doc.text('Resumen General', margin, cursorY);
    cursorY += 6;

    // Summary table
    doc.autoTable({
      startY: cursorY,
      head: [['Horas Contratadas', 'Consumidas', 'Reservadas', 'Disponibles']],
      body: [[
        grandContracted.toFixed(1),
        grandConsumed.toFixed(1),
        grandReserved.toFixed(1),
        grandAvailable.toFixed(1),
      ]],
      headStyles: { fillColor: [nr, ng, nb], textColor: [255, 255, 255] },
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 8;

    // ---- Per-program breakdown ----
    for (const program of reportData.programs) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(nr, ng, nb);
      doc.text(`Programa: ${program.programa_name}`, margin, cursorY);
      cursorY += 5;

      for (const contract of program.contracts) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        const annexLabel = contract.is_annexo ? ' (Anexo)' : '';
        doc.text(`Contrato: ${contract.numero_contrato}${annexLabel}`, margin + 2, cursorY);
        cursorY += 4;

        // Bucket summary table
        const bucketRows = contract.buckets.map((b) => [
          b.display_name,
          b.allocated.toFixed(1),
          b.reserved.toFixed(1),
          b.consumed.toFixed(1),
          b.available.toFixed(1),
          b.annex_hours > 0 ? `+${b.annex_hours.toFixed(1)}` : '—',
        ]);

        if (bucketRows.length > 0) {
          doc.autoTable({
            startY: cursorY,
            head: [['Categoría', 'Asignadas', 'Reservadas', 'Consumidas', 'Disponibles', 'Horas Anexo']],
            body: bucketRows,
            headStyles: { fillColor: [0, 102, 164], textColor: [255, 255, 255], fontSize: 8 },
            alternateRowStyles: { fillColor: [240, 248, 255] },
            margin: { left: margin + 4, right: margin },
            styles: { fontSize: 8 },
          });

          cursorY = (doc as any).lastAutoTable.finalY + 4;
        }

        // Session detail per bucket
        for (const bucket of contract.buckets) {
          if (bucket.sessions.length === 0) continue;

          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(60, 60, 60);
          doc.text(`  ${bucket.display_name} — Sesiones`, margin + 4, cursorY);
          cursorY += 3;

          const sessionRows = bucket.sessions.map((s) => [
            s.date ? new Date(s.date + 'T00:00:00').toLocaleDateString('es-CL') : '—',
            s.consultant_name,
            s.title.length > 35 ? s.title.slice(0, 35) + '…' : s.title,
            s.hours.toFixed(2),
            s.status,
            s.attendance ? `${s.attendance.attended}/${s.attendance.expected}` : '—',
          ]);

          doc.autoTable({
            startY: cursorY,
            head: [['Fecha', 'Consultor', 'Título', 'Horas', 'Estado', 'Asistencia']],
            body: sessionRows,
            headStyles: { fillColor: [100, 100, 100], textColor: [255, 255, 255], fontSize: 7 },
            alternateRowStyles: { fillColor: [250, 250, 250] },
            margin: { left: margin + 6, right: margin },
            styles: { fontSize: 7 },
            bodyStyles: {
              textColor: [60, 60, 60],
            },
            didParseCell: (data: { row: { section: string }; cell: { text: string[]; styles: { textColor: [number, number, number] } }; column: { index: number } }) => {
              if (data.row.section === 'body' && data.column.index === 4) {
                const status = data.cell.text[0];
                const color = STATUS_COLORS[status];
                if (color) {
                  const [sr, sg, sb] = hexToRgb(color);
                  data.cell.styles.textColor = [sr, sg, sb];
                }
              }
            },
          });

          cursorY = (doc as any).lastAutoTable.finalY + 4;
        }

        cursorY += 4;
      }

      cursorY += 4;
    }

    // ---- Footer ----
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Página ${i} de ${pageCount}  —  Generado por FNE LMS  —  ${new Date().toLocaleString('es-CL')}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: 'center' }
      );
    }

    // ---- Output ----
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const safeSchoolName = reportData.school_name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `reporte-horas-${safeSchoolName}-${dateStr}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.status(200).end(pdfBuffer);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error al generar el PDF', 500, message);
  }
}
