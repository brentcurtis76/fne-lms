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
import {
  completeAdministrativeReset,
  isAdminResetFailure,
  ADMIN_RESET_MESSAGES,
} from '../../../lib/auth/admin-password-reset';

// Rate limiter for password reset (auth-level: 10 req/min)
const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'admin-reset-password');

/**
 * Administrative password reset — the HTTP surface only.
 *
 * S2 fixed three defects here (a flag written to a column that does not exist, no
 * server-side password policy, and success reported on partial failure). The
 * review that followed asked for something else: that the DECISION not live in a
 * route at all. So everything that matters — the equipo_directivo scope rules,
 * the flag-before-password ordering, the compensation, the audit row whose action
 * is derived rather than supplied — now lives in
 * `lib/auth/admin-password-reset.ts`, the fourth ceremony of the trusted
 * password-mutation boundary.
 *
 * What is left here is what an HTTP handler should be: method, rate limit,
 * authentication, body shape, and the mapping from a ceremony result onto a
 * status code. The temporary password is read out of the body and handed
 * straight to the ceremony; it is never logged and never echoed back.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiSuccess<any> | ApiError>
) {
  logApiRequest(req, 'reset-password');

  if (req.method !== 'POST') {
    return sendAuthError(res, 'Método no permitido', 405);
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
    // The actor. `checkIsAdminOrEquipoDirectivo` validates the token with the
    // auth server and reads the caller's active roles from the database; the
    // ceremony re-checks the SHAPE of what comes out of it.
    const {
      isAuthorized,
      role: requesterRole,
      schoolId: edSchoolId,
      user,
      error,
    } = await checkIsAdminOrEquipoDirectivo(req, res);

    if (error || !user) {
      console.error('[Reset Password API] Authentication failed:', error);
      return sendAuthError(res, 'Autenticación requerida', 401);
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
      return sendAuthError(res, ADMIN_RESET_MESSAGES.schoolContextMissing, 403);
    }

    // Built here, before the body is inspected, so that "was a service-role
    // client ever constructed?" stays a meaningful assertion about
    // AUTHORIZATION rather than about body validation.
    const supabaseAdmin = createServiceRoleClient();

    const { userId, temporaryPassword } = req.body ?? {};

    const validation = validateRequestBody<{ userId: string; temporaryPassword: string }>(
      req.body,
      ['userId', 'temporaryPassword']
    );

    if (!validation.valid) {
      return sendAuthError(
        res,
        `Faltan campos obligatorios: ${validation.missing.join(', ')}`,
        400
      );
    }

    if (!Validators.isUUID(userId)) {
      return sendAuthError(res, 'userId inválido', 400);
    }

    const result = await completeAdministrativeReset(supabaseAdmin, {
      actor: { userId: user.id, role: requesterRole ?? null, schoolId: edSchoolId ?? null },
      targetUserId: userId,
      temporaryPassword,
    });

    if (isAdminResetFailure(result)) {
      // The two operational failures carry a code the modal renders differently
      // ("nothing changed" versus "the account is flagged but the password is
      // unchanged"); everything else is an ordinary refusal.
      return result.operational
        ? sendMeetingError(res, result.status, result.code, result.message)
        : sendAuthError(res, result.message, result.status);
    }

    // The response carries only what the caller needs to act. It used to return
    // `updateData.user` — the entire GoTrue user object, including full app and
    // user metadata, identity providers, confirmation timestamps and the last
    // sign-in time — to a surface that renders a toast.
    return sendApiResponse(res, {
      success: true,
      message: result.message,
      userId: result.userId,
      mustChangePassword: true,
      audited: result.audited,
    });

  } catch (error: any) {
    console.error('[Reset Password API] Unexpected error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    return sendAuthError(
      res,
      'Error interno del servidor',
      500,
      error.message || 'Ocurrió un error inesperado'
    );
  }
}
