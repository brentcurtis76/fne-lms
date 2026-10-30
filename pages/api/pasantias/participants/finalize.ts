/**
 * POST /api/pasantias/participants/finalize — "Enviar nómina a FNE".
 *
 * Sends no e-mail. "Submitted" means the roster is marked as sent and is
 * available to the FNE admin screen; nothing leaves the platform.
 *
 * Body `{expectedRosterVersion}`. Order (corrections §3.6, C3):
 * 1. the live roster for the token (401 if none);
 * 2. the school's funding — none saved yet → 422 SCHOOL_DATA_MISSING, and the
 *    finalize RPC is NOT called;
 * 3. the unchanged `pasantias_intake_finalize`, which checks the link under the
 *    roster lock (FIRST-B7). It is idempotent for a double click or a retry of
 *    the finalize that produced the current state, and answers STALE to a view
 *    that missed later edits — including funding changes, which bump the
 *    roster version.
 *
 * The gate is race-free: a funding row can never be deleted, and every funding
 * change bumps the roster version that finalize compares.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../../lib/api-auth';
import {
  beginIntakeRequest,
  callFinalize,
  findLiveRoster,
  findRosterByHash,
  isUnavailable,
  logIntakeFailure,
  readSchoolFunding,
  rosterWithFunding,
  sendIntakeError,
} from '../../../../lib/pasantias/participants/server';
import { validateFinalizeBody } from '../../../../lib/pasantias/participants/validation';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tokenHash = await beginIntakeRequest(req, res, ['POST']);
  if (!tokenHash) return;

  try {
    const validation = validateFinalizeBody(req.body);
    // `=== false`, not `!`: tsconfig has strict off, and without
    // strictNullChecks a falsy check does not narrow a boolean discriminant.
    if (validation.ok === false) return sendIntakeError(res, 'VALIDATION', { fields: validation.errors });

    const supabase = createServiceRoleClient();

    const live = await findLiveRoster(supabase, tokenHash);
    if (live.ok === false) {
      logIntakeFailure('roster lookup failed', live.error);
      return sendIntakeError(res, isUnavailable(live.error) ? 'UNAVAILABLE' : 'INTERNAL');
    }
    if (!live.value) return sendIntakeError(res, 'LINK_UNAVAILABLE');

    const funding = await readSchoolFunding(supabase, live.value.id);
    if (funding.ok === false) {
      logIntakeFailure('school funding read failed', funding.error);
      return sendIntakeError(res, 'INTERNAL');
    }
    if (!funding.value) return sendIntakeError(res, 'SCHOOL_DATA_MISSING');

    const outcome = await callFinalize(supabase, tokenHash, validation.value.expectedRosterVersion);

    if (outcome.ok === false) {
      switch (outcome.refusal) {
        case 'link_unavailable':
          return sendIntakeError(res, 'LINK_UNAVAILABLE');
        case 'empty_roster':
          return sendIntakeError(res, 'EMPTY_ROSTER');
        case 'stale_version': {
          const current = await findLiveRoster(supabase, tokenHash);
          if (current.ok && !current.value) return sendIntakeError(res, 'LINK_UNAVAILABLE');
          const view = current.ok && current.value ? await rosterWithFunding(supabase, current.value) : null;
          return sendIntakeError(res, 'STALE', { roster: view && view.ok ? view.value : null });
        }
        case 'invalid_argument':
          console.error('[pasantias-intake] finalize refused (caller bug):', { code: outcome.refusal });
          return sendIntakeError(res, 'INTERNAL');
        default:
          logIntakeFailure('finalize failed', outcome.error);
          return sendIntakeError(res, isUnavailable(outcome.error) ? 'UNAVAILABLE' : 'INTERNAL');
      }
    }

    const fresh = await findRosterByHash(supabase, tokenHash);
    const view = fresh.ok && fresh.value ? await rosterWithFunding(supabase, fresh.value) : null;
    return res.status(200).json({
      roster: view && view.ok ? view.value : null,
      rosterStatus: outcome.row.roster_status,
      rosterVersion: outcome.row.roster_version,
      submittedAt: outcome.row.submitted_at,
    });
  } catch (error) {
    logIntakeFailure('unexpected error', error);
    return sendIntakeError(res, 'INTERNAL');
  }
}
