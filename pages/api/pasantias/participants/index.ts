/**
 * GET / POST /api/pasantias/participants — the coordinator's roster.
 *
 * Authenticated ONLY by the roster link: `Authorization: Intake <token>`
 * (FIRST-B1). No GENERA session is read and no shared auth helper is called;
 * the school and program come from the token's roster and nowhere else, so a
 * `school`, `program` or `rosterId` in a body is an unknown key (422).
 *
 * GET answers `{roster, participants}` (creation order, at most 60).
 * POST creates one participant through `pasantias_intake_save_participant`,
 * which re-checks the link under a roster lock in the same transaction
 * (FIRST-B7). 201 on a new row; 200 on a replay of the same `clientRequestId`
 * — and on a replay the response is the row AS STORED, not the retried input,
 * because the RPC never applies a replay's fields (db-contract §5, plan r2).
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
  publicRoster,
  readParticipant,
  saveArgs,
  sendIntakeError,
  sendSaveFailure,
  toParticipant,
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
      const list = await listParticipants(supabase, roster.id);
      if (list.ok === false) {
        logIntakeFailure('participant list failed', list.error);
        return sendIntakeError(res, 'INTERNAL');
      }
      return res.status(200).json({
        roster: publicRoster(roster),
        participants: list.value.map(toParticipant),
      });
    }

    // POST — dates are validated against THIS roster's program (FIRST-B5).
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
    const rosterAfter = fresh.ok && fresh.value ? fresh.value : roster;

    return res.status(outcome.row.replayed ? 200 : 201).json({
      participant: saved.value,
      roster: publicRoster(rosterAfter),
      replayed: outcome.row.replayed === true,
    });
  } catch (error) {
    logIntakeFailure('unexpected error', error);
    return sendIntakeError(res, 'INTERNAL');
  }
}
