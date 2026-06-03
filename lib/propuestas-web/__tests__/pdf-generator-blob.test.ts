// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { generateProposalPDFBlob } from '../pdf-generator';
import type { ProposalSnapshot } from '../snapshot';

function makeSnapshot(overrides: Partial<ProposalSnapshot> = {}): ProposalSnapshot {
  return {
    version: 2,
    generatedAt: '2026-06-03T00:00:00.000Z',
    type: 'evoluciona',
    schoolName: 'Colegio de Prueba',
    schoolLogoPath: null,
    programYear: 2026,
    serviceName: 'Programa Evoluciona — Preview',
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
    documents: [
      {
        id: 'd1',
        nombre: 'Certificado de Pertenencia',
        tipo: 'certificado_pertenencia',
        archivoPath: 'documentos/certificado_pertenencia/cert.pdf',
        descripcion: null,
      },
    ],
    licitacion: { id: 'lic', numero: 'LIC 2026/1', nombre: 'Licitación de prueba', year: 2026 },
    buckets: [
      { id: 'b1', label: 'Taller inicial', hours: 20, distributionType: 'bloque', modalidad: 'presencial', mes: 1 },
      { id: 'b2', label: 'Acompañamiento', hours: 30, distributionType: 'cadencia', modalidad: 'online' },
    ],
    ficha: null,
    ...overrides,
  };
}

describe('generateProposalPDFBlob (browser preview)', () => {
  it('returns a non-empty application/pdf Blob from a representative snapshot', () => {
    const blob = generateProposalPDFBlob(makeSnapshot());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1000);
  });
});
