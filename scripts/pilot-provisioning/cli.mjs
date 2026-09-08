#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runApply } from './apply.mjs';
import { assertOperatorLabel, buildAuditRecord, buildFailureAuditRecord, writeAuditRecord } from './audit.mjs';
import { SYNTHETIC_OUTPUT_MARKER, loadManifest } from './manifest.mjs';
import { runPreflight } from './preflight.mjs';
import { assertResettable, runReset } from './reset.mjs';
import { loadSchemaAttestationConfig } from './schema-attestation.mjs';
import { assertConfirmation, assertPilotTarget, loadPilotTargetConfig, requiredConfirmation } from './target-guard.mjs';
import { runVerify } from './verify.mjs';

/**
 * Pilot provisioning CLI.
 *
 *   node scripts/pilot-provisioning/cli.mjs <preflight|apply|verify|reset>
 *        --manifest <path> --target <staging|realPilot>
 *        [--confirm <exact string>] [--operator <handle>] [--actor <uuid>]
 *
 * Runtime inputs (never committed): PILOT_SUPABASE_URL (must equal the
 * allowlisted URL exactly) and the target's service-role key in the env var
 * the allowlist names (`keyEnv`). Order of operations is fixed: manifest lint
 * -> target guard -> (write verbs) exact --confirm -> client creation ->
 * stage. No client exists before the guard has accepted the target.
 *
 * Nothing this CLI prints contains a key, a URL with credentials, or PII;
 * results are JSON summaries of counts, digests and stop conditions. Every
 * result and audit record of a synthetic manifest carries the conspicuous
 * non-production marker (manifest.mjs SYNTHETIC_OUTPUT_MARKER). A failed
 * write verb leaves a sanitized failure audit record.
 */

export const VERBS = Object.freeze(['preflight', 'apply', 'verify', 'reset']);
const NIL_ACTOR = '00000000-0000-0000-0000-000000000000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLISH_SERVICE_PATH = 'lib/services/assessment-builder/publishTemplate.ts';

export function parseArguments(argv) {
  const args = { verb: null, manifest: null, target: null, confirm: null, operator: null, actor: null };
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    const takeValue = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      i += 1;
      return value;
    };
    if (VERBS.includes(argument) && args.verb === null) args.verb = argument;
    else if (argument === '--manifest') args.manifest = takeValue();
    else if (argument === '--target') args.target = takeValue();
    else if (argument === '--confirm') args.confirm = takeValue();
    else if (argument === '--operator') args.operator = takeValue();
    else if (argument === '--actor') args.actor = takeValue();
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!args.verb) throw new Error(`a verb is required: ${VERBS.join('|')}`);
  if (!args.manifest) throw new Error('--manifest <path> is required');
  if (!args.target) throw new Error('--target <staging|realPilot> is required');
  const writes = args.verb === 'apply' || args.verb === 'reset';
  if (!writes && args.confirm !== null) throw new Error(`--confirm is only accepted by apply and reset`);
  if (!writes && args.operator !== null) throw new Error(`--operator is only accepted by apply and reset`);
  if (writes && !args.operator) throw new Error(`${args.verb} requires --operator <handle>`);
  if (args.actor !== null && !UUID_RE.test(args.actor)) throw new Error('--actor must be a uuid');
  return Object.freeze(args);
}

/** Default client factory: imported lazily so a refused target never loads a database client. */
async function defaultCreateStore({ target, serviceKey, actorId, repoRoot }) {
  const [{ createClient }, { createSupabaseStore }] = await Promise.all([
    import('@supabase/supabase-js'),
    import('./store.mjs'),
  ]);
  // The shared service is TypeScript; the npm scripts run this CLI under
  // `node --import tsx`, which is what makes this import resolvable.
  let service;
  try {
    service = await import(pathToFileURL(resolve(repoRoot, PUBLISH_SERVICE_PATH)).href);
  } catch (error) {
    throw new Error(
      `shared publish service could not be loaded (${error?.code ?? error?.message}); run through npm run pilot:<verb> (node --import tsx)`,
    );
  }
  if (typeof service.publishTemplate !== 'function') throw new Error('shared publish service is unavailable');
  const client = createClient(target.supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-application-name': 'genera-pilot-provisioning' } },
  });
  return {
    store: createSupabaseStore({
      client,
      publishTemplate: service.publishTemplate,
      actorId,
      lockDir: resolve(repoRoot, '.pilot-provisioning', 'locks'),
    }),
    close: async () => {},
  };
}

