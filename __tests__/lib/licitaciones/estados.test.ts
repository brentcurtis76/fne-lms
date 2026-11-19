// @vitest-environment node
/**
 * GENERA fixes F20, LIC-D1: the one table of what may still change in a
 * tender, checked for every state of the ordered list (historical case included).
 */
import { describe, expect, it } from 'vitest';
import {
  ESTADOS_EN_ORDEN,
  esEstadoFinal,
  motivoRechazoSubida,
  puedeAgregarConsulta,
  puedeEditarDatos,
  puedeEliminarDocumento,
  puedeModificarAtes,
  puedeSubirDocumento,
  puedeSubirPropuesta,
  MENSAJE_EVALUACION_INICIADA,
  MENSAJE_SOLO_ANEXOS,
} from '@/lib/licitaciones/estados';

const TODOS = [
  'borrador', 'publicacion_pendiente', 'recepcion_bases_pendiente', 'propuestas_pendientes',
  'evaluacion_pendiente', 'adjudicacion_pendiente', 'contrato_pendiente',
  'contrato_generado', 'adjudicada_externo', 'cerrada',
] as const;

const ANTES_DE_EVALUACION = ['borrador', 'publicacion_pendiente', 'recepcion_bases_pendiente', 'propuestas_pendientes'];
const ANTES_DE_ADJUDICAR = [...ANTES_DE_EVALUACION, 'evaluacion_pendiente', 'adjudicacion_pendiente'];
const FINALES = ['contrato_generado', 'adjudicada_externo', 'cerrada'];
const NO_FINALES = TODOS.filter(e => !FINALES.includes(e));

const TIPOS = [
  'publicacion_imagen', 'bases_generadas', 'bases_enviadas', 'propuesta', 'evaluacion_generada',
  'evaluacion_firmada', 'carta_adjudicacion_generada', 'carta_adjudicacion_firmada', 'anexos', 'otro',
];

describe('ESTADOS_EN_ORDEN', () => {
  it('is the ordered list of states, end states last', () => {
    expect([...ESTADOS_EN_ORDEN]).toEqual([...TODOS]);
  });
});

describe.each(TODOS)('estado %s', (estado) => {
  it('esEstadoFinal', () => expect(esEstadoFinal(estado)).toBe(FINALES.includes(estado)));
  it('puedeModificarAtes (rule 1)', () => expect(puedeModificarAtes(estado)).toBe(ANTES_DE_EVALUACION.includes(estado)));
  it('puedeSubirPropuesta (rule 1)', () => expect(puedeSubirPropuesta(estado)).toBe(ANTES_DE_EVALUACION.includes(estado)));
  it('puedeEditarDatos (rule 2)', () => expect(puedeEditarDatos(estado)).toBe(ANTES_DE_ADJUDICAR.includes(estado)));
  it('puedeAgregarConsulta (rule 3)', () => expect(puedeAgregarConsulta(estado)).toBe(!FINALES.includes(estado)));
  it('puedeEliminarDocumento (rule 3)', () => expect(puedeEliminarDocumento(estado)).toBe(!FINALES.includes(estado)));

  it.each(TIPOS)('puedeSubirDocumento of tipo %s, not historical', (tipo) => {
    let expected = true;
    if (FINALES.includes(estado) && tipo !== 'anexos' && tipo !== 'otro') expected = false;
    if (tipo === 'propuesta' && !ANTES_DE_EVALUACION.includes(estado)) expected = false;
    expect(puedeSubirDocumento(estado, tipo, false)).toBe(expected);
  });

  it.each(TIPOS)('puedeSubirDocumento of tipo %s into a historical record: always accepted', (tipo) => {
    expect(puedeSubirDocumento(estado, tipo, true)).toBe(true);
  });
});

describe('the sentence of a refused upload', () => {
  it('end state, other kind: only anexos or otro', () => {
    expect(motivoRechazoSubida('contrato_generado', 'bases_enviadas', false)).toBe(MENSAJE_SOLO_ANEXOS);
    expect(motivoRechazoSubida('cerrada', 'propuesta', false)).toBe(MENSAJE_SOLO_ANEXOS);
  });
  it('a proposal kind after the evaluation began, before the end', () => {
    expect(motivoRechazoSubida('evaluacion_pendiente', 'propuesta', false)).toBe(MENSAJE_EVALUACION_INICIADA);
  });
  it('accepted: null', () => {
    expect(motivoRechazoSubida('contrato_generado', 'otro', false)).toBeNull();
    expect(motivoRechazoSubida('cerrada', 'bases_enviadas', true)).toBeNull();
    expect(motivoRechazoSubida('evaluacion_pendiente', 'evaluacion_firmada', false)).toBeNull();
    expect(motivoRechazoSubida('adjudicacion_pendiente', 'carta_adjudicacion_firmada', false)).toBeNull();
  });
});

describe('a state that is not in the list is never refused', () => {
  it.each([undefined, null, '', 'desconocido'])('%s', (estado) => {
    expect(puedeModificarAtes(estado)).toBe(true);
    expect(puedeEditarDatos(estado)).toBe(true);
    expect(puedeAgregarConsulta(estado)).toBe(true);
    expect(puedeEliminarDocumento(estado)).toBe(true);
    expect(puedeSubirDocumento(estado, 'bases_enviadas', false)).toBe(true);
  });
});

it('NO_FINALES covers seven states', () => expect(NO_FINALES).toHaveLength(7));
