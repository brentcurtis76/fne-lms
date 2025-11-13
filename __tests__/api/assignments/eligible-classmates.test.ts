/**
 * Unit tests for /api/assignments/eligible-classmates endpoint
 *
 * Tests multi-role user support and school-based + course enrollment filtering
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../../pages/api/assignments/eligible-classmates';

// Mock @supabase/auth-helpers-nextjs
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: vi.fn()
}));

import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

describe('/api/assignments/eligible-classmates', () => {
  let req: Partial<NextApiRequest>;
  let res: Partial<NextApiResponse>;
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      method: 'GET',
      query: {},
      headers: {}
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    // Mock Supabase client
    mockSupabase = {
      auth: {
        getSession: vi.fn()
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis()
    };

    vi.mocked(createPagesServerClient).mockReturnValue(mockSupabase);
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null }
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'No autorizado' });
    });
  });

  describe('Input Validation', () => {
    it('should require assignmentId parameter', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } }
      });

      req.query = { groupId: 'group-123' };

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'assignmentId y groupId son requeridos'
      });
    });

    it('should require groupId parameter', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } }
      });

      req.query = { assignmentId: 'assignment-123' };

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'assignmentId y groupId son requeridos'
      });
    });
  });

  describe('Multi-Role User Support', () => {
    it('should handle users with multiple roles (docente + lider_generacion)', async () => {
      const userId = 'user-karla';
      const assignmentId = 'assignment-123';
      const groupId = 'group-456';
      const schoolId = 'school-789';
      const courseId = 'course-101';

      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: userId }
          }
        }
      });

      req.query = { assignmentId, groupId };

      // Track which query we're on for user_roles
      let userRolesCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        // Group membership validation
        if (table === 'group_assignment_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { group_id: groupId, assignment_id: assignmentId },
                      error: null
                    })
                  })
                })
              })
            })
          };
        }

        // Group details
        if (table === 'group_assignment_groups') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { is_consultant_managed: false, max_members: 8 },
                  error: null
                })
              })
            })
          };
        }

        // Multi-role user_roles response (THIS IS THE KEY TEST)
        if (table === 'user_roles') {
          userRolesCallCount++;

          // First call: requester roles (multi-role)
          if (userRolesCallCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      { user_id: userId, school_id: schoolId, role_type: 'docente' },
                      { user_id: userId, school_id: schoolId, role_type: 'lider_generacion' }
                    ],
                    error: null
                  })
                })
              })
            };
          }

          // Second call: classmate roles (same school filter)
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      { user_id: 'classmate-1', school_id: schoolId },
                      { user_id: 'classmate-2', school_id: schoolId }
                    ],
                    error: null
                  })
                })
              })
            })
          };
        }

        // Assignment block
        if (table === 'blocks') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { lesson_id: 'lesson-111' },
                  error: null
                })
              })
            })
          };
        }

        // Lesson
        if (table === 'lessons') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { course_id: courseId },
                  error: null
                })
              })
            })
          };
        }

        // Course enrollments
        if (table === 'course_enrollments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({
                    data: [
                      {
                        user_id: 'classmate-1',
                        user: {
                          id: 'classmate-1',
                          first_name: 'Ana',
                          last_name: 'García',
                          email: 'ana@school.cl'
                        }
                      },
                      {
                        user_id: 'classmate-2',
                        user: {
                          id: 'classmate-2',
                          first_name: 'Carlos',
                          last_name: 'López',
                          email: 'carlos@school.cl'
                        }
                      }
                    ],
                    error: null
                  })
                })
              })
            })
          };
        }

        // Group members (already assigned) - should return empty for this test
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        classmates: expect.arrayContaining([
          expect.objectContaining({
            id: 'classmate-1',
            first_name: 'Ana',
            last_name: 'García'
          }),
          expect.objectContaining({
            id: 'classmate-2',
            first_name: 'Carlos',
            last_name: 'López'
          })
        ])
      });
    });

    it('should prefer docente role when user has multiple roles', async () => {
      const userId = 'user-teacher';
      const assignmentId = 'assignment-123';
      const groupId = 'group-456';
      const docenteSchoolId = 'school-docente';
      const estudianteSchoolId = 'school-estudiante';

      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: userId }
          }
        }
      });

      req.query = { assignmentId, groupId };

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      let userRolesCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'group_assignment_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { group_id: groupId, assignment_id: assignmentId },
                      error: null
                    })
                  })
                })
              })
            })
          };
        }

        if (table === 'group_assignment_groups') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { is_consultant_managed: false, max_members: 8 },
                  error: null
                })
              })
            })
          };
        }

        // Return roles in non-preferred order (estudiante first, docente second)
        if (table === 'user_roles') {
          userRolesCallCount++;
          if (userRolesCallCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      { user_id: userId, school_id: estudianteSchoolId, role_type: 'estudiante' },
                      { user_id: userId, school_id: docenteSchoolId, role_type: 'docente' }
                    ],
                    error: null
                  })
                })
              })
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [], error: null })
                })
              })
            })
          };
        }

        if (table === 'blocks') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { lesson_id: 'lesson-111' },
                  error: null
                })
              })
            })
          };
        }

        if (table === 'lessons') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { course_id: 'course-101' },
                  error: null
                })
              })
            })
          };
        }

        if (table === 'course_enrollments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ data: [], error: null })
                })
              })
            })
          };
        }

        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        };
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      // Verify that the docente school_id was selected (should be in logs)
      const logs = consoleLogSpy.mock.calls
        .map(call => call.join(' '))
        .filter(log => log.includes('[eligible-classmates]'));

      const roleSelectionLog = logs.find(log =>
        log.includes('selected role:') && log.includes(docenteSchoolId)
      );

      expect(roleSelectionLog).toBeDefined();
      expect(roleSelectionLog).toContain('docente');
      expect(roleSelectionLog).toContain(docenteSchoolId);

      consoleLogSpy.mockRestore();
    });

    it('should fallback to estudiante role if no docente role with school_id', async () => {
      const userId = 'user-student';
      const assignmentId = 'assignment-123';
      const groupId = 'group-456';
      const estudianteSchoolId = 'school-estudiante';

      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: userId }
          }
        }
      });

      req.query = { assignmentId, groupId };

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      let userRolesCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'group_assignment_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { group_id: groupId, assignment_id: assignmentId },
                      error: null
                    })
                  })
                })
              })
            })
          };
        }

        if (table === 'group_assignment_groups') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { is_consultant_managed: false, max_members: 8 },
                  error: null
                })
              })
            })
          };
        }

        // Return roles: docente without school_id, estudiante with school_id
        if (table === 'user_roles') {
          userRolesCallCount++;
          if (userRolesCallCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      { user_id: userId, school_id: null, role_type: 'docente' },
                      { user_id: userId, school_id: estudianteSchoolId, role_type: 'estudiante' }
                    ],
                    error: null
                  })
                })
              })
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [], error: null })
                })
              })
            })
          };
        }

        if (table === 'blocks') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { lesson_id: 'lesson-111' },
                  error: null
                })
              })
            })
          };
        }

        if (table === 'lessons') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { course_id: 'course-101' },
                  error: null
                })
              })
            })
          };
        }

        if (table === 'course_enrollments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ data: [], error: null })
                })
              })
            })
          };
        }

        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        };
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      // Verify estudiante role was selected
      const logs = consoleLogSpy.mock.calls
        .map(call => call.join(' '))
        .filter(log => log.includes('[eligible-classmates]'));

      const roleSelectionLog = logs.find(log =>
        log.includes('selected role:') && log.includes(estudianteSchoolId)
      );

      expect(roleSelectionLog).toBeDefined();
      expect(roleSelectionLog).toContain('estudiante');

      consoleLogSpy.mockRestore();
    });

    it('should return 403 when user has no roles with school_id', async () => {
      const userId = 'user-no-school';
      const assignmentId = 'assignment-123';
      const groupId = 'group-456';

      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: userId }
          }
        }
      });

      req.query = { assignmentId, groupId };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'group_assignment_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { group_id: groupId, assignment_id: assignmentId },
                      error: null
                    })
                  })
                })
              })
            })
          };
        }

        if (table === 'group_assignment_groups') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { is_consultant_managed: false, max_members: 8 },
                  error: null
                })
              })
            })
          };
        }

        // Return roles without any school_id
        if (table === 'user_roles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { user_id: userId, school_id: null, role_type: 'docente' },
                    { user_id: userId, school_id: null, role_type: 'estudiante' }
                  ],
                  error: null
                })
              })
            })
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis()
        };
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No tienes una escuela asignada'
      });
    });
  });

  describe('Authorization', () => {
    it('should reject if user is not member of the group', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user-123' }
          }
        }
      });

      req.query = {
        assignmentId: 'assignment-123',
        groupId: 'group-456'
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'group_assignment_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' }
            })
          };
        }
        return {};
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No eres miembro de este grupo'
      });
    });

    it('should reject if group is consultant-managed', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user-123' }
          }
        }
      });

      req.query = {
        assignmentId: 'assignment-123',
        groupId: 'group-456'
      };

      mockSupabase.from.mockImplementation((table: string) => {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn()
        };

        if (table === 'group_assignment_members') {
          chain.single.mockResolvedValue({
            data: { group_id: 'group-456', assignment_id: 'assignment-123' },
            error: null
          });
        }

        if (table === 'group_assignment_groups') {
          chain.single.mockResolvedValue({
            data: { is_consultant_managed: true, max_members: 8 },
            error: null
          });
        }

        return chain;
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No puedes invitar compañeros a un grupo administrado por el consultor'
      });
    });
  });
});
