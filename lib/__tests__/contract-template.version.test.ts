import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { generateContractFromTemplate } from '../contract-template';

// F22a (T2): a contract keeps the text it was made with.
// - Without plantilla_version (or with null or 1) the output is today's text, byte for byte:
//   the golden files were written by running today's function at base 0bf8241b3.
// - With plantilla_version 2 the output is the corrected text: PRIMERO neutral, the escritura
//   date as a date, the duration counted to the end day, and exactly the ten wording slips.
// Invented names and data only. The fixtures have no fecha_fin, so the golden output does not
// depend on the time zone. Run this file with TZ=UTC and with TZ=America/Santiago.

const FIXTURES = path.join(__dirname, '__fixtures__');
const golden = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8');

const cliente = {
  nombre_legal: 'Fundación Educacional Sintética Los Aromos',
  nombre_fantasia: 'Colegio Sintético Los Aromos',
  rut: '76.000.000-0',
  direccion: 'Avenida Inventada 100',
  comuna: 'Ñuñoa',
  ciudad: 'Santiago',
  nombre_representante: 'María Inventada Soto',
  rut_representante: '12.345.678-5',
  fecha_escritura: '2018-03-08',
  nombre_notario: 'Pedro Notario Ficticio',
  comuna_notaria: 'Providencia',
};

const programa = {
  nombre: 'Programa Sintético de Acompañamiento',
  descripcion: 'Programa inventado para pruebas',
  horas_totales: 120,
  modalidad: 'mixta',
};

const ufContract = {
  numero_contrato: 'SINT-F22-UF-001',
  fecha_contrato: '2027-03-01',
  precio_total_uf: 120.5,
  tipo_moneda: 'UF',
  cliente,
  programa,
  cuotas: [
    { numero_cuota: 1, fecha_vencimiento: '2027-04-30', monto_uf: 40.25 },
    { numero_cuota: 2, fecha_vencimiento: '2027-07-31', monto_uf: 40.25 },
    { numero_cuota: 3, fecha_vencimiento: '2027-10-31', monto_uf: 40 },
  ],
};

const clpContract = {
  numero_contrato: 'SINT-F22-CLP-002',
  fecha_contrato: '2027-03-15',
  precio_total_uf: 0,
  precio_total_clp: 2400000,
  tipo_moneda: 'CLP',
  cliente,
  programa,
  cuotas: [
    { numero_cuota: 1, fecha_vencimiento: '2027-05-15', monto_clp: 1200000 },
    { numero_cuota: 2, fecha_vencimiento: '2027-09-15', monto_clp: 1200000 },
  ],
};

const v2 = (data: Record<string, unknown>) => generateContractFromTemplate({ ...data, plantilla_version: 2 });
const headings = (html: string) => (html.match(/<h2[ >]/g) || []).length;
const fundacionObligations = (html: string) => {
  const match = html.match(/<p>FUNDACIÓN INSTITUTO RELACIONAL \(NUEVA EDUCACIÓN\)\s*<br>1\.\tEntregar a los docentes[\s\S]*?<\/p>/);
  return match ? match[0] : '';
};
const durationOf = (fecha_contrato: string, fecha_fin: string, plantilla_version?: number) => {
  const html = generateContractFromTemplate({ ...ufContract, fecha_contrato, fecha_fin, plantilla_version });
  const match = html.match(/tendrá duración de (.*?), a contar de la suscripción/);
  return match ? match[1] : `(no duration sentence found)`;
};

describe('contract text, old version (no plantilla_version, null or 1)', () => {
  for (const version of [undefined, null, 1]) {
    it(`UF contract equals today's text byte for byte (plantilla_version ${String(version)})`, () => {
      const data = version === undefined ? ufContract : { ...ufContract, plantilla_version: version };
      expect(generateContractFromTemplate(data)).toBe(golden('contract-v1-golden-uf.html'));
    });
    it(`CLP contract equals today's text byte for byte (plantilla_version ${String(version)})`, () => {
      const data = version === undefined ? clpContract : { ...clpContract, plantilla_version: version };
      expect(generateContractFromTemplate(data)).toBe(golden('contract-v1-golden-clp.html'));
    });
  }

  // Today's calculateDuration reads the dates through new Date('YYYY-MM-DD'), so its result
  // depends on the time zone; this case is checked under TZ=UTC only.
  it.runIf(process.env.TZ === 'UTC')('the old text still uses today\'s duration (TZ=UTC only)', () => {
    expect(durationOf('2027-03-01', '2027-12-31')).toBe('9 meses y 30 días');
    expect(durationOf('2027-03-01', '2027-12-31')).not.toBe('10 meses');
  });
});

