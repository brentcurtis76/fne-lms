import target from '../../config/production-qa-simulation-target.json';

export const QA_SIMULATION_LABEL = target.label;
export const QA_SIMULATION_MANIFEST_VERSION = target.manifestVersion;
export const QA_SIMULATION_PRODUCTION_PROJECT_REF = target.productionProjectRef;
export const QA_SIMULATION_PRODUCTION_URL = target.productionSupabaseUrl;
export const QA_SIMULATION_SCHOOL_IDS = Object.freeze(
  target.qaSchoolIds.map((id) => Number(id))
) as readonly number[];
export const QA_SIMULATION_RESERVED_EMAIL_DOMAIN = target.reservedEmailDomain;

export function isQaSimulationSchoolId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    QA_SIMULATION_SCHOOL_IDS.includes(value)
  );
}

export function isReservedSimulationEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized.endsWith(`@${QA_SIMULATION_RESERVED_EMAIL_DOMAIN}`);
}
