// @vitest-environment node
/**
 * LIC-B4 / LIC-B8 (GENERA fixes F20a): the text of the generated bases. The
 * duration typed «6 meses» used to come out as «6 meses meses», and the budget
 * as «50 UF». The real docx package is used (the sibling docxGenerator.test.ts
 * mocks it) and word/document.xml is read back. Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { generateBasesDocument, type BasesDocumentData } from '@/lib/docxGenerator';

function bases(overrides: Partial<BasesDocumentData['licitacion']> = {}): BasesDocumentData {
  return {
    licitacion: {
      id: 'lic-inventada-1',
      numero_licitacion: 'LIC-2026-INV-001',
      nombre_licitacion: 'Asesoría inventada',
      year: 2026,
      monto_minimo: 1200.5,
      monto_maximo: 1500,
      tipo_moneda: 'UF',
      duracion_minima: '6 meses',
      duracion_maxima: '12',
      peso_evaluacion_tecnica: 70,
      peso_evaluacion_economica: 30,
      email_licitacion: 'licitacion@example.test',
      fecha_publicacion: '2026-03-02',
      participantes_estimados: 25,
      ...overrides,
    },
    school: { name: 'Colegio Inventado' },
    cliente: {
      nombre_legal: 'Fundación Ficticia', nombre_fantasia: 'Colegio Inventado', rut: '1-9',
      direccion: 'Calle Inventada 1', comuna: 'Comuna Ficticia', ciudad: 'Ciudad Ficticia',
      nombre_representante: 'Representante Inventado', rut_representante: '2-7',
    },
    programa: { id: 'prog-1', nombre: 'Programa Inventado' },
    template: {
      nombre_servicio: 'Servicio inventado', objetivo: 'Objetivo inventado', objetivos_especificos: ['Uno'],
      especificaciones_admin: {}, resultados_esperados: ['Uno'], requisitos_ate: ['Uno'], documentos_adjuntar: ['Uno'],
      condiciones_pago: null,
    },
    criterios: [{ nombre_criterio: 'Criterio inventado', puntaje_maximo: 100, descripcion: null, orden: 1 }],
  };
}

async function documentText(data: BasesDocumentData): Promise<string> {
  const buffer = await generateBasesDocument(data);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml.replace(/<[^>]+>/g, '');
}

describe('Bases — duration and budget sentences', () => {
  it('writes «6 meses» once, adds «meses» to a bare number, never «meses meses»', async () => {
    const text = await documentText(bases());
    expect(text).toContain('La duración mínima del servicio es de 6 meses y la duración máxima es de 12 meses.');
    expect(text.match(/6 meses/g)).toHaveLength(1);
    expect(text).not.toContain('meses meses');
  });

  it('writes a UF budget the Chilean way', async () => {
    const text = await documentText(bases());
    expect(text).toContain('un mínimo de UF 1.200,50 y un máximo de UF 1.500,00,');
  });

  it('writes a peso budget the Chilean way', async () => {
    const text = await documentText(bases({ tipo_moneda: 'CLP', monto_minimo: 15000000, monto_maximo: 35000000 }));
    expect(text).toContain('un mínimo de $15.000.000 y un máximo de $35.000.000,');
    expect(text).not.toContain('35000000 CLP');
  });
});
