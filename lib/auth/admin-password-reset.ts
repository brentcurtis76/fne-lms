/**
 * The administrative password reset, as a ceremony.
 *
 * WHY IT IS ITS OWN MODULE. The other three ceremonies establish an identity and
 * write. This one is an authorization decision first and a write second: an
 * administrator or an equipo_directivo is acting on SOMEBODY ELSE'S account, and
 * the interesting question is not "who is calling" but "may this caller do this
 * to this target". Putting that decision in the route left it one refactor away
 * from a route that forgot half of it.
 *
 * WHAT THIS MODULE OWNS:
 *
 *   * the scope rules -- an equipo_directivo may only reset an account in their
 *     own school, may not reset an account holding a globally scoped role, and
 *     may not reset an account whose roles are tied to a different school;
 *   * the ordering -- flag FIRST, then the password (see below);
 *   * the compensation when the password write fails;
 *   * the audit row, whose action comes from the ceremony and not from a caller.
 *
 * WHAT THE ROUTE STILL OWNS, and this is the one deliberate seam: the ACTOR.
 * `checkIsAdminOrEquipoDirectivo` (lib/api-auth.ts) validates the caller's token
 * with the auth server and reads their active roles from the database -- it is
 * the shared helper CLAUDE.md's API pattern prescribes, and it is a server-side
 * read, not a caller-supplied value. This module re-checks the SHAPE of what it
 * is handed (the role must be one of the two, and an equipo_directivo must carry
 * a numeric school id) and refuses anything else, but it does not repeat the
 * role lookup.
 *
 * ORDERING. The flag is written BEFORE the password, because the two failure
 * points are not symmetric:
 *
 *   flag fails     -> nothing changed at all. A clean, complete no-op.
 *   password fails -> the account is flagged but keeps its old password. The user
 *                     is forced to change a password they still know: annoying,
 *                     not insecure -- and the prior flag value is restored
 *                     best-effort anyway.
 *
 * The reverse order has a failure mode with no safe reading: a live temporary
 * password that nobody is required to change. Neither failure returns success.
 *
 * THE TEMPORARY PASSWORD IS NEVER LOGGED, never echoed in a response, and never
 * written to the audit trail (where the metadata CHECK would refuse it anyway).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { firstPasswordPolicyError } from './password-policy';
import {
  CEREMONY_AUDIT_ACTION,
  __writePasswordThroughTrustedBoundary as writePassword,
  isCompletionFailure,
  type CompletionResult,
} from './password-completion';
import { recordSecurityAudit } from '../security/audit';
import { ED_FORBIDDEN_TARGET_ROLES_SET, SCHOOL_SCOPED_ROLES_SET } from '../../utils/roleUtils';

/** es-CL. Every one of these reaches an administrator's toast. */
export const ADMIN_RESET_MESSAGES = {
  notAuthorized: 'No autorizado para restablecer la contraseña de este usuario',
  selfReset:
    'No puedes restablecer tu propia contraseña — usa el flujo normal de recuperación',
  targetLookupFailed: 'Error verificando usuario',
  targetNotFound: 'Usuario no encontrado',
  targetRolesFailed: 'Error verificando roles del usuario',
  schoolContextMissing: 'Falta el contexto de escuela para equipo directivo',
  notStarted:
    'No se pudo preparar el restablecimiento. La contraseña del usuario NO fue modificada. ' +
    'Inténtalo nuevamente.',
  failedFlagRestored:
    'No se pudo restablecer la contraseña. No se modificó nada en la cuenta del usuario.',
  failedFlagStuck:
    'No se pudo restablecer la contraseña. El usuario quedó marcado para cambiar su ' +
    'contraseña en el próximo inicio de sesión, pero su contraseña actual NO cambió.',
  success: 'Contraseña restablecida. El usuario deberá cambiarla al iniciar sesión.',
} as const;

/**
 * The actor, as established by `checkIsAdminOrEquipoDirectivo`. Re-validated
 * here rather than trusted: a caller of this module that made up a role would be
 * refused by `assertActor` below.
 */
export interface AdminResetActor {
  userId: string;
  role: string | null | undefined;
  /** Required, and required to be a number, when the role is equipo_directivo. */
  schoolId: number | null | undefined;
}

