import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { assertOperatorLabel, buildAuditRecord, auditFileName } from '../../../scripts/pilot-provisioning/audit.mjs';
import { parseArguments, run } from '../../../scripts/pilot-provisioning/cli.mjs';
import { loadManifest } from '../../../scripts/pilot-provisioning/manifest.mjs';
import { createSupabaseStore, WRITE_TABLES } from '../../../scripts/pilot-provisioning/store.mjs';
import { requiredConfirmation } from '../../../scripts/pilot-provisioning/target-guard.mjs';
import { createFakeStore, fakeSchemaExpectation } from './fake-store';
import { approvedConfig } from './approved-config';

const SYNTHETIC = resolve(__dirname, '../../../config/pilot-manifests/pc-pilot-synthetic-v1.json');
const manifest = loadManifest(SYNTHETIC);
const STAGING_URL = 'https://abcdefghijklmnopqrst.supabase.co';
// Deliberately NOT key-shaped: the committed-secrets guard scans the git index,
// and the guard under test accepts any non-JWT string as an opaque key.
const SYNTHETIC_KEY = 'synthetic-service-role-placeholder';
const env = (overrides: Record<string, string | undefined> = {}) => ({
  PILOT_SUPABASE_URL: STAGING_URL,
  PILOT_STAGING_SERVICE_ROLE_KEY: SYNTHETIC_KEY,
  ...overrides,
});

function deps(store = createFakeStore()) {
  const createStore = vi.fn(async () => ({ store, close: async () => {} }));
  const writeAuditRecord = vi.fn((record: any) => `/audit/${auditFileName(record)}`);
  return { createStore, writeAuditRecord, config: approvedConfig(), store, auditDir: '/audit', schemaExpectation: fakeSchemaExpectation() };
}

const argsFor = (verb: string, extra: string[] = []) => [verb, '--manifest', SYNTHETIC, '--target', 'staging', ...extra];

