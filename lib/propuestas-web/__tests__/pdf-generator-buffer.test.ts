// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateProposalPDFBuffer } from '../pdf-generator';
import type { ProposalSnapshot } from '../snapshot';

/**
 * Proves the proposal PDF generator (jsPDF + jsPDF-autotable) runs server-side
 * in Node and returns a valid PDF Buffer. This is the server entry point used
 * by both proposal generation and the ZIP download, so it must not depend on
 * any browser globals.
 */
function makeSnapshot(overrides: Partial<ProposalSnapshot> = {}): ProposalSnapshot {
  return {
    version: 1,
    generatedAt: '2026-06-02T00:00:00.000Z',
    type: 'evoluciona',
    schoolName: 'Colegio de Prueba',
    schoolLogoPath: null,
    programYear: 2026,
    serviceName: 'Programa Evoluciona',
    destinatarios: ['Docentes', 'Directivos'],
    consultants: [
      {
        nombre: 'Ana García',
        titulo: 'Directora de Programa',
        bio: 'Especialista en liderazgo escolar con amplia trayectoria.',
        fotoPath: null,
        cvPath: null,
        formacion: [{ year: 2018, institution: 'Universidad', degree: 'PhD Educación' }],
        experiencia: [{ empresa: 'FNE', cargo: 'Consultora', funcion: 'Asesoría' }],
        especialidades: ['Liderazgo', 'Innovación'],
      },
    ],
    modules: [
      { nombre: 'Módulo 1', horas_presenciales: 100, horas_sincronicas: 48, horas_asincronicas: 40 },
    ],
    horasPresenciales: 100,
    horasSincronicas: 48,
    horasAsincronicas: 40,
    totalHours: 188,
    pricing: { mode: 'fixed', precioUf: 0, totalHours: 188, formaPago: '3 cuotas', fixedUf: 888 },
    contentBlocks: [
      {
        key: 'intro',
        titulo: 'Introducción',
        contenido: { sections: [{ type: 'paragraph', text: 'Texto de introducción de la propuesta.' }] },
        imagenes: null,
      },
    ],
    documents: [],
    licitacion: { id: 'lic', numero: 'LIC 2026/1', nombre: 'Licitación de prueba', year: 2026 },
    buckets: [
      { id: 'b1', label: 'Taller inicial', hours: 20, distributionType: 'bloque', modalidad: 'presencial', mes: 1 },
      { id: 'b2', label: 'Acompañamiento', hours: 30, distributionType: 'cadencia', modalidad: 'online' },
    ],
    ficha: null,
    ...overrides,
  };
}

function assertValidPdf(buf: Buffer) {
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(buf.length).toBeGreaterThan(1000);
  // PDF magic header
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
}

describe('generateProposalPDFBuffer (server-side jsPDF)', () => {
  it('renders a valid PDF buffer from a snapshot', () => {
    assertValidPdf(generateProposalPDFBuffer(makeSnapshot()));
  });

  it('renders the supporting-documents section without throwing', () => {
    const buf = generateProposalPDFBuffer(
      makeSnapshot({
        documents: [
          {
            id: 'd1',
            nombre: 'Certificado de Pertenencia',
            tipo: 'certificado_pertenencia',
            archivoPath: 'documentos/certificado_pertenencia/cert.pdf',
            descripcion: null,
          },
        ],
      })
    );
    assertValidPdf(buf);
  });

  it('renders when optional sections (buckets) are absent', () => {
    assertValidPdf(generateProposalPDFBuffer(makeSnapshot({ buckets: undefined })));
  });
});