export type AdminResetFailureCode =
  | 'ACTOR_NOT_AUTHORIZED'
  | 'SCHOOL_CONTEXT_MISSING'
  | 'SELF_RESET'
  | 'PASSWORD_POLICY'
  | 'TARGET_LOOKUP_FAILED'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_OUT_OF_SCOPE'
  | 'TARGET_ROLES_FAILED'
  | 'RESET_NOT_STARTED'
  | 'RESET_FAILED';

export interface AdminResetFailure {
  ok: false;
  status: number;
  code: AdminResetFailureCode;
  message: string;
  /** True only for RESET_NOT_STARTED / RESET_FAILED, which the UI renders differently. */
  operational: boolean;
}

export interface AdminResetSuccess {
  ok: true;
  message: string;
  userId: string;
  mustChangePassword: true;
  audited: boolean;
}

export type AdminResetResult = AdminResetSuccess | AdminResetFailure;

export function isAdminResetFailure(result: AdminResetResult): result is AdminResetFailure {
  return result.ok === false;
}

function fail(
  status: number,
  code: AdminResetFailureCode,
  message: string,
  operational = false
): AdminResetFailure {
  return { ok: false, status, code, message, operational };
}

const ALLOWED_ACTOR_ROLES = new Set(['admin', 'equipo_directivo']);

export interface AdministrativeResetInput {
  actor: AdminResetActor;
  targetUserId: string;
  temporaryPassword: string;
}

/**
 * Reset another account's password and put it under the forced-change regime.
 *
 * `admin` MUST be a service-role client.
 */
