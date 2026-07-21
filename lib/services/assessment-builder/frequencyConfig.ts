import type { FrequencyConfig } from '@/types/assessment-builder';

/**
 * Builds the frequency_config payload for a frecuencia indicator save.
 *
 * The builder edit modal only exposes the `unit`, but frequency_config may also
 * carry scoring-relevant fields (min/max/step/type) set via API/import. Because
 * the indicator PUT does a full-replace of the jsonb column, the client must
 * send the *complete* object — merging the new unit onto the existing config —
 * or those hidden fields are silently wiped. On create there is no existing
 * config, so the result is just `{ unit }`.
 */
export function buildFrequencyConfig(
  existing: FrequencyConfig | null | undefined,
  unit: string
): Partial<FrequencyConfig> & { unit: string } {
  return { ...(existing ?? {}), unit };
}
