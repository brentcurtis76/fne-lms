/**
 * Bases Document Generator
 * Produces a .docx Word document from licitacion + template data.
 * Uses the `docx` npm package (pure JS, Vercel-compatible).
 *
 * All text is in Spanish.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  Header,
} from 'docx';

// ============================================================
// Input Types
// ============================================================

export interface BasesDocumentData {
  licitacion: {
    id: string;
    numero_licitacion: string;
    nombre_licitacion: string;
    year: number;
    monto_minimo: number;
    monto_maximo: number;
    tipo_moneda: string;
    duracion_minima: string;
    duracion_maxima: string;
    peso_evaluacion_tecnica: number;
    peso_evaluacion_economica: number;
    email_licitacion: string;
    fecha_publicacion?: string | null;
    fecha_limite_solicitud_bases?: string | null;
    fecha_limite_consultas?: string | null;
    fecha_inicio_propuestas?: string | null;
    fecha_limite_propuestas?: string | null;
    fecha_limite_evaluacion?: string | null;
    modalidad_preferida?: string | null;
    participantes_estimados?: number | null;
  };
  school: {
    name: string;
    code?: string | null;
  };
  cliente: {
    nombre_legal: string;
    nombre_fantasia: string;
    rut: string;
    direccion: string;
    comuna?: string | null;
    ciudad?: string | null;
    nombre_representante: string;
    rut_representante: string;
  };
  programa: {
    id: string;
    nombre: string;
  };
  template: {
    nombre_servicio: string;
    objetivo: string;
    objetivos_especificos: string[];
    especificaciones_admin: {
      frecuencia?: string;
      lugar?: string;
      contrapartes_tecnicas?: string;
      condiciones_pago?: string;
    };
    resultados_esperados: string[];
    requisitos_ate: string[];
    documentos_adjuntar: string[];
    condiciones_pago?: string | null;
  };
  criterios: Array<{
    nombre_criterio: string;
    puntaje_maximo: number;
    descripcion?: string | null;
    orden: number;
  }>;
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

// Page content width = 9020 twips
const PAGE_WIDTH = 9020;

// White borders shared constant
const WHITE_BORDER = { style: BorderStyle.SINGLE, size: 8, color: 'FFFFFF' };

// Table-level borders (ITableBordersOptions) — controls outer + inner grid lines
const TABLE_BORDERS = {
  top: WHITE_BORDER,
  left: WHITE_BORDER,
  bottom: WHITE_BORDER,
  right: WHITE_BORDER,
  insideHorizontal: WHITE_BORDER,
  insideVertical: WHITE_BORDER,
};

// Cell-level borders (ITableCellBorders) — overrides borders on individual cells
const CELL_BORDERS = {
  top: WHITE_BORDER,
  left: WHITE_BORDER,
  bottom: WHITE_BORDER,
  right: WHITE_BORDER,
};

// ---- Paragraph helpers ----

function heading1(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, color: '2E74B5', font: 'Arial' })],
    spacing: { before: 240, after: 120 },
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 24, color: '2E74B5', font: 'Arial' })],
    spacing: { before: 180, after: 80 },
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 24, color: '000000', font: 'Arial' })],
    spacing: { before: 240, after: 120 },
  });
}

function bulletItem(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `\u2022  ${text}`, size: 24, color: '000000', font: 'Arial' })],
    spacing: { before: 120, after: 80 },
    indent: { left: 360 },
  });
}

// ---- Table cell helpers ----

/**
 * Creates a table header cell with #CED7E7 shading and bold Arial 10pt text.
 */
function makeThCell(text: string, width: number): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, size: 20, font: 'Arial' })],
    })],
    shading: { type: ShadingType.SOLID, color: 'CED7E7' },
    width: { size: width, type: WidthType.DXA },
    borders: CELL_BORDERS,
  });
}

/**
 * Creates a table data cell with optional alternate-row shading (#F5F5F5 or auto).
 */
