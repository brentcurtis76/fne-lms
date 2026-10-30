/**
 * GET / POST /api/pasantias/participants — the coordinator's roster.
 *
 * Authenticated ONLY by the roster link: `Authorization: Intake <token>`
 * (FIRST-B1). No GENERA session is read and no shared auth helper is called;
 * the school and program come from the token's roster and nowhere else, so a
 * `school`, `program` or `rosterId` in a body is an unknown key (422). So are
 * `flightsFunding` / `lodgingFunding` (F01): funding is saved once per roster
 * through `PUT …/school`, never per person, and such a body is refused before
 * any RPC.
 *
 * GET answers `{roster, participants}`: the roster carries `schoolFunding`
 * (or null), participants come in creation order (at most 60) with their
 * effective focus (`todos` included, F04).
 *
 * POST creates one participant through `pasantias_nomina_save_participant`,
 * which re-checks the link under a roster lock in the same transaction
 * (FIRST-B7) and refuses with `school_data_missing` (422 SCHOOL_DATA_MISSING)
 * while the school has not saved its funding. 201 on a new row; 200 on a
 * replay of the same `clientRequestId` — and on a replay the response is the
 * row AS STORED, not the retried input (db-contract §5, plan r2).
 *
 * Every response is `Cache-Control: no-store` and none carries the token hash.
 * Nothing is logged but `loggableError` output or a frozen refusal code.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../../lib/api-auth';
import { INTAKE_NOTICE_VERSION } from '../../../../lib/pasantias/participants/notice';
import {
  beginIntakeRequest,
  callSave,
  findLiveRoster,
  findRosterByHash,
  isUnavailable,
  listParticipants,
  logIntakeFailure,
  readParticipant,
  rosterWithFunding,
  saveArgs,
  sendIntakeError,
  sendSaveFailure,
} from '../../../../lib/pasantias/participants/server';
import { validateCreateBody } from '../../../../lib/pasantias/participants/validation';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tokenHash = await beginIntakeRequest(req, res, ['GET', 'POST']);
  if (!tokenHash) return;

  try {
    const supabase = createServiceRoleClient();

    // Unknown, expired and revoked links need this lookup to be told from a
    // live one; all three answer the identical 401.
    const live = await findLiveRoster(supabase, tokenHash);
    // `=== false`, not `!`: tsconfig has strict off, and without
    // strictNullChecks a falsy check does not narrow a boolean discriminant.
    if (live.ok === false) {
      logIntakeFailure('roster lookup failed', live.error);
      return sendIntakeError(res, isUnavailable(live.error) ? 'UNAVAILABLE' : 'INTERNAL');
    }
    if (!live.value) return sendIntakeError(res, 'LINK_UNAVAILABLE');
    const roster = live.value;

    if (req.method === 'GET') {
      const [list, view] = await Promise.all([
        listParticipants(supabase, roster.id),
        rosterWithFunding(supabase, roster),
      ]);
      if (list.ok === false) {
        logIntakeFailure('participant list failed', list.error);
        return sendIntakeError(res, 'INTERNAL');
      }
      if (view.ok === false) {
        logIntakeFailure('school funding read failed', view.error);
        return sendIntakeError(res, 'INTERNAL');
      }
      return res.status(200).json({ roster: view.value, participants: list.value });
    }

    // POST — dates are validated against THIS roster's program (FIRST-B5);
    // funding keys are unknown keys here (F01).
    const validation = validateCreateBody(req.body, roster.program);
    if (validation.ok === false) return sendIntakeError(res, 'VALIDATION', { fields: validation.errors });

    const outcome = await callSave(
      supabase,
      saveArgs(
        tokenHash,
        { kind: 'create', clientRequestId: validation.value.clientRequestId },
        validation.value.fields,
        INTAKE_NOTICE_VERSION
      )
    );
    if (outcome.ok === false) return sendSaveFailure(res, outcome);

    // Report what is stored, read back within the roster the RPC verified.
    const [saved, fresh] = await Promise.all([
      readParticipant(supabase, roster.id, outcome.row.participant_id),
      findRosterByHash(supabase, tokenHash),
    ]);
    // Committed but unconfirmed (read failed, or no row): a retry with the
    // same clientRequestId is a replay, so asking for one is safe.
    if (saved.ok === false) {
      logIntakeFailure('saved row read failed', saved.error);
      return sendIntakeError(res, 'INTERNAL');
    }
    if (!saved.value) return sendIntakeError(res, 'INTERNAL');
    const view = await rosterWithFunding(supabase, fresh.ok && fresh.value ? fresh.value : roster);
    if (view.ok === false) {
      logIntakeFailure('school funding read failed', view.error);
      return sendIntakeError(res, 'INTERNAL');
    }

    return res.status(outcome.row.replayed ? 200 : 201).json({
      participant: saved.value,
      roster: view.value,
      replayed: outcome.row.replayed === true,
    });
  } catch (error) {
    logIntakeFailure('unexpected error', error);
    return sendIntakeError(res, 'INTERNAL');
  }
}
