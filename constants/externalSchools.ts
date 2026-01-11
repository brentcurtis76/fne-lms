/**
 * External school affiliations for FNE consultants
 * These are schools where FNE consultants work externally (outside Fundación Nueva Educación)
 * This is purely informational - no impact on permissions
 */

export const EXTERNAL_SCHOOLS = [
  { value: 'escola_virolai', label: 'Escola Virolai' },
  { value: 'escola_sadako', label: 'Escola Sadako' },
  { value: 'institut_angeleta_ferrer', label: 'Institut Angeleta Ferrer' },
  { value: 'institut_escola_les_vinyes', label: 'Institut Escola Les Vinyes' },
  { value: 'escola_la_maquinista', label: 'Escola La Maquinista' },
  { value: 'institut_escola_el_puig', label: 'Institut Escola El Puig' },
  { value: 'escola_octavio_paz', label: 'Escola Octavio Paz' },
] as const;

export type ExternalSchoolValue = typeof EXTERNAL_SCHOOLS[number]['value'] | null;

/**
 * Get display label for an external school value
 * Returns empty string if value is null/undefined (independent consultant)
 */
export const getExternalSchoolLabel = (value: string | null | undefined): string => {
  if (!value) return '';
  const school = EXTERNAL_SCHOOLS.find(s => s.value === value);
  return school?.label || value;
};
