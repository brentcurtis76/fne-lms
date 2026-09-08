// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { generateAnnexFromTemplate } from '../annex-template';
import { generateContractFromTemplate } from '../contract-template';

const parent = {
  numero_contrato: 'FNE-DEMO-2026', fecha_contrato: '2026-06-22', fecha_fin: '2027-06-22',
  cliente: { nombre_legal: 'Corporación de Ejemplo', nombre_representante: 'Representante de Ejemplo', nombre_fantasia: 'Colegio de Ejemplo' },
  programa: { nombre: 'Programa de Ejemplo' },
};
const annex = { parentContract: parent, anexo_numero: 2, anexo_fecha: '2026-09-08', numero_participantes: 2, nombre_ciclo: 'Primer Ciclo', precio_total_uf: 4969000, tipo_moneda: 'CLP', cuotas: [{ numero_cuota: 1, monto_clp: 4969000, fecha_vencimiento: '2026-09-09' }] };
function documentFor(html: string) { const node = document.createElement('div'); node.innerHTML = html; return node; }

describe('FNE document presentation', () => {
  it('keeps all annex clauses, correct CLP payment and both signatures', () => {
    const node = documentFor(generateAnnexFromTemplate(annex));
    expect(node.querySelectorAll('h2')).toHaveLength(4);
    expect(node.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(node.querySelector('tbody')?.textContent).toContain('$4.969.000');
    expect(node.querySelector('tbody')?.textContent).toContain('09-09-2026');
    expect(node.querySelectorAll('.doc-signature')).toHaveLength(2);
    expect(node.textContent).toContain('La mora o retraso');
    expect(node.textContent).toContain('permanecen plenamente vigentes');
    expect(node.textContent).not.toContain('{{');
  });
  it('formats UF and retains every row in a long schedule', () => {
    const node = documentFor(generateAnnexFromTemplate({ ...annex, tipo_moneda: 'UF', precio_total_uf: 30.5, cuotas: Array.from({length:30}, (_,i) => ({ numero_cuota: i+1, monto_uf: 1.25, fecha_vencimiento: '2026-09-09' })) }));
    expect(node.querySelectorAll('tbody tr')).toHaveLength(30);
    expect(node.querySelector('tbody')?.textContent).toContain('UF 1,25');
    expect(node.querySelectorAll('.doc-signature')).toHaveLength(2);
  });
  it('keeps all sixteen contract clauses and the personería fallback', () => {
    const node = documentFor(generateContractFromTemplate({ ...parent, tipo_moneda:'CLP', precio_total_uf:4969000, cuotas:annex.cuotas }));
    expect(node.querySelectorAll('h2')).toHaveLength(16);
    for (const heading of node.querySelectorAll('h2')) expect(heading.textContent!.length).toBeLessThan(200);
    expect(node.textContent).toContain('instrumentos legales correspondientes');
    expect(node.querySelectorAll('.doc-signature')).toHaveLength(2);
    expect(node.querySelector('tbody')?.textContent).toContain('$4.969.000');
    expect(node.textContent).not.toContain('{{');
  });
  it('renders client markup as text and preserves literal replacement metacharacters', () => {
    const node = documentFor(generateAnnexFromTemplate({ ...annex, parentContract:{...parent,cliente:{...parent.cliente,nombre_legal:'<img src=x onerror=alert(1)> $&'}} }));
    expect(node.querySelectorAll('img')).toHaveLength(1);
    expect(node.textContent).toContain('<img src=x onerror=alert(1)> $&');
  });
});
