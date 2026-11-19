// @vitest-environment node
/**
 * Release SX: POST /api/sessions checks a series' custom dates against today's date in Chile
 * (America/Santiago), the same first day the create form offers, not against the UTC date.
 * Fakes in the manner of `session-create-facilitators.test.ts`. Invented ids and data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_ID = '22222222-2222-4222-8222-222222222222';
const GROWTH_COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';
const SCHOOL_ID = 1;

const { mockCheckIsAdmin, mockCreateServiceRoleClient, mockValidateFacilitatorIntegrity } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockValidateFacilitatorIntegrity: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../lib/utils/facilitator-validation', () => ({
  validateFacilitatorIntegrity: mockValidateFacilitatorIntegrity,
}));

import handler from '../../../pages/api/sessions/index';

function buildChainableQuery(data: unknown = [], error: unknown = null) {
  const proxy: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve({ data, error });
      }
      return vi.fn(() => new Proxy({}, proxy));
    },
  };
  return new Proxy({}, proxy);
}

function buildMockServiceClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'schools') {
        return buildChainableQuery(
          { id: SCHOOL_ID, tenant_kind: 'client', internal_zoom_testing_enabled: false },
          null
        );
      }
      if (table === 'growth_communities') return buildChainableQuery([{ id: GROWTH_COMMUNITY_ID }], null);
      if (table === 'consultor_sessions') {
        return buildChainableQuery(
          [
            { id: 'session-1', school_id: SCHOOL_ID },
            { id: 'session-2', school_id: SCHOOL_ID },
          ],
          null
        );
      }
      return buildChainableQuery([], null);
    }),
  };
}

async function postCustomDates(dates: string[]) {
  mockCheckIsAdmin.mockResolvedValueOnce({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockValidateFacilitatorIntegrity.mockResolvedValueOnce({ valid: true, errors: [] });
  mockCreateServiceRoleClient.mockReturnValueOnce(buildMockServiceClient());
  const { req, res } = createMocks({
    method: 'POST',
    body: {
      school_id: SCHOOL_ID,
      growth_community_id: GROWTH_COMMUNITY_ID,
      title: 'Taller Inventado',
      session_date: dates[0],
      start_time: '09:00:00',
      end_time: '10:00:00',
      modality: 'presencial',
      location: 'Sala Inventada 1',
      facilitators: [{ user_id: CONSULTANT_ID, is_lead: true, facilitator_role: 'consultor_externo' }],
      recurrence: { frequency: 'custom', dates },
    },
  });
  await handler(req, res);
  const body = res._getData() ? JSON.parse(res._getData()) : {};
  return { status: res._getStatusCode(), error: body.error as string | undefined };
}

describe('POST /api/sessions: custom dates are checked against today in Chile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe.each([
    ['22:30 in Chile, already the 20th in UTC', '2026-11-20T01:30:00Z'],
    ['12:00 in Chile', '2026-11-19T15:00:00Z'],
  ])('at %s', (_label, instant) => {
    beforeEach(() => {
      vi.setSystemTime(new Date(instant));
    });

    it("accepts today's date in Chile (2026-11-19)", async () => {
      const result = await postCustomDates(['2026-11-19', '2026-11-26']);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(201);
    });

    it('refuses the day before (2026-11-18) with «Todas las fechas deben ser futuras»', async () => {
      const result = await postCustomDates(['2026-11-18', '2026-11-26']);
      expect(result.status).toBe(400);
      expect(result.error).toBe('Todas las fechas deben ser futuras');
    });
  });
});
