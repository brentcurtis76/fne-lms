/**
 * GET /api/consultant-earnings/[consultant_id]/pdf
 *
 * Generates a PDF earnings report for a consultant.
 *
 * Auth:
 *   - admin: any consultant
 *   - consultor: own ID only
 *
 * Query params: from, to (YYYY-MM-DD)
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
import { Validators } from '../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';
import { getLatestFxRate } from '../../../../lib/services/hour-tracking';

// ============================================================
// Types
// ============================================================

type EarningsFunctionRow = {
  hour_type_key: string;
  display_name: string;
  total_hours: number;
  rate_eur: number | null;
  total_eur: number | null;
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
  logApiRequest(req, 'consultant-earnings-pdf');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { consultant_id } = req.query;

  if (!consultant_id || typeof consultant_id !== 'string' || !Validators.isUUID(consultant_id)) {
    return sendAuthError(res, 'ID de consultor inválido — debe ser un UUID válido', 400);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    // RBAC: admin can view all; consultor only their own
    if (highestRole !== 'admin') {
      if (highestRole === 'consultor' && consultant_id !== user.id) {
        return sendAuthError(res, 'Solo puede consultar sus propias ganancias', 403);
      } else if (highestRole !== 'consultor') {
        return sendAuthError(res, 'Acceso denegado', 403);
      }
    }

    // Validate date params
    const { from, to } = req.query;
    if (!from || typeof from !== 'string') {
      return sendAuthError(res, 'El parámetro "from" es requerido (formato YYYY-MM-DD)', 400);
    }
    if (!to || typeof to !== 'string') {
      return sendAuthError(res, 'El parámetro "to" es requerido (formato YYYY-MM-DD)', 400);
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from)) {
      return sendAuthError(res, 'El parámetro "from" debe tener el formato YYYY-MM-DD', 400);
    }
    if (!dateRegex.test(to)) {
      return sendAuthError(res, 'El parámetro "to" debe tener el formato YYYY-MM-DD', 400);
    }
    if (from > to) {
      return sendAuthError(res, 'La fecha "from" no puede ser posterior a "to"', 400);
    }

    // Fetch consultant name
    const { data: consultantProfile } = await serviceClient
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', consultant_id)
      .single();

    const consultantName = consultantProfile
      ? `${consultantProfile.first_name ?? ''} ${consultantProfile.last_name ?? ''}`.trim()
      : 'Consultor';

    // Fetch earnings
    const { data: earningsRows, error: earningsError } = await serviceClient.rpc('get_consultant_earnings', {
      p_consultant_id: consultant_id,
      p_from: from,
      p_to: to,
    });

    if (earningsError) {
      return sendAuthError(res, 'Error al obtener ganancias del consultor', 500, earningsError.message);
    }

    // FX rate
    const fxRate = await getLatestFxRate(serviceClient);

    // Build rows
    const rows = (earningsRows as EarningsFunctionRow[] ?? []).map((row) => {
      const totalEur = row.total_eur ?? 0;
      const totalClp = fxRate.rate_clp_per_eur > 0 ? Math.round(totalEur * fxRate.rate_clp_per_eur) : null;
      return {
        display_name: row.display_name,
        total_hours: Number(row.total_hours),
        rate_eur: row.rate_eur !== null ? Number(row.rate_eur) : null,
        total_eur: totalEur,
        total_clp: totalClp,
      };
    });

    const grandTotalHours = rows.reduce((s, r) => s + r.total_hours, 0);
    const grandTotalEur = rows.reduce((s, r) => s + r.total_eur, 0);
    const grandTotalClp = fxRate.rate_clp_per_eur > 0 ? Math.round(grandTotalEur * fxRate.rate_clp_per_eur) : null;

    // Generate PDF
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    const [nr, ng, nb] = hexToRgb('#003A5B');

    // Logo
    try {
      const logoPath = path.join(process.cwd(), 'public', 'genera', 'logo-horizontal-transparent-400.png');
      const logoData = fs.readFileSync(logoPath);
      const base64Logo = `data:image/png;base64,${logoData.toString('base64')}`;
      doc.addImage(base64Logo, 'PNG', margin, 8, 50, 15);
    } catch {
      // Logo not critical
    }

    // Header bar
    doc.setFillColor(nr, ng, nb);
    doc.rect(0, 0, pageWidth, 6, 'F');

    doc.setFontSize(14);
    doc.setTextColor(nr, ng, nb);
    doc.setFont('helvetica', 'bold');
    doc.text(consultantName, pageWidth - margin, 14, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Reporte de Ganancias', pageWidth - margin, 20, { align: 'right' });
    doc.text(`Período: ${from} al ${to}`, pageWidth - margin, 25, { align: 'right' });
    doc.text(`Generado: ${new Date().toLocaleDateString('es-CL')}`, pageWidth - margin, 30, { align: 'right' });

    let cursorY = 40;

    // Summary KPI row
    doc.autoTable({
      startY: cursorY,
      head: [['Total Horas', 'Total EUR', 'Total CLP', `Tipo de Cambio (${fxRate.source})`]],
      body: [[
        grandTotalHours.toFixed(2),
        `€${grandTotalEur.toFixed(2)}`,
        grandTotalClp !== null ? `$${grandTotalClp.toLocaleString('es-CL')}` : 'N/D',
        `1 EUR = ${fxRate.rate_clp_per_eur.toLocaleString('es-CL')} CLP`,
      ]],
      headStyles: { fillColor: [nr, ng, nb], textColor: [255, 255, 255] },
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 8;

    // Breakdown table
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(nr, ng, nb);
    doc.text('Desglose por Tipo de Hora', margin, cursorY);
    cursorY += 5;

    const tableBody = rows.map((r) => [
      r.display_name,
      r.total_hours.toFixed(2),
      r.rate_eur !== null ? `€${r.rate_eur.toFixed(2)}` : '—',
      `€${r.total_eur.toFixed(2)}`,
      r.total_clp !== null ? `$${r.total_clp.toLocaleString('es-CL')}` : 'N/D',
    ]);

    // Totals row
    tableBody.push([
      'TOTAL',
      grandTotalHours.toFixed(2),
      '—',
      `€${grandTotalEur.toFixed(2)}`,
      grandTotalClp !== null ? `$${grandTotalClp.toLocaleString('es-CL')}` : 'N/D',
    ]);

    doc.autoTable({
      startY: cursorY,
      head: [['Tipo de Hora', 'Total Horas', 'Tarifa EUR/h', 'Total EUR', 'Total CLP']],
      body: tableBody,
      headStyles: { fillColor: [nr, ng, nb], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [240, 248, 255] },
      foot: [],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      didParseCell: (data: { row: { section: string; index: number }; cell: { styles: { fontStyle: string } } }) => {
        // Bold the totals row (last body row)
        if (data.row.section === 'body' && data.row.index === tableBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // Footer
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

    // Output
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const safeConsultantName = consultantName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `ganancias-${safeConsultantName}-${from}-${to}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.status(200).end(pdfBuffer);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error al generar el PDF de ganancias', 500, message);
  }
}
