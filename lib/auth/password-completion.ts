/**
 * The trusted password-mutation boundary. Every password this platform writes
 * for an EXISTING account is written here, and nowhere else.
 *
 * ==========================================================================
 * WHY IT IS SHAPED LIKE THIS, and what the previous shape got wrong.
 * ==========================================================================
 *
 * ROUND ONE. Two of the three ways a password got set did the work in the
 * BROWSER: `/reset-password` called `supabase.auth.updateUser({ password })` and
 * then cleared `profiles.must_change_password` with a browser PATCH whose
 * failure it ignored; `/change-password` did the same and only reached the
 * audited endpoint on a 422 this project's configuration never produces. No
 * server-side policy check, and no audit row, for the single most
 * security-relevant event an account has.
 *
 * ROUND TWO moved the write here -- and then exposed it as
 *
 *     completePasswordChange(admin, { userId, newPassword, auditAction, ... })
 *
 * which is a generic primitive. Any route could import it, pass any user id, and
 * name its own audit action. The boundary existed; it just did not require
 * anything of its callers. `/api/auth/recovery-complete` demonstrated exactly
 * that failure mode: it "proved" identity with an ordinary bearer access token,
 * handed the resulting id to this function, and labelled the result
 * `password_change_recovery` -- so a normal login token could change a password
 * and the audit trail would call it a recovery.
 *
 * ==========================================================================
 * ROUND THREE: THE CEREMONY IS THE API.
 * ==========================================================================
 *
 * There is no exported function that simply takes a user id and a password.
 * There are four ceremonies, and each one ESTABLISHES the identity it acts on:
 *
 *   completeRecoveryPasswordChange   leases a bounded, purpose/user-bound grant
 *                                    created only after recovery proof was
 *                                    consumed server-side. An access token cannot
 *                                    satisfy it -- see lib/auth/recovery-grant.ts.
 *   completeForcedPasswordChange     validates the caller's token against the auth
 *                                    server, then requires must_change_password to
 *                                    be TRUE for that account before it writes.
 *   completeVoluntaryPasswordChange  validates the caller's token AND
 *                                    reauthenticates with the current password. A
 *                                    live session alone is not enough.
 *   completeAdministrativeReset      prepares authorization/scope from database
 *                                    facts, then uses the private writer here.
 *
 * The AUDIT ACTION IS DERIVED FROM THE CEREMONY, never supplied by a caller
 * (`CEREMONY_AUDIT_ACTION` below). A route cannot mislabel what it did.
 *
 * The low-level write is module-private. `scripts/ci/check-browser-boundaries.mjs`
 * fails the build if the password-capable `updateUserById` primitive appears
 * outside this module, regardless of payload shape or import form.
 *
 * ORDER, and why: password -> flag -> audit. The user is setting their OWN
 * password having already proved they may; clearing the flag first would release
 * the account from the boundary while it still holds the credential it was
 * issued. PARTIAL FAILURE IS REPORTED, never papered over.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { firstPasswordPolicyError } from './password-policy';
import {
  claimRecoveryGrant,
  finishRecoveryGrantAttempt,
  RECOVERY_GRANT_MARKER,
} from './recovery-grant';
import {
  recordSecurityAudit,
  type SecurityAuditAction,
  type SecurityAuditResult,
} from '../security/audit';
import {
  ADMIN_RESET_MESSAGES,
  compensateAdministrativeReset,
  isAdminResetFailure,
  prepareAdministrativeReset,
  type AdminResetResult,
  type AdministrativeResetInput,
} from './admin-password-reset';

/** The database function that owns writes to `profiles.must_change_password`. */
export const SET_PASSWORD_CHANGE_REQUIRED_RPC = 'set_password_change_required';

/**
 * The four ceremonies. This union is the vocabulary of the whole module: an
 * audit action, a flag policy and an identity rule all follow from it.
 */
export type PasswordCeremony = 'recovery' | 'forced' | 'voluntary' | 'admin_reset';

