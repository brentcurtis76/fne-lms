// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { buildFailureLog, logStageFailure } from '../../../lib/bots/bot-logging';

describe('buildFailureLog', () => {
  it('extracts code/message/details/hint from a Supabase/PostgREST error', () => {
    const record = buildFailureLog(
      'rpc',
      {
        code: '23514',
        message: 'new row for relation "expense_items" violates check constraint "expense_items_currency_check"',
        details: 'Failing row contains (...)',
        hint: null
      },
      { currency: 'GBP', itemId: 'item-1' }
    );
    expect(record).toEqual({
      event: 'bot_save_failure',
      stage: 'rpc',
      code: '23514',
      message: 'new row for relation "expense_items" violates check constraint "expense_items_currency_check"',
      details: 'Failing row contains (...)',
      hint: null,
      currency: 'GBP',
      itemId: 'item-1'
    });
  });

  it('falls back to an Error message and nulls absent fields', () => {
    const record = buildFailureLog('download', new Error('Telegram timeout'), { itemId: 'item-2' });
    expect(record.message).toBe('Telegram timeout');
    expect(record.code).toBeNull();
    expect(record.details).toBeNull();
    expect(record.hint).toBeNull();
    expect(record.currency).toBeNull();
    expect(record.itemId).toBe('item-2');
  });

  it('stringifies a numeric error code', () => {
    expect(buildFailureLog('upload', { code: 400 }, {}).code).toBe('400');
  });

  it('only emits whitelisted keys — never spreads arbitrary (potentially PII) error fields', () => {
    const record = buildFailureLog(
      'rpc',
      { code: '23514', message: 'boom', studentName: 'Juanita Pérez', token: 'secret' } as any,
      { currency: 'GBP', itemId: 'item-3' }
    );
    expect(Object.keys(record).sort()).toEqual(
      ['code', 'currency', 'details', 'event', 'hint', 'itemId', 'message', 'stage'].sort()
    );
    expect(JSON.stringify(record)).not.toContain('Juanita');
    expect(JSON.stringify(record)).not.toContain('secret');
  });

  it('never throws on a null/undefined/string error', () => {
    expect(() => buildFailureLog('report_read', null, {})).not.toThrow();
    expect(buildFailureLog('report_read', 'plain string', {}).message).toBe('plain string');
  });
});

describe('logStageFailure', () => {
  it('emits a single structured console.error line under the [Bot] save failure tag', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      logStageFailure('rpc', { code: '23514', message: 'boom' }, { currency: 'GBP', itemId: 'item-9' });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe('[Bot] save failure');
      expect(JSON.parse(spy.mock.calls[0][1] as string)).toMatchObject({
        stage: 'rpc',
        code: '23514',
        currency: 'GBP',
        itemId: 'item-9'
      });
    } finally {
      spy.mockRestore();
    }
  });
});
