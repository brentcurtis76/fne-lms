/**
 * The message shown when /api/contracts/extract-pdf fails. When the AI key is
 * not configured the route answers 500 'API de Claude no configurada'; staff are
 * told to enter the contract by hand (there is no sample-data fallback).
 */
export const NOT_CONFIGURED_MESSAGE =
  'La lectura automática de PDF no está configurada. Ingrese los datos del contrato manualmente.';

export function extractionErrorMessage(status: number, body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  const text = typeof error === 'string' ? error : '';
  if (status === 500 && text.includes('API de Claude')) return NOT_CONFIGURED_MESSAGE;
  return text || 'Error al procesar el PDF';
}
