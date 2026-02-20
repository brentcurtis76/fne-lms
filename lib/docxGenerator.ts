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
  HeadingLevel,
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

function divider(): Paragraph {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' },
    },
    spacing: { before: 120, after: 120 },
    text: '',
  });
}

function makeHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, size: 20 })],
    })],
    shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
    width: { size: 30, type: WidthType.PERCENTAGE },
  });
}

function makeDataCell(text: string, widthPercent = 70): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, size: 20 })],
    })],
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
  });
}

function twoColTable(rows: Array<[string, string]>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [makeHeaderCell(label), makeDataCell(value)],
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

  const headerAddress = [
    cliente.nombre_legal,
    `RUT: ${cliente.rut}`,
    `RBD: ${school.code || '-'}`,
    cliente.direccion || '',
    cliente.comuna ? `, ${cliente.comuna}` : '',
  ].join(' | ');

  // Build criteria table rows
  const criteriaHeaderRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: 'Criterio', bold: true, size: 20 })] })],
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
        width: { size: 55, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: 'Puntaje Max.', bold: true, size: 20 })] })],
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
        width: { size: 15, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: 'Descripcion', bold: true, size: 20 })] })],
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
        width: { size: 30, type: WidthType.PERCENTAGE },
      }),
    ],
  });

  const criteriaDataRows = criterios
    .sort((a, b) => a.orden - b.orden)
    .map(c =>
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: c.nombre_criterio, size: 20 })] })],
            width: { size: 55, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(c.puntaje_maximo), size: 20 })] })],
            width: { size: 15, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: c.descripcion || '-', size: 20 })] })],
            width: { size: 30, type: WidthType.PERCENTAGE },
          }),
        ],
      })
    );

  const criteriaTotalRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: 'TOTAL', bold: true, size: 20 })] })],
        shading: { type: ShadingType.SOLID, color: 'F0F0F0' },
        width: { size: 55, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(totalPuntaje), bold: true, size: 20 })] })],
        shading: { type: ShadingType.SOLID, color: 'F0F0F0' },
        width: { size: 15, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ text: '' })],
        shading: { type: ShadingType.SOLID, color: 'F0F0F0' },
        width: { size: 30, type: WidthType.PERCENTAGE },
      }),
    ],
  });

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
          // Title
          // =====================================
          new Paragraph({
            children: [new TextRun({ text: 'BASES DE LICITACION', bold: true, size: 40, color: '1A1A1A' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240 },
          }),
          new Paragraph({
            children: [new TextRun({ text: licitacion.nombre_licitacion, bold: true, size: 28, color: '333333' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `${schoolDisplayName} — Ano ${licitacion.year}`, size: 24, color: '555555' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 480 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `N\u00b0 Licitacion: ${licitacion.numero_licitacion}`, size: 22, color: '666666' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
          }),

          divider(),

          // =====================================
          // 1. Introduccion
          // =====================================
          heading1('1. Introduccion'),
          bodyParagraph(
            `El establecimiento educacional ${cliente.nombre_legal}, ubicado en la comuna de ${cliente.comuna || '[comuna]'}, ` +
            `en el marco del Programa "${programa.nombre}", convoca a las Asistencias Tecnicas Educativas (ATE) ` +
            `inscritas en el registro del Ministerio de Educacion a postular al proceso de licitacion denominado: ` +
            `"${licitacion.nombre_licitacion}".`
          ),
          bodyParagraph(`Las consultas sobre estas Bases deben enviarse al correo: ${licitacion.email_licitacion}`),

          divider(),

          // =====================================
          // 2. Nombre del Servicio
          // =====================================
          heading1('2. Nombre del Servicio Requerido'),
          bodyParagraph(template.nombre_servicio),

          divider(),

          // =====================================
          // 3. Objetivo
          // =====================================
          heading1('3. Objetivo'),
          bodyParagraph(template.objetivo),

          divider(),

          // =====================================
          // 4. Objetivos Especificos
          // =====================================
          heading1('4. Objetivos Especificos'),
          ...(template.objetivos_especificos.length > 0
            ? template.objetivos_especificos.map(obj => bulletItem(obj))
            : [bodyParagraph('[Por definir en la plantilla]')]
          ),

          divider(),

          // =====================================
          // 5. Especificaciones Administrativas
          // =====================================
          heading1('5. Especificaciones Administrativas'),

          heading2('5.1 Duracion del Servicio'),
          bodyParagraph(
            `La duracion minima del servicio es de ${licitacion.duracion_minima} ` +
            `y la duracion maxima es de ${licitacion.duracion_maxima}.`
          ),

          heading2('5.2 Numero de Participantes'),
          bodyParagraph(
            licitacion.participantes_estimados
              ? `El servicio contempla la participacion de aproximadamente ${licitacion.participantes_estimados} participantes.`
              : 'El numero de participantes sera definido en coordinacion con el establecimiento.'
          ),

          heading2('5.3 Frecuencia de Sesiones'),
          bodyParagraph(template.especificaciones_admin.frecuencia || '[Por definir]'),

          heading2('5.4 Lugar de Realizacion'),
          bodyParagraph(template.especificaciones_admin.lugar || '[Por definir]'),

          heading2('5.5 Contrapartes Tecnicas'),
          bodyParagraph(template.especificaciones_admin.contrapartes_tecnicas || '[Por definir]'),

          heading2('5.6 Condiciones de Pago'),
          bodyParagraph(template.especificaciones_admin.condiciones_pago || template.condiciones_pago || '[Por definir]'),

          divider(),

          // =====================================
          // 6. Resultados Esperados
          // =====================================
          heading1('6. Resultados Esperados'),
          ...(template.resultados_esperados.length > 0
            ? template.resultados_esperados.map(r => bulletItem(r))
            : [bodyParagraph('[Por definir en la plantilla]')]
          ),

          divider(),

          // =====================================
          // 7. Valor, Financiamiento y Pago
          // =====================================
          heading1('7. Valor, Financiamiento y Forma de Pago'),
          bodyParagraph(
            `El presupuesto disponible para este servicio es de un minimo de ${licitacion.monto_minimo} ${licitacion.tipo_moneda} ` +
            `y un maximo de ${licitacion.monto_maximo} ${licitacion.tipo_moneda}, valores que incluyen todos los impuestos.`
          ),
          bodyParagraph(template.condiciones_pago || '[Condiciones de pago por definir en la plantilla]'),

          divider(),

          // =====================================
          // 8. Etapas del Proceso
          // =====================================
          heading1('8. Etapas del Proceso de Licitacion'),
          twoColTable([
            ['Publicacion de Bases', formatDate(licitacion.fecha_publicacion)],
            ['Limite solicitud de Bases', formatDate(licitacion.fecha_limite_solicitud_bases)],
            ['Limite de Consultas', formatDate(licitacion.fecha_limite_consultas)],
            ['Inicio recepcion de Propuestas', formatDate(licitacion.fecha_inicio_propuestas)],
            ['Limite recepcion de Propuestas', formatDate(licitacion.fecha_limite_propuestas)],
            ['Limite Evaluacion', formatDate(licitacion.fecha_limite_evaluacion)],
          ]),

          divider(),

          // =====================================
          // 9. Requisitos ATE
          // =====================================
          heading1('9. Requisitos del ATE Postulante'),
          ...(template.requisitos_ate.length > 0
            ? template.requisitos_ate.map(r => bulletItem(r))
            : [bodyParagraph('[Por definir en la plantilla]')]
          ),

          divider(),

          // =====================================
          // 10. Pauta de Evaluacion
          // =====================================
          heading1('10. Pauta de Evaluacion y Adjudicacion'),
          bodyParagraph(
            `La evaluacion de las propuestas se realizara considerando una ponderacion del ` +
            `${licitacion.peso_evaluacion_tecnica}% para la Evaluacion Tecnica y del ` +
            `${pesoEco}% para la Evaluacion Economica.`
          ),
          heading2('10.1 Criterios de Evaluacion Tecnica'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [criteriaHeaderRow, ...criteriaDataRows, criteriaTotalRow],
          }),

          divider(),

          // =====================================
          // 11. Documentos a Adjuntar
          // =====================================
          heading1('11. Documentos a Adjuntar en la Propuesta'),
          ...(template.documentos_adjuntar.length > 0
            ? template.documentos_adjuntar.map(d => bulletItem(d))
            : [bodyParagraph('[Por definir en la plantilla]')]
          ),

          divider(),

          // =====================================
          // ANEXO: Formulario Ficha Tecnica
          // =====================================
          new Paragraph({
            children: [new TextRun({ text: 'ANEXO: FORMULARIO FICHA TECNICA', bold: true, size: 32 })],
            spacing: { before: 480, after: 240 },
            pageBreakBefore: true,
          }),

          heading2('Tabla 1: Antecedentes del ATE Postulante'),
          twoColTable([
            ['Nombre / Razon Social', ''],
            ['RUT', ''],
            ['Numero de Registro ATE (Mineduc)', ''],
            ['Representante Legal', ''],
            ['RUT Representante Legal', ''],
            ['Direccion', ''],
            ['Correo Electronico de Contacto', ''],
            ['Telefono de Contacto', ''],
          ]),

          new Paragraph({ text: '', spacing: { after: 240 } }),

          heading2('Tabla 2: Descripcion del Oferente'),
          twoColTable([
            ['Anos de experiencia en el sector educacional', ''],
            ['N\u00b0 de establecimientos atendidos en los ultimos 5 anos', ''],
            ['Programas o areas de especializacion', ''],
            ['Referencias verificables (nombre establecimiento, contacto)', ''],
          ]),

          new Paragraph({ text: '', spacing: { after: 240 } }),

          heading2('Tabla 3: Propuesta Tecnica'),
          twoColTable([
            ['Objetivo de la propuesta', ''],
            ['Metodologia de trabajo', ''],
            ['Cronograma de actividades (resumen)', ''],
            ['N\u00b0 de sesiones propuestas', ''],
            ['Formato de sesiones (presencial/virtual/hibrido)', ''],
            ['Equipo profesional asignado (nombre, cargo, formacion)', ''],
            ['Resultados e indicadores de exito propuestos', ''],
          ]),

          new Paragraph({ text: '', spacing: { after: 240 } }),

          heading2('Tabla 4: Propuesta Economica'),
          twoColTable([
            [`Valor total del servicio (${licitacion.tipo_moneda})`, ''],
            ['Detalle por etapa o periodo', ''],
            ['Condiciones de pago propuestas', ''],
            ['Incluye IVA (si/no)', ''],
          ]),

          new Paragraph({
            children: [
              new TextRun({ text: `Firma Representante Legal: ____________________________    RUT: ________________`, size: 20 }),
            ],
            spacing: { before: 480, after: 120 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Lugar y Fecha: ____________________________`, size: 20 })],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
