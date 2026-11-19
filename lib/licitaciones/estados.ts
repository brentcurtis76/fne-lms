/**
 * What may still change in a tender, by its state (GENERA fixes F20, LIC-D1).
 *
 * One table for the routes and the step screens, built from the ordered list
 * of states. Only what is plainly wrong is refused:
 *   1. Once the evaluation has begun (evaluacion_pendiente or later) no
 *      provider (ATE) is added, changed or removed and no proposal file is
 *      uploaded or replaced.
 *   2. Once the tender is awarded (contrato_pendiente or an end state) the
 *      admin no longer changes the tender's own data; notes, the publication
 *      image and the timeline branch stay open.
 *   3. In an end state no question is added and no document is deleted;
 *      uploads are accepted only for «anexos» and «otro», except into a
 *      historical record (the archive view), which accepts every kind.
 * A state that is not in the list is never refused here.
 */

import type { LicitacionEstado } from '@/types/licitaciones';

/** The states of a tender, in workflow order; the last three are the end states. */
export const ESTADOS_EN_ORDEN: readonly LicitacionEstado[] = [
  'borrador',
  'publicacion_pendiente',
  'recepcion_bases_pendiente',
  'propuestas_pendientes',
  'evaluacion_pendiente',
  'adjudicacion_pendiente',
  'contrato_pendiente',
  'contrato_generado',
  'adjudicada_externo',
  'cerrada',
];

const INICIO_EVALUACION: LicitacionEstado = 'evaluacion_pendiente';
const INICIO_ADJUDICADA: LicitacionEstado = 'contrato_pendiente';
const INICIO_FINAL: LicitacionEstado = 'contrato_generado';

/** Upload kinds still accepted in an end state (step 7's final documents). */
export const TIPOS_SUBIDA_EN_ESTADO_FINAL: readonly string[] = ['anexos', 'otro'];

/** Fields of the admin PATCH that stay editable in every state. */
export const CAMPOS_SIEMPRE_EDITABLES: readonly string[] = ['notas', 'publicacion_imagen_url'];

export const MENSAJE_EVALUACION_INICIADA =
  'La licitación ya está en evaluación: no se pueden modificar las ATE ni las propuestas.';
export const MENSAJE_ADJUDICADA = 'La licitación ya fue adjudicada: sus datos no se pueden modificar.';
export const MENSAJE_CERRADA = 'La licitación está cerrada: no se pueden agregar consultas ni eliminar documentos.';
export const MENSAJE_SOLO_ANEXOS = 'La licitación está cerrada: solo se pueden agregar anexos u otros documentos.';

/** True when `estado` is a known state at or after `desde` in the ordered list. */
function alcanzo(estado: string | null | undefined, desde: LicitacionEstado): boolean {
  const posicion = ESTADOS_EN_ORDEN.indexOf(estado as LicitacionEstado);
  return posicion >= 0 && posicion >= ESTADOS_EN_ORDEN.indexOf(desde);
}

/** contrato_generado, adjudicada_externo or cerrada. */
export function esEstadoFinal(estado: string | null | undefined): boolean {
  return alcanzo(estado, INICIO_FINAL);
}

/** Rule 1: providers may be added, changed or removed. */
export function puedeModificarAtes(estado: string | null | undefined): boolean {
  return !alcanzo(estado, INICIO_EVALUACION);
}

/** Rule 1: a proposal file may be uploaded or replaced. */
export function puedeSubirPropuesta(estado: string | null | undefined): boolean {
  return !alcanzo(estado, INICIO_EVALUACION);
}

/** Rule 2: the admin may change the tender's own data (not notes, image or timeline: always open). */
export function puedeEditarDatos(estado: string | null | undefined): boolean {
  return !alcanzo(estado, INICIO_ADJUDICADA);
}

/** Rule 3: a question («consulta») may be added. */
export function puedeAgregarConsulta(estado: string | null | undefined): boolean {
  return !esEstadoFinal(estado);
}

/** Rule 3: a document may be deleted. */
export function puedeEliminarDocumento(estado: string | null | undefined): boolean {
  return !esEstadoFinal(estado);
}

/**
 * Rules 1 and 3 for the generic upload: in an end state only «anexos» and
 * «otro»; a proposal kind only before the evaluation. A historical record
 * (the archive view) accepts every kind.
 */
export function puedeSubirDocumento(
  estado: string | null | undefined,
  tipo: string,
  esHistorica: boolean,
): boolean {
  if (esHistorica) return true;
  if (esEstadoFinal(estado) && !TIPOS_SUBIDA_EN_ESTADO_FINAL.includes(tipo)) return false;
  if (tipo === 'propuesta' && !puedeSubirPropuesta(estado)) return false;
  return true;
}

/** The sentence a refused upload answers with, or null when it is accepted. */
export function motivoRechazoSubida(
  estado: string | null | undefined,
  tipo: string,
  esHistorica: boolean,
): string | null {
  if (puedeSubirDocumento(estado, tipo, esHistorica)) return null;
  return esEstadoFinal(estado) ? MENSAJE_SOLO_ANEXOS : MENSAJE_EVALUACION_INICIADA;
}