export async function run(argv, environment = process.env, dependencies = {}) {
  const args = parseArguments(argv);
  const repoRoot = dependencies.repoRoot ?? resolve(new URL('../..', import.meta.url).pathname);
  const manifest = dependencies.loadManifest ? dependencies.loadManifest(args.manifest) : loadManifest(resolve(args.manifest));
  const config = dependencies.config ?? loadPilotTargetConfig();

  if (args.verb === 'reset') assertResettable(manifest);
  if (args.operator) assertOperatorLabel(args.operator);

  // Phase one: pure guard, before any client, before any network.
  const entry = config.targets[args.target];
  const serviceKey = entry ? environment[entry.keyEnv] : undefined;
  const target = assertPilotTarget(
    {
      targetName: args.target,
      supabaseUrl: environment.PILOT_SUPABASE_URL,
      manifestTarget: manifest.target,
      manifestEnvironmentClass: manifest.environmentClass,
      serviceKey,
    },
    config,
  );

  const writes = args.verb === 'apply' || args.verb === 'reset';
  if (writes) assertConfirmation(args.verb, args.confirm, manifest.digest, target.projectRef);

  // R10: the committed schema expectation is mandatory; no expectation, no stage.
  const schemaExpectation = dependencies.schemaExpectation ?? loadSchemaAttestationConfig(repoRoot);

  const actorId = args.actor ?? NIL_ACTOR;
  const createStore = dependencies.createStore ?? defaultCreateStore;
  const { store, close } = await createStore({ target, serviceKey, actorId, repoRoot });
  const banner = manifest.mode === 'synthetic' ? SYNTHETIC_OUTPUT_MARKER : null;
  const brand = (result) => (banner ? { banner, ...result } : result);
  try {
    if (args.verb === 'preflight') {
      const plan = await runPreflight({ store, manifest, target, schemaExpectation });
      return brand({ ...plan, requiredConfirmation: requiredConfirmation('apply', manifest.digest, target.projectRef) });
    }
    if (args.verb === 'verify') return brand(await runVerify({ store, manifest, target, schemaExpectation }));

    const auditDir = dependencies.auditDir ?? resolve(repoRoot, '.pilot-provisioning', 'audit');
    const writeAudit = dependencies.writeAuditRecord ?? writeAuditRecord;
    const actorKind = args.verb === 'apply' && args.actor ? 'operator-supplied-actor' : 'nil-actor';
    const startedAt = new Date().toISOString();
    try {
      if (args.verb === 'apply') {
        const result = await runApply({ store, manifest, target, operator: args.operator, schemaExpectation });
        const audit = buildAuditRecord({
          verb: 'apply',
          manifest,
          target,
          operator: args.operator,
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
          counts: { created: result.created, published: result.published.length, noop: result.noop },
          ok: result.ok,
          actorKind,
        });
        return brand({ ...result, auditPath: writeAudit(audit, auditDir) });
      }
      const result = await runReset({ store, manifest, target, schemaExpectation });
      const audit = buildAuditRecord({
        verb: 'reset',
        manifest,
        target,
        operator: args.operator,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        counts: { deleted: result.deleted },
        ok: result.ok,
        actorKind,
      });
      return brand({ ...result, auditPath: writeAudit(audit, auditDir) });
    } catch (error) {
      // R11: a failed or partial write verb leaves a sanitized audit record
      // (no credentials, tokens, URLs, emails or row content) before the
      // refusal propagates. If even the audit cannot be written, the
      // original failure still wins.
      try {
        const audit = buildFailureAuditRecord({
          verb: args.verb,
          manifest,
          target,
          operator: args.operator,
          startedAt,
          finishedAt: new Date().toISOString(),
          stage: args.verb,
          error,
          actorKind,
        });
        const auditPath = writeAudit(audit, auditDir);
        error.auditPath = auditPath;
      } catch (auditError) {
        error.auditError = auditError?.message ?? String(auditError);
      }
      throw error;
    }
  } finally {
    await close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result && result.ok === false) process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`pilot provisioning refused: ${error.message}\n`);
      if (error.auditPath) process.stderr.write(`failure audit record: ${error.auditPath}\n`);
      if (error.auditError) process.stderr.write(`failure audit record could not be written: ${error.auditError}\n`);
      process.exitCode = 1;
    });
}
