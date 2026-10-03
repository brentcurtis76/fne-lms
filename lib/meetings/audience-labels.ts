/**
 * Audience label source of truth.
 *
 * The finalize picker and the post-finalize banner both render the
 * same two audience values but in different grammatical forms. This module
 * keeps them in one place so adding a third audience value (or rewording
 * an existing one) doesn't have to chase through the codebase.
 */

import type { FinalizeAudience, FinalizeRequestAudience } from '../../types/meetings';

/**
 * Short, imperative form for the finalize-dialog radio picker.
 * "Toda la comunidad" / "Solo los asistentes".
 */
// SM-H8 (owner decision 4): the picker offers the people with access to the
// meeting (leader, creator/facilitator/secretary, participants, people added
// by an editor) — never the whole community any more.
export const AUDIENCE_PICKER_LABELS: Record<FinalizeRequestAudience, string> = {
  with_access: 'Las personas con acceso a la reunión',
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
  return AUDIENCE_PICKER_LABELS[audience as FinalizeRequestAudience] ?? audience;
}

/**
 * Safe accessor — falls back to the raw audience string for unknown values.
 * A 'community' finalization made under SM-H8 (`withAccess`) went to the
 * people with access; one made before it really went to the whole community.
 */
export function audienceProseLabel(audience: string, withAccess?: boolean | null): string {
  if (audience === 'community' && withAccess) return 'las personas con acceso a la reunión';
  return AUDIENCE_PROSE_LABELS[audience as FinalizeAudience] ?? audience;
}
