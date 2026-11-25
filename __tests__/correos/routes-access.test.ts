// @vitest-environment node
/**
 * A4 (every route checks first) and E3 (a visitor or a non-admin erases nothing), for every Correos route of
 * phase 2 and every method it accepts. The stand-ins: the admin check (`lib/api-auth`) and the database client
 * (a recorder). Invented people; no network.
 *
 * For each route and method: a visitor gets 401, a docente, a consultor and an admin held by the forced
 * password change get 403; in every case the database was not touched (no query, no function call) and the
 * answer holds no contact data. Methods a route does not accept get 405, also without touching anything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import { fakeDb, type FakeDb } from './fake-db';

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
import importar from '../../pages/api/admin/correos/importar';
import usuarios from '../../pages/api/admin/correos/usuarios';
import pasantias from '../../pages/api/admin/correos/pasantias';

const LIST_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const LEAD_ID = '44444444-4444-4444-8444-444444444444';
const PERSON = 'persona.inventada@example.test';

const REASON = { legal_basis: 'manual_verified', basis_note: 'Nota inventada para la prueba.' };

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

interface RouteCase {
  name: string;
  handler: Handler;
  query?: Record<string, string>;
  accepts: Record<string, unknown>;
  refuses: string[];
}

const ROUTES: RouteCase[] = [
  { name: 'listas', handler: listas, accepts: { GET: undefined, POST: { name: 'Lista inventada', is_public: false } }, refuses: ['PUT', 'PATCH', 'DELETE'] },
  { name: 'listas/[id]', handler: lista, query: { id: LIST_ID }, accepts: { PATCH: { archive: true } }, refuses: ['GET', 'POST', 'PUT', 'DELETE'] },
  {
    name: 'contactos',
    handler: contactos,
    query: { q: 'persona' },
    accepts: { GET: undefined, POST: { email: PERSON, list_ids: [LIST_ID], ...REASON } },
    refuses: ['PUT', 'PATCH', 'DELETE'],
  },
  { name: 'contactos/[id]', handler: contacto, query: { id: CONTACT_ID }, accepts: { GET: undefined }, refuses: ['POST', 'PUT', 'PATCH', 'DELETE'] },
  { name: 'contactos/borrar', handler: borrar, accepts: { POST: { contact_id: CONTACT_ID } }, refuses: ['GET', 'PUT', 'PATCH', 'DELETE'] },
  {
    name: 'importar',
    handler: importar,
    accepts: { POST: { csv: `correo\n${PERSON}\n`, list_ids: [LIST_ID], ...REASON } },
    refuses: ['GET', 'PUT', 'PATCH', 'DELETE'],
  },
  {
    name: 'usuarios',
    handler: usuarios,
    accepts: { GET: undefined, POST: { user_ids: [USER_ID], list_ids: [LIST_ID], ...REASON } },
    refuses: ['PUT', 'PATCH', 'DELETE'],
  },
  {
    name: 'pasantias',
    handler: pasantias,
    accepts: { GET: undefined, POST: { lead_ids: [LEAD_ID], list_ids: [LIST_ID], legal_basis: 'consent_form', basis_note: 'Nota inventada.' } },
    refuses: ['PUT', 'PATCH', 'DELETE'],
  },
];

async function call(route: RouteCase, method: string, body?: unknown) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method as any,
    url: `/api/admin/correos/${route.name}`,
    query: route.query ?? {},
    headers: { 'content-type': 'application/json' },
    body: body as any,
  });
  await route.handler(req, res);
  const raw = res._getData();
  return { status: res._getStatusCode(), raw: typeof raw === 'string' ? raw : JSON.stringify(raw) };
}

function expectUntouched(db: FakeDb) {
  expect(db.queries).toEqual([]);
  expect(db.rpcs).toEqual([]);
}

/** No contact data in a refusal: no address, no id of a person, no list. */
function expectNoContactData(raw: string) {
  expect(raw).not.toMatch(/@example\.test|@correos-prueba\.invalid|email|contact|lists|counts|items/i);
  expect(raw).not.toContain(CONTACT_ID);
  expect(raw).not.toContain(LIST_ID);
}

const PEOPLE = {
  visitor: { user: null, isAdmin: false, status: 401 },
  docente: { user: { id: 'docente-inventada-1', email: 'docente.inventada@example.test' }, isAdmin: false, status: 403 },
  consultor: { user: { id: 'consultor-inventado-1', email: 'consultor.inventado@example.test' }, isAdmin: false, status: 403 },
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.getForcedPasswordChangeVerdict.mockResolvedValue('allowed');
  auth.db = fakeDb(
    () => {
      throw new Error('the database must not be read');
    },
    () => {
      throw new Error('no database function may be called');
    }
  );
});

describe('A4: every route checks "is admin" first, for every method it accepts', () => {
  for (const route of ROUTES) {
    for (const [method, body] of Object.entries(route.accepts)) {
      for (const [who, person] of Object.entries(PEOPLE)) {
        it(`${route.name} ${method}: a ${who} gets ${person.status}, nothing done, no contact data`, async () => {
          auth.checkIsAdmin.mockResolvedValue({ user: person.user, isAdmin: person.isAdmin, error: null });
          const result = await call(route, method, body);
          expect(result.status).toBe(person.status);
          expectUntouched(auth.db);
          expectNoContactData(result.raw);
        });
      }

      it(`${route.name} ${method}: an admin who must change their password first gets 403`, async () => {
        auth.checkIsAdmin.mockResolvedValue({ user: { id: 'admin-inventado-1', email: 'admin.inventado@example.test' }, isAdmin: true, error: null });
        auth.getForcedPasswordChangeVerdict.mockResolvedValue('must_change');
        const result = await call(route, method, body);
        expect(result.status).toBe(403);
        expectUntouched(auth.db);
        expectNoContactData(result.raw);
      });

      it(`${route.name} ${method}: an admin check that fails is a 403`, async () => {
        auth.checkIsAdmin.mockResolvedValue({ user: { id: 'admin-inventado-1' }, isAdmin: false, error: 'lookup failed' });
        const result = await call(route, method, body);
        expect(result.status).toBe(403);
        expectUntouched(auth.db);
      });
    }

    for (const method of route.refuses) {
      it(`${route.name} ${method}: 405, nothing done`, async () => {
        auth.checkIsAdmin.mockResolvedValue({ user: { id: 'admin-inventado-1' }, isAdmin: true, error: null });
        const result = await call(route, method, {});
        expect(result.status).toBe(405);
        expect(auth.checkIsAdmin).not.toHaveBeenCalled();
        expectUntouched(auth.db);
      });
    }
  }
});

describe('E3: a visitor or a non-admin erases nothing', () => {
  const route = ROUTES.find((r) => r.name === 'contactos/borrar') as RouteCase;
  for (const [who, person] of Object.entries(PEOPLE)) {
    it(`a ${who} who posts a contact id: refused, email_erase_contact not called`, async () => {
      auth.checkIsAdmin.mockResolvedValue({ user: person.user, isAdmin: person.isAdmin, error: null });
      const result = await call(route, 'POST', { contact_id: CONTACT_ID });
      expect(result.status).toBe(person.status);
      expect(auth.db.rpcs).toEqual([]);
      expect(auth.db.writes()).toEqual([]);
    });
  }
});
