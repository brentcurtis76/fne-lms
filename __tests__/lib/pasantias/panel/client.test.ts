// @vitest-environment node
/**
 * PASANTÍAS PANEL — the browser-side pure helpers: filters, summary counts, CSV
 * rows, the tracking request body and what a letter still lacks.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  PANEL_CSV_HEADERS,
  filterRows,
  filtersActive,
  logisticsBody,
  matchesSearch,
  panelCsvRows,
  shortDate,
} from '../../../../lib/pasantias/panel/client';
import {
  ACTIVITY_ACTIONS,
  ALLOWED_MIME,
  DOCUMENT_KINDS,
  EMPTY_LOGISTICS,
  FLIGHT_STATUSES,
  LODGING_STATUSES,
  MAX_FILE_BYTES,
  STORED_FILE_MAX_BYTES,
  SALUTATIONS,
  letterMissing,
  summarize,
  type Logistics,
  type PanelRoster,
  type PanelRow,
} from '../../../../lib/pasantias/panel/types';

const ROSTERS: PanelRoster[] = [
  {
    id: 'r1',
    schoolName: 'Colegio Sintético Uno',
    program: 'inspira',
    programName: 'Pasantía INSPIRA',
    status: 'submitted',
    lastSubmittedAt: '2026-11-01T12:00:00.000Z',
    schoolFunding: { flightsFunding: 'sep', lodgingFunding: 'colegio', version: 1 },
    details: { letterSchoolLine: 'del Colegio Sintético Uno, Chile', letterLodgingLine: 'la Residencia X', version: 1 },
  },
  {
    id: 'r2',
    schoolName: 'Colegio  sintético UNO',
    program: 'mirada-profunda',
    programName: 'INSPIRA Mirada Profunda',
    status: 'open',
    lastSubmittedAt: null,
    schoolFunding: null,
    details: { letterSchoolLine: null, letterLodgingLine: null, version: null },
  },
  {
    id: 'r3',
    schoolName: 'Liceo Sintético Dos',
    program: 'inspira',
    programName: 'Pasantía INSPIRA',
    status: 'open',
    lastSubmittedAt: null,
    schoolFunding: null,
    details: { letterSchoolLine: null, letterLodgingLine: null, version: null },
  },
];

function row(id: string, rosterId: string, names: [string, string], rut: string, logistics: Partial<Logistics> = {}): PanelRow {
  return {
    rosterId,
    participant: {
      id,
      version: 1,
      firstNames: names[0],
      lastNames: names[1],
      rut,
      passportNumber: id === 'p1' ? 'AB123456' : null,
      arrivalDate: id === 'p1' ? '2027-01-17' : null,
      departureDate: null,
      focus: id === 'p1' ? 'todos' : null,
      dietaryRestrictions: id === 'p1' ? ['otra', 'vegano'] : [],
      dietaryOther: id === 'p1' ? '=cmd|calc' : null,
      updatedAt: '2026-11-01T12:00:00.000Z',
      createdAt: '2026-11-01T12:00:00.000Z',
      acknowledgedAt: '2026-11-01T12:00:00.000Z',
      noticeVersion: 'v',
    },
    logistics: { ...EMPTY_LOGISTICS, ...logistics },
    documentCount: id === 'p1' ? 2 : 0,
    hasLetter: id === 'p1',
  };
}

const ROWS: PanelRow[] = [
  row('p1', 'r1', ['Ana María', 'Pérez Núñez'], '11111111-1', {
    flightStatus: 'paid',
    lodgingStatus: 'reserved',
    depositReceived: true,
    balanceReceived: true,
    notes: 'Viaja con\nequipaje extra',
    version: 4,
  }),
  row('p2', 'r1', ['Benjamín', 'Soto'], '22222222-2', { flightStatus: 'purchased', depositReceived: true, version: 1 }),
  row('p3', 'r2', ['Carla', 'Ibáñez'], '33333333-3'),
  row('p4', 'r3', ['Diego', 'Muñoz'], '44444444-4', { lodgingStatus: 'paid', version: 2 }),
];

const ids = (rows: PanelRow[]) => rows.map((r) => r.participant.id);

describe('filterRows', () => {
  it('returns everything with no filter', () => {
    expect(ids(filterRows(ROWS, ROSTERS, EMPTY_FILTERS))).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(filtersActive(EMPTY_FILTERS)).toBe(false);
  });

  it('searches names without accents, the RUT in any writing, and the passport', () => {
    const search = (text: string) => ids(filterRows(ROWS, ROSTERS, { ...EMPTY_FILTERS, search: text }));
    expect(search('perez nunez')).toEqual(['p1']);
    expect(search('IBAÑEZ')).toEqual(['p3']);
    expect(search('22.222.222-2')).toEqual(['p2']);
    expect(search('222222222')).toEqual(['p2']);
    expect(search('ab1234')).toEqual(['p1']);
    expect(search('ana soto')).toEqual([]);
    expect(matchesSearch(ROWS[0], '   ')).toBe(true);
  });

  it('filters by school roster, program, each status and payment, combined with AND', () => {
    const f = (change: Partial<typeof EMPTY_FILTERS>) => ids(filterRows(ROWS, ROSTERS, { ...EMPTY_FILTERS, ...change }));
    expect(f({ rosterId: 'r1' })).toEqual(['p1', 'p2']);
    expect(f({ program: 'inspira' })).toEqual(['p1', 'p2', 'p4']);
    expect(f({ flight: 'pending' })).toEqual(['p3', 'p4']);
    expect(f({ lodging: 'paid' })).toEqual(['p4']);
    expect(f({ payment: 'deposit_pending' })).toEqual(['p3', 'p4']);
    expect(f({ payment: 'balance_pending' })).toEqual(['p2', 'p3', 'p4']);
    expect(f({ payment: 'all_received' })).toEqual(['p1']);
    expect(f({ program: 'inspira', flight: 'pending', search: 'diego' })).toEqual(['p4']);
    expect(filtersActive({ ...EMPTY_FILTERS, payment: 'all_received' })).toBe(true);
  });
});

describe('summarize', () => {
  it('counts travellers, distinct schools (same name in two programs = one) and each milestone', () => {
    expect(summarize(ROWS, ROSTERS)).toEqual({
      travellers: 4,
      schools: 2,
      flightPurchased: 2,
      flightPaid: 1,
      lodgingReserved: 2,
      lodgingPaid: 1,
      depositReceived: 2,
      balanceReceived: 1,
    });
    expect(summarize([], ROSTERS).schools).toBe(0);
  });
});

describe('logisticsBody', () => {
  it('sends every stored value with one change applied and the STORED version', () => {
    expect(logisticsBody(ROWS[0].logistics, { lodgingStatus: 'paid' })).toEqual({
      flightStatus: 'paid',
      lodgingStatus: 'paid',
      depositReceived: true,
      balanceReceived: true,
      salutation: null,
      notes: 'Viaja con\nequipaje extra',
      expectedVersion: 4,
    });
  });

  it('expects no row when nothing was saved yet', () => {
    expect(logisticsBody(ROWS[2].logistics, { depositReceived: true }).expectedVersion).toBeNull();
  });
});

describe('panelCsvRows', () => {
  const csv = panelCsvRows(ROWS, ROSTERS);

  it('has one object per traveller keyed by exactly the headers', () => {
    expect(csv).toHaveLength(4);
    for (const line of csv) expect(Object.keys(line)).toEqual([...PANEL_CSV_HEADERS]);
    // ReportExporter reads a dotted header as a nested path.
    expect(PANEL_CSV_HEADERS.some((header) => header.includes('.'))).toBe(false);
  });

  it('writes the values in es-CL', () => {
    expect(csv[0]).toMatchObject({
      Colegio: 'Colegio Sintético Uno',
      Programa: 'Pasantía INSPIRA',
      Nombres: 'Ana María',
      Apellidos: 'Pérez Núñez',
      RUT: '11.111.111-1',
      Pasaporte: 'AB123456',
      Llegada: '17-01-2027',
      Regreso: '',
      Foco: 'Todos',
      'Pasajes a cargo de': 'Costo SEP',
      'Estadía a cargo de': 'Costo Colegio',
      Pasaje: 'Pagado',
      Alojamiento: 'Reservado',
      'Abono 50%': 'Recibido',
      'Saldo 50%': 'Recibido',
      Documentos: '2',
      'Carta de invitación': 'Generada',
      Notas: 'Viaja con\nequipaje extra',
    });
    expect(csv[2]).toMatchObject({ 'Pasajes a cargo de': '', Pasaje: 'Pendiente', 'Abono 50%': 'Pendiente', Documentos: '0' });
  });

  it('leaves school-typed text raw for the exporter to neutralize (never pre-escaped twice)', () => {
    expect(csv[0].Alimentación).toBe('Otra: =cmd|calc · Vegano');
  });
});

describe('shortDate', () => {
  it('formats ISO dates as dd-mm-yyyy', () => {
    expect(shortDate('2027-01-17')).toBe('17-01-2027');
    expect(shortDate(null)).toBe('—');
  });
});

describe('letterMissing', () => {
  const ready = {
    logistics: { salutation: 'estimada' as const },
    details: { letterSchoolLine: 'del Colegio X', letterLodgingLine: 'la Residencia Y' },
    assets: { logo: true, signature: true },
  };

  it('is empty only when all five things exist', () => {
    expect(letterMissing(ready.logistics, ready.details, ready.assets)).toEqual([]);
  });

  it('names each missing thing', () => {
    expect(
      letterMissing({ salutation: null }, { letterSchoolLine: null, letterLodgingLine: null }, { logo: false, signature: false })
    ).toHaveLength(5);
    expect(letterMissing(ready.logistics, ready.details, { logo: true, signature: false })).toEqual(['la firma de la carta']);
    expect(letterMissing({ salutation: null }, ready.details, ready.assets)[0]).toContain('Estimado/Estimada');
  });
});

describe('value sets match the migration CHECKs', () => {
  const sql = readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261109210000_pasantias_logistics_panel.sql'),
    'utf8'
  );
  const list = (values: readonly string[]) => `(${values.map((v) => `'${v}'`).join(', ')})`;

  it('statuses, greetings, document kinds, activity actions, MIME types and size', () => {
    expect(sql).toContain(`CHECK (flight_status IN ${list(FLIGHT_STATUSES)})`);
    expect(sql).toContain(`CHECK (lodging_status IN ${list(LODGING_STATUSES)})`);
    expect(sql).toContain(`salutation IN ${list(SALUTATIONS)})`);
    expect(sql).toContain(`CHECK (kind IN ${list(DOCUMENT_KINDS)})`);
    expect(sql).toContain(`CHECK (mime_type IN ${list(Object.keys(ALLOWED_MIME))})`);
    expect(sql).toContain(`CHECK (size_bytes BETWEEN 1 AND ${STORED_FILE_MAX_BYTES})`);
    expect(sql).toContain(`'pasantias-documents', false, ${STORED_FILE_MAX_BYTES},`);
    // An upload must fit the platform's 4.5 MB request limit, below the stored ceiling.
    expect(MAX_FILE_BYTES).toBeLessThan(4.5 * 1024 * 1024);
    expect(MAX_FILE_BYTES).toBeLessThanOrEqual(STORED_FILE_MAX_BYTES);
    for (const action of ACTIVITY_ACTIONS) expect(sql).toContain(`'${action}'`);
    expect(sql).toContain(`\\.(${Object.values(ALLOWED_MIME).join('|')})$`);
  });
});
