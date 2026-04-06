/**
 * Shared text-normalization utilities for proposal heading-redundancy checks.
 * Used by both the PDF generator and the web ContentBlockSection component.
 */

/** Spanish stop words (post-NFD-normalization forms — accents already stripped) */
export const SPANISH_STOP_WORDS = new Set([
  'el','la','los','las','de','del','en','un','una','y','a','por','para',
  'con','que','se','su','al','es','lo','son','como','mas','o','e','nos','sus',
]);

/** Normalize text for comparison: NFD strip accents → lowercase → trim */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Extract significant words (non-stop, length > 1) from normalized text */
export function significantWords(normalized: string): string[] {
  return normalized.split(/\s+/).filter(w => !SPANISH_STOP_WORDS.has(w) && w.length > 1);
}
