/**
 * Audience label source of truth.
 *
 * The finalize picker and the post-finalize banner both render the
 * same two audience values but in different grammatical forms. This module
 * keeps them in one place so adding a third audience value (or rewording
 * an existing one) doesn't have to chase through the codebase.
 */

import type { FinalizeAudience } from '../../types/meetings';

/**
 * Short, imperative form for the finalize-dialog radio picker.
 * "Toda la comunidad" / "Solo los asistentes".
 */
export const AUDIENCE_PICKER_LABELS: Record<FinalizeAudience, string> = {
  community: 'Toda la comunidad',
  attended: 'Solo los asistentes',
};

/**
 * Prose form used in the post-finalize banner — follows "Resumen enviado a …".
 * Lowercase, grammatically natural when embedded in a sentence.
 */
export const AUDIENCE_PROSE_LABELS: Record<FinalizeAudience, string> = {
  community: 'toda la comunidad de crecimiento',
  attended: 'sólo quienes asistieron',
};

/** Safe accessor — falls back to the raw audience string for unknown values. */
export function audiencePickerLabel(audience: string): string {
  return AUDIENCE_PICKER_LABELS[audience as FinalizeAudience] ?? audience;
}

/** Safe accessor — falls back to the raw audience string for unknown values. */
export function audienceProseLabel(audience: string): string {
  return AUDIENCE_PROSE_LABELS[audience as FinalizeAudience] ?? audience;
}