/**
 * Ceremony -> audit action. Frozen, and consulted rather than accepted, so the
 * trail records what actually happened rather than what a caller claimed.
 */
export const CEREMONY_AUDIT_ACTION: Readonly<Record<PasswordCeremony, SecurityAuditAction>> =
  Object.freeze({
    recovery: 'password_change_recovery',
    forced: 'password_change_forced',
    voluntary: 'password_change_voluntary',
    admin_reset: 'password_reset_admin',
  });

/**
 * Ceremony -> whether it clears `must_change_password`.
 *
 * `voluntary` does NOT: a voluntary change is made by somebody who is not under
 * the forced-change regime, and clearing it here would let that endpoint release
 * an account the boundary is deliberately holding. `admin_reset` SETS it, which
 * its own module handles before the write.
 */
const CEREMONY_CLEARS_FLAG: Readonly<Record<PasswordCeremony, boolean>> = Object.freeze({
  recovery: true,
  forced: true,
  voluntary: false,
  admin_reset: false,
});

/** es-CL, because every one of these reaches the user. */
export const COMPLETION_MESSAGES = {
  weak: 'La contraseña no cumple con los requisitos de seguridad del sistema',
  samePassword: 'La nueva contraseña debe ser diferente a la anterior',
  updateFailed: 'No se pudo actualizar la contraseña. Inténtalo nuevamente.',
  flagNotCleared:
    'Tu contraseña se actualizó, pero no pudimos completar el proceso. ' +
    'Vuelve a iniciar sesión; si el problema persiste, contacta al administrador.',
  success: 'Contraseña actualizada exitosamente',
  /** Recovery material that is absent, expired, already used or not a recovery link. */
  recoveryInvalid:
    'El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo desde la página de inicio de sesión.',
  recoveryBusy: 'Ya hay un intento de recuperación en curso. Espera unos segundos e inténtalo nuevamente.',
  recoveryExhausted:
    'Este enlace alcanzó el máximo de intentos. Solicita uno nuevo desde la página de inicio de sesión.',
  /** The caller has no valid session at all. */
  notAuthenticated: 'No autorizado',
  /** Forced change requested by an account that is not under the regime. */
  changeNotRequired: 'Tu cuenta no tiene un cambio de contraseña pendiente',
  /** Voluntary change with the wrong current password. */
  currentPasswordWrong: 'La contraseña actual es incorrecta',
  /** A required field was absent. */
  passwordRequired: 'La nueva contraseña es obligatoria',
  bothPasswordsRequired: 'La contraseña actual y la nueva contraseña son obligatorias',
  /** The flag could not be read. */
  stateUnavailable:
    'No pudimos verificar el estado de tu cuenta. Inténtalo nuevamente en unos momentos.',
  serverError: 'Error interno del servidor',
} as const;

export type CompletionStage =
  | 'proof'
  | 'identity'
  | 'authorization'
  | 'policy'
  | 'set_password'
  | 'clear_flag';

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
  /** The account that was acted on. Never echoed to an unauthenticated caller. */
  userId: string;
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
 * that a response should not confirm. The raw wording is neither returned nor
 * logged; operators get only stable provider code/status fields.
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
  // not own; runbook 4.1-4.2 covers aligning them with the shared policy.
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
 * The RPC returns false when it matched no row, which is a real failure -- an
 * account that vanished mid-flow -- and is reported as one rather than being
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

export interface WritePasswordInput {
  /** The account the CEREMONY established. Never taken from a request body. */
  userId: string;
  newPassword: string;
  ceremony: PasswordCeremony;
  /** Free-form, sanitised by the audit writer before it is stored. */
  auditMetadata?: Record<string, unknown>;
  /** Only the administrative reset supplies one; otherwise actor == target. */
  actorUserId?: string;
  actorRole?: string | null;
  schoolId?: number | null;
  /** Prefix for operator logs, e.g. `[recovery-complete]`. */
  logPrefix: string;
  /**
   * `auth.admin.updateUserById` also carries user metadata for the administrative
   * reset (the banner marker). Nothing else uses it.
   */
  userMetadata?: Record<string, unknown>;
}