describe('contract text, corrected version (plantilla_version 2)', () => {
  const uf = v2(ufContract);
  const clp = v2(clpContract);

  it('PRIMERO is neutral: «es una institución educacional.»', () => {
    for (const html of [uf, clp]) {
      expect(html).toContain('FUNDACIÓN EDUCACIONAL SINTÉTICA LOS AROMOS, con personalidad jurídica y patrimonio propio, es una institución educacional. Por su parte, FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) es una fundación cuyo objetivo es');
      expect(html).not.toContain('cristiana');
      expect(html).not.toContain('cuya finalidad es entregar');
    }
  });

  it('the escritura date is written like the other dates', () => {
    expect(uf).toContain('consta en la Escritura Pública de fecha 08-03-2018, suscrita ante Pedro Notario Ficticio, Notario Público de Providencia.');
    expect(uf).not.toContain('2018-03-08');
  });

  it('the representative\'s RUT prints in the header as before', () => {
    expect(uf).toContain('representada por MARÍA INVENTADA SOTO, cédula nacional de identidad número 12.345.678-5, todos con domicilio');
  });

  it('S1 «para estos efectos en calle»', () => {
    expect(uf).toContain('ambos domiciliados para estos efectos en calle Carlos Silva Vildósola');
    expect(uf).not.toContain('para estos efectos calle');
  });

  it('S2 no space before the closing quote of the fantasy name', () => {
    expect(uf).toContain('en adelante e indistintamente como “COLEGIO SINTÉTICO LOS AROMOS” por una parte');
    expect(uf).not.toContain('LOS AROMOS  ”');
  });

  it('S3 «TERCERO: Precio y Forma de Pago», still 16 headings', () => {
    expect(uf).toContain('<h2>TERCERO: Precio y Forma de Pago</h2>');
    expect(uf).not.toContain('Forma Pago');
    expect(headings(uf)).toBe(16);
    expect(headings(clp)).toBe(16);
  });

  it('S4 «dentro de los siguientes 30 días» in both places', () => {
    expect(uf).not.toContain('dentro de los siguiente 30 días');
    expect(uf).toContain('según disponibilidad del equipo de la FUNDACIÓN NUEVA EDUCACIÓN dentro de los siguientes 30 días. Si el colegio');
    expect(uf).toContain('asegurando su realización dentro de los siguientes 30 días.');
  });

  it('S5 «comunicación continua»', () => {
    expect(uf).toContain('encargada de la comunicación continua con el área');
    expect(uf).not.toContain('continúa');
  });

  it('S6 items 4 and 5 of the Fundación\'s obligations are one item 4', () => {
    const list = fundacionObligations(uf);
    expect(list).not.toBe('');
    expect(list).toContain('4.\tCorresponde única y exclusivamente a FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) el pago de las remuneraciones');
    expect(list).toContain('exime de toda responsabilidad a FUNDACIÓN EDUCACIONAL SINTÉTICA LOS AROMOS respecto de cualquier obligación laboral que le quepa al primero respecto de los trabajadores de FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN).</p>');
    expect(list).not.toContain('5.');
    expect(list).not.toContain('LOS AROMOS. ');
  });

  it('S7 the paragraph on labour obligations ends with a period', () => {
    expect(uf).toContain('respecto de los trabajadores que destine a las labores propias del servicio.</p>');
  });

  it('S8 «u obligación entre FUNDACIÓN … y un tercero»', () => {
    expect(uf).toContain('no viola ningún contrato u obligación entre FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) y un tercero;');
    expect(uf).not.toContain('u obligación FUNDACIÓN');
  });

  it('S9 «de la ciudad de Santiago»', () => {
    expect(uf).toContain('tribunales ordinarios de justicia de la ciudad de Santiago, fijando');
    expect(uf).not.toContain('ciudad Santiago');
  });

  it('S10 «Municipalidad de La Reina»', () => {
    expect(uf).toContain('otorgados por la Municipalidad de La Reina con fecha');
    expect(uf).not.toContain('Municipalidad de la Reina');
  });

  it('the cuotas, the amounts and the signatures still print', () => {
    expect(uf).toContain('UF 120,50');
    expect(clp).toContain('$2.400.000');
    expect(uf).toContain('ARNOLDO CISTERNAS CHÁVEZ');
    expect(uf).not.toMatch(/\{\{[A-Z_/]+\}\}/);
    expect(clp).not.toMatch(/\{\{[A-Z_/]+\}\}/);
  });

  describe('the duration, computed on calendar dates counting the end day', () => {
    const cases: Array<[string, string, string]> = [
      ['2027-03-01', '2027-12-31', '10 meses'],
      ['2027-03-15', '2027-12-15', '9 meses y 1 día'],
      ['2027-03-01', '2028-02-29', '1 año'],
      ['2027-03-01', '2029-03-01', '2 años y 1 día'],
      ['2027-01-31', '2027-02-28', '1 mes y 1 día'],
      ['2027-05-10', '2027-05-10', '1 día'],
      ['2027-03-01', '2028-06-14', '1 año, 3 meses y 14 días'],
    ];
    for (const [start, end, expected] of cases) {
      it(`${start} → ${end} prints «${expected}»`, () => {
        expect(durationOf(start, end, 2)).toBe(expected);
      });
    }
    it('a missing end date prints «duración a determinar»', () => {
      expect(v2(ufContract)).toContain('tendrá duración de duración a determinar,');
    });
    it('an end date before the start date prints «duración a determinar»', () => {
      expect(durationOf('2027-03-01', '2027-02-28', 2)).toBe('duración a determinar');
    });
  });
});
