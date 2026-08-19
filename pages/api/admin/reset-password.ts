import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdminOrEquipoDirectivo,
  createServiceRoleClient,
  sendAuthError,
  sendMeetingError,
  sendApiResponse,
  validateRequestBody,
  logApiRequest
} from '../../../lib/api-auth';
import { ApiError, ApiSuccess, Validators } from '../../../lib/types/api-auth.types';
import { rateLimit, RATE_LIMITS } from '../../../lib/rateLimit';
import { firstPasswordPolicyError } from '../../../lib/auth/password-policy';
import { recordSecurityAudit } from '../../../lib/security/audit';
import {
  ED_FORBIDDEN_TARGET_ROLES_SET,
  SCHOOL_SCOPED_ROLES_SET,
} from '../../../utils/roleUtils';

// Rate limiter for password reset (auth-level: 10 req/min)
const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'admin-reset-password');

/**
 * Administrative password reset.
 *
 * S2 — three defects fixed here, and the ordering below is the fix for the
 * worst of them.
 *
 *   1. WRONG FLAG. The handler wrote `profiles.password_change_required`. That
 *      column does not exist on `profiles`; the column the whole platform reads
 *      is `must_change_password` (`/login`, `/change-password`,
 *      `/api/auth/force-password-change`, and now the middleware gate of S4).
 *      Supabase answers an UPDATE naming an unknown column with an error, the
 *      handler logged it and continued — so EVERY administrative reset issued a
 *      working temporary password and never forced the user to change it. The
 *      temporary credential simply became the account's password.
 *
 *   2. NO SERVER-SIDE POLICY. The only check on `temporaryPassword` was in the
 *      modal, and it accepted six characters with no character classes. A
 *      direct API call had no check at all.
 *
 *   3. SUCCESS ON PARTIAL FAILURE. The flag write was best-effort, so the
 *      response said "Password reset successfully" precisely in the case where
 *      the security-relevant half had failed.
 *
 * ORDERING. The flag is written BEFORE the password, because the two possible
 * failure points are not symmetric:
 *
 *   flag fails   → nothing changed at all. The account keeps its old password
 *                  and its old flag. A clean, complete no-op.
 *   password fails → the account is flagged but keeps its old password. The
 *                  user is forced to change a password they still know. That is
 *                  annoying, not insecure — and the prior flag value is restored
 *                  best-effort anyway.
 *
 * The reverse order has a failure mode with no safe reading: a live temporary
 * password that nobody is required to change. Neither failure returns success.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiSuccess<any> | ApiError>
) {
  // Log the request
  logApiRequest(req, 'reset-password');

  if (req.method !== 'POST') {
    return sendAuthError(res, 'Method not allowed', 405);
  }

  // Apply rate limiting
  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
    // Verify admin or equipo_directivo access using the centralized auth utility
    const {
      isAuthorized,
      role: requesterRole,
      schoolId: edSchoolId,
      user,
      error,
    } = await checkIsAdminOrEquipoDirectivo(req, res);

    console.log('[Reset Password API] Auth check result:', {
      isAuthorized,
      role: requesterRole,
      userId: user?.id,
      error: error?.message,
    });

    if (error || !user) {
      console.error('[Reset Password API] Authentication failed:', error);
      return sendAuthError(res, 'Authentication required', 401);
    }

    if (!isAuthorized) {
      console.error(
        '[Reset Password API] Solo administradores o equipo directivo pueden restablecer contraseñas:',
        user.id,
      );
      return sendAuthError(
        res,
        'Solo administradores o equipo directivo pueden restablecer contraseñas',
        403,
      );
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return sendAuthError(res, 'School context missing for equipo_directivo', 403);
    }

    // Create service role client for admin operations
    const supabaseAdmin = createServiceRoleClient();

    const { userId, temporaryPassword } = req.body ?? {};

    // Validate required fields
    const validation = validateRequestBody<{ userId: string; temporaryPassword: string }>(
      req.body,
      ['userId', 'temporaryPassword']
    );

    if (!validation.valid) {
      return sendAuthError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        400
      );
    }

    if (!Validators.isUUID(userId)) {
      return sendAuthError(res, 'userId inválido', 400);
    }

    // S5: the shared policy, enforced SERVER-SIDE. The modal checks the same
    // rule for usability; this is the boundary. Without it an administrator can
    // set a credential weaker than the one the platform will accept as its
    // replacement, which is the state this endpoint shipped in.
    const passwordError = firstPasswordPolicyError(temporaryPassword);
    if (passwordError) {
      return sendAuthError(res, passwordError, 400);
    }

    if (userId === user.id) {
      return sendAuthError(
        res,
        'No puedes restablecer tu propia contraseña — usa el flujo normal de recuperación',
        400,
      );
    }

    // The target profile is now read for BOTH requester roles, not just ED.
    // Admin needed it too: the handler has to know the prior value of
    // `must_change_password` so a failed password write can be undone, and a
    // reset against a non-existent account should 404 rather than silently
    // succeed against zero rows.
    const { data: targetProfile, error: profileLookupError } = await supabaseAdmin
      .from('profiles')
      .select('id, school_id, must_change_password')
      .eq('id', userId)
      .maybeSingle();

    if (profileLookupError) {
      return sendAuthError(res, 'Error verificando usuario', 500);
    }
    if (!targetProfile) {
      return sendAuthError(res, 'Usuario no encontrado', 404);
    }

    // For equipo_directivo, verify the target user belongs to the same school
    // before performing any password reset work.
    if (requesterRole === 'equipo_directivo') {
      if (targetProfile.school_id !== edSchoolId) {
        return sendAuthError(
          res,
          'No autorizado para restablecer la contraseña de este usuario',
          403,
        );
      }

      // Note: this is a TOCTOU read. Concurrent role grants between this
      // check and the password write below could let a global-role escalation
      // slip through. Both admin and equipo_directivo can reach this code
      // path, widening the exposure beyond admin-only tooling. Tracked in
      // PR #19 follow-ups as "TOCTOU residual risk hardening (Postgres
      // function or partial unique index)".
      // Defense-in-depth: reject if the target holds any active role either
      // (a) in ED_FORBIDDEN_TARGET_ROLES (admin/consultor/community_manager/
      // supervisor_de_red) or (b) school-scoped but tied to a different
      // school. Two conceptually distinct gates: forbidden-role membership
      // vs. cross-school scope. Profile and user_roles can diverge (stale
      // or cross-school role rows), so this gate is enforced independently.
      const { data: targetRoles, error: rolesLookupError } = await supabaseAdmin
        .from('user_roles')
        .select('role_type, school_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (rolesLookupError) {
        return sendAuthError(res, 'Error verificando roles del usuario', 500);
      }
      const hasForbiddenRole = (targetRoles ?? []).some(
        (r: { role_type: string }) => ED_FORBIDDEN_TARGET_ROLES_SET.has(r.role_type),
      );
      const hasCrossSchoolRole = (targetRoles ?? []).some(
        (r: { role_type: string; school_id: number | null }) =>
          SCHOOL_SCOPED_ROLES_SET.has(r.role_type) &&
          r.school_id !== null &&
          r.school_id !== edSchoolId,
      );
      if (hasForbiddenRole || hasCrossSchoolRole) {
        return sendAuthError(
          res,
          'No autorizado para restablecer la contraseña de este usuario',
          403,
        );
      }
    }

    // The temporary password is never logged, here or anywhere else.
    console.log('[Reset Password API] Attempting to reset password for userId:', userId);

    const previousMustChange = targetProfile.must_change_password === true;

    // --- Step 1: the enforcement flag, FIRST (see the ordering note above) ---
    //
    // The payload is EXACTLY one column. It used to carry `updated_at` as well —
    // and `public.profiles` has no `updated_at` column, so PostgREST answered
    // `PGRST204 Could not find the 'updated_at' column of 'profiles' in the
    // schema cache` and this handler, which now fails closed, returned
    // RESET_NOT_STARTED for EVERY administrative reset.
    //
    // That is the same defect S2 was raised for — writing a column that does not
    // exist — surviving in the very handler that fixed it, one line lower down.
    // The unit suite could not see it because it stubs the client; the e2e found
    // it on the first run against a real database.
    //
    // `__tests__/api/admin/reset-password.test.ts` now pins the payload's KEY SET
    // rather than only its contents, so an invented column fails a test instead
    // of a production reset.
    const { error: flagError } = await supabaseAdmin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', userId);

    if (flagError) {
      console.error('[Reset Password API] Could not set must_change_password:', flagError);
      await recordSecurityAudit(supabaseAdmin, {
        action: 'password_reset_admin',
        outcome: 'failure',
        actorUserId: user.id,
        actorRole: requesterRole ?? null,
        targetUserId: userId,
        schoolId: typeof edSchoolId === 'number' ? edSchoolId : null,
        metadata: { stage: 'set_flag', reason: 'profile_update_failed' },
      });
      return sendMeetingError(
        res,
        500,
        'RESET_NOT_STARTED',
        'No se pudo preparar el restablecimiento. La contraseña del usuario NO fue modificada. ' +
          'Inténtalo nuevamente.',
      );
    }

    // --- Step 2: the password itself ---
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        password: temporaryPassword,
        user_metadata: {
          password_reset_by_admin: true,
          password_reset_at: new Date().toISOString()
        }
      }
    );

    if (updateError) {
      console.error('[Reset Password API] Auth password update failed:', updateError.message);

      // Compensate: put the flag back the way we found it. Best-effort — if it
      // fails the user is merely forced to change a password they already know,
      // which is the safe side of this failure. Either way the response is NOT
      // a success, so the administrator knows to retry.
      const { error: restoreError } = await supabaseAdmin
        .from('profiles')
        .update({ must_change_password: previousMustChange })
        .eq('id', userId);

      if (restoreError) {
        console.error(
          '[Reset Password API] Could not restore must_change_password after a failed reset:',
          restoreError,
        );
      }

      await recordSecurityAudit(supabaseAdmin, {
        action: 'password_reset_admin',
        outcome: restoreError ? 'partial_failure' : 'failure',
        actorUserId: user.id,
        actorRole: requesterRole ?? null,
        targetUserId: userId,
        schoolId: typeof edSchoolId === 'number' ? edSchoolId : null,
        metadata: {
          stage: 'set_password',
          reason: 'auth_update_failed',
          flag_restored: !restoreError,
        },
      });

      return sendMeetingError(
        res,
        500,
        'RESET_FAILED',
        restoreError
          ? 'No se pudo restablecer la contraseña. El usuario quedó marcado para cambiar su ' +
              'contraseña en el próximo inicio de sesión, pero su contraseña actual NO cambió.'
          : 'No se pudo restablecer la contraseña. No se modificó nada en la cuenta del usuario.',
      );
    }

    // --- Step 3: audit. Fail-open and visible (see lib/security/audit.ts) ---
    const audit = await recordSecurityAudit(supabaseAdmin, {
      action: 'password_reset_admin',
      outcome: 'success',
      actorUserId: user.id,
      actorRole: requesterRole ?? null,
      targetUserId: userId,
      schoolId: typeof edSchoolId === 'number' ? edSchoolId : null,
      metadata: { forced_change: true },
    });

    // The response carries only what the caller needs to act. It used to return
    // `updateData.user` — the entire GoTrue user object, including full app and
    // user metadata, identity providers, confirmation timestamps and the last
    // sign-in time — to a surface that renders a toast.
    return sendApiResponse(res, {
      success: true,
      message: 'Contraseña restablecida. El usuario deberá cambiarla al iniciar sesión.',
      userId,
      mustChangePassword: true,
      audited: audit.recorded,
    });

  } catch (error: any) {
    console.error('[Reset Password API] Unexpected error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    return sendAuthError(
      res,
      'Internal server error',
      500,
      error.message || 'An unexpected error occurred'
    );
  }
}
