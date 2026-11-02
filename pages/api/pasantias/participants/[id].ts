/**
 * PUT /api/pasantias/participants/[id] — the coordinator edits one participant.
 *
 * Same link authentication as the index route. The body carries every field
 * (a full replace) plus `expectedVersion`; funding keys are unknown keys (F01).
 * `pasantias_nomina_save_participant` updates only a row of the token's own
 * roster at that version, and refuses a real change with
 * `school_data_missing` while the school has not saved its funding.
 *
 * - A non-UUID id is 404 without any database call; so is an id from another
 *   roster, which the RPC cannot tell from a nonexistent one.
 * - 409 STALE carries `current`: the row as stored now (effective focus
 *   included), read within this roster. A retry whose first response was lost
 *   also lands here, and the client compares `current` with what it meant to
 *   save (db-contract §5).
 * - An edit that changes nothing is a no-op (200, `replayed: true`): no
 *   version bump and no reopen of a sent roster.
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
  logIntakeFailure,
  readParticipant,
  rosterWithFunding,
  saveArgs,
  sendIntakeError,
  sendSaveFailure,
} from '../../../../lib/pasantias/participants/server';
import { isUuid, validateUpdateBody } from '../../../../lib/pasantias/participants/validation';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tokenHash = await beginIntakeRequest(req, res, ['PUT']);
  if (!tokenHash) return;

  const participantId = typeof req.query.id === 'string' ? req.query.id.toLowerCase() : '';
  if (!isUuid(participantId)) return sendIntakeError(res, 'NOT_FOUND');

  try {
    const supabase = createServiceRoleClient();

    const live = await findLiveRoster(supabase, tokenHash);
    // `=== false`, not `!`: tsconfig has strict off, and without
    // strictNullChecks a falsy check does not narrow a boolean discriminant.
    if (live.ok === false) {
      logIntakeFailure('roster lookup failed', live.error);
      return sendIntakeError(res, isUnavailable(live.error) ? 'UNAVAILABLE' : 'INTERNAL');
    }
    if (!live.value) return sendIntakeError(res, 'LINK_UNAVAILABLE');
    const roster = live.value;

    const validation = validateUpdateBody(req.body, roster.program);
    if (validation.ok === false) return sendIntakeError(res, 'VALIDATION', { fields: validation.errors });

    const outcome = await callSave(
      supabase,
      saveArgs(
        tokenHash,
        { kind: 'update', participantId, expectedVersion: validation.value.expectedVersion },
        validation.value.fields,
        INTAKE_NOTICE_VERSION
      )
    );

    if (outcome.ok === false) {
      if (outcome.refusal === 'stale_version') {
        const current = await readParticipant(supabase, roster.id, participantId);
        if (current.ok === false) {
          logIntakeFailure('stale row read failed', current.error);
          return sendIntakeError(res, 'INTERNAL');
        }
        if (!current.value) return sendIntakeError(res, 'NOT_FOUND');
        return sendIntakeError(res, 'STALE', { current: current.value });
      }
      return sendSaveFailure(res, outcome);
    }

    const [saved, fresh] = await Promise.all([
      readParticipant(supabase, roster.id, outcome.row.participant_id),
      findRosterByHash(supabase, tokenHash),
    ]);
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

    return res.status(200).json({
      participant: saved.value,
      roster: view.value,
      replayed: outcome.row.replayed === true,
    });
  } catch (error) {
    logIntakeFailure('unexpected error', error);
    return sendIntakeError(res, 'INTERNAL');
  }
}
