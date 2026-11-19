// @vitest-environment node
/**
 * LIC-B1 / LIC-B8 (GENERA fixes F20a): the Carta de adjudicación writes the
 * awarded amount in the tender's currency, the Chilean way. Before the fix a
 * tender in pesos read «35000000 UF». The real docx package is used and
 * word/document.xml is read back from the generated file. Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { generateCartaDocument, type CartaDocumentData } from '@/lib/cartaGenerator';

function carta(overrides: Partial<CartaDocumentData['licitacion']> = {}): CartaDocumentData {
  return {
    licitacion: {
      nombre_licitacion: 'Asesoría inventada de prueba',
      condiciones_pago: 'Tres cuotas iguales',
      monto_adjudicado_uf: 35000000,
      tipo_moneda: 'CLP',
      fecha_oferta_ganadora: '2026-10-05',
      contacto_coordinacion_nombre: 'Persona Inventada',
      contacto_coordinacion_email: 'coordinacion@example.test',
      contacto_coordinacion_telefono: '+56 9 0000 0000',
      ...overrides,
    },
    ganadorAte: { nombre_ate: 'ATE Sintética', rut_ate: '1-9', nombre_contacto: 'Contacto Ficticio' },
    school: { name: 'Colegio Inventado', ciudad: 'Ciudad Ficticia', director_nombre: 'Representante Inventado' },
    fechaEmision: '2026-11-19',
  };
}

async function documentText(data: CartaDocumentData): Promise<string> {
  const buffer = await generateCartaDocument(data);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml;
}

function amountSentence(xml: string): string {
  const match = xml.match(/El valor adjudicado[^<]*/);
  return match ? match[0] : '';
}

describe('Carta de adjudicación — the awarded amount', () => {
  it('writes a tender in pesos as «$35.000.000», never «35000000 UF»', async () => {
    const xml = await documentText(carta());
    expect(amountSentence(xml)).toContain('$35.000.000');
    expect(xml).not.toContain('35000000 UF');
    expect(xml).not.toContain('35000000');
  });

  it('writes a tender in UF as «UF 1.200,50»', async () => {
    const xml = await documentText(carta({ monto_adjudicado_uf: 1200.5, tipo_moneda: 'UF' }));
    expect(amountSentence(xml)).toContain('UF 1.200,50');
  });

  it('keeps the «[monto por confirmar]» placeholder when there is no amount', async () => {
    const xml = await documentText(carta({ monto_adjudicado_uf: null }));
    expect(amountSentence(xml)).toContain('[monto por confirmar]');
  });
});

describe('Carta de adjudicación — accents (LIC-B6)', () => {
  it('writes its Spanish words with their accents', async () => {
    const xml = await documentText(carta());
    expect(xml).toContain('De mi consideración:');
    expect(xml).toContain('la última oferta económica presentada');
    expect(xml).toContain('el Proveedor deberá coordinarse con la Dirección, a través de');
    expect(xml).not.toMatch(/consideracion|licitacion|ultima oferta|economica|segun|debera|Direccion|traves|telefono|adjudicacion|participacion|permitira/);
  });

  it('writes the phone placeholder with its accent', async () => {
    const xml = await documentText(carta({ contacto_coordinacion_telefono: null }));
    expect(xml).toContain('[teléfono coordinador]');
  });
});
