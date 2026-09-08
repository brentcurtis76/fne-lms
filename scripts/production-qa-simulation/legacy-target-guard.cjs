const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function assertLegacySeederIsNotProduction(rawUrl) {
  if (typeof rawUrl !== 'string') return;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }
  const config = JSON.parse(
    readFileSync(resolve(__dirname, '../../config/production-qa-simulation-target.json'), 'utf8'),
  );
  if (url.hostname === `${config.productionProjectRef}.supabase.co`) {
    throw new Error(
      'Legacy/demo QA seeders are prohibited against Production; use only the governed production QA simulation tooling.',
    );
  }
}

module.exports = { assertLegacySeederIsNotProduction };
