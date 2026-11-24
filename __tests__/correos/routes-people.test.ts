// @vitest-environment node
/**
 * What the Correos routes do for an admin, through GENERA's real admin route, staff rule, pasantías rule and
 * outbound policy. Stand-ins: the admin check (`lib/api-auth`) and the database client (a recorder that answers
 * as the test says). Invented people only; no network.
 *
 *   C1, I2  no reason (no basis chosen, or no note): refused 400 before the database is called.
 *   C3      a malformed address is refused in plain words; the database's answers become plain messages.
 *   I3, I4  the import route: file shapes, 20,001 rows, no address column, not text; cells reach the
 *           database exactly as written; one call for the whole file; the counts come back.
 *   U1, U2  GENERA users: only staff allowed by the outbound policy; an id outside the rule refuses the whole
 *           request and the database function is not called.
 *   P1, P2  pasantías leads: only those who ticked; the tick's time and version per row; a lead who did not
 *           tick refuses the whole request; the registro-tractor table is never read.
 *   Lists   name taken (any case, spaces) refused; no delete anywhere.
 *   E3      an admin's erase calls email_erase_contact once with the admin as actor.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import { arg, counts, fakeDb, has, type QueryRecord } from './fake-db';

const { auth } = vi.hoisted(() => ({
  auth: {
    checkIsAdmin: vi.fn(),
    getForcedPasswordChangeVerdict: vi.fn(),
    db: null as any,
  },
}));

vi.mock('../../lib/api-auth', () => ({
  checkIsAdmin: auth.checkIsAdmin,
  getForcedPasswordChangeVerdict: auth.getForcedPasswordChangeVerdict,
  createServiceRoleClient: () => auth.db.client,
}));

import listas from '../../pages/api/admin/correos/listas/index';
import lista from '../../pages/api/admin/correos/listas/[id]';
import contactos from '../../pages/api/admin/correos/contactos/index';
import contacto from '../../pages/api/admin/correos/contactos/[id]';
import borrar from '../../pages/api/admin/correos/contactos/borrar';
import importar, { config as importConfig } from '../../pages/api/admin/correos/importar';
import usuarios from '../../pages/api/admin/correos/usuarios';
import pasantias from '../../pages/api/admin/correos/pasantias';
import { addressFingerprint } from '../../lib/correos/contacts';

const ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'admin.inventado@example.test' };
const LIST_A = '11111111-1111-4111-8111-111111111111';
const LIST_B = '11111111-1111-4111-8111-222222222222';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_OK = '33333333-3333-4333-8333-000000000001';
const STAFF_QA = '33333333-3333-4333-8333-000000000002';
const NO_ROLE = '33333333-3333-4333-8333-000000000003';
const NO_ADDRESS = '33333333-3333-4333-8333-000000000004';
const LEAD_TICKED = '44444444-4444-4444-8444-000000000001';
const LEAD_NOT_TICKED = '44444444-4444-4444-8444-000000000002';

const REASON = { legal_basis: 'manual_verified', basis_note: 'Lo confirmamos por teléfono el 20 de noviembre (inventado).' };

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

async function call(handler: Handler, method: string, options: { body?: unknown; query?: Record<string, string> } = {}) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method as any,
    url: '/api/admin/correos',
    query: options.query ?? {},
    headers: { 'content-type': 'application/json' },
    body: options.body as any,
  });
  await handler(req, res);
  const raw = res._getData();
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res._getStatusCode(), json, raw: text };
}

// ---------------------------------------------------------------------------------------------------------
// The invented world the database stand-in answers from
// ---------------------------------------------------------------------------------------------------------

const PROFILES: Record<string, { id: string; first_name: string | null; last_name: string | null; name: string | null; email: string | null; school_id: number | null; active_role: boolean; role_school: number | null }> = {
  [STAFF_OK]: { id: STAFF_OK, first_name: 'Dana', last_name: 'Inventada', name: null, email: 'dana.inventada@example.test', school_id: 10, active_role: true, role_school: 10 },
  [STAFF_QA]: { id: STAFF_QA, first_name: 'Quique', last_name: 'Prueba', name: null, email: 'quique.prueba@example.test', school_id: 20, active_role: true, role_school: 20 },
  [NO_ROLE]: { id: NO_ROLE, first_name: 'Sin', last_name: 'Rol', name: null, email: 'sin.rol@example.test', school_id: 10, active_role: false, role_school: null },
  [NO_ADDRESS]: { id: NO_ADDRESS, first_name: 'Sin', last_name: 'Correo', name: null, email: null, school_id: 10, active_role: true, role_school: 10 },
};
const SCHOOLS: Record<number, { id: number; tenant_kind: string; internal_zoom_testing_enabled: boolean }> = {
  10: { id: 10, tenant_kind: 'client', internal_zoom_testing_enabled: false },
  20: { id: 20, tenant_kind: 'qa', internal_zoom_testing_enabled: false },
};

const LEADS: Record<string, any> = {
  [LEAD_TICKED]: {
    id: LEAD_TICKED, first_name: 'Lía', last_name: 'Interesada', email: 'lia.interesada@example.test', institution: 'Liceo Inventado',
    cohort: 'enero-2027', marketing_opt_in: true, marketing_opt_in_at: '2026-10-02T14:30:00+00:00', marketing_notice_version: 'aviso-inventado-v3',
  },
  [LEAD_NOT_TICKED]: {
    id: LEAD_NOT_TICKED, first_name: 'Noé', last_name: 'Sinmarca', email: 'noe.sinmarca@example.test', institution: 'Liceo Inventado',
    cohort: 'enero-2027', marketing_opt_in: false, marketing_opt_in_at: null, marketing_notice_version: null,
  },
};

let LISTS: { id: string; name: string; description: string | null; is_public: boolean; archived_at: string | null; created_at: string }[] = [];

function eqValue(record: QueryRecord, column: string): unknown {
  const op = record.ops.find((o) => o.method === 'eq' && o.args[0] === column);
  return op ? op.args[1] : undefined;
}

function world(record: QueryRecord) {
  const { table } = record;
  if (table === 'tractor_signups') throw new Error('tractor_signups must never be read');
  if (table === 'email_lists') {
    if (has(record, 'insert')) return { data: { id: LIST_B }, error: null };
    if (has(record, 'update')) return { data: null, error: null };
    const id = eqValue(record, 'id');
    if (id !== undefined) return { data: LISTS.find((l) => l.id === id) ?? null, error: null };
    return { data: LISTS, error: null };
  }
  if (table === 'email_list_members') {
    if (has(record, 'select') && arg(record, 'select', 1)?.head) return { count: 7, error: null };
    return {
      data: [
        {
          list_id: LIST_A, state: 'subscribed', joined_via: 'manual', legal_basis: 'manual_verified', basis_note: 'Nota', basis_recorded_at: '2026-11-20T12:00:00Z',
          consent_notice_version: null, subscribed_at: '2026-11-20T12:00:00Z', unsubscribed_at: null, unsubscribed_by: null, email_lists: { name: 'Boletín general' },
        },
        {
          list_id: LIST_B, state: 'unsubscribed', joined_via: 'csv_import', legal_basis: 'manual_verified', basis_note: null, basis_recorded_at: '2026-11-20T12:00:00Z',
          consent_notice_version: null, subscribed_at: '2026-11-20T12:00:00Z', unsubscribed_at: '2026-11-22T12:00:00Z', unsubscribed_by: 'person', email_lists: { name: 'Directivos' },
        },
      ],
      error: null,
    };
  }
  if (table === 'email_contacts') {
    if (eqValue(record, 'email_normalized') !== undefined) return { data: { id: CONTACT_ID }, error: null };
    if (eqValue(record, 'id') !== undefined) {
      return {
        data: {
          id: CONTACT_ID, email: 'Persona.Inventada@example.test', email_normalized: 'persona.inventada@example.test', first_name: '=HYPERLINK("x")',
          last_name: '<b>Inventada</b>', organization: null, source: 'manual', legal_basis: 'manual_verified', basis_note: 'Nota',
          basis_recorded_at: '2026-11-20T12:00:00Z', consent_notice_version: null, created_at: '2026-11-20T12:00:00Z', unsubscribed_at: null,
          suppressed_at: null, suppression_reason: null, anonymized_at: null,
        },
        error: null,
      };
    }
    return { data: [{ id: CONTACT_ID, email: 'persona.inventada@example.test', first_name: 'Ana', last_name: null, organization: null, created_at: '2026-11-20T12:00:00Z', suppressed_at: null }], count: 1, error: null };
  }
  if (table === 'email_suppression') return { data: { reason: 'bounce', created_at: '2026-11-21T12:00:00Z', erased_at: null }, error: null };
  if (table === 'profiles') {
    // The staff query embeds active roles (`user_roles!…!inner`); the outbound policy reads school_id alone.
    const select = String(arg(record, 'select') ?? '');
    if (select === 'school_id') {
      const p = PROFILES[eqValue(record, 'id') as string];
      return { data: p ? { school_id: p.school_id } : null, error: null };
    }
    const ids = (arg(record, 'in', 1) as string[] | undefined) ?? Object.keys(PROFILES);
    const rows = ids
      .map((id) => PROFILES[id])
      .filter((p) => p && p.active_role && (has(record, 'in') || p.email !== null))
      .map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, name: p.name, email: p.email, user_roles: [{ id: `rol-${p.id}` }] }));
    return { data: rows, count: rows.length, error: null };
  }
  if (table === 'user_roles') {
    const p = PROFILES[eqValue(record, 'user_id') as string];
    return { data: p && p.active_role && p.role_school ? [{ school_id: p.role_school }] : [], error: null };
  }
  if (table === 'schools') return { data: SCHOOLS[eqValue(record, 'id') as number] ?? null, error: null };
  if (table === 'pasantias_leads') {
    if (has(record, 'in')) return { data: (arg(record, 'in', 1) as string[]).map((id) => LEADS[id]).filter(Boolean), error: null };
    return { data: Object.values(LEADS).filter((l) => l.marketing_opt_in), count: 1, error: null };
  }
  throw new Error(`unexpected table ${table}`);
}

let rpcResult: (name: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown };

beforeEach(() => {
  vi.clearAllMocks();
  auth.checkIsAdmin.mockResolvedValue({ user: ADMIN, isAdmin: true, error: null });
  auth.getForcedPasswordChangeVerdict.mockResolvedValue('allowed');
  LISTS = [
    { id: LIST_A, name: 'Boletín general', description: null, is_public: true, archived_at: null, created_at: '2026-11-24T00:00:00Z' },
  ];
  rpcResult = (name) => (name === 'email_add_contacts' ? { data: counts({ accepted: 1, contacts_created: 1, memberships_created: 1 }) } : { data: null });
  auth.db = fakeDb(world, (name, args) => rpcResult(name, args));
});

const addCalls = () => auth.db.rpcs.filter((r: any) => r.name === 'email_add_contacts');

// ---------------------------------------------------------------------------------------------------------

describe('C1 and I2: the reason has no default; without it nothing reaches the database', () => {
  const routes: Array<[string, Handler, Record<string, unknown>]> = [
    ['contactos (one person)', contactos, { email: 'persona.inventada@example.test', list_ids: [LIST_A] }],
    ['importar (CSV)', importar, { csv: 'correo\npersona.inventada@example.test\n', list_ids: [LIST_A] }],
    ['usuarios', usuarios, { user_ids: [STAFF_OK], list_ids: [LIST_A] }],
    ['pasantias', pasantias, { lead_ids: [LEAD_TICKED], list_ids: [LIST_A] }],
  ];
  const missing: Array<[string, Record<string, unknown>]> = [
    ['no basis and no note', {}],
    ['a note but no basis', { basis_note: 'Nota inventada.' }],
    ['a basis but no note', { legal_basis: 'consent_form', consent_notice_version: 'v1' }],
    ['a basis and a blank note', { legal_basis: 'consent_form', basis_note: '   ', consent_notice_version: 'v1' }],
    ['a basis that does not exist', { legal_basis: 'implied', basis_note: 'Nota inventada.' }],
  ];
  for (const [routeName, handler, base] of routes) {
    for (const [label, reason] of missing) {
      it(`${routeName}, ${label}: 400 with a plain message, database not called`, async () => {
        const result = await call(handler, 'POST', { body: { ...base, ...reason } });
        expect(result.status).toBe(400);
        expect(result.json.error).toMatch(/permiso|motivo|nota/i);
        expect(auth.db.queries).toEqual([]);
        expect(auth.db.rpcs).toEqual([]);
      });
    }
  }

  it('a consent form without the notice version is refused for one person (400, nothing called)', async () => {
    const result = await call(contactos, 'POST', {
      body: { email: 'persona.inventada@example.test', list_ids: [LIST_A], legal_basis: 'consent_form', basis_note: 'Formulario inventado.' },
    });
    expect(result.status).toBe(400);
    expect(result.json.error).toMatch(/versión del aviso/);
    expect(auth.db.rpcs).toEqual([]);
  });

  it('one person with the reason: one call, the chosen basis and the typed note, the admin as actor, source manual', async () => {
    const result = await call(contactos, 'POST', {
      body: { email: '  Persona.Inventada@Example.TEST ', first_name: 'Ana', list_ids: [LIST_A, LIST_B], ...REASON },
    });
    expect(result.status).toBe(201);
    expect(result.json.outcome).toBe('added');
    expect(result.json.contactId).toBe(CONTACT_ID);
    expect(addCalls()).toHaveLength(1);
    const args = addCalls()[0].args;
    expect(args.p_source).toBe('manual');
    expect(args.p_legal_basis).toBe('manual_verified');
    expect(args.p_basis_note).toBe(REASON.basis_note);
    expect(args.p_actor).toBe(ADMIN.id);
    expect(args.p_list_ids).toEqual([LIST_A, LIST_B]);
    expect(args.p_rows).toEqual([{ email: 'Persona.Inventada@Example.TEST', first_name: 'Ana', last_name: null, organization: null }]);
    expect(typeof args.p_basis_recorded_at).toBe('string');
    expect(auth.db.writes()).toEqual([]);
  });

  it('the import stores the one reason for the whole file, with the admin as actor', async () => {
    rpcResult = () => ({ data: counts({ accepted: 2 }) });
    const result = await call(importar, 'POST', {
      body: { csv: 'correo\nuna@example.test\ndos@example.test\n', list_ids: [LIST_A], legal_basis: 'consent_form', basis_note: 'Formulario de inscripción (inventado).', consent_notice_version: 'v-inventada' },
    });
    expect(result.status).toBe(200);
    const args = addCalls()[0].args;
    expect(args.p_source).toBe('csv_import');
    expect(args.p_legal_basis).toBe('consent_form');
    expect(args.p_consent_notice_version).toBe('v-inventada');
    expect(args.p_actor).toBe(ADMIN.id);
  });
});

describe('C3: bad and duplicate addresses, in plain words', () => {
  it('a malformed address is refused before the database is called', async () => {
    for (const email of ['sin-arroba.example.test', 'dos@@example.test', 'falta@dominio', 'con espacio@example.test', '']) {
      const result = await call(contactos, 'POST', { body: { email, list_ids: [LIST_A], ...REASON } });
      expect(result.status).toBe(400);
      expect(result.json.error).toBe('Esa dirección de correo no es válida. Revísala: debe tener una arroba (@) y un dominio, como «.cl».');
    }
    expect(auth.db.rpcs).toEqual([]);
  });

  it('the database answers become plain messages: already there, blocked, left by choice, malformed', async () => {
    const cases: Array<[Record<string, number>, number, string, RegExp]> = [
      [{ duplicate: 1 }, 200, 'duplicate', /ya estaba en todas esas listas/],
      [{ blocked: 1 }, 409, 'blocked', /bloqueada y no se puede agregar/],
      [{ left: 1 }, 409, 'left', /se dio de baja por decisión propia/i],
      [{ invalid: 1 }, 422, 'invalid', /no es válida/],
    ];
    for (const [values, status, outcome, message] of cases) {
      rpcResult = () => ({ data: counts(values) });
      const result = await call(contactos, 'POST', { body: { email: 'persona.inventada@example.test', list_ids: [LIST_A], ...REASON } });
      expect(result.status).toBe(status);
      expect(result.json.outcome).toBe(outcome);
      expect(result.json.message).toMatch(message);
    }
  });

  it('a blocked person: the answer says "blocked" and never why', async () => {
    rpcResult = () => ({ data: counts({ blocked: 1 }) });
    const result = await call(contactos, 'POST', { body: { email: 'persona.inventada@example.test', list_ids: [LIST_A], ...REASON } });
    expect(result.raw).not.toMatch(/rebot|bounce|complaint|spam|borrad|erased/i);
  });

  it('a database error code becomes a plain message; an unknown error never shows itself', async () => {
    rpcResult = () => ({ error: { code: '22023', message: 'email_add_contacts: list_not_found_or_archived' } });
    let result = await call(contactos, 'POST', { body: { email: 'persona.inventada@example.test', list_ids: [LIST_A], ...REASON } });
    expect(result.status).toBe(400);
    expect(result.json.error).toMatch(/no existe o está archivada/);

    rpcResult = () => ({ error: { code: 'XX000', message: 'relation "secret_table" does not exist at character 42' } });
    result = await call(contactos, 'POST', { body: { email: 'persona.inventada@example.test', list_ids: [LIST_A], ...REASON } });
    expect(result.status).toBe(500);
    expect(result.raw).not.toMatch(/relation|secret_table|character/);
    expect(result.json.error).toMatch(/No se cambió nada/);
  });

  it('no list chosen is refused before the database', async () => {
    for (const list_ids of [undefined, [], ['no-es-un-id']]) {
      const result = await call(contactos, 'POST', { body: { email: 'persona.inventada@example.test', list_ids, ...REASON } });
      expect(result.status).toBe(400);
      expect(result.json.error).toBe('Elige al menos una lista.');
    }
    expect(auth.db.rpcs).toEqual([]);
  });
});

describe('I3 and I4: the import route', () => {
  it('has its own 8 MB body limit', () => {
    expect(importConfig.api.bodyParser.sizeLimit).toBe('8mb');
  });

  it('a semicolon file with a byte-order mark, quoted commas and accents: one call, cells as written, counts returned', async () => {
    rpcResult = () => ({ data: counts({ accepted: 2, duplicate: 1, blocked: 1, left: 1, invalid: 1 }) });
    const csv = '﻿Correo;Nombre;Apellido;Organización\r\n' +
      'nuñez@example.test;"Muñoz, José";Ñandú;"Colegio ""Árbol"""\r\n' +
      'formula@example.test;=HYPERLINK("http://x");+56;-1\r\n' +
      'html@example.test;<img src=x onerror=alert(1)>;@arroba;\r\n' +
      'otra@example.test;;;\r\n' +
      'otra@example.test;;;\r\n' +
      'mal-escrita;;;\r\n';
    const result = await call(importar, 'POST', { body: { csv, list_ids: [LIST_A], ...REASON } });
    expect(result.status).toBe(200);
    expect(result.json.counts).toEqual(counts({ accepted: 2, duplicate: 1, blocked: 1, left: 1, invalid: 1 }));
    expect(addCalls()).toHaveLength(1);
    const rows = addCalls()[0].args.p_rows;
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({ email: 'nuñez@example.test', first_name: 'Muñoz, José', last_name: 'Ñandú', organization: 'Colegio "Árbol"' });
    expect(rows[1]).toEqual({ email: 'formula@example.test', first_name: '=HYPERLINK("http://x")', last_name: '+56', organization: '-1' });
    expect(rows[2]).toEqual({ email: 'html@example.test', first_name: '<img src=x onerror=alert(1)>', last_name: '@arroba' });
    expect(rows[5]).toEqual({ email: 'mal-escrita' });
  });

  const refused: Array<[string, string, RegExp]> = [
    ['no address column', 'nombre,apellido\nAna,Inventada\n', /no tiene una columna de correo/],
    ['not text', 'correo\nuna@example.test\u0000\u0001\u0002binario\n', /no es un archivo de texto/],
    ['20,001 rows', 'correo\n' + Array.from({ length: 20_001 }, (_, i) => `p${i}@example.test`).join('\n') + '\n', /más de 20\.000 filas/],
    ['an unclosed quote', 'correo,nombre\nuna@example.test,"Ana\n', /comillas/],
    ['only the header', 'correo,nombre\n', /ninguna persona/],
  ];
  for (const [label, csv, message] of refused) {
    it(`${label}: refused whole, database not called`, async () => {
      const result = await call(importar, 'POST', { body: { csv, list_ids: [LIST_A], ...REASON } });
      expect(result.status).toBe(422);
      expect(result.json.error).toMatch(message);
      expect(auth.db.rpcs).toEqual([]);
      expect(auth.db.queries).toEqual([]);
    });
  }

  it('a body whose file is not a string is refused as not text', async () => {
    const result = await call(importar, 'POST', { body: { csv: { rows: [] }, list_ids: [LIST_A], ...REASON } });
    expect(result.status).toBe(400);
    expect(result.json.error).toMatch(/no es un archivo de texto/);
    expect(auth.db.rpcs).toEqual([]);
  });

  it('exactly 20,000 rows go in one call', async () => {
    rpcResult = () => ({ data: counts({ accepted: 20_000 }) });
    const csv = 'email\n' + Array.from({ length: 20_000 }, (_, i) => `p${i}@example.test`).join('\n');
    const result = await call(importar, 'POST', { body: { csv, list_ids: [LIST_A], ...REASON } });
    expect(result.status).toBe(200);
    expect(addCalls()).toHaveLength(1);
    expect(addCalls()[0].args.p_rows).toHaveLength(20_000);
  });

  it('the database refusing the size becomes a plain message', async () => {
    rpcResult = () => ({ error: { code: '22023', message: 'email_add_contacts: too_many_rows' } });
    const result = await call(importar, 'POST', { body: { csv: 'correo\nuna@example.test\n', list_ids: [LIST_A], ...REASON } });
    expect(result.status).toBe(400);
    expect(result.json.error).toMatch(/más de 20\.000/);
  });
});

describe('U1 and U2: GENERA users', () => {
  it('the listing offers only staff allowed by the outbound policy (no QA school, no role-less, no address-less)', async () => {
    const result = await call(usuarios, 'GET', { query: { q: 'inventad' } });
    expect(result.status).toBe(200);
    const ids = result.json.items.map((item: any) => item.id);
    expect(ids).toEqual([STAFF_OK]);
    expect(result.json.hidden).toBe(1); // the QA school's user
    const staffQuery = auth.db.queries.find((q: QueryRecord) => q.table === 'profiles' && String(arg(q, 'select')).includes('user_roles'));
    expect(String(arg(staffQuery, 'select'))).toContain('!inner');
    expect(eqValue(staffQuery, 'user_roles.is_active')).toBe(true);
  });

  it('adding allowed staff copies name and address as they are now, source profiles, the admin reason', async () => {
    const result = await call(usuarios, 'POST', { body: { user_ids: [STAFF_OK], list_ids: [LIST_A], ...REASON } });
    expect(result.status).toBe(200);
    expect(addCalls()).toHaveLength(1);
    const args = addCalls()[0].args;
    expect(args.p_source).toBe('profiles');
    expect(args.p_rows).toEqual([{ email: 'dana.inventada@example.test', first_name: 'Dana', last_name: 'Inventada' }]);
    expect(args.p_basis_note).toBe(REASON.basis_note);
    expect(args.p_actor).toBe(ADMIN.id);
  });

  for (const [label, outsider] of [
    ['a QA school user', STAFF_QA],
    ['a user without an active role', NO_ROLE],
    ['a user without an address', NO_ADDRESS],
    ['an unknown id', '33333333-3333-4333-8333-00000000ffff'],
  ] as const) {
    it(`${label} posted directly, next to an allowed one: whole request refused, database function not called`, async () => {
      const result = await call(usuarios, 'POST', { body: { user_ids: [STAFF_OK, outsider], list_ids: [LIST_A], ...REASON } });
      expect(result.status).toBe(422);
      expect(result.json.error).toMatch(/No se agregó a nadie/);
      expect(auth.db.rpcs).toEqual([]);
      expect(auth.db.writes()).toEqual([]);
    });
  }

  it('ids that are not ids are refused', async () => {
    const result = await call(usuarios, 'POST', { body: { user_ids: ['1 OR 1=1'], list_ids: [LIST_A], ...REASON } });
    expect(result.status).toBe(400);
    expect(auth.db.rpcs).toEqual([]);
  });
});

describe('P1 and P2: pasantías leads', () => {
  it('the listing reads only leads who ticked, and never the registro-tractor table', async () => {
    const result = await call(pasantias, 'GET');
    expect(result.status).toBe(200);
    expect(result.json.items.map((item: any) => item.id)).toEqual([LEAD_TICKED]);
    const query = auth.db.queries.find((q: QueryRecord) => q.table === 'pasantias_leads');
    expect(eqValue(query, 'marketing_opt_in')).toBe(true);
    expect(auth.db.queries.some((q: QueryRecord) => q.table === 'tractor_signups')).toBe(false);
  });

  it('a lead who ticked: basis consent_form, the tick time and notice version per row, source pasantia_leads', async () => {
    const result = await call(pasantias, 'POST', {
      body: { lead_ids: [LEAD_TICKED], list_ids: [LIST_A], legal_basis: 'consent_form', basis_note: 'Marcó el boletín en el formulario (inventado).' },
    });
    expect(result.status).toBe(200);
    const args = addCalls()[0].args;
    expect(args.p_source).toBe('pasantia_leads');
    expect(args.p_legal_basis).toBe('consent_form');
    expect(args.p_rows).toEqual([
      {
        email: 'lia.interesada@example.test',
        first_name: 'Lía',
        last_name: 'Interesada',
        organization: 'Liceo Inventado',
        basis_recorded_at: '2026-10-02T14:30:00.000Z',
        consent_notice_version: 'aviso-inventado-v3',
      },
    ]);
    expect(args.p_actor).toBe(ADMIN.id);
  });

  it('only consent_form is accepted as the basis for leads', async () => {
    const result = await call(pasantias, 'POST', { body: { lead_ids: [LEAD_TICKED], list_ids: [LIST_A], ...REASON } });
    expect(result.status).toBe(400);
    expect(auth.db.rpcs).toEqual([]);
  });

  for (const [label, outsider] of [
    ['a lead who did not tick', LEAD_NOT_TICKED],
    ['an unknown lead id', '44444444-4444-4444-8444-00000000ffff'],
  ] as const) {
    it(`${label} posted directly, next to one who ticked: whole request refused, database function not called`, async () => {
      const result = await call(pasantias, 'POST', {
        body: { lead_ids: [LEAD_TICKED, outsider], list_ids: [LIST_A], legal_basis: 'consent_form', basis_note: 'Nota inventada.' },
      });
      expect(result.status).toBe(422);
      expect(result.json.error).toMatch(/no marcó la casilla/);
      expect(auth.db.rpcs).toEqual([]);
    });
  }
});

describe('Lists', () => {
  it('reads every list with its number of subscribed members', async () => {
    const result = await call(listas, 'GET');
    expect(result.status).toBe(200);
    expect(result.json.lists).toEqual([expect.objectContaining({ id: LIST_A, name: 'Boletín general', subscribed: 7 })]);
  });

  it('a name already taken, in other letter case and with spaces, is refused with a plain message', async () => {
    const result = await call(listas, 'POST', { body: { name: '  boletín GENERAL ', is_public: false } });
    expect(result.status).toBe(409);
    expect(result.json.error).toMatch(/Ya existe una lista con ese nombre/);
    expect(auth.db.writes()).toEqual([]);
  });

  it('a new name is created with the admin as creator', async () => {
    const result = await call(listas, 'POST', { body: { name: 'Lista inventada', description: 'Para la prueba', is_public: true } });
    expect(result.status).toBe(201);
    const insert = auth.db.writes()[0];
    expect(arg(insert, 'insert')).toEqual({ name: 'Lista inventada', description: 'Para la prueba', is_public: true, created_by: ADMIN.id });
  });

  it('the public flag must be chosen when creating', async () => {
    const result = await call(listas, 'POST', { body: { name: 'Lista inventada' } });
    expect(result.status).toBe(400);
    expect(auth.db.writes()).toEqual([]);
  });

  it('archive sets archived_at; renaming to a taken name is refused; nothing is ever deleted', async () => {
    LISTS.push({ id: LIST_B, name: 'Directivos', description: null, is_public: false, archived_at: null, created_at: '2026-11-24T00:00:00Z' });
    let result = await call(lista, 'PATCH', { query: { id: LIST_B }, body: { name: 'BOLETÍN GENERAL' } });
    expect(result.status).toBe(409);
    result = await call(lista, 'PATCH', { query: { id: LIST_B }, body: { archive: true } });
    expect(result.status).toBe(200);
    const update = auth.db.writes().find((w: QueryRecord) => has(w, 'update'));
    expect(Object.keys(arg(update, 'update'))).toEqual(['archived_at']);
    expect(auth.db.queries.some((q: QueryRecord) => has(q, 'delete'))).toBe(false);
  });
});

describe('C2: search and a person’s page', () => {
  it('searches by part of address, name and organisation, 25 a page, erased people left out', async () => {
    const result = await call(contactos, 'GET', { query: { q: 'ana,(x)*', page: '2' } });
    expect(result.status).toBe(200);
    const query = auth.db.queries.find((q: QueryRecord) => q.table === 'email_contacts');
    expect(arg(query, 'or')).toBe('email.ilike.*ana x*,first_name.ilike.*ana x*,last_name.ilike.*ana x*,organization.ilike.*ana x*');
    expect(arg(query, 'range', 0)).toBe(25);
    expect(arg(query, 'range', 1)).toBe(49);
    expect(arg(query, 'is')).toBe('anonymized_at');
    expect(result.json.pageSize).toBe(25);
  });

  it('a person’s page shows each list’s state, the reason and date, and the block and why', async () => {
    const result = await call(contacto, 'GET', { query: { id: CONTACT_ID } });
    expect(result.status).toBe(200);
    const c = result.json.contact;
    expect(c.memberships.map((m: any) => [m.list_name, m.state])).toEqual([
      ['Boletín general', 'subscribed'],
      ['Directivos', 'unsubscribed'],
    ]);
    expect(c.legal_basis).toBe('manual_verified');
    expect(c.basis_recorded_at).toBe('2026-11-20T12:00:00Z');
    expect(c.block).toEqual({ blocked: true, reason: 'bounce', since: '2026-11-21T12:00:00Z' });
    const block = auth.db.queries.find((q: QueryRecord) => q.table === 'email_suppression');
    expect(eqValue(block, 'email_hash')).toBe(addressFingerprint('persona.inventada@example.test'));
    // Cells are returned as the plain text they are.
    expect(c.first_name).toBe('=HYPERLINK("x")');
    expect(c.last_name).toBe('<b>Inventada</b>');
  });

  it('an id that is not an id is a 404 without a database read', async () => {
    const result = await call(contacto, 'GET', { query: { id: "1' OR '1'='1" } });
    expect(result.status).toBe(404);
    expect(auth.db.queries).toEqual([]);
  });
});

describe('E3: an admin erases with the confirm, through the one function', () => {
  it('calls email_erase_contact once with the contact and the admin as actor', async () => {
    rpcResult = () => ({ data: { contact_id: CONTACT_ID, erased: true, already_erased: false, sends_cleared: 2, memberships_ended: 1 } });
    const result = await call(borrar, 'POST', { body: { contact_id: CONTACT_ID } });
    expect(result.status).toBe(200);
    expect(result.json.erased).toBe(true);
    expect(auth.db.rpcs).toEqual([{ name: 'email_erase_contact', args: { p_contact_id: CONTACT_ID, p_actor: ADMIN.id } }]);
    expect(auth.db.writes()).toEqual([]);
  });

  it('an unknown contact is a plain 404', async () => {
    rpcResult = () => ({ error: { code: 'P0002', message: 'email_erase_contact: contact_not_found' } });
    const result = await call(borrar, 'POST', { body: { contact_id: CONTACT_ID } });
    expect(result.status).toBe(404);
    expect(result.json.error).toMatch(/No encontramos a esa persona/);
  });
});
