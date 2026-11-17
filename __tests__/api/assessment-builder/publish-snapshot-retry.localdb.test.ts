// @vitest-environment node
/**
 * GC-10 against a real local database. Send-back 1: the snapshot and the
 * flip are written in ONE transaction (public.publish_assessment_template), at
 * the next free version of the scope, so two copies of one published
 * instrument both publish, a leftover of an earlier failed attempt is
 * overwritten in place, and nothing ever deletes a snapshot.
 *
 * Runs only when GESTOR_LOCAL_GROUND names a local ground folder (its ci.env
 * must point at 127.0.0.1); skipped otherwise, so the normal unit run never
 * touches a database. Drives the real publish route: the caller is the seed's
 * synthetic admin signed in on the local stack (session client), the
 * service-role client is the route's own. Every row is invented and removed
 * afterwards (best effort).
 *
 *   GESTOR_LOCAL_GROUND=<ground dir> npx vitest run __tests__/api/assessment-builder/publish-snapshot-retry.localdb.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createMocks } from 'node-mocks-http';

const GROUND = process.env.GESTOR_LOCAL_GROUND ?? '';

const { env, holder } = vi.hoisted(() => {
  const fsH = require('node:fs') as typeof import('node:fs');
  const pathH = require('node:path') as typeof import('node:path');
  const ground = process.env.GESTOR_LOCAL_GROUND ?? '';
  const out: Record<string, string> = {};
  if (ground) {
    const raw = fsH.readFileSync(pathH.join(ground, 'ci.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const l = line.trim();
      if (!l || l.startsWith('#') || !l.includes('=')) continue;
      out[l.slice(0, l.indexOf('='))] = l.slice(l.indexOf('=') + 1);
    }
    const local = /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(out.NEXT_PUBLIC_SUPABASE_URL ?? '')
      && /@127\.0\.0\.1:\d{2,5}\//.test(out.SUPABASE_DB_URL ?? '')
      && !Object.values(out).some((v) => /supabase\.(co|in)/i.test(v));
    if (!local) throw new Error('refusing: the ground is not a 127.0.0.1 stack');
    process.env.NEXT_PUBLIC_SUPABASE_URL = out.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = out.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = out.SUPABASE_SERVICE_ROLE_KEY;
  }
  return { env: out, holder: { client: null as any, userId: '' } };
});

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-auth')>();
  return {
    ...actual,
    getApiUser: vi.fn(async () => ({ user: { id: holder.userId }, error: null })),
    createApiSupabaseClient: vi.fn(async () => holder.client),
  };
});

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/publish';
import { publishTemplate } from '../../../lib/services/assessment-builder/publishTemplate';

describe.runIf(Boolean(GROUND))('GC-10 publish retry on the local database', () => {
  let service: SupabaseClient;
  const created: string[] = [];
  const major = 500 + Math.floor(Math.random() * 400000); // a version scope no other row uses

  beforeAll(async () => {
    service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const fixtures = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/ci/e2e-fixtures.json'), 'utf8'));
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.auth.signInWithPassword({
      email: fixtures.users.admin.email,
      password: fixtures.users.admin.password,
    });
    if (error || !data.user) throw new Error(`admin sign-in failed: ${error?.message}`);
    holder.client = admin;
    holder.userId = data.user.id;
  });

  afterAll(async () => {
    if (!service) return;
    for (const id of created) {
      const { data: snaps } = await service.from('assessment_template_snapshots').select('id').eq('template_id', id);
      const snapIds = (snaps ?? []).map((s) => s.id);
      if (snapIds.length) await service.from('assessment_instances').delete().in('template_snapshot_id', snapIds);
      await service.from('assessment_template_snapshots').delete().eq('template_id', id);
      const { data: mods } = await service.from('assessment_modules').select('id').eq('template_id', id);
      const modIds = (mods ?? []).map((m) => m.id);
      if (modIds.length) await service.from('assessment_indicators').delete().in('module_id', modIds);
      await service.from('assessment_modules').delete().eq('template_id', id);
      await service.from('assessment_objectives').delete().eq('template_id', id);
      await service.from('assessment_templates').delete().eq('id', id);
    }
  });

  async function draft(area: string, gradeId: number | null, version: string, status = 'draft'): Promise<string> {
    const id = randomUUID();
    const t = await service.from('assessment_templates').insert({
      id, name: `F8 Instrumento Sintético ${major}`, area, grade_id: gradeId, version, status,
    });
    if (t.error) throw new Error(`template: ${t.error.message}`);
    created.push(id);
    const objective = randomUUID();
    const moduleId = randomUUID();
    const o = await service.from('assessment_objectives').insert({ id: objective, template_id: id, name: 'Proceso sintético', display_order: 1, weight: 1 });
    if (o.error) throw new Error(`objective: ${o.error.message}`);
    const m = await service.from('assessment_modules').insert({ id: moduleId, template_id: id, objective_id: objective, name: 'Práctica sintética', display_order: 1, weight: 1 });
    if (m.error) throw new Error(`module: ${m.error.message}`);
    const i = await service.from('assessment_indicators').insert({ module_id: moduleId, code: 'SIN-1', name: 'Indicador sintético', category: 'cobertura', display_order: 1, weight: 1 });
    if (i.error) throw new Error(`indicator: ${i.error.message}`);
    return id;
  }

  async function publish(templateId: string) {
    const { req, res } = createMocks({ method: 'POST', query: { templateId }, body: {} });
    await handler(req as any, res as any);
    return { status: res._getStatusCode(), body: JSON.parse(res._getData() || '{}') };
  }

  async function snapshots(templateId: string) {
    const { data } = await service.from('assessment_template_snapshots').select('id, version').eq('template_id', templateId);
    return data ?? [];
  }

  async function status(templateId: string) {
    const { data } = await service.from('assessment_templates').select('status, version').eq('id', templateId).single();
    return data;
  }

  it('the review\'s reproduction: a refused vía/grade rule, corrected, then publishes on the second attempt', async () => {
    // A school-level vía draft that still carries a grade (drafts are not checked by the database).
    const id = await draft('liderazgo', 9, `${major}.0.0`);

    const first = await publish(id);
    expect(first.status).toBe(409);
    expect(first.body.error).toBe('Esta vía se asigna a un responsable del equipo directivo: el template no lleva nivel.');
    const leftAfterRefusal = await snapshots(id);

    // The person corrects the cause: the instrument loses its grade.
    await service.from('assessment_templates').update({ grade_id: null }).eq('id', id);

    const second = await publish(id);
    expect(second.body.error).toBeUndefined();
    expect(second.status).toBe(200);
    expect(await status(id)).toEqual({ status: 'published', version: `${major}.1.0` });
    expect(await snapshots(id)).toHaveLength(1);
    expect(leftAfterRefusal).toEqual([]); // the refusal wrote no snapshot
  });

  it('two copies duplicated from one published instrument both publish, at two versions, each with its own snapshot', async () => {
    // What «Duplicar» leaves: the published original and two drafts numbered by nextTemplateVersion.
    const original = await draft('familias', 14, `${major}.1.0`, 'published');
    const a = await draft('familias', 14, `${major}.1.1`);
    const b = await draft('familias', 14, `${major}.1.2`);

    const ra = await publish(a);
    const rb = await publish(b);
    expect([ra.status, ra.body.error]).toEqual([200, undefined]);
    expect([rb.status, rb.body.error]).toEqual([200, undefined]);
    expect(await status(a)).toEqual({ status: 'published', version: `${major}.2.0` });
    expect(await status(b)).toEqual({ status: 'published', version: `${major}.3.0` });
    expect(await status(original)).toEqual({ status: 'published', version: `${major}.1.0` });
    expect((await snapshots(a)).map((s) => s.version)).toEqual([`${major}.2.0`]);
    expect((await snapshots(b)).map((s) => s.version)).toEqual([`${major}.3.0`]);
    expect(ra.body.snapshot.id).not.toBe(rb.body.snapshot.id);
  });

  it('a leftover snapshot of an earlier failed attempt (referred to by nothing) is overwritten in place and the retry publishes', async () => {
    const id = await draft('trabajo_docente', 12, `${major}.0.0`);
    // What the old code left behind when its flip failed.
    const leftover = await service
      .from('assessment_template_snapshots')
      .insert({ template_id: id, version: `${major}.1.0`, snapshot_data: { leftover: true } })
      .select('id')
      .single();
    expect(leftover.error).toBeNull();

    const r = await publish(id);
    expect(r.body.error).toBeUndefined();
    expect(r.status).toBe(200);
    const { data: snaps } = await service.from('assessment_template_snapshots').select('id, version, snapshot_data').eq('template_id', id);
    expect(snaps).toHaveLength(1);
    expect(snaps![0].id).toBe(leftover.data!.id); // the same row, not deleted
    expect(snaps![0].snapshot_data.leftover).toBeUndefined();
    expect(snaps![0].snapshot_data.template.id).toBe(id);
    expect(await status(id)).toEqual({ status: 'published', version: `${major}.1.0` });
  });

  it('a snapshot that an assessment instance refers to is never removed nor overwritten: the publication is refused', async () => {
    const id = await draft('trabajo_docente', 13, `${major}.0.0`);
    const kept = await service
      .from('assessment_template_snapshots')
      .insert({ template_id: id, version: `${major}.1.0`, snapshot_data: { kept: true } })
      .select('id')
      .single();
    expect(kept.error).toBeNull();
    const inst = await service
      .from('assessment_instances')
      .insert({ template_snapshot_id: kept.data!.id, transformation_year: 1, status: 'pending' })
      .select('id')
      .single();
    expect(inst.error).toBeNull();

    const r = await publish(id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('snapshot_in_use');
    const { data: snaps } = await service.from('assessment_template_snapshots').select('id, snapshot_data').eq('template_id', id);
    expect(snaps).toEqual([{ id: kept.data!.id, snapshot_data: { kept: true } }]);
    const still = await service.from('assessment_instances').select('id').eq('id', inst.data!.id);
    expect(still.data).toHaveLength(1);
    expect((await status(id))?.status).toBe('draft');
  });

  it('the race: another publisher flips the instrument after it was read → refused with a message, nothing written', async () => {
    const id = await draft('trabajo_docente', 15, `${major}.0.0`);
    // The other publisher wins between this publication's read and its write.
    const racing = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        await service.from('assessment_templates').update({ status: 'published', version: `${major}.9.0` }).eq('id', id);
        return service.rpc(fn, args);
      },
    };
    const r = await publishTemplate(holder.client, id, { id: holder.userId }, { publishClient: racing as any });
    expect(r).toMatchObject({
      ok: false,
      status: 409,
      error: 'Este instrumento ya fue publicado o cambió mientras se publicaba. Recarga la página.',
    });
    expect(await snapshots(id)).toEqual([]);
    expect(await status(id)).toEqual({ status: 'published', version: `${major}.9.0` });
  });

  it('nobody but the service role can call the publication function', async () => {
    const id = await draft('trabajo_docente', 16, `${major}.0.0`);
    const signedIn = await holder.client.rpc('publish_assessment_template', {
      p_template_id: id, p_expected_version: `${major}.0.0`, p_snapshot_data: {},
    });
    expect(signedIn.error?.code).toBe('42501');
    const visitor = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anon = await visitor.rpc('publish_assessment_template', {
      p_template_id: id, p_expected_version: `${major}.0.0`, p_snapshot_data: {},
    });
    expect(anon.error?.code).toBe('42501');
    expect(await snapshots(id)).toEqual([]);
    expect((await status(id))?.status).toBe('draft');
  });
});
