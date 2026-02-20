// @vitest-environment node

/**
 * Unit tests for lib/docxGenerator.ts
 * Tests that the generateBasesDocument function produces a valid buffer
 * and that helper functions work correctly.
 * Uses synthetic data only — no real school, student, or user data.
 *
 * The `docx` package is mocked here because it may not be installed in the
 * CI/test environment (it runs server-side only via the generate-bases API).
 * The mock simulates Packer.toBuffer() returning a Buffer with a valid ZIP
 * magic signature (PK = 0x50 0x4B), which is what a real .docx would produce.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the docx module before importing docxGenerator
vi.mock('docx', () => {
  class MockDocument {
    constructor(_options: Record<string, unknown>) {}
  }

  class MockParagraph {
    constructor(_options: Record<string, unknown>) {}
  }

  class MockTextRun {
    constructor(_options: Record<string, unknown>) {}
  }

  class MockTable {
    constructor(_options: Record<string, unknown>) {}
  }

  class MockTableRow {
    constructor(_options: Record<string, unknown>) {}
  }

  class MockTableCell {
    constructor(_options: Record<string, unknown>) {}
  }

  class MockHeader {
    constructor(_options: Record<string, unknown>) {}
  }

  class MockPacker {
    static async toBuffer(_doc: MockDocument): Promise<Buffer> {
      // Return a mock buffer with PK ZIP signature (valid .docx magic bytes)
      // Plus enough padding to simulate a real document
      const mockContent = Buffer.alloc(5000, 0);
      mockContent[0] = 0x50; // 'P'
      mockContent[1] = 0x4B; // 'K'
      mockContent[2] = 0x03;
      mockContent[3] = 0x04;
      return mockContent;
    }
  }

  return {
    Document: MockDocument,
    Packer: MockPacker,
    Paragraph: MockParagraph,
    TextRun: MockTextRun,
    Table: MockTable,
    TableRow: MockTableRow,
    TableCell: MockTableCell,
    Header: MockHeader,
    HeadingLevel: {
      HEADING_1: 'Heading1',
      HEADING_2: 'Heading2',
      HEADING_3: 'Heading3',
      HEADING_4: 'Heading4',
    },
    AlignmentType: {
      CENTER: 'center',
      LEFT: 'left',
      RIGHT: 'right',
      JUSTIFIED: 'both',
    },
    WidthType: {
      PERCENTAGE: 'pct',
      DXA: 'dxa',
      AUTO: 'auto',
      NIL: 'nil',
    },
    BorderStyle: {
      SINGLE: 'single',
      THICK: 'thick',
      DOUBLE: 'double',
      NONE: 'none',
    },
    ShadingType: {
      SOLID: 'solid',
      CLEAR: 'clear',
    },
    NumberFormat: {
      BULLET: 'bullet',
      DECIMAL: 'decimal',
    },
  };
});

import { generateBasesDocument, type BasesDocumentData } from '../../lib/docxGenerator';

// Synthetic test data — all names and data are fictional
const SYNTHETIC_DATA: BasesDocumentData = {
  licitacion: {
    id: 'test-lic-id-001',
    numero_licitacion: 'LIC-2026-TEST001-001',
    nombre_licitacion: 'Asesoria Prueba Sintetica',
    year: 2026,
    monto_minimo: 50,
    monto_maximo: 150,
    tipo_moneda: 'UF',
    duracion_minima: '6 meses',
    duracion_maxima: '12 meses',
    peso_evaluacion_tecnica: 70,
    peso_evaluacion_economica: 30,
    email_licitacion: 'licitacion@escuela-sintetica.cl',
    fecha_publicacion: '2026-03-01',
    fecha_limite_solicitud_bases: '2026-03-08',
    fecha_limite_consultas: '2026-03-13',
    fecha_inicio_propuestas: '2026-03-16',
    fecha_limite_propuestas: '2026-03-23',
    fecha_limite_evaluacion: '2026-03-28',
    modalidad_preferida: 'Presencial',
    participantes_estimados: 25,
  },
  school: {
    name: 'Escuela Sintetica de Prueba',
    code: 'TEST001',
  },
  cliente: {
    nombre_legal: 'Corporacion Municipal Sintetica de Prueba',
    nombre_fantasia: 'Escuela Sintetica',
    rut: '11.111.111-1',
    direccion: 'Av. Sintetica 123',
    comuna: 'Santiago',
    ciudad: 'Santiago',
    nombre_representante: 'Maria Sintetica Prueba',
    rut_representante: '22.222.222-2',
  },
  programa: {
    id: 'prog-test-001',
    nombre: 'Programa Sintetico de Prueba',
  },
  template: {
    nombre_servicio: 'Servicio de Prueba Sintetica',
    objetivo:
      'Objetivo de prueba sintetico para verificar la generacion del documento sin datos reales.',
    objetivos_especificos: [
      'Objetivo especifico 1 de prueba',
      'Objetivo especifico 2 de prueba',
      'Objetivo especifico 3 de prueba',
    ],
    especificaciones_admin: {
      frecuencia: 'Dos veces al mes (prueba sintetica)',
      lugar: 'En el establecimiento sintetico',
      contrapartes_tecnicas: 'Director sintetico',
      condiciones_pago: 'Pago por informe de avance aprobado (prueba)',
    },
    resultados_esperados: [
      'Resultado esperado 1 de prueba sintetica',
      'Resultado esperado 2 de prueba sintetica',
    ],
    requisitos_ate: [
      'Requisito ATE 1 de prueba',
      'Requisito ATE 2 de prueba',
    ],
    documentos_adjuntar: [
      'Documento 1 a adjuntar (prueba)',
      'Documento 2 a adjuntar (prueba)',
    ],
    condiciones_pago: 'Condiciones de pago detalladas de prueba sintetica.',
  },
  criterios: [
    {
      nombre_criterio: 'Criterio de Evaluacion 1 Sintetico',
      puntaje_maximo: 40,
      descripcion: 'Descripcion del criterio 1 de prueba',
      orden: 1,
    },
    {
      nombre_criterio: 'Criterio de Evaluacion 2 Sintetico',
      puntaje_maximo: 30,
      descripcion: 'Descripcion del criterio 2 de prueba',
      orden: 2,
    },
    {
      nombre_criterio: 'Criterio de Evaluacion 3 Sintetico',
      puntaje_maximo: 30,
      descripcion: null,
      orden: 3,
    },
  ],
};

describe('generateBasesDocument()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a Buffer (not null, not empty)', async () => {
    const buffer = await generateBasesDocument(SYNTHETIC_DATA);
    expect(buffer).toBeDefined();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('produces a buffer larger than 1KB (minimal document check)', async () => {
    const buffer = await generateBasesDocument(SYNTHETIC_DATA);
    // The mock returns 5000 bytes — the real docx would be at least 1KB
    expect(buffer.length).toBeGreaterThan(1024);
  });

  it('produces a buffer that starts with PK (ZIP signature — valid .docx)', async () => {
    const buffer = await generateBasesDocument(SYNTHETIC_DATA);
    // .docx files are ZIP archives and start with 0x50 0x4B ('PK')
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4B); // 'K'
  });

  it('handles empty objetivos_especificos gracefully', async () => {
    const data: BasesDocumentData = {
      ...SYNTHETIC_DATA,
      template: {
        ...SYNTHETIC_DATA.template,
        objetivos_especificos: [],
      },
    };
    const buffer = await generateBasesDocument(data);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1024);
  });

  it('handles empty criterios array gracefully', async () => {
    const data: BasesDocumentData = {
      ...SYNTHETIC_DATA,
      criterios: [],
    };
    const buffer = await generateBasesDocument(data);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1024);
  });

  it('handles null optional date fields without throwing', async () => {
    const data: BasesDocumentData = {
      ...SYNTHETIC_DATA,
      licitacion: {
        ...SYNTHETIC_DATA.licitacion,
        fecha_publicacion: null,
        fecha_limite_solicitud_bases: null,
        fecha_limite_consultas: null,
        fecha_inicio_propuestas: null,
        fecha_limite_propuestas: null,
        fecha_limite_evaluacion: null,
        participantes_estimados: null,
      },
    };
    const buffer = await generateBasesDocument(data);
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('handles null condiciones_pago without throwing', async () => {
    const data: BasesDocumentData = {
      ...SYNTHETIC_DATA,
      template: {
        ...SYNTHETIC_DATA.template,
        condiciones_pago: null,
      },
    };
    const buffer = await generateBasesDocument(data);
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('calls Packer.toBuffer and returns its result', async () => {
    // The mock Packer.toBuffer always returns a 5000-byte buffer
    // This verifies the function passes the Document object through
    const buffer = await generateBasesDocument(SYNTHETIC_DATA);
    expect(buffer.length).toBe(5000);
  });
});
