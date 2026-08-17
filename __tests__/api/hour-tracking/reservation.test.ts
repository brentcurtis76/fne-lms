// @vitest-environment node
/**
 * Unit tests for hour tracking reservation logic.
 * Tests: createReservation, calculateHours, findMatchingAllocation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluateCancellationClause,
  calculateHours,
  calculateNoticeHours,
  createReservation,
  getAvailableHours,
} from '../../../lib/services/hour-tracking';

describe('calculateHours', () => {
  it('should convert minutes to hours rounded to 2 decimal places', () => {
    expect(calculateHours(60)).toBe(1);
    expect(calculateHours(90)).toBe(1.5);
    expect(calculateHours(45)).toBe(0.75);
    expect(calculateHours(120)).toBe(2);
  });

  it('should handle fractional minutes (ROUND_HALF_UP)', () => {
    // 70 min = 1.1666... -> 1.17
    expect(calculateHours(70)).toBe(1.17);
    // 50 min = 0.8333... -> 0.83
    expect(calculateHours(50)).toBe(0.83);
  });

  it('should return 0 for 0 minutes', () => {
    expect(calculateHours(0)).toBe(0);
  });
});

describe('calculateNoticeHours', () => {
  it('should return positive notice hours when session is in the future', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const dateStr = futureDate.toISOString().split('T')[0];
    const hours = calculateNoticeHours(dateStr, '10:00:00', new Date());
    expect(hours).toBeGreaterThan(0);
    // Roughly 72 hours from now
    expect(hours).toBeGreaterThan(60);
  });

  it('should return 0 when session is in the past', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const dateStr = pastDate.toISOString().split('T')[0];
    const hours = calculateNoticeHours(dateStr, '10:00:00', new Date());
    expect(hours).toBe(0);
  });
});

describe('createReservation — backward compatibility', () => {
  it('should skip if hour_type_key is null', async () => {
    const mockClient = {} as any;
    const session = {
      id: 'session-1',
      hour_type_key: null,
      contrato_id: null,
      session_date: '2026-03-01',
      start_time: '09:00:00',
      end_time: '10:00:00',
      scheduled_duration_minutes: 60,
      modality: 'presencial',
    } as any;

    const result = await createReservation(mockClient, session, 'user-1');
    expect(result.skipped).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects an XOR tracking pair instead of silently treating it as legacy', async () => {
    const mockClient = {} as any;
    const session = {
      id: 'session-2',
      hour_type_key: 'asesoria_tecnica_presencial',
      contrato_id: null,
      session_date: '2026-03-01',
      start_time: '09:00:00',
      end_time: '10:00:00',
      scheduled_duration_minutes: 60,
      modality: 'presencial',
    } as any;

    const result = await createReservation(mockClient, session, 'user-1');
    expect(result).toMatchObject({ skipped: false, error_kind: 'validation' });
  });
});

describe('createReservation — with hour tracking', () => {
  const makeSelectChain = (result: unknown) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockReturnThis(),
    rpc: vi.fn(),
  });

  it('should return error when no matching allocation found', async () => {
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'ht-1' }, error: null }),
          };
        }
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
          };
        }
        return makeSelectChain({ data: null, error: null });
      }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as any;

    const session = {
      id: 'session-3',
      hour_type_key: 'asesoria_tecnica_presencial',
      contrato_id: '550e8400-e29b-41d4-a716-446655440000',
      session_date: '2026-03-01',
      start_time: '09:00:00',
      end_time: '10:00:00',
      scheduled_duration_minutes: 60,
      modality: 'presencial',
    } as any;

    const result = await createReservation(mockClient, session, 'user-1');
    expect(result.skipped).toBe(false);
    expect(result.error).toContain('no tiene horas asignadas');
  });

  it('should create ledger entry with is_over_budget=false when hours available', async () => {
    const mockLedgerEntry = { id: 'ledger-1' };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'ht-1' }, error: null }),
          };
        }
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'alloc-1', contrato_id: '550e8400-e29b-41d4-a716-446655440000', hour_type_id: 'ht-1', allocated_hours: 100 },
              error: null,
            }),
          };
        }
        if (table === 'contract_hours_ledger') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockLedgerEntry, error: null }),
          };
        }
        return makeSelectChain({ data: null, error: null });
      }),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            hour_type_key: 'asesoria_tecnica_presencial',
            available_hours: 50,
            allocated_hours: 100,
            reserved_hours: 50,
            consumed_hours: 0,
          },
        ],
        error: null,
      }),
    } as any;

    const session = {
      id: 'session-4',
      hour_type_key: 'asesoria_tecnica_presencial',
      contrato_id: '550e8400-e29b-41d4-a716-446655440000',
      session_date: '2026-03-01',
      start_time: '09:00:00',
      end_time: '10:00:00',
      scheduled_duration_minutes: 60,
      modality: 'presencial',
    } as any;

    const result = await createReservation(mockClient, session, 'user-1');
    expect(result.skipped).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.ledger_entry_id).toBe('ledger-1');
    expect(result.hours).toBe(1);
    expect(result.is_over_budget).toBe(false);
  });

  it('should set is_over_budget=true when available hours < required hours', async () => {
    const mockLedgerEntry = { id: 'ledger-2' };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'ht-1' }, error: null }),
          };
        }
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'alloc-1', contrato_id: '550e8400-e29b-41d4-a716-446655440000', hour_type_id: 'ht-1', allocated_hours: 100 },
              error: null,
            }),
          };
        }
        if (table === 'contract_hours_ledger') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockLedgerEntry, error: null }),
          };
        }
        return makeSelectChain({ data: null, error: null });
      }),
      // Only 0.5 hours available, but session is 2 hours
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            hour_type_key: 'asesoria_tecnica_presencial',
            available_hours: 0.5,
            allocated_hours: 100,
            reserved_hours: 99.5,
            consumed_hours: 0,
          },
        ],
        error: null,
      }),
    } as any;

    const session = {
      id: 'session-5',
      hour_type_key: 'asesoria_tecnica_presencial',
      contrato_id: '550e8400-e29b-41d4-a716-446655440000',
      session_date: '2026-03-01',
      start_time: '09:00:00',
      end_time: '11:00:00',
      scheduled_duration_minutes: 120,
      modality: 'presencial',
    } as any;

    const result = await createReservation(mockClient, session, 'user-1');
    expect(result.is_over_budget).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('[Z7-R5.1] returns a typed successful-missing result for a genuinely absent bucket', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as any;

    await expect(getAvailableHours(client, 'contract-1', 'missing-type')).resolves.toEqual({
      kind: 'missing',
    });
  });

  it.each([
    ['contradictory arithmetic', [{ hour_type_key: 'target', allocated_hours: 10, reserved_hours: 1, consumed_hours: 1, available_hours: 9 }]],
    ['duplicate keys', [
      { hour_type_key: 'target', allocated_hours: 1, reserved_hours: 0, consumed_hours: 0, available_hours: 1 },
      { hour_type_key: 'target', allocated_hours: 1, reserved_hours: 0, consumed_hours: 0, available_hours: 1 },
    ]],
    ['null row', [null]],
    ['fractional hundredths', [{ hour_type_key: 'target', allocated_hours: 1, reserved_hours: 0.999, consumed_hours: 0, available_hours: 0.001 }]],
  ])('rejects %s summary metadata', async (_label, data) => {
    const client = { rpc: vi.fn().mockResolvedValue({ data, error: null }) } as any;
    await expect(getAvailableHours(client, 'contract-1', 'target')).rejects.toThrow(/^hour_availability_/);
  });

  it('accepts a coherent negative bucket as valid availability', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({
      data: [{ hour_type_key: 'target', allocated_hours: 1, reserved_hours: 1.2, consumed_hours: 0, available_hours: -0.2 }],
      error: null,
    }) } as any;
    await expect(getAvailableHours(client, 'contract-1', 'target')).resolves.toMatchObject({
      kind: 'available', available_hours: -0.2, available_hundredths: -20,
    });
  });

  it('[Z7-R5.1] an availability RPC error writes no ledger row', async () => {
    const ledgerInsert = vi.fn();
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'ht-1' }, error: null }),
          };
        }
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'alloc-1', contrato_id: 'contract-1', hour_type_id: 'ht-1', allocated_hours: 5 },
              error: null,
            }),
          };
        }
        if (table === 'contract_hours_ledger') return { insert: ledgerInsert };
        throw new Error(`unexpected table ${table}`);
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection lost' } }),
    } as any;
    const session = {
      id: 'session-fail-closed',
      hour_type_key: 'asesoria_tecnica_presencial',
      contrato_id: 'contract-1',
      session_date: '2026-03-01',
      start_time: '09:00:00',
      end_time: '10:00:00',
      scheduled_duration_minutes: 60,
    } as any;

    const result = await createReservation(mockClient, session, 'user-1');

    expect(result).toMatchObject({
      skipped: false,
      error: 'No se pudo verificar la disponibilidad de horas.',
      error_kind: 'dependency',
    });
    expect(ledgerInsert).not.toHaveBeenCalled();
  });

  it('[Z7-R5.1] an allocated bucket omitted by a successful summary is inconsistent', async () => {
    const ledgerInsert = vi.fn();
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'ht-1' }, error: null }),
          };
        }
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'alloc-1', contrato_id: 'contract-1', hour_type_id: 'ht-1', allocated_hours: 5 },
              error: null,
            }),
          };
        }
        if (table === 'contract_hours_ledger') return { insert: ledgerInsert };
        throw new Error(`unexpected table ${table}`);
      }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as any;
    const session = {
      id: 'session-missing-bucket',
      hour_type_key: 'asesoria_tecnica_presencial',
      contrato_id: 'contract-1',
      session_date: '2026-03-01',
      start_time: '09:00:00',
      end_time: '10:00:00',
      scheduled_duration_minutes: 60,
    } as any;

    const result = await createReservation(mockClient, session, 'user-1');

    expect(result.error_kind).toBe('dependency');
    expect(ledgerInsert).not.toHaveBeenCalled();
  });
});
