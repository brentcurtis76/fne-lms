// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockClaimUpdate, mockMarkCompleted, mockHandleInbound, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockClaimUpdate: vi.fn(),
  mockMarkCompleted: vi.fn(),
  mockHandleInbound: vi.fn(),
  mockCreateServiceRoleClient: vi.fn()
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createServiceRoleClient: mockCreateServiceRoleClient };
});

vi.mock('../../../lib/bots/store', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    BotStore: vi.fn().mockImplementation(() => ({
      claimUpdate: mockClaimUpdate,
      markUpdateCompleted: mockMarkCompleted
    }))
  };
});

vi.mock('../../../lib/bots/engine', () => ({ handleInbound: mockHandleInbound }));

vi.mock('../../../lib/bots/expense-service', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, ExpenseService: vi.fn().mockImplementation(() => ({})) };
});

import handler from '../../../pages/api/bots/telegram';
import { makeTextUpdate } from '../../helpers/telegramFixtures';

const SECRET = 'test-webhook-secret';
const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  mockClaimUpdate.mockResolvedValue(true);
  mockMarkCompleted.mockResolvedValue(undefined);
  mockHandleInbound.mockResolvedValue(undefined);
  mockCreateServiceRoleClient.mockReturnValue({});
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  } else {
    process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
  }
});

function post(body: unknown, secret?: string) {
  return createMocks({
    method: 'POST',
    headers: secret === undefined ? {} : { 'x-telegram-bot-api-secret-token': secret },
    body
  });
}

describe('POST /api/bots/telegram', () => {
  it('rejects non-POST methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });

  it('rejects a missing or wrong secret header', async () => {
    const update = makeTextUpdate('hola');

    const missing = post(update);
    await handler(missing.req as never, missing.res as never);
    expect(missing.res._getStatusCode()).toBe(401);

    const wrong = post(update, 'not-the-secret');
    await handler(wrong.req as never, wrong.res as never);
    expect(wrong.res._getStatusCode()).toBe(401);

    expect(mockHandleInbound).not.toHaveBeenCalled();
  });

  it('returns 200 and skips processing for unparseable updates', async () => {
    const { req, res } = post({ update_id: 1, channel_post: {} }, SECRET);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(mockClaimUpdate).not.toHaveBeenCalled();
    expect(mockHandleInbound).not.toHaveBeenCalled();
  });

  it('claims the update before processing and dispatches to the engine', async () => {
    const update = makeTextUpdate('hola', { updateId: 4242 });
    const { req, res } = post(update, SECRET);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(mockClaimUpdate).toHaveBeenCalledWith('telegram', 4242);
    expect(mockHandleInbound).toHaveBeenCalledTimes(1);
    expect(mockClaimUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockHandleInbound.mock.invocationCallOrder[0]
    );
    expect(mockMarkCompleted).toHaveBeenCalledWith('telegram', 4242);
  });

  it('short-circuits duplicate update_ids before any side effect', async () => {
    mockClaimUpdate.mockResolvedValue(false);
    const { req, res } = post(makeTextUpdate('hola', { updateId: 4242 }), SECRET);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ duplicate: true });
    expect(mockHandleInbound).not.toHaveBeenCalled();
  });

  it('returns 200 even when the engine throws, without marking completed', async () => {
    mockHandleInbound.mockRejectedValue(new Error('engine exploded'));
    const { req, res } = post(makeTextUpdate('hola'), SECRET);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(mockMarkCompleted).not.toHaveBeenCalled();
  });
});
