// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { generateAnnexFromTemplate } from '../../lib/annex-template';

/**
 * F10a send-back 1, item 2 (GES-2.5): the annex's text names its parent
 * contract in clause 1. A manual parent has no programme, so the name comes
 * from its manual description; a programme parent is named exactly as before.
 * All data here is invented.
 */

const cliente = {
  nombre_legal: 'Corporación de Ejemplo',
  nombre_fantasia: 'Colegio de Ejemplo',
  nombre_representante: 'Representante de Ejemplo',
};
const annexBase = {
  anexo_numero: 2,
  anexo_fecha: '2026-09-08',
  numero_participantes: 2,
  nombre_ciclo: 'Primer Ciclo',
  precio_total_uf: 30,
  tipo_moneda: 'UF',
  cuotas: [{ numero_cuota: 1, monto_uf: 30, fecha_vencimiento: '2026-09-09' }],
};

function clauseOne(html: string): string {
  const node = document.createElement('div');
  node.innerHTML = html;
  return node.querySelectorAll('section.annex-clause')[0]?.querySelector('p')?.textContent ?? '';
}

describe('annex template — name of the parent contract', () => {
  it('a manual parent is named by its description, never by an empty ""', () => {
    const html = generateAnnexFromTemplate({
      ...annexBase,
      parentContract: {
        numero_contrato: 'C-200',
        fecha_contrato: '2026-06-22',
        cliente,
        programa: null,
        descripcion_manual: 'Asesoría sintética descrita a mano',
      },
    });
    expect(clauseOne(html)).toBe(
      'Se acuerda la incorporación de 2 líderes del Primer Ciclo del colegio al programa de asesoría "Asesoría sintética descrita a mano".'
    );
    expect(html).not.toContain('""');
  });

  it('a programme parent is named by its programme, with the existing wording', () => {
    const html = generateAnnexFromTemplate({
      ...annexBase,
      parentContract: {
        numero_contrato: 'C-100',
        fecha_contrato: '2026-06-22',
        cliente,
        programa: { nombre: 'Programa de Ejemplo' },
      },
    });
    expect(clauseOne(html)).toBe(
      'Se acuerda la incorporación de 2 líderes del Primer Ciclo del colegio al programa de asesoría "Programa de Ejemplo".'
    );
  });
});
