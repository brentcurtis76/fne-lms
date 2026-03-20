import { describe, it, expect } from 'vitest';
import { buildProposalSnapshot, type BuildSnapshotInput } from '../snapshot';

const BASE_INPUT: BuildSnapshotInput = {
  config: {
    type: 'evoluciona',
    schoolName: 'Colegio Test',
    programYear: 2026,
    serviceName: 'Servicio Test',
    consultants: [],
    modules: [
      { nombre: 'Mod 1', horas_presenciales: 10, horas_sincronicas: 5, horas_asincronicas: 3 },
    ],
    horasPresenciales: 10,
    horasSincronicas: 5,
    horasAsincronicas: 3,
    pricing: { mode: 'per_hour', precioUf: 1.5, totalHours: 18, formaPago: '3 cuotas' },
    contentBlocks: [],
  },
  version: 1,
  consultantRecords: [],
  selectedDocuments: [],
  licitacion: null,
  ficha: null,
};

describe('buildProposalSnapshot — buckets', () => {
  it('omits buckets field when no buckets provided', () => {
    const snap = buildProposalSnapshot(BASE_INPUT);
    expect(snap.buckets).toBeUndefined();
  });

  it('omits buckets field when all buckets have 0 hours', () => {
    const snap = buildProposalSnapshot({
      ...BASE_INPUT,
      config: {
        ...BASE_INPUT.config,
        buckets: [
          { id: 'taller-1', label: 'Taller 1', hours: 0, distributionType: 'bloque', modalidad: 'presencial' },
          { id: 'plataforma', label: 'Plataforma', hours: 0, distributionType: 'flexible', modalidad: 'asincronico' },
        ],
      },
    });
    expect(snap.buckets).toBeUndefined();
  });

  it('includes only buckets with hours > 0', () => {
    const snap = buildProposalSnapshot({
      ...BASE_INPUT,
      config: {
        ...BASE_INPUT.config,
        buckets: [
          { id: 'taller-1', label: 'Taller 1', hours: 24, distributionType: 'bloque', modalidad: 'presencial' },
          { id: 'taller-2', label: 'Taller 2', hours: 0, distributionType: 'bloque', modalidad: 'presencial' },
          { id: 'custom-123', label: 'Custom', hours: 10, distributionType: 'cadencia', modalidad: 'online', isCustom: true, notes: 'test' },
        ],
      },
    });
    expect(snap.buckets).toHaveLength(2);
    expect(snap.buckets![0].id).toBe('taller-1');
    expect(snap.buckets![0].hours).toBe(24);
    expect(snap.buckets![1].id).toBe('custom-123');
    expect(snap.buckets![1].isCustom).toBe(true);
    expect(snap.buckets![1].notes).toBe('test');
  });

  it('preserves all bucket fields in snapshot', () => {
    const snap = buildProposalSnapshot({
      ...BASE_INPUT,
      config: {
        ...BASE_INPUT.config,
        buckets: [
          {
            id: 'acomp-directivo',
            label: 'Acompañamiento Directivo',
            hours: 16,
            distributionType: 'cadencia',
            modalidad: 'presencial',
            notes: 'Monthly sessions',
          },
        ],
      },
    });
    expect(snap.buckets).toHaveLength(1);
    const b = snap.buckets![0];
    expect(b).toEqual({
      id: 'acomp-directivo',
      label: 'Acompañamiento Directivo',
      hours: 16,
      distributionType: 'cadencia',
      modalidad: 'presencial',
      notes: 'Monthly sessions',
    });
  });
});

