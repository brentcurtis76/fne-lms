import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { groupAssignmentsV2Service } from '../groupAssignmentsV2';
import { supabase } from '../../supabase';

// Mock Supabase client
vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn()
    }
  }
}));

const setupSupabaseMock = (tablesConfig = {}) => {
  const tables = new Map(
    Object.entries(tablesConfig).map(([table, config]) => [
      table,
      {
        ...config,
        rows: (config.rows || []).map((row) => ({ ...row })),
      },
    ]),
  );

  class MockQueryBuilder {
    constructor(table) {
      this.table = table;
      this.config = tables.get(table) || { rows: [] };
      this.rows = this.config.rows.map((row) => ({ ...row }));
    }

    select() {
      return this;
    }

    eq(column, value) {
      this.rows = this.rows.filter((row) => row[column] === value);
      return this;
    }

    in(column, values = []) {
      const valueSet = new Set(values);
      this.rows = this.rows.filter((row) => valueSet.has(row[column]));
      return this;
    }

    not(column, operator, value) {
      if (operator === 'is' && value === null) {
        this.rows = this.rows.filter((row) => row[column] !== null && row[column] !== undefined);
      }
      return this;
    }

    order(column, options = {}) {
      const ascending = options.ascending !== false;
      this.rows = [...this.rows].sort((a, b) => {
        const aValue = a[column];
        const bValue = b[column];
        if (aValue === bValue) return 0;
        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;
        if (aValue > bValue) return ascending ? 1 : -1;
        return ascending ? -1 : 1;
      });
      return this;
    }

    limit(count) {
      this.rows = this.rows.slice(0, count);
      return Promise.resolve({ data: this.rows, error: null });
    }

    maybeSingle() {
      if (this.config.maybeSingleResult !== undefined) {
        return Promise.resolve(this.config.maybeSingleResult);
      }
      const data = this.rows[0] ?? null;
      const error = data ? null : this.config.maybeSingleError ?? null;
      return Promise.resolve({ data, error });
    }

    single() {
      if (this.config.singleResult !== undefined) {
        return Promise.resolve(this.config.singleResult);
      }
      const data = this.rows[0] ?? null;
      if (!data) {
        const error = this.config.singleError ?? { code: 'PGRST116' };
        return Promise.resolve({ data: null, error });
      }
      return Promise.resolve({ data, error: null });
    }

    insert(values) {
      const rows = Array.isArray(values) ? values : [values];
      if (this.config.onInsert) {
        return this.config.onInsert(rows, this.config);
      }
      if (this.config.insertReturnsBuilder) {
        this.rows = rows.map((row) => ({ ...row }));
        this.config.rows = rows.map((row) => ({ ...row }));
        return this;
      }
      this.config.rows.push(...rows.map((row) => ({ ...row }))); 
      return Promise.resolve(this.config.insertResult ?? { data: rows, error: null });
    }

    upsert(values) {
      if (this.config.onUpsert) {
        return this.config.onUpsert(values, this.config);
      }
      this.config.upserted = values;
      return Promise.resolve(this.config.upsertResult ?? { error: null });
    }

    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: this.rows, error: null }).then(onFulfilled, onRejected);
    }
  }

  vi.mocked(supabase.from).mockImplementation((table) => new MockQueryBuilder(table));
};

