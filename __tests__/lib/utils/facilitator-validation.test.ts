import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateFacilitatorIntegrity } from '../../../lib/utils/facilitator-validation';
import { SupabaseClient } from '@supabase/supabase-js';

const CONSULTANT_ID_1 = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_ID_2 = '22222222-2222-4222-8222-222222222222';
const CONSULTANT_ID_3 = '33333333-3333-4333-8333-333333333333';
const SCHOOL_ID = 1;

/**
 * Build a mock Supabase client that returns user_roles data for testing
 */
function buildMockSupabaseClient(userRolesData: any[] | null = [], error: any = null) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  or: vi.fn(async () => ({
                    data: userRolesData,
                    error,
                  })),
                })),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  } as unknown as SupabaseClient;
}

describe('validateFacilitatorIntegrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('BR-1: Non-empty facilitators', () => {
    it('should fail when facilitators array is undefined', async () => {
      const mockClient = buildMockSupabaseClient();
      const result = await validateFacilitatorIntegrity(mockClient, undefined, SCHOOL_ID);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Debe asignar al menos un facilitador a la sesión');
    });

    it('should fail when facilitators array is empty', async () => {
      const mockClient = buildMockSupabaseClient();
      const result = await validateFacilitatorIntegrity(mockClient, [], SCHOOL_ID);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Debe asignar al menos un facilitador a la sesión');
    });

    it('should fail when facilitators is not an array', async () => {
      const mockClient = buildMockSupabaseClient();
      const result = await validateFacilitatorIntegrity(
        mockClient,
        null as any,
        SCHOOL_ID
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Debe asignar al menos un facilitador a la sesión');
    });
  });

  describe('BR-2: Exactly one lead facilitator', () => {
    it('should fail when no facilitator has is_lead = true', async () => {
      const mockClient = buildMockSupabaseClient([
        { user_id: CONSULTANT_ID_1 },
        { user_id: CONSULTANT_ID_2 },
      ]);

      const result = await validateFacilitatorIntegrity(
        mockClient,
        [
          { user_id: CONSULTANT_ID_1, is_lead: false },
          { user_id: CONSULTANT_ID_2, is_lead: false },
        ],
        SCHOOL_ID
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Debe haber exactamente un facilitador principal (is_lead: true)');
    });

    it('should fail when multiple facilitators have is_lead = true', async () => {
      const mockClient = buildMockSupabaseClient([
        { user_id: CONSULTANT_ID_1 },
        { user_id: CONSULTANT_ID_2 },
      ]);

      const result = await validateFacilitatorIntegrity(
        mockClient,
        [
          { user_id: CONSULTANT_ID_1, is_lead: true },
          { user_id: CONSULTANT_ID_2, is_lead: true },
        ],
        SCHOOL_ID
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Debe haber exactamente un facilitador principal (is_lead: true)');
    });

    it('should pass when exactly one facilitator has is_lead = true', async () => {
      const mockClient = buildMockSupabaseClient([
        { user_id: CONSULTANT_ID_1 },
        { user_id: CONSULTANT_ID_2 },
      ]);

      const result = await validateFacilitatorIntegrity(
        mockClient,
        [
          { user_id: CONSULTANT_ID_1, is_lead: true },
          { user_id: CONSULTANT_ID_2, is_lead: false },
        ],
        SCHOOL_ID
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('BR-3 & BR-4: Consultor role validation', () => {
    it('should fail when facilitator user has no consultor role', async () => {
      const mockClient = buildMockSupabaseClient([
        // Only CONSULTANT_ID_1 has a valid consultor role
        { user_id: CONSULTANT_ID_1 },
      ]);

      const result = await validateFacilitatorIntegrity(
        mockClient,
        [
          { user_id: CONSULTANT_ID_1, is_lead: true },
          { user_id: CONSULTANT_ID_2, is_lead: false }, // This user lacks consultor role
        ],
        SCHOOL_ID
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes(CONSULTANT_ID_2))).toBe(true);
    });

    it('should accept globally-scoped consultors (school_id = null)', async () => {
      const mockClient = buildMockSupabaseClient([
        { user_id: CONSULTANT_ID_1 }, // Globally scoped
        { user_id: CONSULTANT_ID_2 }, // Globally scoped
      ]);

      const result = await validateFacilitatorIntegrity(
        mockClient,
        [
          { user_id: CONSULTANT_ID_1, is_lead: true },
          { user_id: CONSULTANT_ID_2, is_lead: false },
        ],
        SCHOOL_ID
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Database connection failed');
      const mockClient = buildMockSupabaseClient(null, mockError);

      const result = await validateFacilitatorIntegrity(
        mockClient,
        [
          { user_id: CONSULTANT_ID_1, is_lead: true },
        ],
        SCHOOL_ID
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Error'))).toBe(true);
    });

    it('should pass when all facilitators have active consultor roles for school', async () => {
      const mockClient = buildMockSupabaseClient([
        { user_id: CONSULTANT_ID_1 },
        { user_id: CONSULTANT_ID_2 },
      ]);

      const result = await validateFacilitatorIntegrity(
        mockClient,
        [
          { user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
          { user_id: CONSULTANT_ID_2, is_lead: false, facilitator_role: 'equipo_interno' },
        ],
        SCHOOL_ID
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Happy path scenarios', () => {
    it('should validate single facilitator (lead)', async () => {
      const mockClient = buildMockSupabaseClient([
        { user_id: CONSULTANT_ID_1 },
      ]);

      const result = await validateFacilitatorIntegrity(
        mockClient,
        [
          { user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
        ],
        SCHOOL_ID
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate multiple facilitators with one lead', async () => {
      const mockClient = buildMockSupabaseClient([
        { user_id: CONSULTANT_ID_1 },
        { user_id: CONSULTANT_ID_2 },
        { user_id: CONSULTANT_ID_3 },
      ]);

      const result = await validateFacilitatorIntegrity(
        mockClient,
        [
          { user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
          { user_id: CONSULTANT_ID_2, is_lead: false, facilitator_role: 'equipo_interno' },
          { user_id: CONSULTANT_ID_3, is_lead: false, facilitator_role: 'consultor_externo' },
        ],
        SCHOOL_ID
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
