import { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import NotificationService from '../../../lib/notificationService';
import {
  getApiUser,
  createApiSupabaseClient,
  createServiceRoleClient,
  getForcedPasswordChangeVerdict,
  sendForcedPasswordChangeResponse,
} from '../../../lib/api-auth';

/**
 * /api/admin/course-assignments — the admin course-assignment surface
 * (components/AssignTeachersModal.tsx, pages/admin/courses/[id]/assign.tsx).
 *
 * C-R1-03 (closure review 2026-09-08). This route is the designated writer of
 * INDEPENDENT course entitlements (C2 / D1), so:
 *
 *   * authority is the AUTHORITATIVE role row — an active literal `admin` in
 *     `user_roles`, read on the service-role client. Caller-editable
 *     `user_metadata` is never consulted (the previous route accepted it as an
 *     alternative and any verified user could put `role: 'admin'` there);
 *     a role-query error, a missing or malformed result is a denial;
 *   * the established forced-password-change boundary is applied here too
 *     (Bearer callers never reach the middleware's cookie-session branch);
 *   * the grant itself runs through `admin_grant_course_access` on the CALLER's
 *     client, so `auth.uid()` is the actor and the database re-checks the same
 *     admin + password gate; the RPC is atomic (assignment + enrolment +
 *     provenance succeed or fail together) and idempotent, so this route can
 *     never report a durable grant whose enrolment or provenance write failed.
 *
 * Accepts Bearer or cookie sessions (getApiUser).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RECIPIENTS = 200;

type GrantResult = {
  success: boolean;
  assignments_created: number;
  assignments_existing: number;
  enrollments_created: number;
  enrollments_promoted: number;
  enrollments_unchanged: number;
  newly_assigned_user_ids: string[];
};

function isGrantResult(v: unknown): v is GrantResult {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    r.success === true &&
    ['assignments_created', 'assignments_existing', 'enrollments_created', 'enrollments_promoted', 'enrollments_unchanged'].every((k) => typeof r[k] === 'number') &&
    Array.isArray(r.newly_assigned_user_ids)
  );
}

/** Active literal admin role row, or a reason to deny. */
async function verifyActiveAdmin(serviceClient: SupabaseClient, userId: string): Promise<'admin' | 'forbidden' | 'error'> {
  const { data, error } = await serviceClient
    .from('user_roles')
    .select('id, role_type, is_active')
    .eq('user_id', userId)
    .eq('role_type', 'admin')
    .eq('is_active', true)
    .limit(1);
  if (error) {
    console.error('[course-assignments] role verification failed:', error.message);
    return 'error';
  }
  if (!Array.isArray(data) || data.length === 0) return 'forbidden';
  const row = data[0] as { role_type?: unknown; is_active?: unknown };
  return row.role_type === 'admin' && row.is_active === true ? 'admin' : 'forbidden';
}

function rpcErrorStatus(err: { code?: string; message?: string }): number {
  if (err.code === '42501' || /permission|admin only|password change required/i.test(err.message ?? '')) return 403;
  if (/course not found/i.test(err.message ?? '')) return 404;
  if (/do(es)? not exist|at least one recipient|at most \d+ recipients/i.test(err.message ?? '')) return 400;
  return 500;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { user, error: authError } = await getApiUser(req, res);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const serviceClient = createServiceRoleClient();

    // Forced-password-change boundary (before any authority check or write).
    const verdict = await getForcedPasswordChangeVerdict(serviceClient, user.id);
    if (sendForcedPasswordChangeResponse(res, verdict)) return;

    // Authority: the active literal admin role row. Nothing else.
    const authority = await verifyActiveAdmin(serviceClient, user.id);
    if (authority === 'error') {
      return res.status(500).json({ error: 'Role verification failed' });
    }
    if (authority !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions. Admin access required.' });
    }

    if (req.method === 'POST') {
      const { courseId, teacherIds } = (req.body ?? {}) as { courseId?: unknown; teacherIds?: unknown };
      if (typeof courseId !== 'string' || !UUID.test(courseId)) {
        return res.status(400).json({ error: 'Missing or invalid courseId' });
      }
      if (!Array.isArray(teacherIds) || teacherIds.length === 0 || !teacherIds.every((t) => typeof t === 'string' && UUID.test(t))) {
        return res.status(400).json({ error: 'Missing or invalid teacherIds array' });
      }
      const recipients = Array.from(new Set(teacherIds as string[]));
      if (recipients.length > MAX_RECIPIENTS) {
        return res.status(400).json({ error: `At most ${MAX_RECIPIENTS} recipients per request` });
      }

      // The grant: atomic, on the caller's client (auth.uid() = this admin).
      const callerClient = await createApiSupabaseClient(req, res);
      const { data: grant, error: grantError } = await callerClient.rpc('admin_grant_course_access', {
        p_course_id: courseId,
        p_user_ids: recipients,
      });
      if (grantError) {
        console.error('[course-assignments] grant failed:', grantError.message);
        const status = rpcErrorStatus(grantError);
        return res.status(status).json({
          error: status === 500 ? 'Failed to grant course access: ' + grantError.message : grantError.message,
        });
      }
      if (!isGrantResult(grant)) {
        console.error('[course-assignments] grant returned an unexpected result');
        return res.status(500).json({ error: 'Failed to grant course access: unexpected result' });
      }

      // Notify only the newly assigned recipients (a retry re-notifies nobody).
      if (grant.newly_assigned_user_ids.length > 0) {
        const { data: courseData } = await serviceClient
          .from('courses')
          .select('title')
          .eq('id', courseId)
          .maybeSingle();
        try {
          await NotificationService.triggerNotification('course_assigned', {
            course: { id: courseId, name: (courseData as { title?: string } | null)?.title || 'Nuevo curso' },
            assigned_users: grant.newly_assigned_user_ids,
            assigned_by: user.id,
          });
        } catch (notificationError) {
          console.error('❌ Failed to trigger course assignment notifications:', notificationError);
          // The grant is durable; a notification failure does not undo it.
        }
      }

      return res.status(200).json({
        success: true,
        message: `Course assigned to ${grant.assignments_created} teacher(s) (${grant.assignments_existing} already assigned)`,
        grant,
      });
    }

    if (req.method === 'DELETE') {
      const { courseId, teacherId } = (req.body ?? {}) as { courseId?: unknown; teacherId?: unknown };
      if (typeof courseId !== 'string' || !UUID.test(courseId) || typeof teacherId !== 'string' || !UUID.test(teacherId)) {
        return res.status(400).json({ error: 'Missing or invalid courseId / teacherId' });
      }
      // Removes the assignment row only; the enrolment (an independent grant,
      // with its progress) is kept — the pre-existing semantics of this surface
      // and of batch_unassign_courses.
      const { error } = await serviceClient
        .from('course_assignments')
        .delete()
        .eq('course_id', courseId)
        .eq('teacher_id', teacherId);
      if (error) {
        console.error('Error removing course assignment:', error);
        return res.status(500).json({ error: 'Failed to remove course assignment: ' + error.message });
      }
      return res.status(200).json({ success: true, message: 'Course assignment removed successfully' });
    }

    if (req.method === 'GET') {
      const { courseId } = req.query;
      if (typeof courseId !== 'string' || !UUID.test(courseId)) {
        return res.status(400).json({ error: 'Missing or invalid courseId parameter' });
      }

      const { data, error } = await serviceClient
        .from('course_assignments')
        .select(`
          teacher_id,
          assigned_at,
          profiles:teacher_id (
            id,
            email,
            first_name,
            last_name
          )
        `)
        .eq('course_id', courseId);

      if (error) {
        console.error('Error fetching course assignments:', error);
        return res.status(500).json({ error: 'Failed to fetch course assignments: ' + error.message });
      }

      // Get school names from user_roles for each assigned user
      const teacherIds = (data || []).map((a: { teacher_id: string }) => a.teacher_id);
      const schoolMap = new Map<string, string>();

      if (teacherIds.length > 0) {
        const { data: userRoles } = await serviceClient
          .from('user_roles')
          .select('user_id, school_id')
          .in('user_id', teacherIds)
          .eq('is_active', true)
          .not('school_id', 'is', null);

        if (userRoles && userRoles.length > 0) {
          const schoolIds = [...new Set(userRoles.map((r: { school_id: number | null }) => r.school_id).filter(Boolean))];
          const { data: schools } = await serviceClient
            .from('schools')
            .select('id, name')
            .in('id', schoolIds);

          const schoolNameMap = new Map<number, string>();
          (schools || []).forEach((s: { id: number; name: string }) => schoolNameMap.set(s.id, s.name));

          userRoles.forEach((role: { user_id: string; school_id: number | null }) => {
            if (!schoolMap.has(role.user_id) && role.school_id) {
              const schoolName = schoolNameMap.get(role.school_id);
              if (schoolName) schoolMap.set(role.user_id, schoolName);
            }
          });
        }
      }

      const assignmentsWithSchool = (data || []).map((a: { teacher_id: string; profiles: unknown }) => ({
        ...a,
        profiles: {
          ...(a.profiles as Record<string, unknown>),
          school: schoolMap.get(a.teacher_id) || null,
        },
      }));

      return res.status(200).json({ success: true, assignments: assignmentsWithSchool });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Unexpected error in course-assignments API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
