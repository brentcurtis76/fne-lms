/**
 * The trusted server side of every password completion.
 *
 * F3 — WHAT WAS BROKEN. Two of the three ways a password gets set in this
 * platform did the work in the BROWSER:
 *
 *   `/reset-password` called `supabase.auth.updateUser({ password })` directly,
 *   then cleared `profiles.must_change_password` with a browser PATCH, then
 *   reported success whether or not that second write landed. There was no
 *   server-side policy check at all — the only thing standing between a weak
 *   password and the account was a function running in the attacker's own tab —
 *   and no audit row was ever written for a recovery or a first password, so the
 *   single most security-relevant event in the lifecycle left no trace.
 *
 *   `/change-password` called `updateUser` too, and only fell back to the
 *   audited server endpoint when GoTrue happened to answer 422. On a project
 *   where "secure password change" is off — which is the default, and which is
 *   how this project is configured — the 422 never comes, so the fallback never
 *   fires and the ordinary forced change was neither policy-checked nor audited.
 *   The endpoint existed; it simply was not on the path.
 *
 * WHAT THIS MODULE IS. The one place a password is actually written. It is
 * server-only (it needs the service-role key) and every caller reaches it having
 * ALREADY PROVED an identity — from `auth.getUser()` against a bearer token, or
 * from a verified recovery credential. It never accepts a user id from a request
 * body, and it never trusts `getSession()`, whose contents are decoded from a
 * cookie the caller can rewrite.
 *
 * THE ORDER, and why: password first, then flag, then audit.
 *
 *   The flag is not a security control over the password write the way it is in
 *   the ADMINISTRATIVE reset (`pages/api/admin/reset-password.ts`, where it is
 *   written first on purpose — see the note there). Here the user is setting
 *   their OWN password, having already proved they may: clearing the flag before
 *   the password would release the account from the gate while it still carries
 *   the credential it was issued.
 *
 * PARTIAL FAILURE IS REPORTED, NOT PAPERED OVER. If the password changes and the
 * flag does not, the caller gets `ok: false` with `stage: 'clear_flag'` and an
 * HTTP 500 — because the user must know their new password works even though the
 * app is about to hold them at /change-password again. Retrying is safe: setting
 * the same password again is idempotent from the user's point of view, and the
 * flag clear is an UPDATE to a constant.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { firstPasswordPolicyError } from './password-policy';
import {
  recordSecurityAudit,
  type SecurityAuditAction,
  type SecurityAuditResult,
} from '../security/audit';

/** The database function that owns writes to `profiles.must_change_password`. */
export const SET_PASSWORD_CHANGE_REQUIRED_RPC = 'set_password_change_required';

/** es-CL, because every one of these reaches the user. */
export const COMPLETION_MESSAGES = {
  weak: 'La contraseña no cumple con los requisitos de seguridad del sistema',
  samePassword: 'La nueva contraseña debe ser diferente a la anterior',
  updateFailed: 'No se pudo actualizar la contraseña. Inténtalo nuevamente.',
  flagNotCleared:
    'Tu contraseña se actualizó, pero no pudimos completar el proceso. ' +
    'Vuelve a iniciar sesión; si el problema persiste, contacta al administrador.',
  success: 'Contraseña actualizada exitosamente',
} as const;

export type CompletionStage = 'policy' | 'set_password' | 'clear_flag';

export interface CompletionFailure {
  ok: false;
  stage: CompletionStage;
  status: number;
  /** es-CL, safe to show. Never a provider string. */
  message: string;
  code?: string;
  /** True when the password DID change but a later step did not. */
  passwordChanged: boolean;
}

export interface CompletionSuccess {
  ok: true;
  message: string;
  /** False means the trail did not record it. Callers surface it; nobody throws. */
  audited: boolean;
}

export type CompletionResult = CompletionSuccess | CompletionFailure;

export function isCompletionFailure(result: CompletionResult): result is CompletionFailure {
  return result.ok === false;
}

/**
 * Map a GoTrue error onto one of OUR messages.
 *
 * The provider's own string is never returned to the caller: it distinguishes
 * "this password is in a breach corpus" from "too short" from "same as the old
 * one", and the first two are facts about the password the caller just typed
 * that a response should not confirm. It is logged for operators instead.
 */
function describeProviderError(error: { message?: string; code?: string; status?: number }): {
  message: string;
  code: string;
} {
  const raw = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();

  if (raw.includes('same_password') || raw.includes('different from the old password')) {
    return { message: COMPLETION_MESSAGES.samePassword, code: 'SAME_PASSWORD' };
  }

  // GoTrue applies its own minimum length and, when the project enables it, a
  // leaked-password check. Those are dashboard settings this application does
  // not own; runbook §5 covers aligning them with the shared policy.
  if (
    error?.status === 422 ||
    raw.includes('password') ||
    raw.includes('weak') ||
    raw.includes('pwned')
  ) {
    return { message: COMPLETION_MESSAGES.weak, code: 'PASSWORD_REJECTED' };
  }

  return { message: COMPLETION_MESSAGES.updateFailed, code: 'UPDATE_FAILED' };
}

