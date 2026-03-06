/**
 * Shared validation for detalle indicator options.
 * Used by POST, PUT API handlers and the builder client-side.
 */

export interface DetalleValidationResult {
  valid: boolean;
  options?: string[];   // Cleaned options (trimmed, validated)
  error?: string;       // Spanish error message if invalid
}

export function validateDetalleOptions(rawOptions: unknown): DetalleValidationResult {
  if (!Array.isArray(rawOptions)) {
    return { valid: false, error: 'Las opciones de detalle deben ser un arreglo' };
  }
  if (rawOptions.length < 2) {
    return { valid: false, error: 'Los indicadores de detalle requieren al menos 2 opciones' };
  }
  if (rawOptions.length > 15) {
    return { valid: false, error: 'Los indicadores de detalle permiten un máximo de 15 opciones' };
  }

  const cleaned: string[] = [];
  for (const opt of rawOptions) {
    if (typeof opt !== 'string') {
      return { valid: false, error: 'Cada opción debe ser texto' };
    }
    const trimmed = opt.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Todas las opciones deben tener contenido' };
    }
    if (trimmed.length > 200) {
      return { valid: false, error: 'Cada opción puede tener un máximo de 200 caracteres' };
    }
    if (/<[^>]*>/.test(trimmed)) {
      return { valid: false, error: 'Las opciones no pueden contener etiquetas HTML' };
    }
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
      return { valid: false, error: 'Las opciones contienen caracteres inválidos' };
    }
    cleaned.push(trimmed);
  }

  const unique = new Set(cleaned.map(o => o.toLowerCase()));
  if (unique.size !== cleaned.length) {
    return { valid: false, error: 'Las opciones de detalle no pueden repetirse' };
  }

  return { valid: true, options: cleaned };
}
