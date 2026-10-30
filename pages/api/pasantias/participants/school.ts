/**
 * PUT /api/pasantias/participants/school — "Datos del colegio" (F01).
 *
 * The school answers Pasajes and Estadía (Costo SEP / Costo Colegio) ONCE for
 * its roster — one school × one program, exactly what the link reaches. It is
 * never per person and never shared with the same school's other program
 * (FIRST corrections §3.0).
 *
 * Same link authentication and FIRST §4 rules as every intake route
 * (`Intake` header, no-store, 8 kB, unknown keys refused, rate limit, logging,
 * identical 401). Body exactly
 * `{flightsFunding, lodgingFunding, expectedFundingVersion: number|null}`; no
 * acknowledgement — this is the school's own data, not other people's.
 *
 * One call to `pasantias_nomina_save_school_funding`, which checks the link
 * under the roster lock and, on a real change, copies the answer to every
 * participant row, bumps the roster version and reopens a sent roster
 * (corrections §6, C4).
 *
 * - 200 `{roster, replayed}`: the roster as stored, with `schoolFunding`. Saving
 *   the same values again (double click, lost-response retry) is a replay:
 *   nothing written, nothing reopened.
 * - 409 STALE `{current: roster}`: someone saved different values first; the
 *   client shows the stored answer and keeps what was typed.
 * - 422 VALIDATION, 401 LINK_UNAVAILABLE as everywhere else.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../../lib/api-auth';
import {
  beginIntakeRequest,
  callSaveSchoolFunding,
  findLiveRoster,
  findRosterByHash,
  logIntakeFailure,
  rosterWithFunding,
  sendFundingFailure,
  sendIntakeError,
} from '../../../../lib/pasantias/participants/server';
import { validateSchoolFundingBody } from '../../../../lib/pasantias/participants/validation';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tokenHash = await beginIntakeRequest(req, res, ['PUT']);
  if (!tokenHash) return;

  try {
    const validation = validateSchoolFundingBody(req.body);
    // `=== false`, not `!`: tsconfig has strict off, and without
    // strictNullChecks a falsy check does not narrow a boolean discriminant.
    if (validation.ok === false) return sendIntakeError(res, 'VALIDATION', { fields: validation.errors });

    const supabase = createServiceRoleClient();
    // The RPC decides the link under its lock: an unknown, expired or revoked
    // token answers `link_unavailable` → the identical 401.
    const outcome = await callSaveSchoolFunding(supabase, tokenHash, validation.value);

    if (outcome.ok === false) {
      if (outcome.refusal === 'stale_version') {
        const current = await findLiveRoster(supabase, tokenHash);
        if (current.ok === false) {
          logIntakeFailure('stale roster read failed', current.error);
          return sendIntakeError(res, 'INTERNAL');
        }
        if (!current.value) return sendIntakeError(res, 'LINK_UNAVAILABLE');
        const view = await rosterWithFunding(supabase, current.value);
        if (view.ok === false) {
          logIntakeFailure('school funding read failed', view.error);
          return sendIntakeError(res, 'INTERNAL');
        }
        return sendIntakeError(res, 'STALE', { current: view.value });
      }
      return sendFundingFailure(res, outcome);
    }

    // Report what is stored, for the roster the RPC just verified.
    const fresh = await findRosterByHash(supabase, tokenHash);
    if (fresh.ok === false) {
      logIntakeFailure('roster read failed', fresh.error);
      return sendIntakeError(res, 'INTERNAL');
    }
    if (!fresh.value) return sendIntakeError(res, 'INTERNAL');
    const view = await rosterWithFunding(supabase, fresh.value);
    if (view.ok === false) {
      logIntakeFailure('school funding read failed', view.error);
      return sendIntakeError(res, 'INTERNAL');
    }
    return res.status(200).json({ roster: view.value, replayed: outcome.row.replayed === true });
  } catch (error) {
    logIntakeFailure('unexpected error', error);
    return sendIntakeError(res, 'INTERNAL');
  }
}
