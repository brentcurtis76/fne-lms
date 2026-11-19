// @vitest-environment node
/**
 * LIC-E6: a proposal has ONE price, computed by totalUf(pricing) and used by
 * the configuration panel, the PDF and the public page. Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import { totalUf } from '../pricing';
import { generateProposalPDFBuffer } from '../pdf-generator';
import { buildProposalSnapshot, type BuildSnapshotInput, type ProposalSnapshot } from '../snapshot';

describe('totalUf(pricing)', () => {
  it('fixed with a value → that value', () => {
    expect(totalUf({ mode: 'fixed', precioUf: 2, totalHours: 100, fixedUf: 888 })).toBe(888);
  });

  it('fixed left blank → 0 (never the hourly rate × hours)', () => {
    expect(totalUf({ mode: 'fixed', precioUf: 2, totalHours: 100 })).toBe(0);
    expect(totalUf({ mode: 'fixed', precioUf: 2, totalHours: 100, fixedUf: undefined })).toBe(0);
    expect(totalUf({ mode: 'fixed', precioUf: 2, totalHours: 100, fixedUf: null })).toBe(0);
    expect(totalUf({ mode: 'fixed', precioUf: 2, totalHours: 100, fixedUf: '' })).toBe(0);
  });

  it('per hour → rate × hours', () => {
    expect(totalUf({ mode: 'per_hour', precioUf: 1.5, totalHours: 18 })).toBe(27);
    expect(totalUf({ mode: 'per_hour', precioUf: 1.5, totalHours: 18, fixedUf: 888 })).toBe(27);
  });

  it('negative values give a negative total (refused by the route)', () => {
    expect(totalUf({ mode: 'fixed', precioUf: 0, totalHours: 10, fixedUf: -5 })).toBe(-5);
    expect(totalUf({ mode: 'per_hour', precioUf: -1, totalHours: 10 })).toBe(-10);
  });

  it('text: a number written as text is read, any other text counts as 0', () => {
    expect(totalUf({ mode: 'fixed', precioUf: '', totalHours: 10, fixedUf: '120.5' })).toBe(120.5);
    expect(totalUf({ mode: 'per_hour', precioUf: '2', totalHours: 10 })).toBe(20);
    expect(totalUf({ mode: 'fixed', precioUf: 0, totalHours: 10, fixedUf: 'abc' })).toBe(0);
    expect(totalUf({ mode: 'per_hour', precioUf: 'abc', totalHours: 10 })).toBe(0);
  });
});

function makeSnapshot(pricing: ProposalSnapshot['pricing']): ProposalSnapshot {
  return {
    version: 1,
    generatedAt: '2026-11-19T00:00:00.000Z',
    type: 'evoluciona',
    schoolName: 'Escuela Inventada',
    schoolLogoPath: null,
    programYear: 2026,
    serviceName: 'Servicio Inventado',
    destinatarios: ['Docentes'],
    consultants: [],
    modules: [{ nombre: 'Módulo 1', horas_presenciales: 100, horas_sincronicas: 0, horas_asincronicas: 0 }],
    horasPresenciales: 100,
    horasSincronicas: 0,
    horasAsincronicas: 0,
    totalHours: 100,
    pricing,
    contentBlocks: [],
    documents: [],
    licitacion: { id: 'lic', numero: 'LIC 2026/1', nombre: 'Licitación inventada', year: 2026 },
    ficha: null,
  };
}

describe('the PDF prints totalUf(pricing)', () => {
  it('«Precio fijo» left blank: the PDF prints 0.00 UF, the same as the page and the panel', () => {
    const pricing = { mode: 'fixed' as const, precioUf: 2, totalHours: 100, formaPago: '3 cuotas' };
    expect(totalUf(pricing)).toBe(0);
    const text = generateProposalPDFBuffer(makeSnapshot(pricing)).toString('latin1');
    expect(text).toContain('0.00 UF');
    expect(text).not.toContain('200.00 UF');
  });

  it('per hour: the PDF prints rate × hours and never the rate', () => {
    const pricing = { mode: 'per_hour' as const, precioUf: 2.5, totalHours: 100, formaPago: '3 cuotas' };
    const text = generateProposalPDFBuffer(makeSnapshot(pricing)).toString('latin1');
    expect(text).toContain('250.00 UF');
  });
});

describe('the snapshot takes the pricing hours from its own total', () => {
  it('ignores the hours the client sent in pricing.totalHours', () => {
    const input: BuildSnapshotInput = {
      config: {
        type: 'evoluciona',
        schoolName: 'Escuela Inventada',
        programYear: 2026,
        serviceName: 'Servicio Inventado',
        consultants: [],
        modules: [{ nombre: 'Mod 1', horas_presenciales: 10, horas_sincronicas: 5, horas_asincronicas: 3 }],
        horasPresenciales: 10,
        horasSincronicas: 5,
        horasAsincronicas: 3,
        pricing: { mode: 'per_hour', precioUf: 2, totalHours: 999, formaPago: '3 cuotas' },
        contentBlocks: [],
      },
      version: 1,
      consultantRecords: [],
      selectedDocuments: [],
      licitacion: null,
      ficha: null,
    };
    const snap = buildProposalSnapshot(input);
    expect(snap.totalHours).toBe(18);
    expect(snap.pricing.totalHours).toBe(18);
    expect(totalUf(snap.pricing)).toBe(36);
  });
});
