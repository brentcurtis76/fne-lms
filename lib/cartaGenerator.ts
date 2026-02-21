/**
 * Carta de Adjudicacion Document Generator
 * Phase 4: Licitaciones Evaluation System
 *
 * Generates a formal award letter .docx.
 * Uses the docx npm package (pure JS, Vercel-compatible).
 * All text is in Spanish.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from 'docx';

// ============================================================
// Input Types
// ============================================================

export interface CartaDocumentData {
  licitacion: {
    nombre_licitacion: string;
    condiciones_pago?: string | null;
    monto_adjudicado_uf?: number | null;
    fecha_oferta_ganadora?: string | null;
    contacto_coordinacion_nombre?: string | null;
    contacto_coordinacion_email?: string | null;
    contacto_coordinacion_telefono?: string | null;
  };
  ganadorAte: {
    nombre_ate: string;
    rut_ate?: string | null;
    nombre_contacto?: string | null;
  };
  school: {
    name: string;
    ciudad?: string | null;
    director_nombre?: string | null;
  };
  fechaEmision: string; // YYYY-MM-DD
}

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '[fecha no definida]';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const day = parseInt(parts[2], 10);
  const month = months[parseInt(parts[1], 10) - 1] || '';
  return `${day} de ${month} de ${parts[0]}`;
}

function letterParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 200 },
  });
}

function blankLine(): Paragraph {
  return new Paragraph({ text: '', spacing: { after: 120 } });
}

// ============================================================
// Main Generator
// ============================================================

/**
 * Generates a Carta de Adjudicacion .docx document.
 * Returns a Buffer suitable for Supabase storage upload.
 */
export async function generateCartaDocument(data: CartaDocumentData): Promise<Buffer> {
  const { licitacion, ganadorAte, school, fechaEmision } = data;

  const ciudad = school.ciudad || '[ciudad]';
  const monto = licitacion.monto_adjudicado_uf
    ? `${licitacion.monto_adjudicado_uf} UF`
    : '[monto por confirmar]';
  const condiciones = licitacion.condiciones_pago || '[condiciones de pago por definir]';
  const coordinadorNombre = licitacion.contacto_coordinacion_nombre || '[nombre coordinador]';
  const coordinadorEmail = licitacion.contacto_coordinacion_email || '[correo coordinador]';
  const coordinadorTelefono = licitacion.contacto_coordinacion_telefono || '[telefono coordinador]';
  const directorNombre = school.director_nombre || '[nombre director]';
  const fechaOferta = formatDate(licitacion.fecha_oferta_ganadora);

  const doc = new Document({
    sections: [
      {
        children: [
          // Location and date
          letterParagraph(`${ciudad}, ${formatDate(fechaEmision)}`),

          blankLine(),

          // Recipient
          letterParagraph(ganadorAte.nombre_ate),
          ganadorAte.rut_ate
            ? letterParagraph(`RUT: ${ganadorAte.rut_ate}`)
            : new Paragraph({ text: '' }),
          ganadorAte.nombre_contacto
            ? letterParagraph(ganadorAte.nombre_contacto)
            : new Paragraph({ text: '' }),

          blankLine(),

          new Paragraph({
            children: [new TextRun({ text: 'PRESENTE', bold: true, size: 22 })],
            spacing: { after: 240 },
          }),

          blankLine(),

          // Salutation
          letterParagraph('De mi consideracion:'),

          blankLine(),

          // Opening
          letterParagraph(
            `Nos es muy grato informar a ustedes, que han sido adjudicados en la licitacion por ${licitacion.nombre_licitacion.toUpperCase()}.`
          ),

          blankLine(),

          // Offer date
          letterParagraph(
            `De acuerdo a la ultima oferta economica presentada con fecha ${fechaOferta}:`
          ),

          blankLine(),

          // Amount and payment terms
          letterParagraph(
            `El valor adjudicado en este proceso de licitacion asciende a ${monto}, segun el plan de pago propuesto. "${condiciones}"`
          ),

          blankLine(),

          // Coordination contact
          letterParagraph(
            `Para las tareas propias del proyecto, el Proveedor debera coordinarse con la Direccion, ` +
            `a traves de ${coordinadorNombre}, email: ${coordinadorEmail} y telefono: ${coordinadorTelefono}.`
          ),

          blankLine(),

          // Closing
          letterParagraph(
            `Junto con felicitarle por esta adjudicacion, el ${school.name} quiere agradecer su participacion ` +
            `y esfuerzo demostrado en este proceso, y estamos seguros que el trabajo en conjunto nos permitira ` +
            `alcanzar los objetivos planteados.`
          ),

          blankLine(),
          blankLine(),

          // Sign-off
          letterParagraph('Saludos Cordiales'),

          blankLine(),
          blankLine(),
          blankLine(),

          // Signature block
          new Paragraph({
            children: [new TextRun({ text: '_________________________________', size: 22 })],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [new TextRun({ text: directorNombre, bold: true, size: 22 })],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Director(a) del ${school.name}`, size: 20, color: '555555' })],
            spacing: { after: 120 },
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
