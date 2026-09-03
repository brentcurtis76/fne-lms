import { projectRefFromSupabaseUrl, loadSimulationTargetConfig } from './target-guard.mjs';

export function assertLegacySeederIsNotProduction(rawUrl) {
  if (typeof rawUrl !== 'string') return;
  const config = loadSimulationTargetConfig();
  if (projectRefFromSupabaseUrl(rawUrl) === config.productionProjectRef) {
    throw new Error(
      'Legacy/demo QA seeders are prohibited against Production; use only the governed production QA simulation tooling.',
    );
  }
}