function makeTdCell(text: string, width: number, isOddRow: boolean): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, size: 20, font: 'Arial' })],
    })],
    shading: isOddRow
      ? { type: ShadingType.SOLID, color: 'F5F5F5' }
      : { type: ShadingType.CLEAR, color: 'auto' },
    width: { size: width, type: WidthType.DXA },
    borders: CELL_BORDERS,
  });
}

// ---- Timeline table (section 8): 2 cols, 4510 each ----

function timelineTable(rows: Array<[string, string]>): Table {
  const col1 = 4510;
  const col2 = 4510;
  return new Table({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    columnWidths: [col1, col2],
    borders: TABLE_BORDERS,
    rows: rows.map(([label, value], idx) =>
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: label, bold: true, size: 20, font: 'Arial' })],
            })],
            shading: idx % 2 === 0
              ? { type: ShadingType.SOLID, color: 'F5F5F5' }
              : { type: ShadingType.CLEAR, color: 'auto' },
            width: { size: col1, type: WidthType.DXA },
            borders: CELL_BORDERS,
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: value, size: 20, font: 'Arial' })],
            })],
            shading: idx % 2 === 0
              ? { type: ShadingType.SOLID, color: 'F5F5F5' }
              : { type: ShadingType.CLEAR, color: 'auto' },
            width: { size: col2, type: WidthType.DXA },
            borders: CELL_BORDERS,
          }),
        ],
      })
    ),
  });
}

// ---- Annexo 2-column tables with header shading on col 1 ----

interface AnnexoTableSpec {
  col1Width: number;
  col2Width: number;
  rows: Array<[string, string]>;
}

function annexoTable({ col1Width, col2Width, rows }: AnnexoTableSpec): Table {
  return new Table({
    width: { size: col1Width + col2Width, type: WidthType.DXA },
    columnWidths: [col1Width, col2Width],
    borders: TABLE_BORDERS,
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: label, bold: true, size: 20, font: 'Arial' })],
            })],
            shading: { type: ShadingType.SOLID, color: 'CED7E7' },
            width: { size: col1Width, type: WidthType.DXA },
            borders: CELL_BORDERS,
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: value, size: 20, font: 'Arial' })],
            })],
            shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
            width: { size: col2Width, type: WidthType.DXA },
            borders: CELL_BORDERS,
          }),
        ],
      })
    ),
  });
}

// ============================================================
// Main Generator
// ============================================================

/**
 * Generates a Bases Licitacion .docx document.
 * Returns a Buffer suitable for Supabase storage upload.
 */
