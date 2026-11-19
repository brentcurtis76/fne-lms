/**
 * The read-only sentences of steps 3 and 4, by the tender's state (GENERA
 * fixes F20, join fix 3). Screen copy only: the rules themselves live in
 * lib/licitaciones/estados.ts and the routes answer with their own sentences.
 */

import {
  MENSAJE_CERRADA,
  MENSAJE_EVALUACION_INICIADA,
  esEstadoFinal,
  puedeEditarDatos,
  puedeModificarAtes,
} from '@/lib/licitaciones/estados';

export const MENSAJE_ATES_ADJUDICADA =
  'La licitación ya fue adjudicada: no se pueden modificar las ATE ni las propuestas.';
export const MENSAJE_CONTRATO_GENERADO =
  'La licitación ya tiene su contrato: no se pueden agregar consultas ni eliminar documentos.';

/**
 * Why the providers and proposals can no longer change: the evaluation
 * sentence in evaluacion_pendiente and adjudicacion_pendiente, the award
 * sentence once the tender is awarded or ended; null while they still can.
 */
export function mensajeAtesSoloLectura(estado: string | null | undefined): string | null {
  if (puedeModificarAtes(estado)) return null;
  return puedeEditarDatos(estado) ? MENSAJE_EVALUACION_INICIADA : MENSAJE_ATES_ADJUDICADA;
}

/**
 * Why no question can be added nor document deleted: shown only in the three
 * end states; contrato_generado has its own sentence.
 */
export function mensajeConsultasSoloLectura(estado: string | null | undefined): string | null {
  if (!esEstadoFinal(estado)) return null;
  return estado === 'contrato_generado' ? MENSAJE_CONTRATO_GENERADO : MENSAJE_CERRADA;
}
