/**
 * GET / PATCH /api/admin/pasantia-participants/[rosterId]
 *
 * GET: one roster and its participants (creation order, at most 60), with the
 * acknowledgement evidence. Never the token or its hash.
 *
 * PATCH `{action:'rotate', validDays}` replaces the token hash and expiry and
 * clears `revoked_at`, so the old link stops working at once; it answers the
 * new token once. `{action:'revoke'}` sets `revoked_at` if unset; revoking an
 * already revoked roster answers it unchanged. Neither touches the roster's
 * version or status (db-contract §6). Revocation reaches a coordinator write
 * that is already waiting for the roster lock (FIRST-B7).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  ADMIN_ROSTER_SELECT,
  authorizeIntakeAdmin,
  expiryFromNow,
  writeWithFreshToken,
} from '../../../../lib/pasantias/participants/admin';
// Table names are written as literals at each `.from(...)` below, not imported:
// the ledger production-consumer inventory resolves only statically provable
// literal targets (an imported constant carries no string value there).
import {
  ADMIN_PARTICIPANT_COLUMNS,
  listParticipants,
  logIntakeFailure,
  toAdminParticipant,
  toAdminRoster,
} from '../../../../lib/pasantias/participants/server';
import { isUuid, validateRosterPatchBody } from '../../../../lib/pasantias/participants/validation';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

const NOT_FOUND = { code: 'NOT_FOUND', error: 'No encontramos esa nómina.' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['GET', 'PATCH']);
  if (!auth) return;
  const { supabase } = auth;

  const rosterId = typeof req.query.rosterId === 'string' ? req.query.rosterId.toLowerCase() : '';
  if (!isUuid(rosterId)) return res.status(404).json(NOT_FOUND);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('pasantias_intake_rosters')
        .select(ADMIN_ROSTER_SELECT)
        .eq('id', rosterId)
        .maybeSingle();
      if (error) {
        logIntakeFailure('admin roster read failed', error);
        return res.status(500).json({ error: 'Error al cargar la nómina' });
      }
      if (!data) return res.status(404).json(NOT_FOUND);
      const list = await listParticipants(supabase, rosterId, ADMIN_PARTICIPANT_COLUMNS);
      // Explicit `=== false` / `=== true`: tsconfig has strict off, and without
      // strictNullChecks only equality narrows a boolean discriminant both ways.
      if (list.ok === false) {
        logIntakeFailure('admin participant list failed', list.error);
        return res.status(500).json({ error: 'Error al cargar la nómina' });
      }
      return res.status(200).json({
        roster: toAdminRoster(data as unknown as Record<string, unknown>),
        participants: list.value.map(toAdminParticipant),
      });
    }

    const validation = validateRosterPatchBody(req.body);
    if (validation.ok === false) {
      return res.status(422).json({
        code: 'VALIDATION',
        error: 'Revisa los campos marcados.',
        fields: validation.errors,
      });
    }

    if (validation.value.action === 'rotate') {
      const { validDays } = validation.value;
      const written = await writeWithFreshToken((tokenHash) =>
        supabase
          .from('pasantias_intake_rosters')
          .update({ token_hash: tokenHash, expires_at: expiryFromNow(validDays), revoked_at: null })
          .eq('id', rosterId)
          .select(ADMIN_ROSTER_SELECT)
          .maybeSingle()
      );
      if (written.ok === true) return res.status(200).json({ roster: written.roster, token: written.token });
      if (written.reason === 'not_found') return res.status(404).json(NOT_FOUND);
      return res.status(500).json({ error: 'Error al renovar el enlace' });
    }

    // Revoke: only an unrevoked roster is written, so the first revocation
    // time is kept.
    const { data: revoked, error: revokeError } = await supabase
      .from('pasantias_intake_rosters')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', rosterId)
      .is('revoked_at', null)
      .select(ADMIN_ROSTER_SELECT)
      .maybeSingle();
    if (revokeError) {
      logIntakeFailure('admin revoke failed', revokeError);
      return res.status(500).json({ error: 'Error al revocar el enlace' });
    }
    if (revoked) return res.status(200).json({ roster: toAdminRoster(revoked as unknown as Record<string, unknown>) });

    const { data: existing, error: readError } = await supabase
      .from('pasantias_intake_rosters')
      .select(ADMIN_ROSTER_SELECT)
      .eq('id', rosterId)
      .maybeSingle();
    if (readError) {
      logIntakeFailure('admin roster read failed', readError);
      return res.status(500).json({ error: 'Error al revocar el enlace' });
    }
    if (!existing) return res.status(404).json(NOT_FOUND);
    return res.status(200).json({ roster: toAdminRoster(existing as unknown as Record<string, unknown>) });
  } catch (error) {
    logIntakeFailure('admin unexpected error', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
