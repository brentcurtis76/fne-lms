/**
 * The single denial a session GET returns when it will not serve a session.
 *
 * `session-policy.ts` answers "may this user open the session at all?" and
 * `session-disclosure.ts` answers "what may they see inside it". This module
 * answers the question that comes before both: what a caller learns when the
 * answer is no.
 *
 * The answer must be *nothing*. A caller who is told `404 'Sesión no
 * encontrada'` for an absent row but `403 'Acceso denegado a esta sesión'` for
 * a row they may not read has been handed an existence oracle: iterate session
 * ids, and the status code alone maps out which sessions exist. That is the
 * same leak `resolveMeetSessionAccess()` collapses to a single `NOT_FOUND` at
 * the meeting interstitial, and the session GETs must not undo it.
 *
 * So both paths — row absent and `canViewSession()` false — route through this
 * one helper. They are not "two responses that happen to match today"; they are
 * literally the same call, which is what stops them drifting apart later.
 *
 * Scope note: `403 'Usuario sin roles asignados'` deliberately does NOT route
 * here. It is returned identically for every session id, so it discloses
 * something about the *caller*, never about a particular session.
 */

import type { NextApiResponse } from 'next';
import { sendAuthError } from '../api-auth';
import type { ApiError } from '../types/api-auth.types';

/** Status for every session denial. Absent and forbidden share it. */
export const SESSION_NOT_FOUND_STATUS = 404;

/** Body message for every session denial. Absent and forbidden share it. */
export const SESSION_NOT_FOUND_MESSAGE = 'Sesión no encontrada';

/**
 * Send the shared session denial. Byte-identical for every caller and every
 * reason: same status, same body, same log line.
 */
export function sendSessionNotFound(res: NextApiResponse<ApiError>): void {
  sendAuthError(res, SESSION_NOT_FOUND_MESSAGE, SESSION_NOT_FOUND_STATUS);
}
