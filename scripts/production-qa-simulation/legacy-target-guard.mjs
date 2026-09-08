import { loadSimulationTargetConfig } from './target-guard.mjs';

export function assertLegacySeederIsNotProduction(rawUrl) {
  if (typeof rawUrl !== 'string') return;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }
  const config = loadSimulationTargetConfig();
  if (url.hostname === `${config.productionProjectRef}.supabase.co`) {
    throw new Error(
      'Legacy/demo QA seeders are prohibited against Production; use only the governed production QA simulation tooling.',
    );
  }
}
