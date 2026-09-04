import { QA_SIMULATION_PRODUCTION_PROJECT_REF } from './constants';

export function assertLegacySeederIsNotProduction(rawUrl: unknown): void {
  if (typeof rawUrl !== 'string') return;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }
  if (url.hostname === `${QA_SIMULATION_PRODUCTION_PROJECT_REF}.supabase.co`) {
    throw new Error(
      'Legacy/demo QA seeders are prohibited against Production; use only the governed production QA simulation tooling.',
    );
  }
}
