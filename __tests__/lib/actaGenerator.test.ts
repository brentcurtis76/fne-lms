// @vitest-environment node
/**
 * LIC-B2 / LIC-B6 / LIC-B8 (GENERA fixes F20b): the Acta de Reunión writes
 * every amount in the tender's currency, the Chilean way (the helper of
 * lib/licitaciones/formato.ts), and its Spanish words with their accents.
 * Before the fix a tender in UF read «$450». The real docx package is used and
 * word/document.xml is read back from the generated file. Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { generateActaDocument, type ActaDocumentData } from '@/lib/actaGenerator';

function acta(tipoMoneda: 'UF' | 'CLP', montos: [number, number]): ActaDocumentData {
  return {
    licitacion: {
      nombre_licitacion: 'Asesoría inventada de prueba',
      numero_licitacion: 'LIC-1-2026-001',
      peso_evaluacion_tecnica: 70,
      peso_evaluacion_economica: 30,
      tipo_moneda: tipoMoneda,
    },
    fechaEvaluacion: '2026-11-05',
    horaInicio: '10:00',
    horaFin: '11:00',
    committee: [
      { nombre: 'Persona Inventada Uno', rut: null, cargo: null, orden: 1 },
      { nombre: 'Persona Inventada Dos', rut: null, cargo: null, orden: 2 },
      { nombre: 'Persona Inventada Tres', rut: null, cargo: null, orden: 3 },
    ],
    ates: [
      {
        id: 'ate-a', nombre_ate: 'ATE Sintética A', rut_ate: '1-9', puntaje_total: 86, puntaje_tecnico: 80,
        puntaje_economico: 100, puntaje_tecnico_ponderado: 56, puntaje_economico_ponderado: 30,
        monto_propuesto: montos[0], es_ganador: true,
      },
      {
        id: 'ate-b', nombre_ate: 'ATE Sintética B', rut_ate: '2-7', puntaje_total: 70, puntaje_tecnico: 70,
        puntaje_economico: 70, puntaje_tecnico_ponderado: 49, puntaje_economico_ponderado: 21,
        monto_propuesto: montos[1], es_ganador: false,
      },
    ],
    criterios: [{ id: 'crit-1', nombre_criterio: 'Criterio inventado', puntaje_maximo: 100, orden: 1 }],
    scoresByAte: { 'ate-a': { 'crit-1': 80 }, 'ate-b': { 'crit-1': 70 } },
  };
}

async function documentXml(data: ActaDocumentData): Promise<string> {
  const buffer = await generateActaDocument(data);
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml')!.async('string');
}

/** The economic table: from its «Monto Propuesto» header to the next heading. */
function economicTable(xml: string): string {
  const match = xml.match(/Monto Propuesto[\s\S]*?Final Ponderada/);
  return match ? match[0] : '';
}

describe('Acta de Reunión — amounts in the tender\'s currency (LIC-B2, LIC-B8)', () => {
  it('writes a tender in UF as «UF 450,00», never with «$»', async () => {
    const xml = await documentXml(acta('UF', [450, 640.25]));
    const table = economicTable(xml);
    expect(table).toContain('UF 450,00');
    expect(table).toContain('UF 640,25');
    expect(xml).not.toContain('$');
  });

  it('writes a tender in pesos as «$15.000.000»', async () => {
    const xml = await documentXml(acta('CLP', [15000000, 21500000]));
    const table = economicTable(xml);
    expect(table).toContain('$15.000.000');
    expect(table).toContain('$21.500.000');
    expect(xml).not.toContain('UF ');
  });
});

describe('Acta de Reunión — accents (LIC-B6)', () => {
  it('writes its Spanish words with their accents', async () => {
    const xml = await documentXml(acta('UF', [450, 640.25]));
    expect(xml).toContain('ACTA DE REUNIÓN');
    expect(xml).toContain('para la licitación de:');
    expect(xml).toContain('entregar la evaluación del adjudicado');
    expect(xml).toContain('se reúne la comisión para evaluar');
    expect(xml).toContain('la revisión sistemática de todos los documentos');
    expect(xml).toContain('cada ítem de la pauta');
    expect(xml).toContain('Firmas de la Comisión Evaluadora');
    expect(xml).toContain('INFORMACIÓN ANEXA');
    expect(xml).toContain('CRITERIOS DE EVALUACIÓN');
    expect(xml).toContain('Evaluación Económica');
    expect(xml).toContain('Puntaje Económico');
    expect(xml).toContain('Evaluación Final Ponderada');
    expect(xml).toContain('para la ejecución del programa');
    expect(xml).toContain('Sí');
    expect(xml).not.toMatch(/REUNION|licitacion|evaluacion|EVALUACION|comision|Comision|reune|revision|sistematica|Economic|Tecnic|ejecucion|INFORMACION|Ponderacion|>Si</);
  });

  it('says the evaluation is pending with its accents when there is no winner', async () => {
    const data = acta('UF', [450, 640.25]);
    data.ates = data.ates.map(a => ({ ...a, es_ganador: false }));
    const xml = await documentXml(data);
    expect(xml).toContain('El proceso de evaluación está pendiente de finalización.');
  });
});
