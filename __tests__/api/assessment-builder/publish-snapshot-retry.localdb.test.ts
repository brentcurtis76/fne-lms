// @vitest-environment node
/**
 * GC-10 against a real local database: a publication that fails after its
 * snapshot is written must not leave that snapshot behind, and a retry must
 * not be stopped by a leftover of an earlier failed attempt.
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

  async function draft(area: string, gradeId: number | null, version: string): Promise<string> {
    const id = randomUUID();
    const t = await service.from('assessment_templates').insert({
      id, name: `F8 Instrumento Sintético ${major}`, area, grade_id: gradeId, version, status: 'draft',
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

  it('a leftover snapshot of an earlier failed attempt (referred to by nothing) is removed and the retry publishes', async () => {
    const id = await draft('trabajo_docente', 12, `${major}.0.0`);
    const leftover = await service
      .from('assessment_template_snapshots')
      .insert({ template_id: id, version: `${major}.1.0`, snapshot_data: { leftover: true } })
      .select('id')
      .single();
    expect(leftover.error).toBeNull();

    const r = await publish(id);
    expect(r.body.error).toBeUndefined();
    expect(r.status).toBe(200);
    const snaps = await snapshots(id);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].id).not.toBe(leftover.data!.id);
  });

  it('a snapshot that an assessment instance refers to is never removed', async () => {
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
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('Error al crear snapshot');
    expect((await snapshots(id)).map((s) => s.id)).toEqual([kept.data!.id]);
    const still = await service.from('assessment_instances').select('id').eq('id', inst.data!.id);
    expect(still.data).toHaveLength(1);
    expect((await status(id))?.status).toBe('draft');
  });

  it('two drafts of the same vía and level: the second is refused with a message, and publishes once its level is corrected', async () => {
    const a = await draft('familias', 14, `${major}.0.0`);
    const b = await draft('familias', 14, `${major}.0.1`); // both would publish to `${major}.1.0`

    const ra = await publish(a);
    expect(ra.status).toBe(200);

    const rb = await publish(b);
    expect(rb.status).toBe(409);
    expect(rb.body.error).toBe('Ya existe un template con la misma vía, nivel (o nombre, si no lleva nivel) y versión.');
    const leftAfterRefusal = await snapshots(b);

    // The person corrects the cause: the second draft is for another level.
    await service.from('assessment_templates').update({ grade_id: 15 }).eq('id', b);

    const rb2 = await publish(b);
    expect(rb2.body.error).toBeUndefined();
    expect(rb2.status).toBe(200);
    expect(await status(b)).toEqual({ status: 'published', version: `${major}.1.0` });
    expect(leftAfterRefusal).toEqual([]); // the refusal wrote no snapshot
  });
});