/**
 * THE ONLY PLACE A PASSWORD IS WRITTEN.
 *
 * Module-private rather than an export a route could call with any user id.
 *
 * `admin` MUST be a service-role client: `auth.admin.updateUserById` and the flag
 * RPC are both service-role-only, and the audit table grants `authenticated`
 * SELECT alone.
 *
 * @internal
 */
async function writePassword(
  admin: SupabaseClient,
  input: WritePasswordInput
): Promise<CompletionResult> {
  const auditAction = CEREMONY_AUDIT_ACTION[input.ceremony];
  const actorUserId = input.actorUserId ?? input.userId;
  const auditBase = {
    action: auditAction,
    actorUserId,
    actorRole: input.actorRole ?? null,
    targetUserId: input.userId,
    schoolId: typeof input.schoolId === 'number' ? input.schoolId : null,
  };

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

  // --- The password, on the ESTABLISHED account and no other.
  const { error: updateError } = await admin.auth.admin.updateUserById(input.userId, {
    password: input.newPassword,
    ...(input.userMetadata ? { user_metadata: input.userMetadata } : {}),
  });

  if (updateError) {
    // Provider wording can echo request/account detail, so log only stable
    // machine fields and keep the caller-facing mapping below coarse.
    console.error(`${input.logPrefix} password update refused`, {
      code: (updateError as { code?: string }).code ?? null,
      status: (updateError as { status?: number }).status ?? null,
      ceremony: input.ceremony,
    });

    const described = describeProviderError(updateError as any);

    await recordSecurityAudit(admin, {
      ...auditBase,
      outcome: 'failure',
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
  if (CEREMONY_CLEARS_FLAG[input.ceremony]) {
    const flag = await clearPasswordChangeFlag(admin, input.userId);

    if (!flag.cleared) {
      console.error(`${input.logPrefix} could not clear must_change_password`, {
        ceremony: input.ceremony,
      });

      await recordSecurityAudit(admin, {
        ...auditBase,
        outcome: 'partial_failure',
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
    ...auditBase,
    outcome: 'success',
    metadata: input.auditMetadata ?? {},
  });

  return {
    ok: true,
    message: COMPLETION_MESSAGES.success,
    audited: audit.recorded,
    userId: input.userId,
  };
}

// ---------------------------------------------------------------------------
// CEREMONY 1 — RECOVERY
// ---------------------------------------------------------------------------

export interface RecoveryCeremonyInput {
  grant?: unknown;
  newPassword: string;
}

/**
 * The first password after an invitation, and the new password after a
 * self-service "olvidé mi contraseña".
 *
 * The policy is checked before a provider-attempt lease is spent. The emailed
 * proof was already exchanged for this bounded grant when the form opened.
 *
 * An ordinary access token cannot reach the write. Identity comes only from the
 * authenticated encrypted grant, and the durable hash ledger limits lifetime,
 * retries, replay, and concurrent attempts. There is no bearer token, cookie or
 * body user id this ceremony will read as identity.
 */
export async function completeRecoveryPasswordChange(
  admin: SupabaseClient,
  input: RecoveryCeremonyInput
): Promise<CompletionResult> {
  if (typeof input.newPassword !== 'string' || input.newPassword.length === 0) {
    return {
      ok: false,
      stage: 'policy',
      status: 400,
      message: COMPLETION_MESSAGES.passwordRequired,
      code: 'PASSWORD_REQUIRED',
      passwordChanged: false,
    };
  }

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

  const claim = await claimRecoveryGrant(admin, input.grant);

  if (claim.ok === false) {
    const unavailable = claim.reason === 'unavailable';
    const busy = claim.reason === 'busy';
    const exhausted = claim.reason === 'exhausted';
    return {
      ok: false,
      stage: 'proof',
      status: unavailable ? 503 : busy ? 409 : exhausted ? 429 : 401,
      message: unavailable
        ? COMPLETION_MESSAGES.serverError
        : busy
          ? COMPLETION_MESSAGES.recoveryBusy
          : exhausted
            ? COMPLETION_MESSAGES.recoveryExhausted
            : COMPLETION_MESSAGES.recoveryInvalid,
      code: unavailable
        ? 'RECOVERY_GRANT_UNAVAILABLE'
        : busy
          ? 'RECOVERY_ATTEMPT_IN_PROGRESS'
          : exhausted
            ? 'RECOVERY_ATTEMPTS_EXHAUSTED'
            : 'RECOVERY_GRANT_INVALID',
      passwordChanged: false,
    };
  }

  let written: CompletionResult;
  try {
    written = await writePassword(admin, {
      userId: claim.claims.subject,
      newPassword: input.newPassword,
      ceremony: 'recovery',
      auditMetadata: { change_type: 'recovery_grant' },
      logPrefix: '[recovery-complete]',
      // Written atomically with the password at the auth provider. If the
      // following database completion is lost, the next retry sees this marker
      // and refuses replay rather than waiting for a lease to expire.
      userMetadata: { [RECOVERY_GRANT_MARKER]: claim.grantHash },
    });
  } catch {
    await finishRecoveryGrantAttempt(admin, claim, false);
    return {
      ok: false,
      stage: 'set_password',
      status: 502,
      message: COMPLETION_MESSAGES.updateFailed,
      code: 'UPDATE_FAILED',
      passwordChanged: false,
    };
  }

  const passwordChanged = isCompletionFailure(written) ? written.passwordChanged : true;
  await finishRecoveryGrantAttempt(admin, claim, passwordChanged);
  return written;
}

// ---------------------------------------------------------------------------
// CEREMONY 2 — FORCED
// ---------------------------------------------------------------------------

/** The user-scoped client a route builds from the request's own cookies. */
export type AuthenticatedClient = { auth: Pick<SupabaseClient['auth'], 'getUser'> };

/**
 * The change a flagged account is held at /change-password until it finishes.
 *
 * `auth.getUser()` and not `getSession()`: getSession decodes a cookie the caller
 * owns; getUser validates the token with the auth server. Then the flag must
 * actually be TRUE -- this ceremony writes with the service role and so bypasses
 * GoTrue's own reauthentication, which would make it a "change my password
 * without knowing it" route for anyone if the regime were not checked.
 *
 * The flag is read with the SERVICE-ROLE client: the caller is by definition
 * flagged, so a user-scoped read of their own profile is exactly what the
 * database boundary refuses.
 */
export async function completeForcedPasswordChange(
  admin: SupabaseClient,
  authenticated: AuthenticatedClient,
  input: { newPassword: string }
): Promise<CompletionResult> {
  const { data, error } = await authenticated.auth.getUser();
  const user = data?.user;

  if (error || !user?.id) {
    return {
      ok: false,
      stage: 'identity',
      status: 401,
      message: COMPLETION_MESSAGES.notAuthenticated,
      code: 'UNAUTHORIZED',
      passwordChanged: false,
    };
  }

  if (typeof input.newPassword !== 'string' || input.newPassword.length === 0) {
    return {
      ok: false,
      stage: 'policy',
      status: 400,
      message: COMPLETION_MESSAGES.passwordRequired,
      code: 'PASSWORD_REQUIRED',
      passwordChanged: false,
    };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('must_change_password')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[force-password-change] profile read failed', {
      user_id: user.id,
      error: profileError.message,
    });
    return {
      ok: false,
      stage: 'authorization',
      status: 503,
      message: COMPLETION_MESSAGES.stateUnavailable,
      code: 'PASSWORD_STATE_UNAVAILABLE',
      passwordChanged: false,
    };
  }

  if (profile?.must_change_password !== true) {
    return {
      ok: false,
      stage: 'authorization',
      status: 403,
      message: COMPLETION_MESSAGES.changeNotRequired,
      code: 'CHANGE_NOT_REQUIRED',
      passwordChanged: false,
    };
  }

  return writePassword(admin, {
    userId: user.id,
    newPassword: input.newPassword,
    ceremony: 'forced',
    auditMetadata: { change_type: 'forced_first_login' },
    logPrefix: '[force-password-change]',
  });
}

// ---------------------------------------------------------------------------
// CEREMONY 3 — VOLUNTARY
// ---------------------------------------------------------------------------

/**
 * Reauthentication. A live session is NOT sufficient for a voluntary change: the
 * point of asking for the current password is that a stolen session cannot lock
 * the owner out of their own account.
 *
 * Injected so the ceremony owns the decision while the route owns the transport.
 */
export type Reauthenticator = (credentials: {
  email: string;
  password: string;
}) => Promise<{ ok: boolean }>;

export async function completeVoluntaryPasswordChange(
  admin: SupabaseClient,
  authenticated: AuthenticatedClient,
  reauthenticate: Reauthenticator,
  input: { currentPassword: string; newPassword: string }
): Promise<CompletionResult> {
  const { data, error } = await authenticated.auth.getUser();
  const user = data?.user;

  if (error || !user?.id || !user.email) {
    return {
      ok: false,
      stage: 'identity',
      status: 401,
      message: COMPLETION_MESSAGES.notAuthenticated,
      code: 'UNAUTHORIZED',
      passwordChanged: false,
    };
  }

  if (
    typeof input.currentPassword !== 'string' ||
    input.currentPassword.length === 0 ||
    typeof input.newPassword !== 'string' ||
    input.newPassword.length === 0
  ) {
    return {
      ok: false,
      stage: 'policy',
      status: 400,
      message: COMPLETION_MESSAGES.bothPasswordsRequired,
      code: 'PASSWORD_REQUIRED',
      passwordChanged: false,
    };
  }

  const reauth = await reauthenticate({ email: user.email, password: input.currentPassword });

  if (!reauth.ok) {
    // Audited: a failed reauthentication on a live session is the signature of a
    // stolen session being probed, and it is worth having in the trail.
    await recordSecurityAudit(admin, {
      action: CEREMONY_AUDIT_ACTION.voluntary,
      outcome: 'denied',
      actorUserId: user.id,
      targetUserId: user.id,
      metadata: { change_type: 'user_initiated', reason: 'current_password_incorrect' },
    });

    return {
      ok: false,
      stage: 'authorization',
      status: 400,
      message: COMPLETION_MESSAGES.currentPasswordWrong,
      code: 'CURRENT_PASSWORD_INVALID',
      passwordChanged: false,
    };
  }

  return writePassword(admin, {
    userId: user.id,
    newPassword: input.newPassword,
    ceremony: 'voluntary',
    auditMetadata: { change_type: 'user_initiated' },
    logPrefix: '[change-password]',
  });
}

// ---------------------------------------------------------------------------
// CEREMONY 4 — ADMINISTRATIVE RESET
// ---------------------------------------------------------------------------

/**
 * The authorization half lives in admin-password-reset.ts. The raw password
 * writer does not: it is module-private above, so no import form, barrel, require
 * or dynamic import can obtain an arbitrary-user password primitive.
 */
export async function completeAdministrativeReset(
  admin: SupabaseClient,
  input: AdministrativeResetInput
): Promise<AdminResetResult> {
  const prepared = await prepareAdministrativeReset(admin, input);
  if (isAdminResetFailure(prepared)) return prepared;

  const written = await writePassword(admin, {
    userId: prepared.targetUserId,
    newPassword: prepared.temporaryPassword,
    ceremony: 'admin_reset',
    actorUserId: prepared.actor.userId,
    actorRole: prepared.actor.role,
    schoolId: prepared.schoolId,
    auditMetadata: { forced_change: true },
    logPrefix: '[admin-password-reset]',
    userMetadata: {
      password_reset_by_admin: true,
      password_reset_at: new Date().toISOString(),
    },
  });

  if (isCompletionFailure(written)) {
    return compensateAdministrativeReset(admin, prepared);
  }

  return {
    ok: true,
    message: ADMIN_RESET_MESSAGES.success,
    userId: prepared.targetUserId,
    mustChangePassword: true,
    audited: written.audited,
  };
}