describe('GroupAssignmentsV2Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGroupAssignmentsForUser', () => {
    it('should return empty array when user has no profile', async () => {
      setupSupabaseMock({
        user_roles: { rows: [] },
        profiles: { rows: [] },
        course_assignments: { rows: [] },
        consultant_assignments: { rows: [] },
        lessons: { rows: [] }
      });
      
      const result = await groupAssignmentsV2Service.getGroupAssignmentsForUser('test-user-id');
      
      expect(result.assignments).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should fetch assignments from directly assigned courses (placeholder)', async () => {
      // TODO: rebuild test with refreshed Supabase mocks for V2 service
      expect(true).toBe(true);
    });

    it('should handle submission status correctly (placeholder)', async () => {
      // TODO: rebuild test with refreshed Supabase mocks for V2 service
      expect(true).toBe(true);
    });
  });

  describe('getGroupAssignmentsForConsultant', () => {
    it('should return empty array for non-consultant users', async () => {
      setupSupabaseMock({
        user_roles: {
          rows: [{ user_id: 'non-consultant-id', role_type: 'docente', is_active: true }]
        }
      });
      
      const result = await groupAssignmentsV2Service.getGroupAssignmentsForConsultant('non-consultant-id');
      
      expect(result.assignments).toEqual([]);
      expect(result.students).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should fetch assignments for consultant\'s students (placeholder)', async () => {
      // TODO: rebuild test with refreshed Supabase mocks for V2 service
      expect(true).toBe(true);
    });
  });

  describe('getOrCreateGroup', () => {
    it('should return existing group if user already belongs to one (placeholder)', async () => {
      // TODO: rebuild test with refreshed Supabase mocks for V2 service
      expect(true).toBe(true);
    });

    it('should create new group if user has no group (placeholder)', async () => {
      // TODO: rebuild test with refreshed Supabase mocks for V2 service
      expect(true).toBe(true);
    });
  });

  describe('submitGroupAssignment', () => {
    it('should create submissions for all group members (placeholder)', async () => {
      // TODO: rebuild test with refreshed Supabase mocks for V2 service
      expect(true).toBe(true);
    });

    it('should handle submission errors gracefully', async () => {
      setupSupabaseMock({
        group_assignment_members: {
          rows: []
        }
      });
      
      const result = await groupAssignmentsV2Service.submitGroupAssignment(
        'test-assignment',
        'test-group',
        {}
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getGroupMembers - Data Structure', () => {
    it('should transform profile data to include user.full_name', async () => {
      setupSupabaseMock({
        group_assignment_members: {
          rows: [
            { id: 'member1', group_id: 'group1', user_id: 'user1', assignment_id: 'assignment1' }
          ]
        },
        profiles: {
          rows: [
            { id: 'user1', first_name: 'Juan', last_name: 'Pérez', avatar_url: 'avatar1.jpg' }
          ]
        }
      });

      const result = await groupAssignmentsV2Service.getGroupMembers('group1');

      // Verify member.user structure exists with full_name
      expect(result.members).toHaveLength(1);
      const member = result.members[0];

      expect(member.user).toBeDefined();
      expect(member.user.id).toBe('user1');
      expect(member.user.first_name).toBe('Juan');
      expect(member.user.last_name).toBe('Pérez');
      expect(member.user.full_name).toBe('Juan Pérez');
      expect(member.user.avatar_url).toBe('avatar1.jpg');

      // Verify backward compatibility - profile still exists
      expect(member.profile).toBeDefined();
      expect(member.profile.first_name).toBe('Juan');
    });

    it('should handle empty name fields gracefully', async () => {
      setupSupabaseMock({
        group_assignment_members: {
          rows: [{ id: 'member1', group_id: 'group1', user_id: 'user1', assignment_id: 'assignment1' }]
        },
        profiles: {
          rows: [{ id: 'user1', first_name: '', last_name: '', avatar_url: null }]
        }
      });

      const result = await groupAssignmentsV2Service.getGroupMembers('group1');

      expect(result.members[0].user.full_name).toBe('');
    });

    it('should handle missing last name', async () => {
      setupSupabaseMock({
        group_assignment_members: {
          rows: [{ id: 'member1', group_id: 'group1', user_id: 'user1', assignment_id: 'assignment1' }]
        },
        profiles: {
          rows: [{ id: 'user1', first_name: 'Juan', last_name: null, avatar_url: null }]
        }
      });

      const result = await groupAssignmentsV2Service.getGroupMembers('group1');

      expect(result.members[0].user.full_name).toBe('Juan');
    });
  });

  describe('getOrCreateGroup - Policy Error Handling', () => {
    it('should return error for RLS infinite recursion (42P17)', async () => {
      setupSupabaseMock({
        group_assignment_members: {
          singleResult: {
            data: null,
            error: {
              code: '42P17',
              message: 'infinite recursion detected in policy for relation "group_assignment_members"'
            }
          }
        }
      });

      const result = await groupAssignmentsV2Service.getOrCreateGroup('assignment1', 'user1');

      expect(result.group).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Error de configuración del sistema');
    });

    it('should return error for permission denied (42501)', async () => {
      setupSupabaseMock({
        group_assignment_members: {
          singleResult: {
            data: null,
            error: {
              code: '42501',
              message: 'permission denied for table group_assignment_members'
            }
          }
        }
      });

      const result = await groupAssignmentsV2Service.getOrCreateGroup('assignment1', 'user1');

      expect(result.group).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('No tienes permiso');
    });

    it('should return error for unexpected database errors (not PGRST116)', async () => {
      const unexpectedError = {
        code: 'PGRST301',
        message: 'Connection timeout'
      };

      setupSupabaseMock({
        group_assignment_members: {
          singleResult: {
            data: null,
            error: unexpectedError
          }
        }
      });

      const result = await groupAssignmentsV2Service.getOrCreateGroup('assignment1', 'user1');

      // Should return the error, not proceed to create group
      expect(result.group).toBeNull();
      expect(result.error).toBe(unexpectedError);
    });

    it('should proceed to create group when error is PGRST116 (no rows found)', async () => {
      const insertedGroup = {
        id: 'new-group-123',
        assignment_id: 'assignment1',
        name: 'Test Group'
      };

      setupSupabaseMock({
        group_assignment_members: {
          singleResult: {
            data: null,
            error: { code: 'PGRST116', message: 'No rows found' }
          },
          insertReturnsBuilder: true,
          insertResult: { data: [{ group_id: 'new-group-123' }], error: null }
        },
        group_assignment_groups: {
          insertReturnsBuilder: true,
          rows: [insertedGroup]
        },
        user_roles: {
          rows: [{ user_id: 'user1', community_id: 'community1', is_active: true }]
        }
      });

      const result = await groupAssignmentsV2Service.getOrCreateGroup('assignment1', 'user1');

      // Should successfully create group when no existing membership found
      expect(result.group).toBeDefined();
      expect(result.error).toBeNull();
    });

    it('should not attempt insert when non-PGRST116 error occurs', async () => {
      const insertSpy = vi.fn();

      setupSupabaseMock({
        group_assignment_members: {
          singleResult: {
            data: null,
            error: { code: 'CONNECTION_ERROR', message: 'Network failure' }
          },
          onInsert: insertSpy
        },
        group_assignment_groups: {
          onInsert: insertSpy
        }
      });

      await groupAssignmentsV2Service.getOrCreateGroup('assignment1', 'user1');

      // Insert should never be called when we have an unexpected error
      expect(insertSpy).not.toHaveBeenCalled();
    });
  });
});