export async function generateBasesDocument(data: BasesDocumentData): Promise<Buffer> {
  const { licitacion, school, cliente, programa, template, criterios } = data;

  const schoolDisplayName = cliente.nombre_fantasia || school.name;
  const pesoEco = licitacion.peso_evaluacion_economica;
  const totalPuntaje = criterios.reduce((s, c) => s + Number(c.puntaje_maximo), 0);

  const headerAddress =
    `${cliente.nombre_legal} | RUT: ${cliente.rut} | RBD: ${school.code || '-'} | ` +
    `${cliente.direccion}` +
    `${cliente.comuna ? ', ' + cliente.comuna : ''}`;

  // ---- Criteria table (section 10): 3 cols — 2966, 1571, 4365 ----
  const critCol1 = 2966;
  const critCol2 = 1571;
  const critCol3 = 4365;

  const criteriaHeaderRow = new TableRow({
    children: [
      makeThCell('Criterio', critCol1),
      makeThCell('Puntaje Max.', critCol2),
      makeThCell('Descripcion', critCol3),
    ],
  });

  const criteriaDataRows = criterios
    .sort((a, b) => a.orden - b.orden)
    .map((c, idx) =>
      new TableRow({
        children: [
          makeTdCell(c.nombre_criterio, critCol1, idx % 2 === 0),
          makeTdCell(String(c.puntaje_maximo), critCol2, idx % 2 === 0),
          makeTdCell(c.descripcion || '-', critCol3, idx % 2 === 0),
        ],
      })
    );

  const criteriaTotalRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: 'TOTAL', bold: true, size: 20, font: 'Arial' })],
        })],
        shading: { type: ShadingType.SOLID, color: 'F0F0F0' },
        width: { size: critCol1, type: WidthType.DXA },
        borders: CELL_BORDERS,
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: String(totalPuntaje), bold: true, size: 20, font: 'Arial' })],
        })],
        shading: { type: ShadingType.SOLID, color: 'F0F0F0' },
        width: { size: critCol2, type: WidthType.DXA },
        borders: CELL_BORDERS,
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: '', size: 20, font: 'Arial' })] })],
        shading: { type: ShadingType.SOLID, color: 'F0F0F0' },
        width: { size: critCol3, type: WidthType.DXA },
        borders: CELL_BORDERS,
      }),
    ],
  });

  // ---- Section 5.2 Numero de Participantes body text ----
  const participantesText = licitacion.participantes_estimados
    ? `El numero de participantes sera definido en coordinacion con el establecimiento. Se estima ${licitacion.participantes_estimados} participantes.`
    : 'El numero de participantes sera definido en coordinacion con el establecimiento.';

  // ---- Section 7 condiciones de pago ----
  const condPagoText =
    template.especificaciones_admin.condiciones_pago || template.condiciones_pago || '';

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: headerAddress,
                    size: 18,
                    color: '666666',
                    font: 'Helvetica Neue',
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 80 },
              }),
            ],
          }),
        },
        children: [

          // =====================================
          // Title block (centered)
          // =====================================
          new Paragraph({
            children: [new TextRun({ text: 'BASES DE LICITACION', bold: true, size: 24, font: 'Arial' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            children: [new TextRun({ text: licitacion.nombre_licitacion, bold: true, size: 24, font: 'Arial' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `${schoolDisplayName} \u2014 Ano ${licitacion.year}`, size: 24, font: 'Arial' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `N\u00b0 Licitacion: ${licitacion.numero_licitacion}`, size: 24, font: 'Arial' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),

          // =====================================
          // 1. Introduccion
          // =====================================
          heading1('1. Introduccion'),
          bodyParagraph(
            `El establecimiento educacional ${cliente.nombre_legal}, ubicado en la comuna de ` +
            `${cliente.comuna || '[comuna]'}, en el marco del Programa "${programa.nombre}", ` +
            `convoca a las Asistencias Tecnicas Educativas (ATE) inscritas en el registro del ` +
            `Ministerio de Educacion a postular al proceso de licitacion denominado: ` +
            `"${licitacion.nombre_licitacion}".`
          ),
          bodyParagraph(
            'Esta licitacion busca contar con una asesoria solidamente fundamentada en el Modelo de ' +
            'Educacion Relacional, ejecutada por relatores con trayectoria comprobada en dicho modelo, ' +
            'idealmente con publicaciones academicas, libros o certificaciones especializadas en el area. ' +
            'Asimismo, se valorara especialmente que los postulantes acrediten contacto directo y experiencia ' +
            'de trabajo con escuelas de vanguardia a nivel mundial que implementen el modelo relacional, de ' +
            'modo que la asesoria este nutrida por las mejores practicas y evidencias internacionales ' +
            'disponibles en innovacion educativa.'
          ),
          bodyParagraph(`Las consultas sobre estas Bases deben enviarse al correo: ${licitacion.email_licitacion}`),

          // =====================================
          // 2. Nombre del Servicio Requerido
          // =====================================
          heading1('2. Nombre del Servicio Requerido'),
          bodyParagraph(template.nombre_servicio),

          // =====================================
          // 3. Objetivo
          // =====================================
          heading1('3. Objetivo'),
          bodyParagraph(
            template.objetivo +
            ' La asesoria debera estar profundamente anclada en el Modelo de Educacion Relacional ' +
            '\u2014con respaldo teorico y practico validado internacionalmente\u2014 y conducida por ' +
            'profesionales que acrediten experiencia directa en este modelo, con publicaciones, libros o ' +
            'certificaciones que den cuenta de su especializacion. Se priorizara a quienes demuestren ' +
            'vinculos o experiencias concretas con escuelas de vanguardia del mundo que ya transitan por ' +
            'esta transformacion cultural.'
          ),

          // =====================================
          // 4. Objetivos Especificos
          // =====================================
          heading1('4. Objetivos Especificos'),
          ...(template.objetivos_especificos.length > 0
            ? template.objetivos_especificos.map(obj => bulletItem(obj))
            : [bodyParagraph('[Por definir en la plantilla]')]
          ),

          // =====================================
          // 5. Especificaciones Administrativas
          // =====================================
          heading1('5. Especificaciones Administrativas'),

          heading2('5.1 Duracion del Servicio'),
          bodyParagraph(
            `La duracion minima del servicio es de ${licitacion.duracion_minima} meses ` +
            `y la duracion maxima es de ${licitacion.duracion_maxima} meses.`
          ),

          heading2('5.2 Numero de Participantes'),
          bodyParagraph(participantesText),

          heading2('5.3 Frecuencia de Sesiones'),
          bodyParagraph(template.especificaciones_admin.frecuencia || '[Por definir]'),

          heading2('5.4 Lugar de Realizacion'),
          bodyParagraph(template.especificaciones_admin.lugar || '[Por definir]'),

          heading2('5.5 Contrapartes Tecnicas'),
          bodyParagraph(template.especificaciones_admin.contrapartes_tecnicas || '[Por definir]'),

          heading2('5.6 Condiciones de Pago'),
          bodyParagraph(
            template.especificaciones_admin.condiciones_pago || template.condiciones_pago || '[Por definir]'
          ),

          heading2('5.7 Plataforma Online de Gestion'),
          bodyParagraph(
            'La ATE debera proporcionar una plataforma online para la gestion integral del proceso de ' +
            'cambio cultural, que incluya: capacitacion asincronica (videos, recursos y materiales de ' +
            'formacion disponibles para la comunidad educativa), organizacion y seguimiento de los equipos ' +
            'de trabajo, registro de avances y acuerdos de cada sesion, y comunicacion fluida entre el ' +
            'equipo asesor y las contrapartes del establecimiento.'
          ),

          // =====================================
          // 6. Resultados Esperados
          // =====================================
          heading1('6. Resultados Esperados'),
          ...(template.resultados_esperados.length > 0
            ? template.resultados_esperados.map(r => bulletItem(r))
            : [bodyParagraph('[Por definir en la plantilla]')]
          ),

          // =====================================
          // 7. Valor, Financiamiento y Forma de Pago
          // =====================================
          heading1('7. Valor, Financiamiento y Forma de Pago'),
          bodyParagraph(
            `El presupuesto disponible para este servicio es de un minimo de ${licitacion.monto_minimo} ` +
            `${licitacion.tipo_moneda} y un maximo de ${licitacion.monto_maximo} ${licitacion.tipo_moneda}, ` +
            `valores que incluyen todos los impuestos.`
          ),
          ...(condPagoText ? [bodyParagraph(condPagoText)] : []),

          // =====================================
          // 8. Etapas del Proceso de Licitacion
          // =====================================
          heading1('8. Etapas del Proceso de Licitacion'),
          timelineTable([
            ['Publicacion de Bases', formatDate(licitacion.fecha_publicacion)],
            ['Limite solicitud de Bases', formatDate(licitacion.fecha_limite_solicitud_bases)],
            ['Limite de Consultas', formatDate(licitacion.fecha_limite_consultas)],
            ['Inicio recepcion de Propuestas', formatDate(licitacion.fecha_inicio_propuestas)],
            ['Limite recepcion de Propuestas', formatDate(licitacion.fecha_limite_propuestas)],
            ['Limite Evaluacion', formatDate(licitacion.fecha_limite_evaluacion)],
          ]),

          // =====================================
          // 9. Requisitos del ATE Postulante
          // =====================================
          heading1('9. Requisitos del ATE Postulante'),
          ...(template.requisitos_ate.length > 0
            ? template.requisitos_ate.map(r => bulletItem(r))
            : [bodyParagraph('[Por definir en la plantilla]')]
          ),

          // =====================================
          // 10. Pauta de Evaluacion y Adjudicacion
          // =====================================
          heading1('10. Pauta de Evaluacion y Adjudicacion'),
          bodyParagraph(
            `La evaluacion de las propuestas se realizara considerando una ponderacion del ` +
            `${licitacion.peso_evaluacion_tecnica}% para la Evaluacion Tecnica y del ` +
            `${pesoEco}% para la Evaluacion Economica.`
          ),
          heading2('10.1 Criterios de Evaluacion Tecnica'),
          new Table({
            width: { size: critCol1 + critCol2 + critCol3, type: WidthType.DXA },
            columnWidths: [critCol1, critCol2, critCol3],
            borders: TABLE_BORDERS,
            rows: [criteriaHeaderRow, ...criteriaDataRows, criteriaTotalRow],
          }),

          // =====================================
          // 11. Documentos a Adjuntar
          // =====================================
          heading1('11. Documentos a Adjuntar en la Propuesta (pueden venir todos en un solo documento)'),
          ...(template.documentos_adjuntar.length > 0
            ? template.documentos_adjuntar.map(d => bulletItem(d))
            : [bodyParagraph('[Por definir en la plantilla]')]
          ),

          // =====================================
          // ANEXO: Formulario Ficha Tecnica
          // =====================================
          new Paragraph({
            children: [new TextRun({ text: 'ANEXO: FORMULARIO FICHA TECNICA', bold: true, size: 32, font: 'Arial' })],
            spacing: { before: 480, after: 240 },
            pageBreakBefore: true,
          }),

          // Tabla 1: Antecedentes del ATE Postulante — col1: 5467, col2: 3553
          heading2('Tabla 1: Antecedentes del ATE Postulante'),
          annexoTable({
            col1Width: 5467,
            col2Width: 3553,
            rows: [
              ['Nombre / Razon Social', ''],
              ['RUT', ''],
              ['Numero de Registro ATE (Mineduc)', ''],
              ['Representante Legal', ''],
              ['RUT Representante Legal', ''],
              ['Direccion', ''],
              ['Correo Electronico de Contacto', ''],
              ['Telefono de Contacto', ''],
            ],
          }),

          new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 240 } }),

          // Tabla 2: Descripcion del Oferente — col1: 4060, col2: 4504
          heading2('Tabla 2: Descripcion del Oferente'),
          annexoTable({
            col1Width: 4060,
            col2Width: 4504,
            rows: [
              ['Anos de experiencia en el sector educacional', ''],
              ['N\u00b0 de establecimientos atendidos en los ultimos 5 anos', ''],
              ['Programas o areas de especializacion', ''],
              ['Referencias verificables (nombre establecimiento, contacto)', ''],
            ],
          }),

          new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 240 } }),

          // Tabla 3: Propuesta Tecnica — col1: 4000, col2: 4504
          heading2('Tabla 3: Propuesta Tecnica'),
          annexoTable({
            col1Width: 4000,
            col2Width: 4504,
            rows: [
              ['Objetivo de la propuesta', ''],
              ['Metodologia de trabajo', ''],
              ['Cronograma de actividades (resumen)', ''],
              ['N\u00b0 de sesiones propuestas', ''],
              ['Formato de sesiones (presencial/virtual/hibrido)', ''],
              ['Equipo profesional asignado (nombre, cargo, formacion)', ''],
              ['Resultados e indicadores de exito propuestos', ''],
            ],
          }),

          new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 240 } }),

          // Tabla 4: Propuesta Economica — col1: 3340, col2: 4504
          heading2('Tabla 4: Propuesta Economica'),
          annexoTable({
            col1Width: 3340,
            col2Width: 4504,
            rows: [
              [`Valor total del servicio (${licitacion.tipo_moneda})`, ''],
              ['Detalle por etapa o periodo', ''],
              ['Condiciones de pago propuestas', ''],
              ['Incluye IVA (si/no)', ''],
            ],
          }),

          // Signature block
          new Paragraph({
            children: [
              new TextRun({
                text: 'Firma Representante Legal: ____________________________    RUT: ________________',
                size: 24,
                font: 'Arial',
              }),
            ],
            spacing: { before: 480, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Lugar y Fecha: ____________________________',
                size: 24,
                font: 'Arial',
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
