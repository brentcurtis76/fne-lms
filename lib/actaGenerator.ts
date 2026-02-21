/**
 * Acta de Reunion Document Generator
 * Phase 4: Licitaciones Evaluation System
 *
 * Generates a .docx Word document with:
 * - Part 1: Meeting record with committee signatures
 * - Part 2: Informacion Anexa (scoring annex)
 *
 * Uses the docx npm package (pure JS, Vercel-compatible).
 * All text is in Spanish.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from 'docx';

// ============================================================
// Input Types
// ============================================================

export interface ActaDocumentData {
  licitacion: {
    nombre_licitacion: string;
    numero_licitacion: string;
    peso_evaluacion_tecnica: number;
    peso_evaluacion_economica: number;
  };
  fechaEvaluacion: string;   // YYYY-MM-DD
  horaInicio: string;        // HH:MM
  horaFin: string;           // HH:MM
  committee: Array<{
    nombre: string;
    rut?: string | null;
    cargo?: string | null;
    orden: number;
  }>;
  ates: Array<{
    id: string;
    nombre_ate: string;
    rut_ate?: string | null;
    puntaje_total: number;
    puntaje_tecnico: number;
    puntaje_economico: number;
    puntaje_tecnico_ponderado: number;
    puntaje_economico_ponderado: number;
    monto_propuesto: number;
    es_ganador: boolean;
  }>;
  criterios: Array<{
    id: string;
    nombre_criterio: string;
    puntaje_maximo: number;
    orden: number;
  }>;
  scoresByAte: Record<string, Record<string, number>>; // ate_id -> criterio_id -> puntaje
}

// ============================================================
// Helpers (following docxGenerator.ts pattern)
// ============================================================

function formatDate(dateStr: string): string {
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

function formatMonto(monto: number): string {
  return `$${monto.toLocaleString('es-CL')}`;
}

function heading1(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 180, after: 80 },
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 120 },
  });
}

function bulletItem(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `\u2022  ${text}`, size: 22 })],
    spacing: { after: 80 },
    indent: { left: 360 },
  });
}

function makeHeaderCell(text: string, widthPercent = 25): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, size: 20 })],
    })],
    shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
  });
}

function makeDataCell(text: string, widthPercent = 75): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, size: 20 })],
    })],
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
  });
}

function divider(): Paragraph {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' },
    },
    spacing: { before: 120, after: 120 },
    text: '',
  });
}

// ============================================================
// Main Generator
// ============================================================

/**
 * Generates an Acta de Reunion .docx document.
 * Returns a Buffer suitable for Supabase storage upload.
 */
