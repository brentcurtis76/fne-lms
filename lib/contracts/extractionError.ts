/**
 * The message shown when /api/contracts/extract-pdf fails. When the AI key is
 * not configured the route answers 500 'API de Claude no configurada'; staff are
 * told to enter the contract by hand (there is no sample-data fallback).
 */
export const NOT_CONFIGURED_MESSAGE =
  'La lectura automática de PDF no está configurada. Ingrese los datos del contrato manualmente.';

/**
 * GES-2.3: the importer allows 2,9 MB (base64 inside JSON adds a third; the
 * route accepts a 4 MB body). A 413 answer, JSON or not, says that limit.
 */
export const TOO_LARGE_MESSAGE =
  'El PDF es demasiado grande para leerlo automáticamente (máximo 2,9 MB). Ingrese los datos manualmente.';

export function extractionErrorMessage(status: number, body: unknown): string {
  if (status === 413) return TOO_LARGE_MESSAGE;
  const error = (body as { error?: unknown } | null)?.error;
  const text = typeof error === 'string' ? error : '';
  if (status === 500 && text.includes('API de Claude')) return NOT_CONFIGURED_MESSAGE;
  return text || 'Error al procesar el PDF';
}
