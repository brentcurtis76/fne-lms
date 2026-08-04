/**
 * The denials the session GETs return when they will not serve something.
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
 * So both paths — row absent and `canViewSession()` false — route through the
 * one `sendSessionNotFound()` helper. They are not "two responses that happen
 * to match today"; they are literally the same call, which is what stops them
 * drifting apart later.
 *
 * ## Two granularities, one rule
 *
 * `/api/sessions/[id]/reports/[rid]` resolves a second id, so it carried the
 * same oracle a second time: report absent vs `canViewRestrictedReports()`
 * false. `sendReportNotFound()` collapses that pair the same way, and lives
 * here rather than in a module of its own because the two denials are one rule
 * at two granularities — and because the ordering between them is an invariant
 * *between* the two, which belongs where both are defined:
 *
 *   The session denial strictly precedes the report denial. A caller who may
 *   not open the session must be answered `sendSessionNotFound()` before any
 *   report row is fetched — otherwise they still learn whether the report
 *   exists, and the report id becomes the oracle the session id no longer is.
 *
 * Both denials share status 404. They are deliberately NOT collapsed into each
 * other: a caller who reaches the report check has already been told this
 * session exists, so the only thing left to hide at that point is which
 * reports it holds, and `REPORT_NOT_FOUND_MESSAGE` hides exactly that.
 *
 * Scope note: `403 'Usuario sin roles asignados'` deliberately does NOT route
 * here. It is returned identically for every session and report id, so it
 * discloses something about the *caller*, never about a particular row.
 */

import type { NextApiResponse } from 'next';
import { sendAuthError } from '../api-auth';
import type { ApiError } from '../types/api-auth.types';

/** Status for every session denial. Absent and forbidden share it. */
export const SESSION_NOT_FOUND_STATUS = 404;

/** Body message for every session denial. Absent and forbidden share it. */
export const SESSION_NOT_FOUND_MESSAGE = 'Sesión no encontrada';

/** Status for every report denial. Absent and forbidden share it. */
export const REPORT_NOT_FOUND_STATUS = 404;

/** Body message for every report denial. Absent and forbidden share it. */
export const REPORT_NOT_FOUND_MESSAGE = 'Informe no encontrado';

/**
 * Send the shared session denial. Byte-identical for every caller and every
 * reason: same status, same body, same log line.
 */
export function sendSessionNotFound(res: NextApiResponse<ApiError>): void {
  sendAuthError(res, SESSION_NOT_FOUND_MESSAGE, SESSION_NOT_FOUND_STATUS);
}

/**
 * Send the shared report denial. Byte-identical whether the report row is
 * absent or merely one this caller may not read.
 *
 * Only reachable once the caller has passed the session check — see the
 * ordering invariant in the module header.
 */
export function sendReportNotFound(res: NextApiResponse<ApiError>): void {
  sendAuthError(res, REPORT_NOT_FOUND_MESSAGE, REPORT_NOT_FOUND_STATUS);
}
