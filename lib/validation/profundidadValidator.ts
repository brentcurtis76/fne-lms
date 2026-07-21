/**
 * Shared validation for profundidad indicator level descriptors.
 * Used by the POST and PUT indicator API handlers and the builder client-side,
 * so the ">=1 non-empty descriptor" rule and its Spanish message live in one place.
 */

export interface ProfundidadValidationResult {
  valid: boolean;
  error?: string; // Spanish error message if invalid
}

/**
 * A profundidad indicator requires at least one level descriptor with real
 * (non-whitespace) content. Non-string values count as empty.
 */
export function validateProfundidadDescriptors(descriptors: unknown[]): ProfundidadValidationResult {
  const hasDescriptor = descriptors.some(
    (d) => typeof d === 'string' && d.trim().length > 0
  );
  if (!hasDescriptor) {
    return {
      valid: false,
      error: 'Los indicadores de profundidad requieren al menos un descriptor de nivel',
    };
  }
  return { valid: true };
}