describe('pilot provisioning CLI', () => {
  it('parses verbs and refuses write flags on read-only verbs', () => {
    expect(parseArguments(argsFor('preflight'))).toMatchObject({ verb: 'preflight', target: 'staging', confirm: null });
    expect(() => parseArguments(argsFor('preflight', ['--confirm', 'x']))).toThrow(/only accepted by apply and reset/);
    expect(() => parseArguments(argsFor('apply'))).toThrow(/requires --operator/);
    expect(() => parseArguments(['apply', '--target', 'staging'])).toThrow(/--manifest/);
    expect(() => parseArguments(argsFor('verify', ['--force']))).toThrow(/unknown argument: --force/);
    expect(() => parseArguments(argsFor('apply', ['--operator', 'op', '--actor', 'not-a-uuid']))).toThrow(/--actor must be a uuid/);
  });

  it('never creates a client for an unapproved (committed) allowlist', async () => {
    const d = deps();
    await expect(run(argsFor('preflight'), env(), { createStore: d.createStore })).rejects.toThrow(/refusing pilot target: target staging is not approved/);
    expect(d.createStore).not.toHaveBeenCalled();
  });

  it.each([
    ['localhost', env({ PILOT_SUPABASE_URL: 'http://127.0.0.1:54321' }), /loopback/],
    ['the production project', env({ PILOT_SUPABASE_URL: 'https://zyxwvutsrqponmlkjihg.supabase.co' }), /not the allowlisted ref/],
    ['an unknown project', env({ PILOT_SUPABASE_URL: 'https://qqqqqqqqqqqqqqqqqqqq.supabase.co' }), /not the allowlisted ref/],
    ['a missing key', env({ PILOT_STAGING_SERVICE_ROLE_KEY: undefined }), /service key .* is missing/],
    ['no URL at all', env({ PILOT_SUPABASE_URL: undefined }), /runtime Supabase URL is missing/],
  ])('refuses %s before the client factory runs', async (_label, environment, pattern) => {
    const d = deps();
    await expect(run(argsFor('preflight'), environment, d)).rejects.toThrow(pattern);
    expect(d.createStore).not.toHaveBeenCalled();
  });

  it('refuses a mismatched target class before the client factory runs', async () => {
    const d = deps();
    await expect(
      run(['preflight', '--manifest', SYNTHETIC, '--target', 'realPilot'], env({ PILOT_REALPILOT_SERVICE_ROLE_KEY: SYNTHETIC_KEY }), d),
    ).rejects.toThrow(/manifest target does not match/);
    expect(d.createStore).not.toHaveBeenCalled();
  });

  it('runs preflight read-only on the accepted staging target and prints the required confirmation', async () => {
    const d = deps();
    const result: any = await run(argsFor('preflight'), env(), d);
    expect(d.createStore).toHaveBeenCalledTimes(1);
    expect(d.createStore.mock.calls[0][0]).toMatchObject({ target: { projectRef: 'abcdefghijklmnopqrst' }, actorId: '00000000-0000-0000-0000-000000000000' });
    expect(result.ok).toBe(true);
    expect(result.readOnly).toBe(true);
    expect(result.requiredConfirmation).toBe(requiredConfirmation('apply', manifest.digest, 'abcdefghijklmnopqrst'));
    expect(d.store.writes).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_KEY);
  });

  it('apply requires the exact confirmation and an operator handle, then writes an audit record', async () => {
    const d = deps();
    await expect(run(argsFor('apply', ['--operator', 'brent-op']), env(), d)).rejects.toThrow(/exact --confirm string is required/);
    await expect(run(argsFor('apply', ['--operator', 'brent-op', '--confirm', 'yes']), env(), d)).rejects.toThrow(/exact --confirm string/);
    expect(d.createStore).not.toHaveBeenCalled();

    const confirm = requiredConfirmation('apply', manifest.digest, 'abcdefghijklmnopqrst');
    const result: any = await run(argsFor('apply', ['--operator', 'brent-op', '--confirm', confirm]), env(), d);
    expect(result.ok).toBe(true);
    expect(result.auditPath).toMatch(/apply-pc-pilot-synthetic-v1-/);
    const record = d.writeAuditRecord.mock.calls[0][0];
    expect(record).toMatchObject({
      verb: 'apply',
      manifestVersion: 'pc-pilot-synthetic-v1',
      manifestDigest: manifest.digest,
      targetName: 'staging',
      environmentClass: 'staging',
      projectRef: 'abcdefghijklmnopqrst',
      operator: 'brent-op',
      actorKind: 'nil-actor',
      counts: { published: 2, noop: false },
    });
    expect(JSON.stringify(record)).not.toMatch(new RegExp(`${SYNTHETIC_KEY}|supabase\\.co|@example\\.com`));

    const again: any = await run(argsFor('apply', ['--operator', 'brent-op', '--confirm', confirm]), env(), d);
    expect(again.noop).toBe(true);
    expect(d.writeAuditRecord.mock.calls[1][0].counts.noop).toBe(true);
  });

  it('reset requires the reset confirmation (not the apply one) and refuses realPilot manifests', async () => {
    const d = deps();
    const applyConfirm = requiredConfirmation('apply', manifest.digest, 'abcdefghijklmnopqrst');
    await run(argsFor('apply', ['--operator', 'brent-op', '--confirm', applyConfirm]), env(), d);
    await expect(run(argsFor('reset', ['--operator', 'brent-op', '--confirm', applyConfirm]), env(), d)).rejects.toThrow(/refusing pilot reset: exact --confirm/);
    const resetConfirm = requiredConfirmation('reset', manifest.digest, 'abcdefghijklmnopqrst');
    const result: any = await run(argsFor('reset', ['--operator', 'brent-op', '--confirm', resetConfirm]), env(), d);
    expect(result.deleted.assessment_templates).toBe(2);
    expect(d.store.rows('assessment_templates')).toEqual([]);
  });

  it('operator labels are handles, never emails', () => {
    expect(assertOperatorLabel('brent-op')).toBe('brent-op');
    expect(() => assertOperatorLabel('someone@example.com')).toThrow(/never an email/);
    expect(() => assertOperatorLabel('')).toThrow(/--operator/);
    expect(() =>
      buildAuditRecord({
        verb: 'apply',
        manifest,
        target: { targetName: 'staging', environmentClass: 'staging', projectRef: 'abcdefghijklmnopqrst' },
        operator: 'op',
        startedAt: '2026-09-07T12:00:00.000Z',
        finishedAt: '2026-09-07T12:00:01.000Z',
        counts: { note: 'contact me at real.person@gmail.com' },
        ok: true,
        actorKind: 'nil-actor',
      }),
    ).toThrow(/refusing to emit audit record/);
  });

  it('publishes through the shared publish service: the Supabase store delegates with (client, templateId, actor)', async () => {
    const client = { from: vi.fn() };
    const publishTemplate = vi.fn(async () => ({ ok: true, newVersion: '1.1.0', warnings: [] }));
    const store = createSupabaseStore({ client, publishTemplate, actorId: 'actor-1', lockDir: '/tmp/unused' });
    const result = await store.publishTemplate('template-1');
    expect(publishTemplate).toHaveBeenCalledWith(client, 'template-1', { id: 'actor-1' });
    expect(result).toMatchObject({ ok: true, newVersion: '1.1.0' });
    expect(() => createSupabaseStore({ client, publishTemplate: undefined as any, actorId: 'a' })).toThrow(/requires the shared publish service/);
  });

  it('the CLI loads the same publish service the API route uses', () => {
    const cli = readFileSync(resolve(__dirname, '../../../scripts/pilot-provisioning/cli.mjs'), 'utf8');
    const route = readFileSync(resolve(__dirname, '../../../pages/api/admin/assessment-builder/templates/[templateId]/publish.ts'), 'utf8');
    expect(cli).toContain("'lib/services/assessment-builder/publishTemplate.ts'");
    expect(route).toContain("from '@/lib/services/assessment-builder/publishTemplate'");
    expect(route).not.toMatch(/assessment_template_snapshots/);
  });

  it('the Supabase store refuses writes outside the allowlist and never deletes user or instance tables', async () => {
    const client = { from: vi.fn() };
    const store = createSupabaseStore({ client, publishTemplate: async () => ({ ok: true }), actorId: 'a', lockDir: '/tmp/unused' });
    for (const table of ['profiles', 'user_roles', 'assessment_instances', 'school_course_docente_assignments', 'auth_users']) {
      await expect(store.insertRows(table, [{ id: 1 }])).rejects.toThrow(/outside the provisioning allowlist/);
      await expect(store.deleteRows(table, 'id', [1])).rejects.toThrow(/outside the provisioning allowlist/);
      expect(WRITE_TABLES).not.toContain(table);
    }
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('failure audit and non-production marker (R11)', () => {
  it('a failed apply leaves a sanitized failure audit record (ok:false, stage, redacted reason) and still refuses', async () => {
    // Exercise redaction without embedding a provider-shaped credential in Git.
    const syntheticSensitiveValue = 'synthetic-not-a-credential-'.repeat(3);
    const d = deps(createFakeStore({ schemaAttestationError: `permission denied for function pilot_schema_attestation at https://abcdefghijklmnopqrst.supabase.co key ${syntheticSensitiveValue} operator@example.org` }));
    const confirm = requiredConfirmation('apply', manifest.digest, 'abcdefghijklmnopqrst');
    await expect(run(argsFor('apply', ['--operator', 'brent-op', '--confirm', confirm]), env(), d)).rejects.toThrow(/schema attestation: unavailable/);
    expect(d.writeAuditRecord).toHaveBeenCalledTimes(1);
    const record = d.writeAuditRecord.mock.calls[0][0];
    expect(record).toMatchObject({ verb: 'apply', ok: false, synthetic: true, notProduction: true, operator: 'brent-op', actorKind: 'nil-actor' });
    expect(record.failure.stage).toBe('apply');
    expect(record.failure.reason).toContain('schema attestation: unavailable');
    const text = JSON.stringify(record);
    expect(text).not.toMatch(/supabase\.co|sk_live|@example\.org|aaaaaaaa/);
    expect(text).toContain('[url]');
    expect(text).toContain('[redacted]');
    expect(text).toContain('[email]');
  });

  it('a failed reset leaves a failure audit record too, and the audit path travels with the refusal', async () => {
    const d = deps();
    const applyConfirm = requiredConfirmation('apply', manifest.digest, 'abcdefghijklmnopqrst');
    await run(argsFor('apply', ['--operator', 'brent-op', '--confirm', applyConfirm]), env(), d);
    d.store.put('assessment_sub_questions', { id: 'sq-1', indicator_id: d.store.rows('assessment_indicators')[0].id });
    const resetConfirm = requiredConfirmation('reset', manifest.digest, 'abcdefghijklmnopqrst');
    let caught: any;
    await run(argsFor('reset', ['--operator', 'brent-op', '--confirm', resetConfirm]), env(), d).catch((e) => { caught = e; });
    expect(caught.message).toMatch(/rows not owned by the manifest depend on owned rows/);
    expect(caught.auditPath).toMatch(/reset-pc-pilot-synthetic-v1-/);
    const record = d.writeAuditRecord.mock.calls[1][0];
    expect(record).toMatchObject({ verb: 'reset', ok: false, failure: { stage: 'reset' } });
    expect(record.failure.reason).toMatch(/assessment_sub_questions/);
  });

  it('read-only verbs never write an audit record on failure, and a successful synthetic run is branded', async () => {
    const d = deps(createFakeStore({ schemaAttestationError: 'boom' }));
    const result: any = await run(argsFor('preflight'), env(), d);
    expect(result.ok).toBe(false);
    expect(d.writeAuditRecord).not.toHaveBeenCalled();
    expect(result.banner).toContain('[SINTÉTICO — NO PRODUCCIÓN]');

    const good = deps();
    const preflight: any = await run(argsFor('preflight'), env(), good);
    expect(preflight).toMatchObject({ ok: true, synthetic: true, notProduction: true });
    expect(preflight.banner).toContain('no son evidencia de piloto real');
    const confirm = requiredConfirmation('apply', manifest.digest, 'abcdefghijklmnopqrst');
    const apply: any = await run(argsFor('apply', ['--operator', 'brent-op', '--confirm', confirm]), env(), good);
    expect(apply.banner).toContain('[SINTÉTICO — NO PRODUCCIÓN]');
    expect(good.writeAuditRecord.mock.calls[0][0]).toMatchObject({ synthetic: true, notProduction: true, ok: true, failure: null });
  });

  it('the CLI refuses to run without a schema attestation expectation', async () => {
    const d = deps();
    delete (d as any).schemaExpectation;
    await expect(run(argsFor('preflight'), env(), { ...d, repoRoot: '/nonexistent' })).rejects.toThrow(/ENOENT|no such file/);
    expect(d.createStore).not.toHaveBeenCalled();
  });
});