export async function completeAdministrativeReset(
  admin: SupabaseClient,
  input: AdministrativeResetInput
): Promise<AdminResetResult> {
  const { actor, targetUserId, temporaryPassword } = input;

  // --- The actor, re-validated ------------------------------------------------
  if (!actor?.userId || typeof actor.role !== 'string' || !ALLOWED_ACTOR_ROLES.has(actor.role)) {
    return fail(403, 'ACTOR_NOT_AUTHORIZED', ADMIN_RESET_MESSAGES.notAuthorized);
  }

  const isEquipoDirectivo = actor.role === 'equipo_directivo';
  const actorSchoolId = actor.schoolId;

  if (isEquipoDirectivo && typeof actorSchoolId !== 'number') {
    return fail(403, 'SCHOOL_CONTEXT_MISSING', ADMIN_RESET_MESSAGES.schoolContextMissing);
  }

  if (targetUserId === actor.userId) {
    return fail(400, 'SELF_RESET', ADMIN_RESET_MESSAGES.selfReset);
  }

  // --- The shared policy, SERVER-SIDE ----------------------------------------
  // Without it an administrator can set a credential weaker than the one the
  // platform will accept as its replacement, which is the state this endpoint
  // shipped in.
  const policyError = firstPasswordPolicyError(temporaryPassword);
  if (policyError) {
    return fail(400, 'PASSWORD_POLICY', policyError);
  }

  // --- The target -------------------------------------------------------------
  // Read for BOTH actor roles: the ceremony has to know the prior value of
  // `must_change_password` so a failed password write can be undone, and a reset
  // against a non-existent account must 404 rather than silently succeed against
  // zero rows.
  const { data: targetProfile, error: profileLookupError } = await admin
    .from('profiles')
    .select('id, school_id, must_change_password')
    .eq('id', targetUserId)
    .maybeSingle();

  if (profileLookupError) {
    return fail(500, 'TARGET_LOOKUP_FAILED', ADMIN_RESET_MESSAGES.targetLookupFailed);
  }
  if (!targetProfile) {
    return fail(404, 'TARGET_NOT_FOUND', ADMIN_RESET_MESSAGES.targetNotFound);
  }

  if (isEquipoDirectivo) {
    if (targetProfile.school_id !== actorSchoolId) {
      return fail(403, 'TARGET_OUT_OF_SCOPE', ADMIN_RESET_MESSAGES.notAuthorized);
    }

    // Note: this is a TOCTOU read. Concurrent role grants between this check and
    // the password write below could let a global-role escalation slip through.
    // Tracked in PR #19 follow-ups as "TOCTOU residual risk hardening".
    //
    // Two conceptually distinct gates, enforced independently because profile and
    // user_roles can diverge (stale or cross-school role rows): forbidden-role
    // membership, and school scope on a school-scoped role.
    const { data: targetRoles, error: rolesLookupError } = await admin
      .from('user_roles')
      .select('role_type, school_id')
      .eq('user_id', targetUserId)
      .eq('is_active', true);

    if (rolesLookupError) {
      return fail(500, 'TARGET_ROLES_FAILED', ADMIN_RESET_MESSAGES.targetRolesFailed);
    }

    const hasForbiddenRole = (targetRoles ?? []).some((r: { role_type: string }) =>
      ED_FORBIDDEN_TARGET_ROLES_SET.has(r.role_type)
    );
    const hasCrossSchoolRole = (targetRoles ?? []).some(
      (r: { role_type: string; school_id: number | null }) =>
        SCHOOL_SCOPED_ROLES_SET.has(r.role_type) &&
        r.school_id !== null &&
        r.school_id !== actorSchoolId
    );

    if (hasForbiddenRole || hasCrossSchoolRole) {
      return fail(403, 'TARGET_OUT_OF_SCOPE', ADMIN_RESET_MESSAGES.notAuthorized);
    }
  }

  const previousMustChange = targetProfile.must_change_password === true;
  const schoolId = typeof actorSchoolId === 'number' ? actorSchoolId : null;

  // --- Step 1: the enforcement flag, FIRST ------------------------------------
  // The payload is EXACTLY one column. It used to carry `updated_at` as well, and
  // `public.profiles` has no such column, so PostgREST answered PGRST204 and this
  // handler -- which fails closed -- returned RESET_NOT_STARTED for EVERY
  // administrative reset. The unit suite could not see it because it stubs the
  // client; the e2e found it on the first run against a real database.
  const { error: flagError } = await admin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', targetUserId);

  if (flagError) {
    console.error('[admin-password-reset] could not set must_change_password:', flagError);
    await recordSecurityAudit(admin, {
      action: CEREMONY_AUDIT_ACTION.admin_reset,
      outcome: 'failure',
      actorUserId: actor.userId,
      actorRole: actor.role,
      targetUserId,
      schoolId,
      metadata: { stage: 'set_flag', reason: 'profile_update_failed' },
    });
    return fail(500, 'RESET_NOT_STARTED', ADMIN_RESET_MESSAGES.notStarted, true);
  }

  // --- Step 2: the password, through the trusted boundary ---------------------
  const written: CompletionResult = await writePassword(admin, {
    userId: targetUserId,
    newPassword: temporaryPassword,
    ceremony: 'admin_reset',
    actorUserId: actor.userId,
    actorRole: actor.role,
    schoolId,
    auditMetadata: { forced_change: true },
    logPrefix: '[admin-password-reset]',
    userMetadata: {
      password_reset_by_admin: true,
      password_reset_at: new Date().toISOString(),
    },
  });

  if (isCompletionFailure(written)) {
    // Compensate: put the flag back the way we found it. Best-effort -- if it
    // fails the user is merely forced to change a password they already know,
    // which is the safe side of this failure. Either way the response is NOT a
    // success, so the administrator knows to retry.
    const { error: restoreError } = await admin
      .from('profiles')
      .update({ must_change_password: previousMustChange })
      .eq('id', targetUserId);

    if (restoreError) {
      console.error(
        '[admin-password-reset] could not restore must_change_password after a failed reset:',
        restoreError
      );
    }

    // `writePassword` already recorded a `failure` row for the password stage.
    // This one records what the COMPENSATION did, which is the part an operator
    // needs in order to know whether the account was left flagged.
    await recordSecurityAudit(admin, {
      action: CEREMONY_AUDIT_ACTION.admin_reset,
      outcome: restoreError ? 'partial_failure' : 'failure',
      actorUserId: actor.userId,
      actorRole: actor.role,
      targetUserId,
      schoolId,
      metadata: {
        stage: 'compensate_flag',
        reason: 'auth_update_failed',
        flag_restored: !restoreError,
      },
    });

    return fail(
      500,
      'RESET_FAILED',
      restoreError
        ? ADMIN_RESET_MESSAGES.failedFlagStuck
        : ADMIN_RESET_MESSAGES.failedFlagRestored,
      true
    );
  }

  return {
    ok: true,
    message: ADMIN_RESET_MESSAGES.success,
    userId: targetUserId,
    mustChangePassword: true,
    audited: written.audited,
  };
}