/**
 * Clear the forced-change flag through the trusted database path.
 *
 * The RPC returns false when it matched no row, which is a real failure — an
 * account that vanished mid-flow — and is reported as one rather than being
 * mistaken for "cleared".
 */
export async function clearPasswordChangeFlag(
  admin: Pick<SupabaseClient, 'rpc'>,
  userId: string
): Promise<{ cleared: boolean; error?: string }> {
  try {
    const { data, error } = await admin.rpc(SET_PASSWORD_CHANGE_REQUIRED_RPC, {
      p_user_id: userId,
      p_required: false,
    });

    if (error) {
      return { cleared: false, error: error.message ?? 'rpc failed' };
    }

    return data === true
      ? { cleared: true }
      : { cleared: false, error: 'no profile row was updated' };
  } catch (thrown) {
    return {
      cleared: false,
      error: thrown instanceof Error ? thrown.message : String(thrown),
    };
  }
}

export interface CompletePasswordChangeInput {
  /** The account the caller PROVED. Never taken from a request body. */
  userId: string;
  newPassword: string;
  /** `password_change_forced` or `password_change_recovery`. */
  auditAction: Extract<
    SecurityAuditAction,
    'password_change_forced' | 'password_change_recovery' | 'password_change_voluntary'
  >;
  /** Free-form, sanitised by the audit writer before it is stored. */
  auditMetadata?: Record<string, unknown>;
  /**
   * Whether to clear `profiles.must_change_password` afterwards. Recovery and
   * forced completion both do; a voluntary change has nothing to clear.
   */
  clearFlag: boolean;
  /** Prefix for operator logs, e.g. `[recovery-complete]`. */
  logPrefix: string;
}

/**
 * Validate, write the password, clear the flag, audit. In that order.
 *
 * `admin` MUST be a service-role client: `auth.admin.updateUserById` and the
 * flag RPC are both service-role-only, and the audit table grants
 * `authenticated` SELECT alone.
 */
export async function completePasswordChange(
  admin: SupabaseClient,
  input: CompletePasswordChangeInput
): Promise<CompletionResult> {
  // --- The policy, SERVER-SIDE. This is the boundary; the identical check in
  //     the form is usability, not security.
  const policyError = firstPasswordPolicyError(input.newPassword);
  if (policyError) {
    return {
      ok: false,
      stage: 'policy',
      status: 400,
      message: policyError,
      code: 'PASSWORD_POLICY',
      passwordChanged: false,
    };
  }

  // --- The password, on the PROVED account and no other.
  const { error: updateError } = await admin.auth.admin.updateUserById(input.userId, {
    password: input.newPassword,
  });

  if (updateError) {
    // The provider's own words go to the operator log and stop there.
    console.error(`${input.logPrefix} password update refused`, {
      user_id: input.userId,
      code: (updateError as { code?: string }).code ?? null,
      status: (updateError as { status?: number }).status ?? null,
      message: updateError.message,
    });

    const described = describeProviderError(updateError as any);

    await recordSecurityAudit(admin, {
      action: input.auditAction,
      outcome: 'failure',
      actorUserId: input.userId,
      targetUserId: input.userId,
      metadata: { ...(input.auditMetadata ?? {}), stage: 'set_password' },
    });

    return {
      ok: false,
      stage: 'set_password',
      // 400 for anything the user can fix by typing a different password;
      // 502 when the provider itself is the problem.
      status: described.code === 'UPDATE_FAILED' ? 502 : 400,
      message: described.message,
      code: described.code,
      passwordChanged: false,
    };
  }

  // --- The enforcement state, through the trusted database path.
  if (input.clearFlag) {
    const flag = await clearPasswordChangeFlag(admin, input.userId);

    if (!flag.cleared) {
      console.error(`${input.logPrefix} could not clear must_change_password`, {
        user_id: input.userId,
        error: flag.error,
      });

      await recordSecurityAudit(admin, {
        action: input.auditAction,
        outcome: 'partial_failure',
        actorUserId: input.userId,
        targetUserId: input.userId,
        metadata: {
          ...(input.auditMetadata ?? {}),
          stage: 'clear_flag',
          reason: 'set_password_change_required_failed',
        },
      });

      // The password DID change. Saying "success" here is the exact lie the old
      // code told: the user would believe the flow finished and then be bounced
      // back to /change-password on their next request with no explanation.
      return {
        ok: false,
        stage: 'clear_flag',
        status: 500,
        message: COMPLETION_MESSAGES.flagNotCleared,
        code: 'FLAG_NOT_CLEARED',
        passwordChanged: true,
      };
    }
  }

  // --- The durable record. Fail-open and visible: the password has already
  //     changed, so refusing the response would report a failure that did not
  //     happen. `audited: false` travels in the body and `[security-audit]`
  //     goes to the log.
  const audit: SecurityAuditResult = await recordSecurityAudit(admin, {
    action: input.auditAction,
    outcome: 'success',
    actorUserId: input.userId,
    targetUserId: input.userId,
    metadata: input.auditMetadata ?? {},
  });

  return { ok: true, message: COMPLETION_MESSAGES.success, audited: audit.recorded };
}
