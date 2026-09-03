#!/usr/bin/env node
import { buildSimulationManifest, expectedCounts } from './manifest.mjs';
import { resetManifest, seedManifest, verifyManifest } from './engine.mjs';
import {
  assertExplicitExecutionConfirmation,
  assertProductionQaDatabaseTarget,
  assertProductionQaTarget,
  loadSimulationTargetConfig,
  requiredExecutionConfirmation,
} from './target-guard.mjs';

export function parseArguments(argv) {
  const args = { action: 'plan', execute: false, confirm: null };
  for (const argument of argv) {
    if (['plan', 'seed', 'verify', 'reset'].includes(argument) && args.action === 'plan') {
      args.action = argument;
    } else if (argument === '--execute') {
      args.execute = true;
    } else if (argument.startsWith('--confirm=')) {
      args.confirm = argument.slice('--confirm='.length);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (args.execute && args.action === 'plan') throw new Error('plan never accepts --execute');
  if (args.confirm && !args.execute) throw new Error('--confirm is valid only with --execute');
  return Object.freeze(args);
}

export function dryRunSummary(action, manifest = buildSimulationManifest()) {
  return {
    dryRun: true,
    requestedAction: action,
    manifestVersion: manifest.version,
    scenarioEpoch: manifest.scenarioEpoch,
    targetSchoolIds: manifest.targetSchoolIds,
    counts: expectedCounts(manifest),
    digest: manifest.digest,
    deferredGaps: manifest.deferredGaps,
    requiredExecutionConfirmation: requiredExecutionConfirmation(),
  };
}

export async function run(argv, environment = process.env, dependencies = {}) {
  const args = parseArguments(argv);
  const manifest = buildSimulationManifest();
  if (!args.execute) return dryRunSummary(args.action, manifest);

  assertExplicitExecutionConfirmation(args.confirm);
  const databaseUrl = environment.SM_SIM_DATABASE_URL;
  if (!databaseUrl) throw new Error('SM_SIM_DATABASE_URL is required for an explicitly authorized execution');
  assertProductionQaDatabaseTarget(databaseUrl);

  const config = loadSimulationTargetConfig();
  const guardedTarget = assertProductionQaTarget({
    supabaseUrl: config.productionSupabaseUrl,
    schoolIds: config.qaSchoolIds,
  });

  const createStore = dependencies.createStore ?? (async () => {
    const [{ Pool }, { createPostgresSimulationStore }] = await Promise.all([
      import('pg'),
      import('./postgres-store.mjs'),
    ]);
    const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: `genera-${manifest.version}` });
    return { store: createPostgresSimulationStore(pool), close: () => pool.end() };
  });

  const { store, close } = await createStore();
  try {
    if (args.action === 'seed') return { dryRun: false, action: 'seed', ...(await seedManifest({ store, manifest, guardedTarget })) };
    if (args.action === 'verify') return { dryRun: false, action: 'verify', ...(await verifyManifest({ store, manifest, guardedTarget })) };
    if (args.action === 'reset') return { dryRun: false, action: 'reset', ...(await resetManifest({ store, manifest, guardedTarget })) };
    throw new Error('unsupported execution action');
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`production QA simulation refused: ${error.message}\n`);
      process.exitCode = 1;
    });
}