describe('buildProposalSnapshot — client enrichment', () => {
  it('includes cliente data when provided', () => {
    const snap = buildProposalSnapshot({
      ...BASE_INPUT,
      cliente: {
        nombre_legal: 'Sostenedor Test SpA',
        nombre_fantasia: 'Colegio Fantasía',
        comuna: 'Las Condes',
        ciudad: 'Santiago',
        nombre_representante: 'Juan Pérez',
      },
    });
    expect(snap.cliente).toEqual({
      nombreLegal: 'Sostenedor Test SpA',
      nombreFantasia: 'Colegio Fantasía',
      comuna: 'Las Condes',
      ciudad: 'Santiago',
      nombreRepresentante: 'Juan Pérez',
    });
  });

  it('omits cliente when not provided', () => {
    const snap = buildProposalSnapshot(BASE_INPUT);
    expect(snap.cliente).toBeUndefined();
  });

  it('includes schoolCode when provided', () => {
    const snap = buildProposalSnapshot({ ...BASE_INPUT, schoolCode: 'RBD-12345' });
    expect(snap.schoolCode).toBe('RBD-12345');
  });

  it('includes fichaObjetivo from ficha', () => {
    const snap = buildProposalSnapshot({
      ...BASE_INPUT,
      ficha: {
        id: 'f1',
        folio: 52244,
        nombre_servicio: 'Test',
        dimension: 'Liderazgo',
        categoria: 'Asesoría',
        total_horas: 148,
        destinatarios: ['Directivos'],
        objetivo_general: 'Transformar comunidades educativas',
      },
    });
    expect(snap.fichaObjetivo).toBe('Transformar comunidades educativas');
  });
});

describe('buildProposalSnapshot — interpolation', () => {
  it('replaces {{school_name}} in content block text', () => {
    const snap = buildProposalSnapshot({
      ...BASE_INPUT,
      config: {
        ...BASE_INPUT.config,
        contentBlocks: [
          {
            key: 'test-block',
            titulo: 'Test',
            contenido: {
              sections: [
                { type: 'paragraph', text: 'Programa para {{school_name}} en {{program_year}}' },
              ],
            },
          },
        ],
      },
    });
    expect(snap.contentBlocks[0].contenido.sections[0].text).toBe(
      'Programa para Colegio Test en 2026'
    );
  });

  it('replaces {{client_name}} with cliente fantasia when available', () => {
    const snap = buildProposalSnapshot({
      ...BASE_INPUT,
      cliente: {
        nombre_legal: 'Legal',
        nombre_fantasia: 'Mi Colegio',
        comuna: null,
        ciudad: null,
        nombre_representante: 'Director',
      },
      config: {
        ...BASE_INPUT.config,
        contentBlocks: [
          {
            key: 'test',
            titulo: 'Test',
            contenido: {
              sections: [
                { type: 'paragraph', text: 'Para {{client_name}}, representado por {{representative}}' },
              ],
            },
          },
        ],
      },
    });
    expect(snap.contentBlocks[0].contenido.sections[0].text).toBe(
      'Para Mi Colegio, representado por Director'
    );
  });

  it('replaces variables in list items too', () => {
    const snap = buildProposalSnapshot({
      ...BASE_INPUT,
      config: {
        ...BASE_INPUT.config,
        contentBlocks: [
          {
            key: 'test',
            titulo: 'Test',
            contenido: {
              sections: [
                { type: 'list', items: ['Horas: {{total_hours}}', 'Colegio: {{school_name}}'] },
              ],
            },
          },
        ],
      },
    });
    const items = snap.contentBlocks[0].contenido.sections[0].items!;
    expect(items[0]).toBe('Horas: 18');
    expect(items[1]).toBe('Colegio: Colegio Test');
  });

  it('leaves text unchanged when no variables present', () => {
    const snap = buildProposalSnapshot({
      ...BASE_INPUT,
      config: {
        ...BASE_INPUT.config,
        contentBlocks: [
          {
            key: 'test',
            titulo: 'Test',
            contenido: {
              sections: [{ type: 'paragraph', text: 'No variables here.' }],
            },
          },
        ],
      },
    });
    expect(snap.contentBlocks[0].contenido.sections[0].text).toBe('No variables here.');
  });
});