export async function generateActaDocument(data: ActaDocumentData): Promise<Buffer> {
  const { licitacion, fechaEvaluacion, horaInicio, horaFin, committee, ates, criterios, scoresByAte } = data;

  const sortedCriterios = [...criterios].sort((a, b) => a.orden - b.orden);
  const winnerAte = ates.find(a => a.es_ganador);
  const sortedAtes = [...ates].sort((a, b) => b.puntaje_total - a.puntaje_total);

  // ============================================================
  // PART 1: Meeting Record
  // ============================================================

  // Score summary table for Part 1
  const summaryHeaderRow = new TableRow({
    children: [
      makeHeaderCell('ATE', 50),
      makeHeaderCell('Puntaje Total', 50),
    ],
  });
  const summaryDataRows = sortedAtes.map(ate =>
    new TableRow({
      children: [
        makeDataCell(ate.nombre_ate, 50),
        makeDataCell(String(ate.puntaje_total), 50),
      ],
    })
  );

  // Signature table
  const signatureRows = committee
    .sort((a, b) => a.orden - b.orden)
    .map(member =>
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: member.nombre, bold: true, size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: `RUT: ${member.rut || '-'}`, size: 18 })] }),
              new Paragraph({ children: [new TextRun({ text: `Cargo: ${member.cargo || '-'}`, size: 18 })] }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: 'Firma: ________________________', size: 20 })] }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
          }),
        ],
      })
    );

  // ============================================================
  // PART 2: Informacion Anexa (new page)
  // ============================================================

  // Weight split table
  const weightTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          makeHeaderCell('Evaluacion Tecnica', 50),
          makeHeaderCell('Evaluacion Economica', 50),
        ],
      }),
      new TableRow({
        children: [
          makeDataCell(`${licitacion.peso_evaluacion_tecnica}%`, 50),
          makeDataCell(`${licitacion.peso_evaluacion_economica}%`, 50),
        ],
      }),
    ],
  });

  // Technical criteria table
  const criteriaHeaderRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: 'Criterio', bold: true, size: 20 })] })],
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
        width: { size: 60, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: 'Puntaje Max', bold: true, size: 20 })] })],
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
        width: { size: 20, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: '% Tecnico', bold: true, size: 20 })] })],
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
        width: { size: 20, type: WidthType.PERCENTAGE },
      }),
    ],
  });

  const totalCriterioPoints = sortedCriterios.reduce((s, c) => s + c.puntaje_maximo, 0);
  const criteriaDataRows = sortedCriterios.map(c =>
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: c.nombre_criterio, size: 20 })] })],
          width: { size: 60, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(c.puntaje_maximo), size: 20 })] })],
          width: { size: 20, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: `${Math.round((c.puntaje_maximo / totalCriterioPoints) * 100)}%`, size: 20 })] })],
          width: { size: 20, type: WidthType.PERCENTAGE },
        }),
      ],
    })
  );

  // Results matrix table: rows = criteria, columns = ATEs
  const colWidth = Math.floor(100 / (sortedCriterios.length > 0 ? sortedAtes.length + 1 : 2));
  const matrixHeaderRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: 'Criterio', bold: true, size: 18 })] })],
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
        width: { size: 30, type: WidthType.PERCENTAGE },
      }),
      ...sortedAtes.map(ate =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: ate.nombre_ate, bold: true, size: 18 })] })],
          shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
          width: { size: colWidth, type: WidthType.PERCENTAGE },
        })
      ),
    ],
  });

  const matrixDataRows = sortedCriterios.map(crit =>
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: crit.nombre_criterio, size: 18 })] })],
          width: { size: 30, type: WidthType.PERCENTAGE },
        }),
        ...sortedAtes.map(ate => {
          const score = scoresByAte[ate.id]?.[crit.id] ?? '-';
          return new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(score), size: 18 })] })],
            width: { size: colWidth, type: WidthType.PERCENTAGE },
          });
        }),
      ],
    })
  );

  // Subtotals row
  const subtotalRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: 'Subtotal Tecnico', bold: true, size: 18 })] })],
        shading: { type: ShadingType.SOLID, color: 'F0F0F0' },
        width: { size: 30, type: WidthType.PERCENTAGE },
      }),
      ...sortedAtes.map(ate =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(ate.puntaje_tecnico), bold: true, size: 18 })] })],
          shading: { type: ShadingType.SOLID, color: 'F0F0F0' },
          width: { size: colWidth, type: WidthType.PERCENTAGE },
        })
      ),
    ],
  });

  // Economic table
  const econHeaderRow = new TableRow({
    children: [
      makeHeaderCell('ATE', 30),
      makeHeaderCell('Monto Propuesto', 35),
      makeHeaderCell('Puntaje Economico', 35),
    ],
  });
  const econDataRows = sortedAtes.map(ate =>
    new TableRow({
      children: [
        makeDataCell(ate.nombre_ate, 30),
        makeDataCell(formatMonto(ate.monto_propuesto), 35),
        makeDataCell(String(ate.puntaje_economico), 35),
      ],
    })
  );

  // Final evaluation table
  const finalHeaderRow = new TableRow({
    children: [
      makeHeaderCell('ATE', 20),
      makeHeaderCell('Tec. Pond.', 16),
      makeHeaderCell('Eco. Pond.', 16),
      makeHeaderCell('Total', 16),
      makeHeaderCell('Rank', 16),
      makeHeaderCell('Ganador', 16),
    ],
  });
  const finalDataRows = sortedAtes.map(ate =>
    new TableRow({
      children: [
        makeDataCell(ate.nombre_ate, 20),
        makeDataCell(String(ate.puntaje_tecnico_ponderado), 16),
        makeDataCell(String(ate.puntaje_economico_ponderado), 16),
        makeDataCell(String(ate.puntaje_total), 16),
        makeDataCell(String(sortedAtes.indexOf(ate) + 1), 16),
        makeDataCell(ate.es_ganador ? 'Si' : 'No', 16),
      ],
    })
  );

  // ============================================================
  // Assemble document
  // ============================================================

  const doc = new Document({
    sections: [
      {
        children: [
          // ========================================
          // PART 1: ACTA DE REUNION
          // ========================================
          new Paragraph({
            children: [new TextRun({ text: 'ACTA DE REUNION', bold: true, size: 40, color: '1A1A1A' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240 },
          }),

          divider(),

          bodyParagraph(
            `Objetivo: Revisar las propuestas recibidas para la licitacion de: "${licitacion.nombre_licitacion}" ` +
            `y entregar la evaluacion del adjudicado.`
          ),

          bodyParagraph(
            `Con fecha ${formatDate(fechaEvaluacion)}, siendo las ${horaInicio} Hrs. se reune la comision para evaluar ` +
            `las propuestas del proceso de Licitacion, donde se procede a la revision sistematica de todos los documentos ` +
            `entregados por los ofertantes, las ATES ofertantes son:`
          ),

          ...ates.map(ate => bulletItem(`${ate.nombre_ate}${ate.rut_ate ? ` — RUT: ${ate.rut_ate}` : ''}`)),

          new Paragraph({ text: '', spacing: { after: 120 } }),

          bodyParagraph(
            `Se procede a evaluar y ponderar cada item de la pauta que se anexa, dando el siguiente puntaje de evaluacion:`
          ),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [summaryHeaderRow, ...summaryDataRows],
          }),

          new Paragraph({ text: '', spacing: { after: 240 } }),

          winnerAte
            ? bodyParagraph(
                `Por lo tanto, de acuerdo a los resultados obtenidos, la empresa que cumple con nuestros objetivos ` +
                `planteados es ${winnerAte.nombre_ate}. Se acuerda confirmar a esta empresa para la ejecucion del programa.`
              )
            : bodyParagraph('El proceso de evaluacion esta pendiente de finalizacion.'),

          bodyParagraph(`Se da por finalizada a las ${horaFin} la reunion.`),

          divider(),

          heading2('Firmas de la Comision Evaluadora'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: signatureRows.length > 0 ? signatureRows : [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: 'Sin miembros registrados' })],
                    width: { size: 100, type: WidthType.PERCENTAGE },
                  }),
                ],
              }),
            ],
          }),

          // ========================================
          // PART 2: INFORMACION ANEXA (new page)
          // ========================================
          new Paragraph({
            children: [new TextRun({ text: 'INFORMACION ANEXA', bold: true, size: 36, color: '1A1A1A' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240 },
            pageBreakBefore: true,
          }),

          heading1('CRITERIOS DE EVALUACION'),
          heading2(`PAUTA DE EVALUACION: Licitacion "${licitacion.nombre_licitacion}"`),

          new Paragraph({ text: '', spacing: { after: 120 } }),

          bodyParagraph('Ponderacion de Evaluacion:'),
          weightTable,

          new Paragraph({ text: '', spacing: { after: 240 } }),

          heading2('Criterios de Evaluacion Tecnica'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [criteriaHeaderRow, ...criteriaDataRows],
          }),

          new Paragraph({ text: '', spacing: { after: 240 } }),

          heading2('Resultados por Criterio por ATE'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [matrixHeaderRow, ...matrixDataRows, subtotalRow],
          }),

          new Paragraph({ text: '', spacing: { after: 240 } }),

          heading2('Evaluacion Economica'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [econHeaderRow, ...econDataRows],
          }),

          new Paragraph({ text: '', spacing: { after: 240 } }),

          heading2('Evaluacion Final Ponderada'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [finalHeaderRow, ...finalDataRows],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
